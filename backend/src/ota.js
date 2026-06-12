// ===== OTA — actualización del sistema vía Git (disparada por la app, ejecutada por root) =====
import { execFile } from 'child_process';
import fs from 'fs';
import { authMiddleware, adminOnly } from './auth.js';
import { verify2FACode } from './twofa.js';

const APP = '/opt/preventis';
const OTA_DIR = '/var/lib/preventis/ota';
const STATUS = OTA_DIR + '/status.json';
const TRIGGER = OTA_DIR + '/trigger';

function git(args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile('git', ['-C', APP, ...args], { timeout }, (err, stdout) => resolve(err ? '' : String(stdout).trim()));
  });
}
function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS, 'utf8')); }
  catch { return { state: 'idle', pct: 0, step: '' }; }
}

// Anti fuerza bruta del código 2FA en el OTA
const _ota = new Map();
const otaBlocked = (k) => { const e = _ota.get(k); return (e && e.until > Date.now()) ? Math.ceil((e.until - Date.now()) / 1000) : 0; };
const otaFail = (k) => { const e = _ota.get(k) || { n: 0 }; e.n = (e.n || 0) + 1; if (e.n >= 5) { e.until = Date.now() + 10 * 60000; e.n = 0; } _ota.set(k, e); };
const otaOk = (k) => _ota.delete(k);

export function mountOTA(app, q) {
  // Versión instalada (+ chequeo best-effort de si hay algo nuevo en el repo)
  app.get('/api/system/version', authMiddleware, adminOnly, async (req, res) => {
    const hash = await git(['rev-parse', '--short', 'HEAD']);
    const full = await git(['rev-parse', 'HEAD']);
    const subject = await git(['log', '-1', '--pretty=%s']);
    const date = await git(['log', '-1', '--pretty=%cI']);
    const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])) || 'main';
    let remoteFull = '';
    try {
      const ls = await new Promise((resolve) => execFile('git', ['-C', APP, 'ls-remote', 'origin', 'refs/heads/' + branch], { timeout: 15000 }, (e, o) => resolve(e ? '' : String(o).trim())));
      remoteFull = (ls.split(/\s+/)[0] || '');
    } catch {}
    res.json({
      version: hash || '—', full, subject, date, branch,
      remote: remoteFull ? remoteFull.slice(0, 7) : null,
      updateAvailable: remoteFull ? (remoteFull !== full) : null,
    });
  });

  // Estado del proceso de actualización (polling de la UI)
  app.get('/api/system/update/status', authMiddleware, adminOnly, (req, res) => res.json(readStatus()));

  // Lanzar la actualización — requiere el 2FA del admin
  app.post('/api/system/update', authMiddleware, adminOnly, async (req, res) => {
    const k = 'u' + req.user.id;
    const wait = otaBlocked(k);
    if (wait) return res.status(429).json({ error: 'Demasiados intentos. Espera ' + Math.ceil(wait / 60) + ' minuto(s).' });
    const st = readStatus();
    if (st.state === 'running' || st.state === 'queued') return res.status(409).json({ error: 'Ya hay una actualización en curso.' });
    const code = (req.body || {}).code;
    const ok = await verify2FACode(q, req.user.id, code);
    if (!ok) { otaFail(k); return res.status(401).json({ error: 'Código 2FA incorrecto.' }); }
    otaOk(k);
    try {
      fs.mkdirSync(OTA_DIR, { recursive: true });
      fs.writeFileSync(STATUS, JSON.stringify({ state: 'queued', pct: 0, step: 'En cola', ts: new Date().toISOString() }));
      fs.writeFileSync(TRIGGER, JSON.stringify({ by: req.user.username, ts: new Date().toISOString() }));
    } catch (e) { return res.status(500).json({ error: 'No se pudo iniciar la actualización: ' + e.message }); }
    res.json({ started: true });
  });
}
