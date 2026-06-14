// Autenticacion en dos pasos (2FA).
// - TOTP (apps autenticadoras, RFC 6238) implementado con crypto nativo (sin dependencias).
// - OTP por WhatsApp (openwa) como metodo de respaldo.
// - Codigos de respaldo de un solo uso.
// El secreto TOTP se guarda cifrado con AES-256-GCM (misma clave derivada que las credenciales).
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { authMiddleware, adminOnly, signToken } from './auth.js';
import { sendMail, buildEmailHtml } from './mailer.js';

const SECRET = process.env.JWT_SECRET || 'preventis-dev-secret-change-me';
const KEY = crypto.createHash('sha256').update(process.env.CRED_KEY || process.env.JWT_SECRET || 'preventis-cred-default').digest();
const ISSUER = 'Preventis';

// ---- Cifrado del secreto ----
function enc(t) { if (t == null || t === '') return null; const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', KEY, iv); const ct = Buffer.concat([c.update(String(t), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'); }
function dec(b) { if (!b) return ''; try { const r = Buffer.from(b, 'base64'); const iv = r.subarray(0, 12), tag = r.subarray(12, 28), ct = r.subarray(28); const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); } catch { return ''; } }

// ---- Base32 (RFC 4648) ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(buf) { let bits = 0, val = 0, out = ''; for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
function b32decode(str) { str = String(str).replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = 0, val = 0; const out = []; for (const c of str) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } } return Buffer.from(out); }

// ---- TOTP ----
function hotp(key, counter) { const buf = Buffer.alloc(8); let c = counter; for (let i = 7; i >= 0; i--) { buf[i] = c & 0xff; c = Math.floor(c / 256); } const h = crypto.createHmac('sha1', key).update(buf).digest(); const o = h[h.length - 1] & 0xf; const code = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff); return String(code % 1000000).padStart(6, '0'); }
function totpVerify(secretB32, token, window = 1) { if (!token || !secretB32) return false; token = String(token).replace(/\s/g, ''); if (token.length !== 6) return false; const key = b32decode(secretB32); const t = Math.floor(Date.now() / 1000 / 30); for (let i = -window; i <= window; i++) if (hotp(key, t + i) === token) return true; return false; }

// ---- Codigos de respaldo ----
function genBackup() { const c = []; for (let i = 0; i < 10; i++) c.push(crypto.randomBytes(4).toString('hex')); return c; }
const normCode = (c) => String(c || '').toLowerCase().replace(/[\s-]/g, '');
const hashCode = (c) => crypto.createHash('sha256').update(normCode(c)).digest('hex');

// ---- OTP por WhatsApp (en memoria, 5 min) ----
const waCodes = new Map(); // userId -> { code, exp }
function setWa(userId) { const code = String(Math.floor(100000 + Math.random() * 900000)); waCodes.set(userId, { code, exp: Date.now() + 5 * 60000 }); return code; }
function checkWa(userId, code) { const e = waCodes.get(userId); if (!e || Date.now() > e.exp) return false; if (String(code).replace(/\s/g, '') === e.code) { waCodes.delete(userId); return true; } return false; }

export async function waSend(q, texto, telefono) {
  try {
    const cfg = ((await q("SELECT valor FROM app_config WHERE clave='chatbot'")).rows[0] || {}).valor || {};
    if (!cfg.url || !telefono) return false;
    const chatId = String(telefono).includes('@') ? telefono : String(telefono).replace(/[^0-9]/g, '') + '@c.us';
    if (!chatId || chatId === '@c.us') return false;
    let sid = cfg.session || 'default';
    const base = cfg.url.replace(/\/+$/, '');
    if (!/^[0-9a-f]{8}-/i.test(sid)) {
      try { const rs = await fetch(base + '/api/sessions', { headers: { 'X-API-Key': cfg.api_key || '' } }); const lj = await rs.json().catch(() => null); const list = Array.isArray(lj) ? lj : (lj && (lj.data || lj.sessions)) || []; const f = list.find(x => x.id === sid || x.name === sid); if (f) sid = f.id; } catch {}
    }
    const r = await fetch(base + '/api/sessions/' + sid + '/messages/send-text', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.api_key || '' },
      body: JSON.stringify({ chatId, text: texto }),
    });
    return r.ok;
  } catch { return false; }
}

const phoneHint = (t) => { const s = String(t || '').replace(/[^0-9]/g, ''); return s ? '••••' + s.slice(-3) : ''; };
const emailHint = (e) => { const s = String(e || '').trim(); const i = s.indexOf('@'); if (i < 1) return ''; return s.slice(0, Math.min(2, i)) + '•••' + s.slice(i); };

// ---- OTP por email (en memoria, 10 min) ----
const emailCodes = new Map(); // userId -> { code, exp }
function setEmail(userId) { const code = String(Math.floor(100000 + Math.random() * 900000)); emailCodes.set(userId, { code, exp: Date.now() + 10 * 60000 }); return code; }
function checkEmail(userId, code) { const e = emailCodes.get(userId); if (!e || Date.now() > e.exp) return false; if (String(code).replace(/\s/g, '') === e.code) { emailCodes.delete(userId); return true; } return false; }

// Envia el codigo de acceso por email usando la plantilla branded MJML.
async function sendEmailCode(q, email, code) {
  const built = await buildEmailHtml(q, {
    heading: 'Tu código de acceso',
    lead: 'Usá este código para completar tu ingreso a Preventis. Vence en 10 minutos.',
    paragraphs: ['Código: <b style="font-size:22px;letter-spacing:3px">' + code + '</b>'],
    footerNote: 'Si no intentaste ingresar, ignorá este correo.',
  });
  return sendMail(q, { to: email, subject: 'Preventis · código de acceso ' + code, html: built.html, attachments: built.attachments });
}

export async function ensure2FASchema(q) {
  await q(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS twofa_enabled boolean NOT NULL DEFAULT false;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS twofa_secret text;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS twofa_temp text;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS twofa_backup jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono text;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS last_seen timestamptz;`);
}

export function mount2FA(app, q) {
  // Anti fuerza bruta de 2FA (por usuario; el bloqueo expira solo).
  const _va = new Map();
  const VA_MAX = 6, VA_LOCK = 10 * 60000, VA_WIN = 10 * 60000;
  const vaBlocked = (k) => { const e = _va.get(k); return e && e.until > Date.now() ? Math.ceil((e.until - Date.now()) / 1000) : 0; };
  const vaFail = (k) => { const now = Date.now(); const e = _va.get(k) || { n: 0, first: now }; if (now - e.first > VA_WIN) { e.n = 0; e.first = now; } e.n++; if (e.n >= VA_MAX) e.until = now + VA_LOCK; _va.set(k, e); };
  const vaOk = (k) => _va.delete(k);
  // Anti spam de envio de OTP por WhatsApp (por usuario): max 4 cada 10 min.
  const _wa = new Map();
  const waResendOk = (k) => { const now = Date.now(); const e = _wa.get(k) || { n: 0, first: now }; if (now - e.first > 10 * 60000) { e.n = 0; e.first = now; } e.n++; _wa.set(k, e); return e.n <= 4; };

  // Acepta token de sesion completo o token de enrolamiento (twofa_setup) para las rutas de configuracion.
  const setupOrAuth = (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = (h.startsWith('Bearer ') ? h.slice(7) : null) || req.query.token || null;
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    try { req.user = jwt.verify(token, SECRET); if (req.user.twofa_pending) return res.status(403).json({ error: 'Token invalido' }); next(); }
    catch { return res.status(401).json({ error: 'Sesion invalida' }); }
  };

  // Generar secreto + QR (enrolamiento)
  app.post('/api/2fa/setup', setupOrAuth, async (req, res) => {
    try {
      const secret = b32encode(crypto.randomBytes(20));
      await q('UPDATE usuarios SET twofa_temp=$1 WHERE id=$2', [enc(secret), req.user.id]);
      const label = encodeURIComponent(ISSUER + ':' + (req.user.username || req.user.nombre || 'usuario'));
      const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=30`;
      const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 240 });
      res.json({ secret, otpauth, qr: qrDataUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Confirmar codigo y activar; opcionalmente guarda telefono para respaldo WhatsApp
  app.post('/api/2fa/enable', setupOrAuth, async (req, res) => {
    try {
      const { code, telefono } = req.body || {};
      const r = await q('SELECT twofa_temp FROM usuarios WHERE id=$1', [req.user.id]);
      const tempSecret = dec(r.rows[0]?.twofa_temp);
      if (!tempSecret) return res.status(400).json({ error: 'Primero genera el codigo QR' });
      if (!totpVerify(tempSecret, code)) return res.status(400).json({ error: 'Codigo incorrecto. Revisa la hora del telefono.' });
      const backup = genBackup();
      await q('UPDATE usuarios SET twofa_secret=$1, twofa_temp=NULL, twofa_enabled=true, twofa_backup=$2, telefono=COALESCE($3,telefono) WHERE id=$4',
        [enc(tempSecret), JSON.stringify(backup.map(hashCode)), telefono || null, req.user.id]);
      const u = (await q('SELECT id,username,nombre,rol FROM usuarios WHERE id=$1', [req.user.id])).rows[0];
      q("INSERT INTO auditoria (usuario,rol,metodo,ruta,status,detalle) VALUES ($1,$2,'POST','/2fa/enable',200,'2FA activado')", [u.username, u.rol]).catch(() => {});
      res.json({ ok: true, backup_codes: backup, token: signToken(u), user: u });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/2fa/status', authMiddleware, async (req, res) => {
    const r = await q('SELECT twofa_enabled, telefono, email FROM usuarios WHERE id=$1', [req.user.id]);
    res.json({ enabled: !!r.rows[0]?.twofa_enabled, has_phone: !!r.rows[0]?.telefono, phone_hint: phoneHint(r.rows[0]?.telefono), has_email: !!r.rows[0]?.email, email_hint: emailHint(r.rows[0]?.email) });
  });

  // Guardar/actualizar el numero de WhatsApp para el segundo factor por WhatsApp.
  app.post('/api/2fa/phone', authMiddleware, async (req, res) => {
    try {
      const tel = (req.body?.telefono || '').toString().trim() || null;
      await q('UPDATE usuarios SET telefono=$1 WHERE id=$2', [tel, req.user.id]);
      res.json({ ok: true, has_phone: !!tel, phone_hint: phoneHint(tel) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Enviar un codigo de prueba por WhatsApp (sesion activa) para validar la configuracion.
  app.post('/api/2fa/whatsapp/test', authMiddleware, async (req, res) => {
    try {
      const r = await q('SELECT telefono FROM usuarios WHERE id=$1', [req.user.id]);
      const tel = r.rows[0]?.telefono;
      if (!tel) return res.status(400).json({ error: 'Primero guarda tu numero de WhatsApp' });
      const ok = await waSend(q, 'Preventis: mensaje de prueba de verificacion en dos pasos. Si lo recibis, WhatsApp esta listo como segundo factor.', tel);
      if (!ok) return res.status(502).json({ error: 'No se pudo enviar. Revisa la configuracion del chatbot (Configuracion > Chatbot).' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Guardar/actualizar el email para el segundo factor por correo.
  app.post('/api/2fa/email', authMiddleware, async (req, res) => {
    try {
      const em = (req.body?.email || '').toString().trim().toLowerCase() || null;
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ error: 'Email inválido' });
      await q('UPDATE usuarios SET email=$1 WHERE id=$2', [em, req.user.id]);
      res.json({ ok: true, has_email: !!em, email_hint: emailHint(em) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Enviar un email de prueba para validar la configuracion de correo.
  app.post('/api/2fa/email/test', authMiddleware, async (req, res) => {
    try {
      const r = await q('SELECT email FROM usuarios WHERE id=$1', [req.user.id]);
      const em = r.rows[0]?.email;
      if (!em) return res.status(400).json({ error: 'Primero guardá tu email' });
      const built = await buildEmailHtml(q, { heading: 'Email de prueba', lead: 'Si recibís este mensaje, tu correo quedó listo como segundo factor de acceso a Preventis.', footerNote: 'Verificación en dos pasos · Preventis.' });
      await sendMail(q, { to: em, subject: 'Preventis · prueba de verificación por email', html: built.html, attachments: built.attachments });
      res.json({ ok: true });
    } catch (e) { res.status(502).json({ error: 'No se pudo enviar. Revisá Configuración › Correo. ' + e.message }); }
  });

  // Desactivar (requiere contrasena actual)
  app.post('/api/2fa/disable', authMiddleware, async (req, res) => {
    try {
      const bcrypt = (await import('bcryptjs')).default;
      const { password } = req.body || {};
      const r = await q('SELECT password,username,rol FROM usuarios WHERE id=$1', [req.user.id]);
      if (!r.rows[0] || !(await bcrypt.compare(password || '', r.rows[0].password))) return res.status(400).json({ error: 'Contrasena incorrecta' });
      await q("UPDATE usuarios SET twofa_enabled=false, twofa_secret=NULL, twofa_temp=NULL, twofa_backup='[]'::jsonb WHERE id=$1", [req.user.id]);
      q("INSERT INTO auditoria (usuario,rol,metodo,ruta,status,detalle) VALUES ($1,$2,'POST','/2fa/disable',200,'2FA desactivado')", [r.rows[0].username, r.rows[0].rol]).catch(() => {});
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Restablecer el 2FA de OTRO usuario (solo admin). No expone codigos: fuerza
  // re-enrolamiento en el proximo ingreso. Queda en auditoria y avisa por WhatsApp.
  app.post('/api/usuarios/:id/reset-2fa', authMiddleware, adminOnly, async (req, res) => {
    try {
      const r = await q('SELECT username, nombre, rol, telefono FROM usuarios WHERE id=$1', [req.params.id]);
      const u = r.rows[0];
      if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
      await q("UPDATE usuarios SET twofa_enabled=false, twofa_secret=NULL, twofa_temp=NULL, twofa_backup='[]'::jsonb WHERE id=$1", [req.params.id]);
      q("INSERT INTO auditoria (usuario,rol,metodo,ruta,status,detalle) VALUES ($1,$2,'POST','/usuarios/reset-2fa',200,$3)",
        [req.user?.username || '?', req.user?.rol || '?', 'Restablecio 2FA de ' + (u.username || req.params.id)]).catch(() => {});
      if (u.telefono) waSend(q, 'Preventis: un administrador restableció tu verificación en dos pasos. La próxima vez que ingreses se te pedirá configurarla de nuevo.', u.telefono).catch(() => {});
      res.json({ ok: true, era_admin: u.rol === 'admin' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Login paso 2 (publicas: validan el token pending del cuerpo) ----
  const pendingUser = async (pending) => { const p = jwt.verify(pending, SECRET); if (!p.twofa_pending) throw new Error('bad'); return (await q('SELECT * FROM usuarios WHERE id=$1 AND activo', [p.id])).rows[0]; };

  app.post('/api/auth/2fa/whatsapp', async (req, res) => {
    try {
      const u = await pendingUser(req.body?.pending);
      if (!u || !u.telefono) return res.status(400).json({ error: 'No hay telefono configurado para WhatsApp' });
      if (!waResendOk('u' + u.id)) return res.status(429).json({ error: 'Demasiados envios de codigo. Espera unos minutos.' });
      const code = setWa(u.id);
      const ok = await waSend(q, 'Preventis: tu codigo de acceso es ' + code + ' (vence en 5 minutos).', u.telefono);
      if (!ok) return res.status(502).json({ error: 'No se pudo enviar el WhatsApp. Usa la app autenticadora.' });
      res.json({ ok: true, phone_hint: phoneHint(u.telefono) });
    } catch { res.status(401).json({ error: 'Sesion de login expirada, vuelve a ingresar.' }); }
  });

  app.post('/api/auth/2fa/email', async (req, res) => {
    try {
      const u = await pendingUser(req.body?.pending);
      if (!u || !u.email) return res.status(400).json({ error: 'No hay email configurado.' });
      if (!waResendOk('e' + u.id)) return res.status(429).json({ error: 'Demasiados envios de codigo. Espera unos minutos.' });
      const code = setEmail(u.id);
      try { await sendEmailCode(q, u.email, code); }
      catch (e) { return res.status(502).json({ error: 'No se pudo enviar el email. Usa la app autenticadora.' }); }
      res.json({ ok: true, email_hint: emailHint(u.email) });
    } catch { res.status(401).json({ error: 'Sesion de login expirada, vuelve a ingresar.' }); }
  });

  app.post('/api/auth/2fa/verify', async (req, res) => {
    try {
      const { pending, code, type } = req.body || {};
      const u = await pendingUser(pending);
      if (!u) return res.status(401).json({ error: 'Sesion de login expirada, vuelve a ingresar.' });
      const vk = 'u' + u.id;
      const vwait = vaBlocked(vk);
      if (vwait) return res.status(429).json({ error: 'Demasiados intentos. Espera ' + Math.ceil(vwait / 60) + ' minuto(s).' });
      let ok = false;
      if (type === 'whatsapp') ok = checkWa(u.id, code);
      else if (type === 'email') ok = checkEmail(u.id, code);
      else if (type === 'backup') {
        const h = hashCode(code); const list = Array.isArray(u.twofa_backup) ? u.twofa_backup : [];
        if (list.includes(h)) { ok = true; await q('UPDATE usuarios SET twofa_backup=$1 WHERE id=$2', [JSON.stringify(list.filter(x => x !== h)), u.id]); }
      } else ok = totpVerify(dec(u.twofa_secret), code);
      if (!ok) { vaFail(vk); return res.status(400).json({ error: 'Codigo incorrecto' }); }
      vaOk(vk);
      const user = { id: u.id, username: u.username, nombre: u.nombre, rol: u.rol };
      res.json({ token: signToken(u), user });
    } catch { res.status(401).json({ error: 'Sesion de login expirada, vuelve a ingresar.' }); }
  });
}

// Verifica el codigo 2FA (TOTP o codigo de respaldo) de un usuario ya autenticado. Reutilizado por el OTA.
export async function verify2FACode(q, userId, code) {
  if (!code) return false;
  const u = (await q('SELECT * FROM usuarios WHERE id=$1', [userId])).rows[0];
  if (!u || !u.twofa_enabled) return false;
  if (totpVerify(dec(u.twofa_secret), code)) return true;
  const h = hashCode(code);
  const list = Array.isArray(u.twofa_backup) ? u.twofa_backup : [];
  if (list.includes(h)) { await q('UPDATE usuarios SET twofa_backup=$1 WHERE id=$2', [JSON.stringify(list.filter(x => x !== h)), u.id]); return true; }
  return false;
}
