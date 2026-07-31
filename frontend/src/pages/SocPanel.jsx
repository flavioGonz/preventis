import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';

// Bandera real (imagen). Windows no renderiza los emoji de bandera, por eso usamos flagcdn con fallback al código.
function Flag({ cc, size = 18 }) {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return <span style={{ fontSize: Math.round(size * 0.7), fontWeight: 700, color: 'var(--subtle)' }}>🏴</span>;
  const h = Math.round(size * 0.75);
  return <img src={'https://flagcdn.com/48x36/' + cc.toLowerCase() + '.png'} width={size} height={h} alt={cc.toUpperCase()} loading="lazy"
    style={{ borderRadius: 2, objectFit: 'cover', verticalAlign: 'middle', boxShadow: '0 0 0 1px rgba(0,0,0,.08)', flexShrink: 0 }}
    onError={e => { e.currentTarget.onerror = null; e.currentTarget.outerHTML = '<span style="font-size:10px;font-weight:700;color:var(--subtle)">' + cc.toUpperCase() + '</span>'; }} />;
}
const PAISES = [
  ['UY', 'Uruguay'], ['AR', 'Argentina'], ['BR', 'Brasil'], ['CL', 'Chile'], ['PY', 'Paraguay'], ['BO', 'Bolivia'], ['PE', 'Perú'],
  ['CO', 'Colombia'], ['EC', 'Ecuador'], ['VE', 'Venezuela'], ['MX', 'México'], ['US', 'Estados Unidos'], ['CA', 'Canadá'],
  ['CR', 'Costa Rica'], ['PA', 'Panamá'], ['GT', 'Guatemala'], ['HN', 'Honduras'], ['SV', 'El Salvador'], ['NI', 'Nicaragua'],
  ['DO', 'Rep. Dominicana'], ['CU', 'Cuba'], ['PR', 'Puerto Rico'], ['ES', 'España'], ['PT', 'Portugal'], ['FR', 'Francia'],
  ['IT', 'Italia'], ['DE', 'Alemania'], ['GB', 'Reino Unido'], ['IE', 'Irlanda'], ['NL', 'Países Bajos'], ['BE', 'Bélgica'],
  ['CH', 'Suiza'], ['AT', 'Austria'], ['SE', 'Suecia'], ['NO', 'Noruega'], ['DK', 'Dinamarca'], ['FI', 'Finlandia'],
  ['PL', 'Polonia'], ['CZ', 'Chequia'], ['RO', 'Rumania'], ['GR', 'Grecia'], ['RU', 'Rusia'], ['UA', 'Ucrania'], ['TR', 'Turquía'],
  ['CN', 'China'], ['JP', 'Japón'], ['KR', 'Corea del Sur'], ['IN', 'India'], ['ID', 'Indonesia'], ['VN', 'Vietnam'],
  ['SG', 'Singapur'], ['HK', 'Hong Kong'], ['AU', 'Australia'], ['NZ', 'Nueva Zelanda'], ['ZA', 'Sudáfrica'], ['NG', 'Nigeria'],
  ['EG', 'Egipto'], ['MA', 'Marruecos'], ['IL', 'Israel'], ['AE', 'Emiratos Árabes'], ['SA', 'Arabia Saudita'], ['IR', 'Irán'],
];
const paisNom = (cc) => (PAISES.find(p => p[0] === cc) || [cc, cc])[1];

const EVT = {
  intento_fallido: ['Intento fallido', '#f59e0b', 'alert'],
  ban: ['Baneo automático', '#ef4444', 'ban'],
  ban_manual: ['Baneo manual', '#ef4444', 'ban'],
  bloqueo_ban: ['Bloqueo (IP baneada)', '#dc2626', 'shield'],
  bloqueo_pais: ['Bloqueo por país', '#a855f7', 'globe'],
  login_ok: ['Ingreso correcto', '#22c55e', 'checkCircle'],
  unban: ['Deslistada', '#38bdf8', 'checkCircle'],
};
const CATS = [['', 'Todos'], ['intentos', 'Intentos'], ['baneos', 'Baneos'], ['bloqueos', 'Bloqueos'], ['ingresos', 'Ingresos']];
const fdt = (d) => d ? new Date(d).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const rel = (d) => { const s = (Date.now() - new Date(d).getTime()) / 1000; if (s < 60) return 'hace ' + Math.floor(s) + 's'; if (s < 3600) return 'hace ' + Math.floor(s / 60) + 'm'; if (s < 86400) return 'hace ' + Math.floor(s / 3600) + 'h'; return 'hace ' + Math.floor(s / 86400) + 'd'; };

const CSS = `
.soc *{box-sizing:border-box}
.soc-card{background:var(--surface);border:1px solid var(--border);border-radius:16px}
.soc-sub{background:var(--surface-2);border:1px solid var(--border);border-radius:12px}
.soc-tgl{width:44px;height:24px;border-radius:999px;border:1px solid var(--border);background:var(--surface-2);position:relative;cursor:pointer;transition:.2s;padding:0;flex-shrink:0}
.soc-tgl[data-on="1"]{background:var(--brand-600);border-color:var(--brand-600)}
.soc-tgl>span{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:.2s}
.soc-tgl[data-on="1"]>span{left:22px}
.soc-livedot{width:8px;height:8px;border-radius:50%;background:#22c55e;animation:socPing 1.6s infinite}
@keyframes socPing{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%{box-shadow:0 0 0 9px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
.soc-shield{animation:socFloat 3.2s ease-in-out infinite}
@keyframes socFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
.soc-bar{height:7px;border-radius:5px;background:var(--surface-2);overflow:hidden}
.soc-bar>i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#ef4444,#f59e0b);transition:width .55s ease}
.soc-ev{animation:socIn .25s ease}
@keyframes socIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.soc-tab{border:1px solid var(--border);background:var(--surface);color:var(--muted);border-radius:10px;padding:8px 14px;font-weight:600;font-size:13.5px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.15s}
.soc-tab.on{background:var(--brand-600);color:#fff;border-color:var(--brand-600)}
.soc-chipf{border:1px solid var(--border);background:var(--surface-2);color:var(--muted);border-radius:999px;padding:3px 12px;font-size:12.5px;cursor:pointer;transition:.15s}
.soc-chipf.on{background:var(--brand-soft);color:var(--brand-700);border-color:var(--brand-600)}
.soc-kpi{flex:1;min-width:150px}
.soc-mini{width:32px;height:32px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center}
.soc-iconbtn{border:1px solid var(--border);background:var(--surface);color:var(--muted);border-radius:8px;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.15s}
.soc-iconbtn:hover{color:var(--falla);border-color:var(--falla)}
`;

function Toggle({ on, onChange, tip }) {
  return <button type="button" className="soc-tgl" data-on={on ? '1' : '0'} data-tip={tip} aria-label={tip} onClick={() => onChange(!on)}><span /></button>;
}

// Buscador multi-país con banderas (reutilizado para lista blanca y baneo de países).
function CountryPicker({ value = [], onToggle, placeholder, tone = 'var(--brand-700)' }) {
  const [qy, setQy] = useState('');
  const res = PAISES.filter(([cc, nm]) => !qy || nm.toLowerCase().includes(qy.toLowerCase()) || cc.toLowerCase().includes(qy.toLowerCase()));
  return (
    <div>
      {value.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {value.map(cc => <span key={cc} className="soc-sub" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', fontSize: 12.5, color: tone }}><Flag cc={cc} size={16} /> {paisNom(cc)}
          <button onClick={() => onToggle(cc)} aria-label="Quitar" style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, opacity: .7, display: 'inline-flex' }}><Icon name="x" size={11} /></button></span>)}
      </div>}
      <div className="soc-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
        <Icon name="search" size={15} /><input value={qy} onChange={e => setQy(e.target.value)} placeholder={placeholder} style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', flex: 1, fontSize: 14 }} />
      </div>
      {qy.trim() && <div className="soc-sub" style={{ maxHeight: 200, overflow: 'auto', marginTop: 6 }}>
        {res.length === 0 ? <div style={{ padding: 10, color: 'var(--subtle)', fontSize: 13 }}>Sin resultados</div> :
          res.map(([cc, nm]) => <div key={cc} onClick={() => { onToggle(cc); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 14, background: value.includes(cc) ? 'var(--brand-soft)' : 'transparent' }}>
            <Flag cc={cc} size={20} />{nm}<span style={{ marginLeft: 'auto', color: 'var(--subtle)', fontSize: 11 }}>{cc}</span>{value.includes(cc) && <Icon name="check" size={14} color="var(--ok)" />}
          </div>)}
      </div>}
    </div>
  );
}

export default function SocPanel() {
  const [cfg, setCfg] = useState(null);
  const [stats, setStats] = useState(null);
  const [bans, setBans] = useState([]);
  const [feed, setFeed] = useState({ rows: [], total: 0, page: 1, pages: 1 });
  const [miIp, setMiIp] = useState(null);
  const [tab, setTab] = useState('ops');
  const [cat, setCat] = useState('');
  const [fpage, setFpage] = useState(1);
  const [live, setLive] = useState(true);
  const [banPage, setBanPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [manIp, setManIp] = useState(''); const [manMotivo, setManMotivo] = useState(''); const [manMin, setManMin] = useState('');

  const loadStats = () => api.get('/api/seguridad/stats').then(setStats).catch(() => { });
  const loadBans = () => api.get('/api/seguridad/bans').then(setBans).catch(() => { });
  const loadFeed = () => api.get('/api/seguridad/eventos?limit=25&page=' + fpage + (cat ? '&cat=' + cat : '')).then(r => setFeed(Array.isArray(r) ? { rows: r, total: r.length, page: 1, pages: 1 } : r)).catch(() => { });
  const loadAll = () => { api.get('/api/seguridad/config').then(setCfg).catch(() => { }); loadStats(); loadBans(); api.get('/api/seguridad/mi-ip').then(setMiIp).catch(() => { }); };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadFeed(); }, [cat, fpage]);
  useEffect(() => { if (!live) return; const t = setInterval(() => { loadStats(); if (fpage === 1) loadFeed(); }, 15000); return () => clearInterval(t); }, [live, fpage, cat]);

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }));
  const guardar = async (silent) => { setSaving(true); try { const r = await api.put('/api/seguridad/config', cfg); setCfg(r); if (!silent) toast.ok('Configuración guardada'); } catch (e) { toast.err(e.message); } setSaving(false); return true; };
  const togglePais = (key, cc) => setCfg(c => { const cur = c[key] || []; return { ...c, [key]: cur.includes(cc) ? cur.filter(x => x !== cc) : [...cur, cc] }; });
  const banearPais = async (cc) => { const cur = cfg.paises_baneados || []; if (cur.includes(cc)) return; const nuevo = { ...cfg, paises_baneados: [...cur, cc] }; setCfg(nuevo); try { await api.put('/api/seguridad/config', nuevo); toast.ok(paisNom(cc) + ' bloqueado'); } catch (e) { toast.err(e.message); } };
  const banIp = async (ip, min) => { try { await api.post('/api/seguridad/bans', { ip, motivo: 'Baneo desde SOC', min: min || 0 }); toast.ok('IP ' + ip + ' baneada'); loadBans(); loadStats(); } catch (e) { toast.err(e.message); } };
  const banManual = async () => { if (!manIp.trim()) return; await banIp(manIp.trim(), Number(manMin) || 0); setManIp(''); setManMotivo(''); setManMin(''); };
  const deslistar = async (ip) => { if (!confirm('¿Deslistar la IP ' + ip + '?')) return; try { await api.del('/api/seguridad/bans/' + encodeURIComponent(ip)); toast.ok('IP deslistada'); loadBans(); loadStats(); } catch (e) { toast.err(e.message); } };

  if (!cfg) return <div style={{ padding: 20, color: 'var(--subtle)' }}>Cargando panel de seguridad…</div>;

  const KPI = ({ ic, label, value, color, tip }) => (
    <div className="soc-card soc-kpi" data-tip={tip} style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12.5, marginBottom: 6 }}><span style={{ color }}><Icon name={ic} size={15} /></span>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{value ?? 0}</div>
    </div>
  );
  const maxAtk = Math.max(1, ...(stats?.paises || []).map(p => p.c));
  const banPages = Math.max(1, Math.ceil(bans.length / 10));
  const bansShown = bans.slice((banPage - 1) * 10, banPage * 10);

  return (
    <div className="soc">
      <style>{CSS}</style>

      {/* Header */}
      <div className="soc-card" style={{ padding: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="soc-shield soc-mini" style={{ width: 46, height: 46, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff' }}><Icon name="shield" size={24} /></span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Centro de Seguridad · SOC</div>
          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Quién intentó entrar, desde dónde, y qué lo frenó</div>
        </div>
        <span data-tip={cfg.enabled ? 'El firewall está filtrando accesos' : 'Protección desactivada: no se bloquea nada'} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: cfg.enabled ? 'var(--ok)' : 'var(--falla)', background: cfg.enabled ? 'var(--ok-bg)' : 'var(--falla-bg)', border: '1px solid ' + (cfg.enabled ? 'var(--ok)' : 'var(--falla)'), padding: '6px 12px', borderRadius: 999 }}>
          {cfg.enabled ? <span className="soc-livedot" /> : <Icon name="alert" size={13} />}{cfg.enabled ? 'Protección activa' : 'Desactivada'}
        </span>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <KPI ic="alert" label="Intentos fallidos (24h)" value={stats?.intentos_24h} color="#f59e0b" tip="Logins con contraseña incorrecta en las últimas 24 horas" />
        <KPI ic="globe" label="IPs atacantes (24h)" value={stats?.ips_24h} color="#38bdf8" tip="Direcciones IP distintas que fallaron el login" />
        <KPI ic="ban" label="Baneos automáticos (24h)" value={stats?.bans_24h} color="#ef4444" tip="IPs baneadas solas por superar el umbral de intentos" />
        <KPI ic="shield" label="Bloqueos por país (24h)" value={stats?.pais_24h} color="#a855f7" tip="Accesos frenados por la lista blanca / países baneados" />
        <KPI ic="ban" label="IPs baneadas ahora" value={stats?.bans_activos} color="#22c55e" tip="Baneos activos en este momento" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['ops', 'Centro de operaciones', 'globe'], ['ajustes', 'Ajustes del borde', 'settings'], ['listas', 'IPs baneadas', 'ban'], ['paises', 'Filtro por país', 'shield']].map(([k, l, ic]) =>
          <button key={k} className={'soc-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}><Icon name={ic} size={15} />{l}{k === 'listas' && bans.length > 0 ? ' (' + bans.length + ')' : ''}</button>)}
      </div>

      {/* ===== OPERACIONES ===== */}
      {tab === 'ops' && <>
        <div className="soc-card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <b style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="history" size={16} />Registro de seguridad en vivo</b>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: live ? 'var(--ok)' : 'var(--subtle)', fontWeight: 700 }}>{live && <span className="soc-livedot" />}{live ? 'EN VIVO' : 'PAUSADO'}</span>
            <span style={{ color: 'var(--subtle)', fontSize: 12 }}>· {feed.total} eventos</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATS.map(([v, l]) => <span key={v || 'all'} className={'soc-chipf' + (cat === v ? ' on' : '')} onClick={() => { setCat(v); setFpage(1); }}>{l}</span>)}
              <button className="soc-iconbtn" data-tip={live ? 'Pausar auto-actualización' : 'Reanudar en vivo'} onClick={() => setLive(v => !v)} style={{ color: 'var(--muted)' }}><Icon name={live ? 'clock' : 'repeat'} size={15} /></button>
            </div>
          </div>
          <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            {feed.rows.length === 0 ? <div style={{ padding: 16, color: 'var(--subtle)', fontSize: 13 }}>Sin actividad registrada.</div> :
              feed.rows.map(ev => { const [lbl, col] = EVT[ev.tipo] || [ev.tipo, 'var(--muted)']; return (
                <div key={ev.id} className="soc-ev" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--subtle)', fontFamily: 'monospace', flexShrink: 0 }}>{new Date(ev.ts).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <span style={{ color: col, minWidth: 130, fontWeight: 600, flexShrink: 0 }}>{lbl}</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>{ev.pais && <Flag cc={ev.pais} size={16} />}{ev.ip || '—'}</span>
                  <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.username ? '· ' + ev.username : ''}{ev.detalle ? ' · ' + ev.detalle : ''}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--subtle)', flexShrink: 0 }} data-tip={fdt(ev.ts)}>{rel(ev.ts)}</span>
                </div>
              ); })}
          </div>
          {feed.pages > 1 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <span style={{ color: 'var(--subtle)', fontSize: 12.5 }}>pág. {feed.page}/{feed.pages}</span>
            <button className="btn sec sm" disabled={fpage <= 1} onClick={() => setFpage(p => Math.max(1, p - 1))}><Icon name="chevronLeft" size={15} /></button>
            <button className="btn sec sm" disabled={fpage >= feed.pages} onClick={() => setFpage(p => Math.min(feed.pages, p + 1))}><Icon name="chevronRight" size={15} /></button>
          </div>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
          {/* De dónde vienen los ataques */}
          <div className="soc-card" style={{ padding: 16 }}>
            <b style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}><Icon name="pin" size={16} />De dónde vienen los ataques <span style={{ color: 'var(--subtle)', fontWeight: 400, fontSize: 12 }}>(7 días)</span></b>
            {(stats?.paises || []).length === 0 ? <div style={{ color: 'var(--subtle)', fontSize: 13 }}>Sin datos aún.</div> :
              (stats.paises).map(p => <div key={p.pais} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Flag cc={p.pais} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{paisNom(p.pais)}</span><b>{p.c}</b></div>
                  <div className="soc-bar"><i style={{ width: Math.round(p.c / maxAtk * 100) + '%' }} /></div>
                </div>
                <button className="soc-iconbtn" data-tip={(cfg.paises_baneados || []).includes(p.pais) ? 'Ya está bloqueado' : 'Bloquear todo este país'} disabled={(cfg.paises_baneados || []).includes(p.pais)} onClick={() => banearPais(p.pais)}><Icon name="ban" size={15} /></button>
              </div>)}
          </div>

          {/* Los más insistentes */}
          <div className="soc-card" style={{ padding: 16 }}>
            <b style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}><Icon name="alert" size={16} />Los más insistentes <span style={{ color: 'var(--subtle)', fontWeight: 400, fontSize: 12 }}>(por golpes)</span></b>
            {(stats?.top_ips || []).length === 0 ? <div style={{ color: 'var(--subtle)', fontSize: 13 }}>Sin datos aún.</div> :
              (stats.top_ips).map(t => <div key={t.ip} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <Flag cc={t.pais} size={20} />
                <span style={{ fontFamily: 'monospace', fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.ip}</span>
                <span className="soc-sub" style={{ padding: '2px 9px', fontSize: 12.5, fontWeight: 700 }}>{t.c}</span>
                <button className="soc-iconbtn" data-tip="Banear esta IP (permanente)" onClick={() => banIp(t.ip, 0)}><Icon name="ban" size={15} /></button>
              </div>)}
          </div>
        </div>
      </>}

      {/* ===== AJUSTES ===== */}
      {tab === 'ajustes' && <div className="soc-card" style={{ padding: 18, maxWidth: 620 }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}><Icon name="settings" size={16} />Ajustes del firewall</b>
        <label style={rowT}><div><div style={{ fontWeight: 600 }}>Protección activada</div><div style={sub}>Enciende/apaga todo el firewall de accesos.</div></div><Toggle on={!!cfg.enabled} onChange={v => set('enabled', v)} tip="Activa o desactiva el firewall completo" /></label>
        <label style={rowT}><div><div style={{ fontWeight: 600 }}>Auto-banear por fuerza bruta</div><div style={sub}>Banea solo a las IPs que superan el umbral de intentos.</div></div><Toggle on={!!cfg.auto_ban} onChange={v => set('auto_ban', v)} tip="Baneo automático ante intentos repetidos" /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, margin: '14px 0' }}>
          <Num label="Intentos máx." tip="Cuántos logins fallidos se toleran antes de banear" value={cfg.max_intentos} onChange={v => set('max_intentos', v)} />
          <Num label="Ventana (min)" tip="Los intentos se cuentan dentro de esta ventana de tiempo" value={cfg.ventana_min} onChange={v => set('ventana_min', v)} />
          <Num label="Ban (min · 0=∞)" tip="Duración del baneo. 0 = permanente" value={cfg.ban_min} onChange={v => set('ban_min', v)} />
        </div>
        <button className="btn block" onClick={() => guardar(false)} disabled={saving}><Icon name="check" size={16} />{saving ? 'Guardando…' : 'Guardar configuración'}</button>
        {miIp && <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Icon name="globe" size={13} />Tu IP: <b style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{miIp.ip || '—'}</b>{miIp.pais && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Flag cc={miIp.pais} size={16} /> {paisNom(miIp.pais)}</span>}{miIp.privada && <span style={{ color: 'var(--ok)' }}>(red interna)</span>}</div>}
      </div>}

      {/* ===== LISTAS (IPs baneadas) ===== */}
      {tab === 'listas' && <div className="soc-card" style={{ padding: 16 }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><Icon name="ban" size={16} color="var(--falla)" />IPs baneadas <span style={{ color: 'var(--subtle)', fontWeight: 400 }}>({bans.length})</span></b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input value={manIp} onChange={e => setManIp(e.target.value)} placeholder="IP a banear (ej. 203.0.113.5)" style={{ flex: 1, minWidth: 160, fontFamily: 'monospace' }} />
          <input value={manMotivo} onChange={e => setManMotivo(e.target.value)} placeholder="Motivo (opcional)" style={{ flex: 1, minWidth: 140 }} />
          <input value={manMin} onChange={e => setManMin(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Min · 0=∞" style={{ width: 110 }} inputMode="numeric" data-tip="Minutos de baneo (0 = permanente)" />
          <button className="btn danger" onClick={banManual} disabled={!manIp.trim()}><Icon name="ban" size={15} />Banear</button>
        </div>
        {bans.length === 0 ? <div style={{ color: 'var(--subtle)', fontSize: 13, padding: 6 }}>No hay IPs baneadas.</div> :
          <div className="tablewrap" style={{ maxHeight: 420, overflow: 'auto' }}>
            <table className="table">
              <thead><tr><th>IP</th><th>País</th><th>Motivo</th><th>Intentos</th><th>Desde</th><th>Expira</th><th></th></tr></thead>
              <tbody>{bansShown.map(b => (
                <tr key={b.ip}>
                  <td className="mono">{b.ip}</td>
                  <td>{b.pais ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Flag cc={b.pais} size={16} /> {paisNom(b.pais)}</span> : <span className="subtle">—</span>}</td>
                  <td>{b.motivo || '—'}</td>
                  <td>{b.intentos ?? '—'}</td>
                  <td className="mono subtle">{fdt(b.created_at)}</td>
                  <td>{b.expira ? <span className="mono subtle">{fdt(b.expira)}</span> : <span className="badge warn">Permanente</span>}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn sec sm" data-tip="Quitar el baneo de esta IP" onClick={() => deslistar(b.ip)}><Icon name="check" size={14} />Deslistar</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
        {banPages > 1 && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span style={{ color: 'var(--subtle)', fontSize: 12.5 }}>pág. {banPage}/{banPages}</span>
          <button className="btn sec sm" disabled={banPage <= 1} onClick={() => setBanPage(p => p - 1)}><Icon name="chevronLeft" size={15} /></button>
          <button className="btn sec sm" disabled={banPage >= banPages} onClick={() => setBanPage(p => p + 1)}><Icon name="chevronRight" size={15} /></button>
        </div>}
      </div>}

      {/* ===== PAÍSES ===== */}
      {tab === 'paises' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
        <div className="soc-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Icon name="shield" size={16} color="var(--ok)" /><b>Lista blanca (permitir solo estos)</b></div>
          <div style={{ ...sub, marginBottom: 10 }}>Si está activada, <b>solo</b> se podrá iniciar sesión desde los países elegidos.</div>
          <label style={{ ...rowT, borderTop: 'none', paddingTop: 0 }}><div style={{ fontWeight: 600 }}>Restringir acceso por país</div><Toggle on={!!cfg.geo_enabled} onChange={v => set('geo_enabled', v)} tip="Activa la lista blanca de países" /></label>
          {cfg.geo_enabled && <div style={{ marginTop: 10 }}><CountryPicker value={cfg.paises || []} onToggle={cc => togglePais('paises', cc)} placeholder="Buscar país para permitir…" tone="var(--ok)" /></div>}
          {miIp?.pais && cfg.geo_enabled && !(cfg.paises || []).includes(miIp.pais) && <div className="badge warn" style={{ marginTop: 10 }}><Icon name="alert" size={13} />Tu país (<Flag cc={miIp.pais} size={14} /> {paisNom(miIp.pais)}) no está en la lista. <button className="btn ghost sm" onClick={() => togglePais('paises', miIp.pais)}>Agregarlo</button></div>}
        </div>
        <div className="soc-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Icon name="ban" size={16} color="var(--falla)" /><b>Países baneados (bloquear estos)</b></div>
          <div style={{ ...sub, marginBottom: 10 }}>Se bloquea el login desde estos países, siempre (independiente de la lista blanca).</div>
          <CountryPicker value={cfg.paises_baneados || []} onToggle={cc => togglePais('paises_baneados', cc)} placeholder="Buscar país para bloquear…" tone="var(--falla)" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button className="btn" onClick={() => guardar(false)} disabled={saving}><Icon name="check" size={16} />{saving ? 'Guardando…' : 'Guardar filtros de país'}</button>
        </div>
      </div>}
    </div>
  );
}

const rowT = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 0', borderTop: '1px solid var(--border)', cursor: 'default' };
const sub = { fontSize: 12, color: 'var(--muted)' };

function Num({ label, value, onChange, tip }) {
  return <label style={{ fontSize: 12, color: 'var(--muted)' }} data-tip={tip}>{label}
    <input value={value ?? ''} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" style={{ width: '100%', marginTop: 4 }} />
  </label>;
}
