// Correo saliente (SMTP) — configuración cifrada + envío reutilizable.
// La contraseña SMTP se guarda cifrada con AES-256-GCM (misma clave derivada que credenciales/2FA).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import mjml2html from 'mjml';
import { authMiddleware, adminOnly } from './auth.js';

const KEY = crypto.createHash('sha256').update(process.env.CRED_KEY || process.env.JWT_SECRET || 'preventis-cred-default').digest();
function enc(t) { if (t == null || t === '') return null; const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', KEY, iv); const ct = Buffer.concat([c.update(String(t), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'); }
function dec(b) { if (!b) return ''; try { const r = Buffer.from(b, 'base64'); const iv = r.subarray(0, 12), tag = r.subarray(12, 28), ct = r.subarray(28); const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); } catch { return ''; } }

export async function getEmailCfg(q) {
  try { const r = (await q("SELECT valor FROM app_config WHERE clave='email'")).rows[0]; return r?.valor || {}; } catch { return {}; }
}

function transportFrom(cfg) {
  if (!cfg.host || !cfg.user) return null;
  const port = Number(cfg.port) || 587;
  return nodemailer.createTransport({
    host: cfg.host, port, secure: cfg.secure ?? (port === 465),
    auth: { user: cfg.user, pass: dec(cfg.pass_enc) },
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000,
  });
}

// Envío reutilizable desde cualquier módulo
export async function sendMail(q, { to, subject, html, text, attachments }) {
  const cfg = await getEmailCfg(q);
  if (!cfg.enabled) throw new Error('El correo no está habilitado en Configuración');
  const tr = transportFrom(cfg);
  if (!tr) throw new Error('Falta configurar el servidor de correo');
  const from = cfg.from_name ? `${cfg.from_name} <${cfg.from || cfg.user}>` : (cfg.from || cfg.user);
  return tr.sendMail({ from, to, subject, html, text, attachments });
}

// ---- Plantilla de email branded (MJML) ----
async function getBrand(q) { try { const r = (await q("SELECT valor FROM app_config WHERE clave='branding'")).rows[0]; return r?.valor || {}; } catch { return {}; } }
function brandLogoPath(brand) {
  if (brand.logo_path) { const p = path.join('/opt/preventis/backend/uploads', path.basename(brand.logo_path)); if (fs.existsSync(p)) return p; }
  for (const p of ['/opt/preventis/frontend/public/logo.png', '/opt/preventis/frontend/dist/logo.png', '/opt/preventis/frontend/public/logo_es.png']) { if (fs.existsSync(p)) return p; }
  return null;
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Devuelve { html, attachments } listo para sendMail. paragraphs: string[]
export async function buildEmailHtml(q, { heading, lead, paragraphs = [], ctaText, ctaUrl, footerNote } = {}) {
  const brand = await getBrand(q);
  const empresa = brand.pdf_empresa || brand.empresa || brand.app_nombre || 'Preventis';
  const color = brand.color || '#2563eb';
  const logo = brandLogoPath(brand);
  const attachments = [];
  let logoBlock = `<mj-text font-size="20px" font-weight="bold" color="${color}" padding="0">${esc(empresa)}</mj-text>`;
  if (logo) { attachments.push({ filename: 'logo' + (path.extname(logo) || '.png'), path: logo, cid: 'brandlogo' }); logoBlock = `<mj-image width="150px" align="left" padding="0" src="cid:brandlogo" />`; }
  const paras = (paragraphs || []).map(p => `<mj-text font-size="14px" color="#334155" line-height="22px" padding="6px 0 0">${esc(p)}</mj-text>`).join('');
  const cta = (ctaText && ctaUrl) ? `<mj-button background-color="${color}" color="#ffffff" border-radius="8px" href="${esc(ctaUrl)}" align="left" padding="16px 0 0">${esc(ctaText)}</mj-button>` : '';
  const mjml = `<mjml><mj-body background-color="#f1f5f9">
    <mj-section padding="22px 0 6px"><mj-column>${logoBlock}</mj-column></mj-section>
    <mj-section background-color="#ffffff" border-radius="14px" padding="30px"><mj-column>
      ${heading ? `<mj-text font-size="20px" font-weight="bold" color="#0f172a" padding="0 0 6px">${esc(heading)}</mj-text>` : ''}
      ${lead ? `<mj-text font-size="15px" color="#334155" line-height="23px" padding="0">${esc(lead)}</mj-text>` : ''}
      ${paras}${cta}
    </mj-column></mj-section>
    <mj-section padding="12px 0 24px"><mj-column>
      <mj-text font-size="11px" color="#94a3b8" align="center" line-height="17px">${esc(empresa)} · ${esc(footerNote || 'Correo automático, no respondas a esta dirección.')}</mj-text>
    </mj-column></mj-section>
  </mj-body></mjml>`;
  const out = mjml2html(mjml, { validationLevel: 'soft' });
  return { html: out.html, attachments };
}

export function mountEmail(app, q) {
  app.get('/api/email/config', authMiddleware, adminOnly, async (req, res) => {
    const c = await getEmailCfg(q);
    res.json({ host: c.host || '', port: c.port || 587, secure: !!c.secure, user: c.user || '', from: c.from || '', from_name: c.from_name || '', enabled: !!c.enabled, has_pass: !!c.pass_enc });
  });

  app.put('/api/email/config', authMiddleware, adminOnly, async (req, res) => {
    const b = req.body || {}; const cur = await getEmailCfg(q);
    const next = {
      host: b.host ?? cur.host ?? '', port: Number(b.port) || cur.port || 587,
      secure: b.secure ?? cur.secure ?? false, user: b.user ?? cur.user ?? '',
      from: b.from ?? cur.from ?? '', from_name: b.from_name ?? cur.from_name ?? '',
      enabled: b.enabled ?? cur.enabled ?? false, pass_enc: cur.pass_enc || null,
    };
    if (b.pass !== undefined && b.pass !== '') next.pass_enc = enc(b.pass);
    if (b.clear_pass) next.pass_enc = null;
    await q("INSERT INTO app_config (clave,valor) VALUES ('email',$1) ON CONFLICT (clave) DO UPDATE SET valor=$1", [JSON.stringify(next)]);
    res.json({ ok: true });
  });

  app.post('/api/email/test', authMiddleware, adminOnly, async (req, res) => {
    const to = (req.body || {}).to;
    if (!to) return res.status(400).json({ error: 'Indicá un destinatario' });
    try {
      const info = await sendMail(q, {
        to, subject: 'Preventis · correo de prueba',
        text: 'Este es un correo de prueba de Preventis. Si lo recibís, la configuración SMTP funciona.',
        html: '<div style="font-family:Arial,sans-serif"><p>Este es un <b>correo de prueba</b> de Preventis.</p><p>Si lo recibís, la configuración SMTP está funcionando ✅</p></div>',
      });
      res.json({ ok: true, id: info.messageId });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
}
