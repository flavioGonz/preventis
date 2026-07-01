// Passkeys (WebAuthn / FIDO2): login passwordless y segundo factor con Face ID / huella / Windows Hello.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { authMiddleware, signToken } from './auth.js';

const SECRET = process.env.JWT_SECRET || 'preventis-dev-secret-change-me';
const b64u = { enc: (buf) => Buffer.from(buf).toString('base64url'), dec: (s) => Buffer.from(s, 'base64url') };

// rpID/origin dinámico según el host (soporta infratec e IES); override por env si el proxy no reenvía Host.
function rp(req) {
  const host = (process.env.WEBAUTHN_RPID || (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0] || '').trim();
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const origin = process.env.WEBAUTHN_ORIGIN || (proto + '://' + host);
  return { rpID: host, origin };
}

// Desafíos en memoria (5 min).
const regCh = new Map();   // userId -> {challenge, exp}
const authCh = new Map();  // challengeId -> {challenge, userId, exp}
const put = (m, k, v) => m.set(k, { ...v, exp: Date.now() + 5 * 60000 });
const get = (m, k) => { const e = m.get(k); if (!e || Date.now() > e.exp) { m.delete(k); return null; } return e; };
setInterval(() => { const t = Date.now(); for (const m of [regCh, authCh]) for (const [k, v] of m) if (v.exp < t) m.delete(k); }, 60000).unref?.();

export async function ensureWebauthnSchema(q) {
  await q(`CREATE TABLE IF NOT EXISTS passkeys (
    id serial PRIMARY KEY,
    user_id int REFERENCES usuarios(id) ON DELETE CASCADE,
    credential_id text UNIQUE NOT NULL,
    public_key text NOT NULL,
    counter bigint DEFAULT 0,
    transports text,
    device_name text,
    created_at timestamptz DEFAULT now(),
    last_used timestamptz
  )`);
}

export function mountWebauthn(app, q) {
  const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error('webauthn', e); res.status(500).json({ error: e.message }); });

  // ---- Registro de passkey (usuario autenticado) ----
  app.post('/api/webauthn/register/options', authMiddleware, wrap(async (req, res) => {
    const { rpID } = rp(req); const uid = req.user.id;
    const existing = (await q('SELECT credential_id, transports FROM passkeys WHERE user_id=$1', [uid])).rows;
    const opts = await generateRegistrationOptions({
      rpName: 'Preventis', rpID,
      userID: String(uid), userName: req.user.username || ('user' + uid), userDisplayName: req.user.nombre || req.user.username || ('user' + uid),
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({ id: b64u.dec(c.credential_id), type: 'public-key', transports: c.transports ? c.transports.split(',') : undefined })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    put(regCh, uid, { challenge: opts.challenge });
    res.json(opts);
  }));

  app.post('/api/webauthn/register/verify', authMiddleware, wrap(async (req, res) => {
    const { rpID, origin } = rp(req); const uid = req.user.id;
    const ch = get(regCh, uid);
    if (!ch) return res.status(400).json({ error: 'Desafío expirado, reintentá.' });
    const { response, device_name } = req.body || {};
    const v = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID });
    if (!v.verified || !v.registrationInfo) return res.status(400).json({ error: 'No se pudo verificar la passkey' });
    const { credentialID, credentialPublicKey, counter } = v.registrationInfo;
    const transports = ((response.response && response.response.transports) || []).join(',');
    await q(`INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, device_name)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (credential_id) DO NOTHING`,
      [uid, b64u.enc(credentialID), b64u.enc(credentialPublicKey), counter || 0, transports || null, (device_name || '').toString().slice(0, 60) || null]);
    regCh.delete(uid);
    res.json({ ok: true });
  }));

  app.get('/api/passkeys', authMiddleware, wrap(async (req, res) => {
    res.json((await q('SELECT id, device_name, created_at, last_used FROM passkeys WHERE user_id=$1 ORDER BY id DESC', [req.user.id])).rows);
  }));
  app.delete('/api/passkeys/:id', authMiddleware, wrap(async (req, res) => {
    await q('DELETE FROM passkeys WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  }));

  // ---- Login: passwordless (username o discoverable) y segundo factor (pending) ----
  app.post('/api/webauthn/login/options', wrap(async (req, res) => {
    const { rpID } = rp(req);
    const { username, pending } = req.body || {};
    let userId = null;
    if (pending) { try { const d = jwt.verify(pending, SECRET); if (d.twofa_pending) userId = d.id; } catch {} }
    else if (username) { const u = (await q('SELECT id FROM usuarios WHERE username=$1 AND activo', [username])).rows[0]; if (u) userId = u.id; }
    let allow = [];
    if (userId) {
      const creds = (await q('SELECT credential_id, transports FROM passkeys WHERE user_id=$1', [userId])).rows;
      allow = creds.map(c => ({ id: b64u.dec(c.credential_id), type: 'public-key', transports: c.transports ? c.transports.split(',') : undefined }));
    }
    const opts = await generateAuthenticationOptions({ rpID, userVerification: 'preferred', allowCredentials: allow.length ? allow : undefined });
    const cid = b64u.enc(Buffer.from(crypto.randomUUID()));
    put(authCh, cid, { challenge: opts.challenge, userId });
    res.json({ ...opts, challengeId: cid });
  }));

  app.post('/api/webauthn/login/verify', wrap(async (req, res) => {
    const { rpID, origin } = rp(req);
    const { challengeId, response } = req.body || {};
    const ch = get(authCh, challengeId);
    if (!ch) return res.status(400).json({ error: 'Desafío expirado, reintentá.' });
    const pk = (await q('SELECT * FROM passkeys WHERE credential_id=$1', [response && response.id])).rows[0];
    if (!pk) return res.status(400).json({ error: 'Passkey no reconocida' });
    if (ch.userId && pk.user_id !== ch.userId) return res.status(400).json({ error: 'La passkey no corresponde al usuario' });
    const v = await verifyAuthenticationResponse({
      response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID,
      authenticator: { credentialID: b64u.dec(pk.credential_id), credentialPublicKey: b64u.dec(pk.public_key), counter: Number(pk.counter) || 0 },
    });
    if (!v.verified) return res.status(400).json({ error: 'No se pudo verificar la passkey' });
    await q('UPDATE passkeys SET counter=$1, last_used=now() WHERE id=$2', [v.authenticationInfo.newCounter, pk.id]);
    authCh.delete(challengeId);
    const u = (await q('SELECT * FROM usuarios WHERE id=$1 AND activo', [pk.user_id])).rows[0];
    if (!u) return res.status(401).json({ error: 'Usuario inactivo' });
    res.json({ token: signToken(u), user: { id: u.id, username: u.username, nombre: u.nombre, rol: u.rol } });
  }));
}
