// Seguridad perimetral / SOC: firewall por IP, auto-baneo por fuerza bruta y allowlist de países (geo-IP).
import geoip from 'geoip-lite';
import { authMiddleware, adminOnly } from './auth.js';

const DEFAULT_CFG = { enabled: true, auto_ban: true, max_intentos: 5, ventana_min: 15, ban_min: 60, geo_enabled: false, paises: [] };
let CFG = { ...DEFAULT_CFG };
const bans = new Map();   // ip -> { expira(ms|null), motivo, pais }
const fails = new Map();  // ip -> [ts,...]

function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = xff || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
  return String(ip).replace(/^::ffff:/, '');
}
function isPrivate(ip) { return !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i.test(ip); }
function paisDe(ip) { try { const g = geoip.lookup(ip); return g ? g.country : null; } catch { return null; } }

async function loadCfg(q) { try { const r = (await q("SELECT valor FROM app_config WHERE clave='seguridad'")).rows[0]; CFG = { ...DEFAULT_CFG, ...(r && r.valor || {}) }; } catch {} }
async function loadBans(q) {
  try {
    bans.clear();
    const r = await q("SELECT ip,pais,motivo,expira FROM seguridad_bans WHERE activo AND (expira IS NULL OR expira>now())");
    for (const b of r.rows) bans.set(b.ip, { expira: b.expira ? new Date(b.expira).getTime() : null, motivo: b.motivo, pais: b.pais });
  } catch {}
}
function banActivo(ip) { const b = bans.get(ip); if (!b) return null; if (b.expira && Date.now() > b.expira) { bans.delete(ip); return null; } return b; }
async function logEv(q, ev) { q('INSERT INTO seguridad_eventos (ip,pais,tipo,detalle,username) VALUES ($1,$2,$3,$4,$5)', [ev.ip || null, ev.pais || null, ev.tipo, ev.detalle || null, ev.username || null]).catch(() => {}); }
async function banIP(q, ip, minutos, motivo, pais, intentos) {
  const expira = minutos > 0 ? new Date(Date.now() + minutos * 60000) : null;
  await q(`INSERT INTO seguridad_bans (ip,pais,motivo,intentos,expira,activo,created_at) VALUES ($1,$2,$3,$4,$5,true,now())
           ON CONFLICT (ip) DO UPDATE SET pais=$2,motivo=$3,intentos=$4,expira=$5,activo=true,created_at=now()`, [ip, pais, motivo, intentos || null, expira]);
  bans.set(ip, { expira: expira ? expira.getTime() : null, motivo, pais });
  logEv(q, { ip, pais, tipo: 'ban', detalle: motivo + (minutos > 0 ? ' · ' + minutos + ' min' : ' · permanente') });
}

export async function ensureSeguridadSchema(q) {
  await q(`CREATE TABLE IF NOT EXISTS seguridad_bans (ip text PRIMARY KEY, pais text, motivo text, intentos int, created_at timestamptz DEFAULT now(), expira timestamptz, activo boolean DEFAULT true)`);
  await q(`CREATE TABLE IF NOT EXISTS seguridad_eventos (id bigserial PRIMARY KEY, ts timestamptz DEFAULT now(), ip text, pais text, tipo text, detalle text, username text)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_seg_ev_ts ON seguridad_eventos(ts DESC)`);
}

// IMPORTANTE: montar ANTES de mountAuth para que el firewall corra primero.
export function mountSeguridad(app, q) {
  loadCfg(q); loadBans(q);
  const t = setInterval(() => loadBans(q), 5 * 60000); t.unref && t.unref();
  const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error('seguridad', e); res.status(500).json({ error: e.message }); });

  // Firewall: bloquea IPs baneadas en todo /api (salvo health).
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || req.path === '/api/health') return next();
    if (!CFG.enabled) return next();
    const ip = clientIp(req); if (isPrivate(ip)) return next();
    const b = banActivo(ip);
    if (b) { logEv(q, { ip, pais: b.pais, tipo: 'bloqueo_ban', detalle: req.path }); return res.status(403).json({ error: 'Acceso bloqueado por seguridad', code: 'ip_baneada' }); }
    next();
  });

  // Observador del login: allowlist de país + auto-baneo por fuerza bruta.
  app.use((req, res, next) => {
    if (req.method !== 'POST' || req.path !== '/api/auth/login' || !CFG.enabled) return next();
    const ip = clientIp(req); if (isPrivate(ip)) return next();
    const pais = paisDe(ip);
    if (CFG.geo_enabled && Array.isArray(CFG.paises) && CFG.paises.length && (!pais || !CFG.paises.includes(pais))) {
      logEv(q, { ip, pais, tipo: 'bloqueo_pais', detalle: 'login' });
      return res.status(403).json({ error: 'Acceso no permitido desde tu ubicación', code: 'pais_bloqueado' });
    }
    const orig = res.json.bind(res);
    res.json = (body) => {
      try {
        if (res.statusCode === 401) {
          const arr = (fails.get(ip) || []).filter(x => Date.now() - x < CFG.ventana_min * 60000); arr.push(Date.now()); fails.set(ip, arr);
          logEv(q, { ip, pais, tipo: 'intento_fallido', detalle: 'intento ' + arr.length + '/' + CFG.max_intentos, username: (req.body || {}).username });
          if (CFG.auto_ban && arr.length >= CFG.max_intentos) { fails.delete(ip); banIP(q, ip, CFG.ban_min, 'Fuerza bruta (' + arr.length + ' intentos)', pais, arr.length); }
        } else if (res.statusCode < 300) { fails.delete(ip); logEv(q, { ip, pais, tipo: 'login_ok', username: (req.body || {}).username }); }
      } catch {}
      return orig(body);
    };
    next();
  });

  // ---- Endpoints admin ----
  app.get('/api/seguridad/config', authMiddleware, adminOnly, wrap(async (req, res) => res.json(CFG)));
  app.put('/api/seguridad/config', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body || {};
    CFG = {
      enabled: !!b.enabled, auto_ban: !!b.auto_ban,
      max_intentos: Math.max(1, parseInt(b.max_intentos, 10) || 5),
      ventana_min: Math.max(1, parseInt(b.ventana_min, 10) || 15),
      ban_min: Math.max(0, parseInt(b.ban_min, 10) || 0),
      geo_enabled: !!b.geo_enabled, paises: Array.isArray(b.paises) ? b.paises.filter(Boolean) : [],
    };
    await q("INSERT INTO app_config (clave,valor) VALUES ('seguridad',$1) ON CONFLICT (clave) DO UPDATE SET valor=$1", [JSON.stringify(CFG)]);
    res.json(CFG);
  }));
  app.get('/api/seguridad/stats', authMiddleware, adminOnly, wrap(async (req, res) => {
    const s = (await q(`SELECT
      count(*) FILTER (WHERE tipo='intento_fallido' AND ts>now()-interval '24 hours')::int intentos_24h,
      count(*) FILTER (WHERE tipo='bloqueo_ban' AND ts>now()-interval '24 hours')::int bloqueos_24h,
      count(*) FILTER (WHERE tipo='bloqueo_pais' AND ts>now()-interval '24 hours')::int pais_24h,
      count(*) FILTER (WHERE tipo='ban' AND ts>now()-interval '24 hours')::int bans_24h,
      count(DISTINCT ip) FILTER (WHERE tipo='intento_fallido' AND ts>now()-interval '24 hours')::int ips_24h
      FROM seguridad_eventos`)).rows[0];
    const activos = (await q("SELECT count(*)::int c FROM seguridad_bans WHERE activo AND (expira IS NULL OR expira>now())")).rows[0].c;
    const paises = (await q(`SELECT pais, count(*)::int c FROM seguridad_eventos WHERE pais IS NOT NULL AND ts>now()-interval '7 days' AND tipo IN ('intento_fallido','bloqueo_pais','bloqueo_ban') GROUP BY pais ORDER BY c DESC LIMIT 8`)).rows;
    res.json({ ...s, bans_activos: activos, paises });
  }));
  app.get('/api/seguridad/eventos', authMiddleware, adminOnly, wrap(async (req, res) => {
    const lim = Math.min(300, parseInt(req.query.limit, 10) || 100);
    res.json((await q('SELECT id,ts,ip,pais,tipo,detalle,username FROM seguridad_eventos ORDER BY ts DESC LIMIT $1', [lim])).rows);
  }));
  app.get('/api/seguridad/bans', authMiddleware, adminOnly, wrap(async (req, res) => {
    res.json((await q("SELECT ip,pais,motivo,intentos,created_at,expira FROM seguridad_bans WHERE activo AND (expira IS NULL OR expira>now()) ORDER BY created_at DESC")).rows);
  }));
  app.post('/api/seguridad/bans', authMiddleware, adminOnly, wrap(async (req, res) => {
    const ip = (req.body && req.body.ip || '').trim(); if (!ip) return res.status(400).json({ error: 'Falta la IP' });
    await banIP(q, ip, parseInt(req.body.min, 10) || 0, req.body.motivo || 'Baneo manual', paisDe(ip), null);
    logEv(q, { ip, tipo: 'ban_manual', detalle: req.body.motivo || 'Baneo manual' });
    res.json({ ok: true });
  }));
  app.delete('/api/seguridad/bans/:ip', authMiddleware, adminOnly, wrap(async (req, res) => {
    const ip = req.params.ip;
    await q('UPDATE seguridad_bans SET activo=false WHERE ip=$1', [ip]);
    bans.delete(ip); fails.delete(ip);
    logEv(q, { ip, tipo: 'unban', detalle: 'Deslistada por admin' });
    res.json({ ok: true });
  }));
  app.get('/api/seguridad/mi-ip', authMiddleware, wrap(async (req, res) => { const ip = clientIp(req); res.json({ ip, pais: paisDe(ip), privada: isPrivate(ip) }); }));
}
