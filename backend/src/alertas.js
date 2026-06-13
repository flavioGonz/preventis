// Sistema de alertas: matriz evento × canal (email / WhatsApp / in-app) configurable.
// Config en app_config clave 'alertas': { _public_url, <evento>: {email,whatsapp,inapp,al_cliente,al_tecnico,destinatarios[],telefonos[]} }
import { authMiddleware, adminOnly } from './auth.js';
import { sendMail, buildEmailHtml } from './mailer.js';
import { waSend } from './twofa.js';
import { notify } from './realtime.js';

export const EVENTOS = [
  { id: 'visita_agendada', label: 'Visita agendada', desc: 'Cuando se crea/agenda una visita.', icon: 'calendar' },
  { id: 'visita_cerrada', label: 'Visita cerrada', desc: 'Al cerrar una visita (informe listo).', icon: 'checkCircle' },
  { id: 'equipo_falla', label: 'Equipo en falla', desc: 'Cuando una prueba marca un equipo en falla.', icon: 'alert' },
  { id: 'ticket_nuevo', label: 'Ticket nuevo', desc: 'Al crear un ticket de soporte.', icon: 'ticket' },
];

async function getCfg(q) { try { const r = (await q("SELECT valor FROM app_config WHERE clave='alertas'")).rows[0]; return r?.valor || {}; } catch { return {}; } }
const absUrl = (base, url) => { if (!url) return ''; if (/^https?:/i.test(url)) return url; const b = (base || '').replace(/\/+$/, ''); return b ? b + url : ''; };
const uniqList = (arr) => [...new Set((arr || []).map(x => String(x == null ? '' : x).trim()).filter(Boolean))];

// Despacho central. ctx: { titulo, texto, url, clienteId, tecnicoId }
export async function dispatchAlerta(q, evento, ctx = {}) {
  try {
    const all = await getCfg(q);
    const r = all[evento];
    if (!r) return;
    const base = all._public_url || process.env.PUBLIC_URL || '';
    const link = absUrl(base, ctx.url);

    if (r.inapp !== false) notify({ type: evento, icon: (EVENTOS.find(e => e.id === evento) || {}).icon || 'bell', text: ctx.titulo + (ctx.texto ? ' · ' + ctx.texto : ''), url: ctx.url || null });

    let clienteEmail, clienteTel, tecnicoTel;
    if (r.al_cliente && ctx.clienteId) {
      try { const c = (await q('SELECT telefono FROM clientes WHERE id=$1', [ctx.clienteId])).rows[0]; clienteTel = c?.telefono; } catch {}
      try { const ce = (await q("SELECT email FROM cliente_contactos WHERE cliente_id=$1 AND email IS NOT NULL AND email<>'' ORDER BY id LIMIT 1", [ctx.clienteId])).rows[0]; clienteEmail = ce?.email; } catch {}
    }
    if (r.al_tecnico && ctx.tecnicoId) { try { const t = (await q('SELECT telefono FROM tecnicos WHERE id=$1', [ctx.tecnicoId])).rows[0]; tecnicoTel = t?.telefono; } catch {} }

    if (r.email) {
      const to = uniqList([...(r.destinatarios || []), r.al_cliente ? clienteEmail : null]);
      if (to.length) {
        try {
          const built = await buildEmailHtml(q, { heading: ctx.titulo, lead: ctx.texto, ctaText: link ? 'Abrir en Preventis' : null, ctaUrl: link || null, footerNote: 'Alerta automática del sistema de mantenimientos.' });
          await sendMail(q, { to: to.join(','), subject: ctx.titulo, html: built.html, attachments: built.attachments });
        } catch (e) { console.error('alerta email:', e.message); }
      }
    }

    if (r.whatsapp) {
      const nums = uniqList([...(r.telefonos || []), r.al_cliente ? clienteTel : null, r.al_tecnico ? tecnicoTel : null]);
      if (nums.length) {
        const msg = '*' + ctx.titulo + '*' + (ctx.texto ? '\n' + ctx.texto : '') + (link ? '\n' + link : '');
        for (const n of nums) { try { await waSend(q, msg, n); } catch (e) { console.error('alerta wa:', e.message); } }
      }
    }
  } catch (e) { console.error('dispatchAlerta:', e.message); }
}

export function mountAlertas(app, q) {
  app.get('/api/alertas/eventos', authMiddleware, adminOnly, (req, res) => res.json(EVENTOS));
  app.get('/api/alertas/config', authMiddleware, adminOnly, async (req, res) => res.json(await getCfg(q)));
  app.put('/api/alertas/config', authMiddleware, adminOnly, async (req, res) => {
    await q("INSERT INTO app_config (clave,valor) VALUES ('alertas',$1) ON CONFLICT (clave) DO UPDATE SET valor=$1", [JSON.stringify(req.body || {})]);
    res.json({ ok: true });
  });
  app.post('/api/alertas/test', authMiddleware, adminOnly, async (req, res) => {
    const ev = (req.body || {}).evento || EVENTOS[0].id;
    await dispatchAlerta(q, ev, { titulo: 'Alerta de prueba', texto: 'Prueba del sistema de alertas (' + ev + ').' });
    res.json({ ok: true });
  });
}
