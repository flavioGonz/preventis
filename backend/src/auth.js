import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'preventis-dev-secret-change-me';
const EXPIRES = '12h';

const PUBLIC = ['/api/health', '/api/auth/login', '/api/auth/2fa/verify', '/api/auth/2fa/whatsapp', '/api/chatbot/webhook', '/api/branding', '/api/manifest.webmanifest'];
const phoneHint = (t) => { const s = String(t || '').replace(/[^0-9]/g, ''); return s ? '••••' + s.slice(-3) : ''; };
// Rutas permitidas a un token de enrolamiento obligatorio (twofa_setup)
const SETUP_PATHS = ['/api/2fa/setup', '/api/2fa/enable', '/api/2fa/status', '/api/auth/me'];

export function signToken(u) {
  return jwt.sign({ id: u.id, username: u.username, nombre: u.nombre, rol: u.rol }, SECRET, { expiresIn: EXPIRES });
}

export function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = (h.startsWith('Bearer ') ? h.slice(7) : null) || req.query.token || null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try { req.user = jwt.verify(token, SECRET); }
  catch { return res.status(401).json({ error: 'Sesion invalida o expirada' }); }
  // Un token "pending" (login a medias) no sirve como sesion.
  if (req.user.twofa_pending) return res.status(403).json({ error: 'Completa la verificacion en dos pasos' });
  // Un token de enrolamiento obligatorio solo puede tocar las rutas de configuracion 2FA.
  if (req.user.twofa_setup && !SETUP_PATHS.includes(req.path)) return res.status(403).json({ error: 'Debes configurar la verificacion en dos pasos', code: 'twofa_setup' });
  next();
}

export function adminOnly(req, res, next) {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Requiere rol administrador' });
  next();
}

function guard(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (PUBLIC.includes(req.path)) return next();
  return authMiddleware(req, res, next);
}

export async function ensureAuthSchema(q) {
  await q(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id          SERIAL PRIMARY KEY,
      username    TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      nombre      TEXT,
      rol         TEXT NOT NULL DEFAULT 'tecnico',
      activo      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  const n = await q('SELECT count(*)::int AS c FROM usuarios');
  if (n.rows[0].c === 0) {
    const hash = await bcrypt.hash('admin1234', 10);
    await q('INSERT INTO usuarios (username,password,nombre,rol) VALUES ($1,$2,$3,$4)',
      ['admin', hash, 'Administrador', 'admin']);
    console.log('Usuario admin creado (admin / admin1234)');
  }
}

export function mountAuth(app, q) {
  // Anti fuerza bruta de login (en memoria, por usuario; el bloqueo expira solo).
  const _la = new Map();
  const LA_MAX = 10, LA_LOCK = 10 * 60000, LA_WIN = 15 * 60000;
  const laBlocked = (k) => { const e = _la.get(k); return e && e.until > Date.now() ? Math.ceil((e.until - Date.now()) / 1000) : 0; };
  const laFail = (k) => { const now = Date.now(); const e = _la.get(k) || { n: 0, first: now }; if (now - e.first > LA_WIN) { e.n = 0; e.first = now; } e.n++; if (e.n >= LA_MAX) e.until = now + LA_LOCK; _la.set(k, e); };
  const laOk = (k) => _la.delete(k);

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const lk = String(username || '').toLowerCase().trim() || 'anon';
      const wait = laBlocked(lk);
      if (wait) return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera ' + Math.ceil(wait / 60) + ' minuto(s).' });
      const r = await q('SELECT * FROM usuarios WHERE username=$1 AND activo', [username]);
      const u = r.rows[0];
      if (!u || !(await bcrypt.compare(password || '', u.password))) {
        laFail(lk);
        return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
      }
      laOk(lk);
      const baseUser = { id: u.id, username: u.username, nombre: u.nombre, rol: u.rol };
      // 2FA ya activo -> pedir segundo factor (no se emite la sesion todavia).
      if (u.twofa_enabled) {
        const pending = jwt.sign({ id: u.id, twofa_pending: true }, SECRET, { expiresIn: '5m' });
        return res.json({ twofa_required: true, pending, methods: ['totp', ...(u.telefono ? ['whatsapp'] : [])], phone_hint: phoneHint(u.telefono) });
      }
      // Admin sin 2FA -> enrolamiento obligatorio (token acotado a las rutas de configuracion).
      if (u.rol === 'admin') {
        const setup_token = jwt.sign({ ...baseUser, twofa_setup: true }, SECRET, { expiresIn: '20m' });
        return res.json({ twofa_setup_required: true, setup_token, user: baseUser });
      }
      res.json({ token: signToken(u), user: baseUser });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => res.json(req.user));

  app.use(guard);

  // Presencia: marca last_seen del usuario (throttle en memoria para no escribir en cada request).
  const seenAt = new Map();
  app.use((req, res, next) => {
    const u = req.user;
    if (u && u.id && !u.twofa_pending && !u.twofa_setup) {
      const now = Date.now();
      if (now - (seenAt.get(u.id) || 0) > 20000) { seenAt.set(u.id, now); q('UPDATE usuarios SET last_seen=now() WHERE id=$1', [u.id]).catch(() => {}); }
    }
    next();
  });

  // Usuarios en linea (activos en los ultimos 2 minutos).
  app.get('/api/usuarios/online', authMiddleware, adminOnly, async (req, res) => {
    const r = await q("SELECT id, username, nombre, rol, avatar_path, last_seen, EXTRACT(EPOCH FROM (now()-last_seen))::int AS hace_seg FROM usuarios WHERE last_seen > now() - interval '2 minutes' ORDER BY last_seen DESC");
    res.json(r.rows);
  });

  app.get('/api/usuarios', authMiddleware, adminOnly, async (req, res) => {
    const r = await q('SELECT id,username,nombre,rol,activo,avatar_path,created_at FROM usuarios ORDER BY id');
    res.json(r.rows);
  });
  app.post('/api/usuarios', authMiddleware, adminOnly, async (req, res) => {
    try {
      const { username, password, nombre, rol } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Usuario y contrasena requeridos' });
      const hash = await bcrypt.hash(password, 10);
      const r = await q("INSERT INTO usuarios (username,password,nombre,rol) VALUES ($1,$2,$3,COALESCE($4,'tecnico')) RETURNING id,username,nombre,rol,activo",
        [username, hash, nombre, rol]);
      res.status(201).json(r.rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Ese usuario ya existe' });
      res.status(500).json({ error: e.message });
    }
  });
  app.put('/api/usuarios/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
      const { nombre, rol, activo, password } = req.body;
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        await q('UPDATE usuarios SET password=$1 WHERE id=$2', [hash, req.params.id]);
      }
      const r = await q('UPDATE usuarios SET nombre=COALESCE($1,nombre), rol=COALESCE($2,rol), activo=COALESCE($3,activo) WHERE id=$4 RETURNING id,username,nombre,rol,activo',
        [nombre, rol, activo, req.params.id]);
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/usuarios/:id', authMiddleware, adminOnly, async (req, res) => {
    if (String(req.user.id) === String(req.params.id)) return res.status(400).json({ error: 'No podes eliminar tu propio usuario' });
    await q('DELETE FROM usuarios WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  });
}
