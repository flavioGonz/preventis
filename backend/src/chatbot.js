// Chatbot de WhatsApp: numeros autorizados, captura de remitentes, comandos.
// El envio real lo hace extras.js (waSend). Aca vive la logica de autorizacion y comandos.
import { authMiddleware, adminOnly } from './auth.js';
import { notify } from './realtime.js';

const norm = (t) => String(t || '').replace(/[^0-9]/g, '');
const fechaUY = (d) => { try { return new Date(d).toLocaleDateString('es-UY'); } catch { return ''; } };
const ymd = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x.toISOString().slice(0, 10); };
function parseFecha(s) {
  s = String(s || '').trim().toLowerCase();
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  if (/^hoy/.test(s)) return ymd(hoy);
  if (/^(mañana|manana)/.test(s)) { const d = new Date(hoy); d.setDate(d.getDate() + 1); return ymd(d); }
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (m) { let [, d, mo, y] = m; y = y ? (y.length === 2 ? '20' + y : y) : String(hoy.getFullYear()); return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  return null;
}

// --- Conversaciones con estado (crear ticket / visita por pasos) ---
const sessions = new Map(); // telefono -> { flow, step, data, exp, opciones, tecs }
const TTL = 10 * 60000;
const getSession = (tel) => { const s = sessions.get(tel); if (!s) return null; if (Date.now() > s.exp) { sessions.delete(tel); return null; } return s; };
const touch = (s) => { s.exp = Date.now() + TTL; return s; };
const startTicket = (tel) => { sessions.set(tel, { flow: 'ticket', step: 'cliente', data: {}, exp: Date.now() + TTL }); return '🎫 *Nuevo ticket*\n¿Para qué cliente? Escribí parte del nombre.\n(_cancelar_ para salir)'; };
const startVisita = (tel) => { sessions.set(tel, { flow: 'visita', step: 'cliente', data: {}, exp: Date.now() + TTL }); return '📅 *Nueva visita*\n¿Para qué cliente? Escribí parte del nombre.\n(_cancelar_ para salir)'; };
const buscarClientes = async (q, txt) => (await q("SELECT id, nombre FROM clientes WHERE nombre ILIKE $1 ORDER BY nombre LIMIT 8", ['%' + String(txt).trim() + '%'])).rows;
const trasCliente = (sess) => { if (sess.flow === 'ticket') { sess.step = 'titulo'; return 'Cliente: *' + sess.data.cliente + '*\n¿Cuál es el título o problema del ticket?'; } sess.step = 'fecha'; return 'Cliente: *' + sess.data.cliente + '*\n¿Para qué fecha? (_hoy_, _mañana_ o DD/MM)'; };
const esSi = (t) => /^(s[ií]|ok|dale|confirmar?|si)$/i.test(String(t).trim());

// ---------- Finanzas (solo numeros admin) ----------
const MEDIOS = ['Efectivo', 'Transferencia', 'Débito/Crédito', 'Cheque', 'Otro'];
const esAdminBot = (s) => s && s.rol === 'admin';
const fmtMoney = (n, mon) => (mon === 'USD' ? 'US$ ' : '$ ') + Number(n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function parseMonto(s) {
  const str = String(s || '').toLowerCase();
  const moneda = /\b(usd|u\$s|us\$|d[oó]lar|d[oó]lares)\b/.test(str) ? 'USD' : 'UYU';
  let num = str.replace(/[^0-9.,]/g, '');
  if (!num) return null;
  if (num.includes(',') && num.includes('.')) num = num.lastIndexOf(',') > num.lastIndexOf('.') ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '');
  else if (num.includes(',')) { const p = num.split(','); num = (p.length === 2 && p[1].length <= 2) ? num.replace(',', '.') : num.replace(/,/g, ''); }
  else if ((num.match(/\./g) || []).length > 1) num = num.replace(/\./g, '');
  else if (num.includes('.') && (num.split('.')[1] || '').length === 3) num = num.replace(/\./g, '');
  const v = parseFloat(num);
  if (!isFinite(v) || v <= 0) return null;
  return { monto: Math.round(v * 100) / 100, moneda };
}
const startFactura = (tel) => { sessions.set(tel, { flow: 'factura', step: 'tipo', data: {}, exp: Date.now() + TTL }); return '🧾 *Nueva factura*\n¿Es emitida o recibida?\n1) Emitida (a un cliente)\n2) Recibida (de un proveedor)\n(_cancelar_ para salir)'; };
const startCobro = (tel) => { sessions.set(tel, { flow: 'cobro', step: 'cliente', data: {}, exp: Date.now() + TTL }); return '💵 *Nuevo cobro* (ingreso)\n¿De qué cliente? Escribí parte del nombre.\n(_cancelar_ para salir)'; };
const startPago = (tel) => { sessions.set(tel, { flow: 'pago', step: 'tercero', data: {}, exp: Date.now() + TTL }); return '💸 *Nuevo pago* (egreso)\n¿A quién le pagaste? (proveedor)\n(_cancelar_ para salir)'; };

const finTrasCliente = (sess) => { sess.step = 'monto'; return 'Cliente: *' + sess.data.cliente + '*\n¿Monto cobrado? (ej. 1500 o 1500 usd)'; };
function finResumen(sess) {
  const d = sess.data;
  if (sess.flow === 'cobro') return '¿Confirmás?\n💵 *Cobro* de *' + d.cliente + '*\n• Monto: ' + fmtMoney(d.monto, d.moneda) + '\n• Medio: ' + (d.medio || '-') + '\n(_sí_ / _no_)';
  if (sess.flow === 'pago') return '¿Confirmás?\n💸 *Pago* a *' + d.tercero + '*\n• Monto: ' + fmtMoney(d.monto, d.moneda) + '\n• Medio: ' + (d.medio || '-') + '\n(_sí_ / _no_)';
  return '¿Confirmás?\n🧾 *Factura ' + d.tipo + '*\n• ' + (d.cliente || d.tercero || '') + (d.numero ? '\n• N°: ' + d.numero : '') + '\n• Monto: ' + fmtMoney(d.monto, d.moneda) + (d.vencimiento ? '\n• Vence: ' + fechaUY(d.vencimiento) : '') + '\n(_sí_ / _no_)';
}

async function financeStep(q, tel, sess, t, sender, helpers) {
  touch(sess); const d = sess.data; const tt = String(t).trim();
  if (sess.step === 'cliente') {
    const cs = await buscarClientes(q, tt);
    if (!cs.length) return 'No encontré clientes con "' + tt + '". Probá de nuevo o _cancelar_.';
    if (cs.length === 1) { d.cliente_id = cs[0].id; d.cliente = cs[0].nombre; return sess.flow === 'factura' ? (sess.step = 'numero', '¿Número de factura? (o *-* si no tiene)') : finTrasCliente(sess); }
    sess.opciones = cs; sess.step = 'cliente_pick';
    return 'Encontré varios:\n' + cs.map((c, i) => (i + 1) + ') ' + c.nombre).join('\n') + '\nRespondé con el número.';
  }
  if (sess.step === 'cliente_pick') {
    const c = sess.opciones?.[parseInt(tt) - 1];
    if (!c) return 'Elegí un número de la lista, o _cancelar_.';
    d.cliente_id = c.id; d.cliente = c.nombre;
    return sess.flow === 'factura' ? (sess.step = 'numero', 'Cliente: *' + c.nombre + '*\n¿Número de factura? (o *-* si no tiene)') : finTrasCliente(sess);
  }
  if (sess.step === 'monto') {
    const m = parseMonto(tt);
    if (!m) return 'No entendí el monto. Escribí un número, ej. *1500* o *1500 usd*.';
    d.monto = m.monto; d.moneda = m.moneda;
    if (sess.flow === 'cobro' || sess.flow === 'pago') { sess.step = 'medio'; return '¿Medio de pago?\n' + MEDIOS.map((x, i) => (i + 1) + ') ' + x).join('\n'); }
    sess.step = 'vencimiento'; return '¿Vencimiento? (DD/MM, _hoy_, o *-* para sin fecha)';
  }
  if (sess.step === 'medio') {
    const idx = parseInt(tt) - 1; d.medio = (idx >= 0 && MEDIOS[idx]) ? MEDIOS[idx] : tt.slice(0, 40);
    sess.step = 'confirm'; return finResumen(sess);
  }
  if (sess.flow === 'pago' && sess.step === 'tercero') { d.tercero = tt.slice(0, 120); sess.step = 'monto'; return 'Proveedor: *' + d.tercero + '*\n¿Monto pagado? (ej. 1500 o 1500 usd)'; }
  if (sess.flow === 'factura') {
    if (sess.step === 'tipo') {
      const tp = { '1': 'emitida', '2': 'recibida', emitida: 'emitida', recibida: 'recibida' }[tt.toLowerCase()];
      if (!tp) return 'Respondé 1 (emitida) o 2 (recibida).';
      d.tipo = tp;
      if (tp === 'emitida') { sess.step = 'cliente'; return '¿Para qué cliente? Escribí parte del nombre.'; }
      sess.step = 'tercero'; return '¿De qué proveedor? (nombre)';
    }
    if (sess.step === 'tercero') { d.tercero = tt.slice(0, 120); sess.step = 'numero'; return 'Proveedor: *' + d.tercero + '*\n¿Número de factura? (o *-* si no tiene)'; }
    if (sess.step === 'numero') { d.numero = (tt === '-' ? null : tt.slice(0, 60)); sess.step = 'monto'; return '¿Monto de la factura? (ej. 1500 o 1500 usd)'; }
    if (sess.step === 'vencimiento') { if (tt === '-') d.vencimiento = null; else { const f = parseFecha(tt); if (!f) return 'No entendí la fecha. Probá DD/MM, _hoy_ o *-*.'; d.vencimiento = f; } sess.step = 'confirm'; return finResumen(sess); }
  }
  if (sess.step === 'confirm') {
    if (!esSi(t)) { sessions.delete(tel); return 'Ok, no lo registré. Escribí el comando de nuevo para empezar otra vez.'; }
    if (sess.flow === 'cobro') {
      const r = await q("INSERT INTO fin_cobros (cliente_id,fecha,monto,moneda,medio) VALUES ($1,CURRENT_DATE,$2,$3,$4) RETURNING id", [d.cliente_id, d.monto, d.moneda, d.medio || null]);
      d.compro = { tipo: 'cobros', ref_id: r.rows[0].id }; sess.step = 'comprobante';
      try { notify({ type: 'fin', icon: 'file', text: '💵 Cobro (WhatsApp): ' + fmtMoney(d.monto, d.moneda) + ' — ' + d.cliente, url: '/contable' }); } catch {}
      return '✅ Cobro #' + r.rows[0].id + ' registrado: ' + fmtMoney(d.monto, d.moneda) + ' de ' + d.cliente + '.\n📎 Si querés, mandá ahora la *foto del comprobante*, o escribí *listo*.';
    }
    if (sess.flow === 'pago') {
      const r = await q("INSERT INTO fin_pagos (tercero,fecha,monto,moneda,medio) VALUES ($1,CURRENT_DATE,$2,$3,$4) RETURNING id", [d.tercero, d.monto, d.moneda, d.medio || null]);
      d.compro = { tipo: 'pagos', ref_id: r.rows[0].id }; sess.step = 'comprobante';
      try { notify({ type: 'fin', icon: 'file', text: '💸 Pago (WhatsApp): ' + fmtMoney(d.monto, d.moneda) + ' — ' + d.tercero, url: '/contable' }); } catch {}
      return '✅ Pago #' + r.rows[0].id + ' registrado: ' + fmtMoney(d.monto, d.moneda) + ' a ' + d.tercero + '.\n📎 Si querés, mandá ahora la *foto del comprobante*, o escribí *listo*.';
    }
    if (sess.flow === 'factura') {
      const r = await q("INSERT INTO fin_facturas (tipo,cliente_id,tercero,numero,fecha,vencimiento,monto,moneda,estado) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,'pendiente') RETURNING id", [d.tipo, d.cliente_id || null, d.tercero || null, d.numero || null, d.vencimiento || null, d.monto, d.moneda]);
      sessions.delete(tel);
      try { notify({ type: 'fin', icon: 'file', text: '🧾 Factura ' + d.tipo + ' (WhatsApp): ' + fmtMoney(d.monto, d.moneda) + ' — ' + (d.cliente || d.tercero || ''), url: '/contable' }); } catch {}
      return '✅ Factura *' + d.tipo + '* registrada: ' + fmtMoney(d.monto, d.moneda) + ' — ' + (d.cliente || d.tercero || '') + (d.numero ? ' (N° ' + d.numero + ')' : '') + '.';
    }
  }
  if (sess.step === 'comprobante') {
    if (helpers && helpers.media && d.compro) {
      const ok = helpers.saveComprobante ? await helpers.saveComprobante(d.compro.tipo, d.compro.ref_id, helpers.media) : false;
      sessions.delete(tel);
      return ok ? '📎 Comprobante guardado. ¡Listo!' : 'No pude guardar la foto, pero el registro quedó hecho. Podés adjuntarla desde la app.';
    }
    if (/^(listo|no|ok|nada|skip|saltar|fin)$/i.test(tt)) { sessions.delete(tel); return '👍 Listo.'; }
    return 'Mandá la *foto del comprobante* o escribí *listo* para terminar.';
  }
  return 'No entendí. Escribí _cancelar_ para salir.';
}

async function financeQuery(q, cmd) {
  const sumBy = (arr, mon) => Number((arr.find(x => x.moneda === mon) || {}).t || 0);
  if (/^(balance|finanzas|caja)$/.test(cmd)) {
    const cob = await one(q, "SELECT moneda, COALESCE(sum(monto),0) t FROM fin_cobros GROUP BY moneda");
    const pag = await one(q, "SELECT moneda, COALESCE(sum(monto),0) t FROM fin_pagos GROUP BY moneda");
    let out = '💰 *Balance*';
    for (const mon of ['UYU', 'USD']) { const c = sumBy(cob, mon), p = sumBy(pag, mon); if (c || p) out += '\n*' + mon + '*: cobrado ' + fmtMoney(c, mon) + ' · pagado ' + fmtMoney(p, mon) + ' · balance ' + fmtMoney(c - p, mon); }
    return out === '💰 *Balance*' ? 'Sin movimientos registrados.' : out;
  }
  if (/^(por\s*cobrar|pendientes?|deudas?)$/.test(cmd)) {
    const tot = await one(q, "SELECT moneda, COALESCE(sum(monto),0) t FROM fin_facturas WHERE tipo='emitida' AND estado='pendiente' GROUP BY moneda");
    const rows = await one(q, "SELECT f.numero, f.monto, f.moneda, f.vencimiento, c.nombre cliente FROM fin_facturas f LEFT JOIN clientes c ON c.id=f.cliente_id WHERE f.tipo='emitida' AND f.estado='pendiente' ORDER BY f.vencimiento NULLS LAST, f.id DESC LIMIT 8");
    if (!rows.length) return 'No hay facturas pendientes de cobro ✅';
    return '📥 *Por cobrar*\n' + tot.map(x => '• Total ' + x.moneda + ': ' + fmtMoney(x.t, x.moneda)).join('\n') + '\n' + rows.map(r => '· ' + (r.cliente || 's/cliente') + ' ' + fmtMoney(r.monto, r.moneda) + (r.numero ? ' (N° ' + r.numero + ')' : '') + (r.vencimiento ? ' vence ' + fechaUY(r.vencimiento) : '')).join('\n');
  }
  if (/^(movimientos|ultimos|últimos)$/.test(cmd)) {
    const co = await one(q, "SELECT co.fecha, co.monto, co.moneda, c.nombre cliente FROM fin_cobros co LEFT JOIN clientes c ON c.id=co.cliente_id ORDER BY co.fecha DESC, co.id DESC LIMIT 5");
    const pa = await one(q, "SELECT p.fecha, p.monto, p.moneda, p.tercero FROM fin_pagos p ORDER BY p.fecha DESC, p.id DESC LIMIT 5");
    let out = '📊 *Últimos movimientos*';
    if (co.length) out += '\n_Cobros_\n' + co.map(r => '• ' + fechaUY(r.fecha) + ' ' + fmtMoney(r.monto, r.moneda) + ' — ' + (r.cliente || '-')).join('\n');
    if (pa.length) out += '\n_Pagos_\n' + pa.map(r => '• ' + fechaUY(r.fecha) + ' ' + fmtMoney(r.monto, r.moneda) + ' — ' + (r.tercero || '-')).join('\n');
    return (co.length || pa.length) ? out : 'Sin movimientos aún.';
  }
  if (/^(mes|resumen\s*mes|finanzas\s*mes)$/.test(cmd)) {
    const cob = await one(q, "SELECT moneda, COALESCE(sum(monto),0) t FROM fin_cobros WHERE date_trunc('month',fecha)=date_trunc('month',CURRENT_DATE) GROUP BY moneda");
    const pag = await one(q, "SELECT moneda, COALESCE(sum(monto),0) t FROM fin_pagos WHERE date_trunc('month',fecha)=date_trunc('month',CURRENT_DATE) GROUP BY moneda");
    let out = '🗓️ *Mes actual*';
    for (const mon of ['UYU', 'USD']) { const c = sumBy(cob, mon), p = sumBy(pag, mon); if (c || p) out += '\n*' + mon + '*: cobrado ' + fmtMoney(c, mon) + ' · pagado ' + fmtMoney(p, mon) + ' · balance ' + fmtMoney(c - p, mon); }
    return out === '🗓️ *Mes actual*' ? 'Sin movimientos este mes.' : out;
  }
  return null;
}

async function continueFlow(q, tel, sess, t, sender, helpers) {
  if (sess.flow === 'factura' || sess.flow === 'cobro' || sess.flow === 'pago') return financeStep(q, tel, sess, t, sender, helpers);
  touch(sess); const d = sess.data;
  if (sess.step === 'cliente') {
    const cs = await buscarClientes(q, t);
    if (!cs.length) return 'No encontré clientes con "' + t + '". Probá de nuevo o _cancelar_.';
    if (cs.length === 1) { d.cliente_id = cs[0].id; d.cliente = cs[0].nombre; return trasCliente(sess); }
    sess.opciones = cs; sess.step = 'cliente_pick';
    return 'Encontré varios:\n' + cs.map((c, i) => (i + 1) + ') ' + c.nombre).join('\n') + '\nRespondé con el número.';
  }
  if (sess.step === 'cliente_pick') {
    const c = sess.opciones?.[parseInt(t) - 1];
    if (!c) return 'Elegí un número de la lista, o _cancelar_.';
    d.cliente_id = c.id; d.cliente = c.nombre; return trasCliente(sess);
  }
  if (sess.flow === 'ticket') {
    if (sess.step === 'titulo') { d.titulo = String(t).slice(0, 200); sess.step = 'prioridad'; return '¿Prioridad?\n1) Baja\n2) Media\n3) Alta'; }
    if (sess.step === 'prioridad') {
      const p = { '1': 'baja', '2': 'media', '3': 'alta', baja: 'baja', media: 'media', alta: 'alta' }[String(t).toLowerCase().trim()];
      if (!p) return 'Respondé 1, 2 o 3.';
      d.prioridad = p; sess.step = 'confirm';
      return '¿Confirmás?\n🎫 Ticket para *' + d.cliente + '*\n• ' + d.titulo + '\n• Prioridad: ' + p + '\n(_sí_ / _no_)';
    }
    if (sess.step === 'confirm') {
      if (!esSi(t)) { sessions.delete(tel); return 'Ok, no lo creé. Escribí *nuevo ticket* para empezar otra vez.'; }
      const r = await q("INSERT INTO tickets (titulo,cliente_id,prioridad,estado,solicitante) VALUES ($1,$2,$3,'abierto',$4) RETURNING id", [d.titulo, d.cliente_id, d.prioridad, sender.nombre || null]);
      sessions.delete(tel);
      try { notify({ type: 'ticket', icon: 'ticket', text: 'Nuevo ticket (WhatsApp): ' + d.titulo, url: '/tickets/' + r.rows[0].id }); } catch {}
      return '✅ Ticket *TK-' + r.rows[0].id + '* creado para ' + d.cliente + '.';
    }
  }
  if (sess.flow === 'visita') {
    if (sess.step === 'fecha') {
      const f = parseFecha(t); if (!f) return 'No entendí la fecha. Probá _hoy_, _mañana_ o _DD/MM_ (ej. 15/06).';
      d.fecha = f; sess.step = 'tipo'; return '¿Tipo de visita?\n1) Preventiva\n2) Correctiva';
    }
    if (sess.step === 'tipo') {
      const tp = { '1': 'preventiva', '2': 'correctiva', preventiva: 'preventiva', correctiva: 'correctiva' }[String(t).toLowerCase().trim()];
      if (!tp) return 'Respondé 1 (preventiva) o 2 (correctiva).';
      d.tipo = tp;
      sess.tecs = (await q("SELECT id,nombre FROM tecnicos WHERE activo ORDER BY nombre LIMIT 8")).rows;
      sess.step = 'tecnico';
      return '¿Técnico?\n' + (sender.tecnico_id ? '0) Yo\n' : '') + sess.tecs.map((x, i) => (i + 1) + ') ' + x.nombre).join('\n') + '\n-) Sin asignar';
    }
    if (sess.step === 'tecnico') {
      let tid = null, tnom = 'Sin asignar';
      const tt = String(t).trim();
      if (tt === '-') { tid = null; }
      else if (tt === '0' && sender.tecnico_id) { tid = sender.tecnico_id; tnom = sender.nombre || 'Vos'; }
      else { const x = sess.tecs?.[parseInt(tt) - 1]; if (!x) return 'Elegí un número de la lista, 0 para vos, o - sin asignar.'; tid = x.id; tnom = x.nombre; }
      d.tecnico_id = tid; d.tecnico_nombre = tnom; sess.step = 'confirm';
      return '¿Confirmás?\n📅 Visita *' + d.tipo + '* para *' + d.cliente + '*\n• Fecha: ' + fechaUY(d.fecha) + '\n• Técnico: ' + tnom + '\n(_sí_ / _no_)';
    }
    if (sess.step === 'confirm') {
      if (!esSi(t)) { sessions.delete(tel); return 'Ok, no la creé. Escribí *nueva visita* para empezar otra vez.'; }
      const r = await q("INSERT INTO visitas (cliente_id,fecha,tipo,asignada_por,tecnico_id) VALUES ($1,$2,$3,$4,$5) RETURNING id", [d.cliente_id, d.fecha, d.tipo, sender.nombre || 'WhatsApp', d.tecnico_id]);
      if (d.tecnico_id) await q("INSERT INTO visita_tecnicos (visita_id,tecnico_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [r.rows[0].id, d.tecnico_id]);
      sessions.delete(tel);
      try { notify({ type: 'visita', icon: 'calendar', text: 'Nueva visita (WhatsApp): ' + d.cliente, url: '/visitas/' + r.rows[0].id }); } catch {}
      return '✅ Visita agendada para ' + d.cliente + ' el ' + fechaUY(d.fecha) + '.';
    }
  }
  return 'No entendí. Escribí _cancelar_ para salir.';
}

export async function ensureChatbotSchema(q) {
  await q(`
    CREATE TABLE IF NOT EXISTS chatbot_numeros (
      id serial PRIMARY KEY,
      telefono text UNIQUE,
      nombre text,
      rol text NOT NULL DEFAULT 'tecnico',
      tecnico_id int,
      usuario_id int,
      cliente_id int,
      autorizado boolean NOT NULL DEFAULT false,
      ultimo_msg text,
      ultimo_at timestamptz,
      msgs int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );`);
}

const one = async (q, sql, params) => { try { return (await q(sql, params)).rows; } catch { return []; } };

// Genera la respuesta a un comando. `sender` es la fila de chatbot_numeros (autorizada).
export async function processCommand(q, texto, sender = {}) {
  const cmd = String(texto || '').trim().toLowerCase();
  const nom = sender.nombre ? ' ' + sender.nombre.split(' ')[0] : '';

  // ticket NN
  const mt = cmd.match(/^tickets?\s+#?(\d+)/);
  if (mt) {
    const r = await one(q, "SELECT t.id, t.titulo, t.estado, t.prioridad, t.asignado, c.nombre AS cliente FROM tickets t LEFT JOIN clientes c ON c.id=t.cliente_id WHERE t.id=$1", [Number(mt[1])]);
    if (!r.length) return 'No encontre el ticket #' + mt[1] + '.';
    const t = r[0];
    return '🎫 *Ticket TK-' + t.id + '*\n' + t.titulo + '\n• Estado: ' + t.estado + '\n• Prioridad: ' + t.prioridad + (t.cliente ? '\n• Cliente: ' + t.cliente : '') + (t.asignado ? '\n• Asignado: ' + t.asignado : '');
  }
  // cliente <texto>
  const mc = cmd.match(/^cliente\s+(.+)/);
  if (mc) {
    const rows = await one(q, "SELECT c.nombre, (SELECT min(v.fecha) FROM visitas v WHERE v.cliente_id=c.id AND v.estado='programada' AND v.fecha>=CURRENT_DATE) AS prox FROM clientes c WHERE c.nombre ILIKE $1 ORDER BY c.nombre LIMIT 3", ['%' + mc[1].trim() + '%']);
    if (!rows.length) return 'No encontre clientes con "' + mc[1].trim() + '".';
    return '🏢 *Clientes*\n' + rows.map(r => '• ' + r.nombre + (r.prox ? ' — próxima visita ' + fechaUY(r.prox) : ' — sin visitas programadas')).join('\n');
  }

  if (/^(ayuda|help|menu|hola|buenas|buenos)/.test(cmd)) {
    const miAgenda = sender.tecnico_id ? '\n• *mi agenda* — tus visitas de la semana' : '';
    const fin = sender.rol === 'admin'
      ? '\n\n💰 *Finanzas* (admin):\n• *balance* · *mes* · *por cobrar* · *movimientos*\n• *nuevo cobro* · *nuevo pago* · *nueva factura*'
      : '';
    return '🤖 *Preventis* — hola' + nom + '. Comandos:\n• *estado* — resumen general\n• *visitas* — próximas visitas\n• *agenda* — visitas de la semana' + miAgenda + '\n• *fallas* — equipos en falla\n• *tickets* — tickets abiertos\n• *ticket NN* — estado de un ticket\n• *cliente X* — próxima visita de un cliente\n\n✍️ *Crear* (te hago preguntas):\n• *nuevo ticket*\n• *nueva visita*' + fin + '\n\n_cancelar_ — abortar';
  }
  if (/^(estado|resumen)/.test(cmd)) {
    const v = await one(q, "SELECT count(*)::int c FROM visitas WHERE estado IN ('programada','en_curso')");
    const fa = await one(q, "SELECT count(*)::int c FROM v_ultima_prueba u JOIN equipos e ON e.id=u.equipo_id WHERE u.ultima_falla AND e.activo");
    const t = await one(q, "SELECT count(*)::int c FROM tickets WHERE estado IN ('abierto','en_proceso')");
    return '📊 *Estado Preventis*\n• Visitas pendientes: ' + (v[0]?.c ?? 0) + '\n• Equipos en falla: ' + (fa[0]?.c ?? 0) + '\n• Tickets abiertos: ' + (t[0]?.c ?? 0);
  }
  if (/^(mi\s*agenda|agenda)/.test(cmd)) {
    const mia = /^mi/.test(cmd) && sender.tecnico_id;
    const tid = Number(sender.tecnico_id) || 0;
    // Multi-dia: una linea por jornada (dia k/N). "mi agenda" considera el tecnico de la visita o de la jornada.
    const rows = await one(q, `
      WITH dias AS (
        SELECT j.fecha, v.hora, v.id AS vid, v.orden, c.nombre AS cliente,
          (row_number() OVER (PARTITION BY v.id ORDER BY j.orden))::int AS dnum,
          (count(*) OVER (PARTITION BY v.id))::int AS dtot,
          COALESCE(j.tecnico_id, v.tecnico_id) AS jtec
        FROM visitas v JOIN clientes c ON c.id=v.cliente_id
        JOIN visita_jornadas j ON j.visita_id=v.id AND j.estado <> 'cancelada'
        WHERE v.multidia AND v.estado IN ('programada','en_curso')
        UNION ALL
        SELECT v.fecha, v.hora, v.id, v.orden, c.nombre, 0, 0, v.tecnico_id
        FROM visitas v JOIN clientes c ON c.id=v.cliente_id
        WHERE COALESCE(v.multidia,false)=false AND v.estado IN ('programada','en_curso')
      )
      SELECT d.fecha, d.hora, d.cliente, d.dnum, d.dtot,
        COALESCE((SELECT string_agg(t2.nombre, ', ') FROM visita_tecnicos vt JOIN tecnicos t2 ON t2.id=vt.tecnico_id WHERE vt.visita_id=d.vid), '') AS tecnicos
      FROM dias d
      WHERE d.fecha BETWEEN CURRENT_DATE AND CURRENT_DATE+6
      ${mia ? `AND (d.jtec=${tid} OR EXISTS (SELECT 1 FROM visita_tecnicos vt WHERE vt.visita_id=d.vid AND vt.tecnico_id=${tid}))` : ''}
      ORDER BY d.fecha, COALESCE(d.orden,999)`);
    if (!rows.length) return (mia ? 'No tenés' : 'Sin') + ' visitas esta semana ✅';
    return '📅 *Agenda' + (mia ? ' (' + (sender.nombre || 'vos') + ')' : ' de la semana') + '*\n' + rows.map(r => '• ' + fechaUY(r.fecha) + (r.hora ? ' ' + String(r.hora).slice(0, 5) : '') + ' — ' + r.cliente + (r.dtot > 1 ? ' _(día ' + r.dnum + '/' + r.dtot + ')_' : '') + (r.tecnicos && !mia ? ' (' + r.tecnicos + ')' : '')).join('\n');
  }
  if (/^visitas/.test(cmd)) {
    const rows = await one(q, "SELECT v.fecha, v.fecha_fin, v.multidia, c.nombre AS cliente, (SELECT count(*) FROM visita_jornadas j WHERE j.visita_id=v.id AND j.estado <> 'cancelada')::int AS dias FROM visitas v JOIN clientes c ON c.id=v.cliente_id WHERE v.estado IN ('programada','en_curso') ORDER BY v.fecha LIMIT 8");
    return rows.length ? '📅 *Próximas visitas*\n' + rows.map(r => '• ' + fechaUY(r.fecha) + (r.multidia && r.fecha_fin ? ' → ' + fechaUY(r.fecha_fin) + ' _(' + r.dias + ' días)_' : '') + ' — ' + r.cliente).join('\n') : 'Sin visitas pendientes ✅';
  }
  if (/^fallas/.test(cmd)) {
    const rows = await one(q, "SELECT e.etiqueta, c.nombre AS cliente FROM v_ultima_prueba u JOIN equipos e ON e.id=u.equipo_id JOIN clientes c ON c.id=e.cliente_id WHERE u.ultima_falla AND e.activo LIMIT 8");
    return rows.length ? '⚠️ *Equipos en falla*\n' + rows.map(r => '• ' + (r.etiqueta || 'Equipo') + ' — ' + r.cliente).join('\n') : 'Sin equipos en falla ✅';
  }
  if (/^tickets/.test(cmd)) {
    const rows = await one(q, "SELECT t.id, t.titulo, t.prioridad, c.nombre AS cliente FROM tickets t LEFT JOIN clientes c ON c.id=t.cliente_id WHERE t.estado IN ('abierto','en_proceso') ORDER BY t.updated_at DESC LIMIT 8");
    return rows.length ? '🎫 *Tickets abiertos*\n' + rows.map(r => '• TK-' + r.id + ' [' + r.prioridad + '] ' + r.titulo + (r.cliente ? ' — ' + r.cliente : '')).join('\n') : 'Sin tickets abiertos ✅';
  }
  // Consultas financieras (solo admin)
  if (sender.rol === 'admin') {
    const fq = await financeQuery(q, cmd);
    if (fq) return fq;
  }
  return 'No entendí 🤔. Escribí *ayuda* para ver los comandos.';
}

// Extrae {from, texto, fromMe, isGroup, evt} de payloads de distintos gateways
// (WAHA, wa-automate/open-wa, WPPConnect, Evolution/Baileys).
export function parseInbound(body = {}) {
  const evt = (body.event || body.type || '').toString();
  const m = body.payload || body.data || body.message || (Array.isArray(body.messages) ? body.messages[0] : null) || body || {};
  const key = m.key || {};
  const inner = m.message || {};
  const texto = (m.body || m.text || m.content || m.caption ||
    inner.conversation || (inner.extendedTextMessage && inner.extendedTextMessage.text) ||
    (inner.imageMessage && inner.imageMessage.caption) || '').toString().trim();
  const from = (m.from || m.chatId || (m.chat && (m.chat.id || m.chat._serialized)) || key.remoteJid || m.remoteJid || m.author || '').toString();
  const fromMe = !!(m.fromMe ?? key.fromMe ?? m.self ?? body.fromMe);
  // Media (foto). Distintos gateways la exponen de formas diferentes; tomamos una URL descargable si la hay.
  const img = inner.imageMessage || {};
  const mediaUrl = (m.media && (m.media.url || m.media)) || m.mediaUrl || m.deprecatedMms3Url || img.url || (typeof m.body === 'string' && /^https?:\/\//i.test(m.body) ? m.body : '') || '';
  const mediaMime = (m.media && m.media.mimetype) || m.mimetype || m.mimeType || img.mimetype || '';
  const esImagen = /^image\//i.test(mediaMime) || !!inner.imageMessage || /image/i.test(m.type || m.messageType || '') || !!m.hasMedia;
  const media = (esImagen && typeof mediaUrl === 'string' && /^https?:\/\//i.test(mediaUrl)) ? { url: mediaUrl, mime: mediaMime || 'image/jpeg' } : null;
  return { evt, from, texto, fromMe, media, isGroup: /@g\.us$/i.test(from) || /-\d{6,}@/.test(from) };
}

// Procesa un mensaje entrante: captura el numero, verifica autorizacion y arma respuesta.
export async function handleIncoming(q, { from, texto, isGroup, media }, helpers = {}) {
  const tel = norm(from);
  if (!tel || (!texto && !media)) return { resp: null };
  // Captura / actualiza el numero
  await q(`INSERT INTO chatbot_numeros (telefono, ultimo_msg, ultimo_at, msgs)
           VALUES ($1,$2,now(),1)
           ON CONFLICT (telefono) DO UPDATE SET ultimo_msg=$2, ultimo_at=now(), msgs=chatbot_numeros.msgs+1`,
    [tel, String(texto).slice(0, 300)]);
  const sender = (await q('SELECT * FROM chatbot_numeros WHERE telefono=$1', [tel])).rows[0] || {};
  // En grupos, al arrobar al bot el texto llega como "@59891716502 estado": quitamos la mención inicial.
  const t = String(texto || '').trim().replace(/^(@[\d]{5,}\s*)+/g, '').trim();
  // Mensaje solo-imagen sin conversación activa: ignorar (evita responder a cada foto suelta).
  if (!t && media && !getSession(tel)) return { authorized: !!sender.autorizado, resp: null };
  // Palabras que claramente apuntan a Preventis (para no contestarle a quien escribe a OmniAccess).
  const esComandoPreventis = /^(ayuda|hola|menu|buenas|buenos|estado|resumen|visitas|agenda|mi\s|fallas|tickets?\b|cliente\s|nuevo|nueva|crear|agendar|cancelar|factura|cobro|pago|balance|finanzas|caja|por\s*cobrar|movimientos|mes)/i.test(t);
  if (!sender.autorizado) {
    // Número compartido con OmniAccess: solo respondemos si parece un comando de Preventis; si no, silencio.
    return { authorized: false, resp: esComandoPreventis ? '👋 Soy el asistente de *Preventis*. Tu número no está autorizado todavía. Pedile al administrador que te habilite el acceso.' : null };
  }
  // Cancelar siempre aborta una conversación en curso
  if (/^(cancelar|cancel|salir)$/i.test(t)) { const had = sessions.delete(tel); return { authorized: true, resp: had ? '❌ Operación cancelada.' : 'No hay nada para cancelar. Escribí *ayuda*.' }; }
  // Si hay una conversación en curso, seguirla
  const sess = getSession(tel);
  if (sess) return { authorized: true, resp: await continueFlow(q, tel, sess, t, sender, { ...helpers, media }) };
  // En grupos, solo responder a comandos explícitos (evita contestar cada mensaje)
  if (isGroup && !esComandoPreventis) {
    return { authorized: true, resp: null };
  }
  // Iniciar flujos
  if (/^(nuevo\s*ticket|ticket\s+nuevo|crear\s+ticket)$/i.test(t)) return { authorized: true, resp: startTicket(tel) };
  if (/^(nueva\s*visita|visita\s+nueva|crear\s+visita|agendar\s+visita)$/i.test(t)) return { authorized: true, resp: startVisita(tel) };
  // Flujos de finanzas (solo numeros admin)
  if (esAdminBot(sender)) {
    if (/^(nueva?\s*factura|crear\s+factura|registrar\s+factura)$/i.test(t)) return { authorized: true, resp: startFactura(tel) };
    if (/^(nuevo\s*cobro|cobro\s+nuevo|crear\s+cobro|registrar\s+cobro)$/i.test(t)) return { authorized: true, resp: startCobro(tel) };
    if (/^(nuevo\s*pago|pago\s+nuevo|crear\s+pago|registrar\s+pago)$/i.test(t)) return { authorized: true, resp: startPago(tel) };
  }
  // Comandos sueltos (usar el texto ya sin mención)
  const resp = await processCommand(q, t, sender);
  return { authorized: true, resp };
}

export function mountChatbot(app, q) {
  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(500).json({ error: e.message }));

  app.get('/api/chatbot/numeros', authMiddleware, adminOnly, wrap(async (req, res) => {
    const r = await q(`SELECT n.*, t.nombre AS tecnico_nombre FROM chatbot_numeros n LEFT JOIN tecnicos t ON t.id=n.tecnico_id ORDER BY n.autorizado DESC, n.ultimo_at DESC NULLS LAST, n.id DESC`);
    res.json(r.rows);
  }));
  app.post('/api/chatbot/numeros', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body || {}; const tel = norm(b.telefono);
    if (!tel) return res.status(400).json({ error: 'Número inválido' });
    const r = await q(`INSERT INTO chatbot_numeros (telefono,nombre,rol,tecnico_id,autorizado)
      VALUES ($1,$2,COALESCE($3,'tecnico'),$4,COALESCE($5,true))
      ON CONFLICT (telefono) DO UPDATE SET nombre=COALESCE($2,chatbot_numeros.nombre), rol=COALESCE($3,chatbot_numeros.rol), tecnico_id=$4, autorizado=COALESCE($5,chatbot_numeros.autorizado)
      RETURNING *`, [tel, b.nombre || null, b.rol || null, b.tecnico_id || null, b.autorizado]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/chatbot/numeros/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q(`UPDATE chatbot_numeros SET nombre=COALESCE($1,nombre), rol=COALESCE($2,rol), tecnico_id=$3, autorizado=COALESCE($4,autorizado) WHERE id=$5 RETURNING *`,
      [b.nombre ?? null, b.rol || null, b.tecnico_id ?? null, b.autorizado, req.params.id]);
    res.json(r.rows[0]);
  }));
  app.delete('/api/chatbot/numeros/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    await q('DELETE FROM chatbot_numeros WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  // Importar telefonos de tecnicos como numeros autorizados
  app.post('/api/chatbot/numeros/importar-tecnicos', authMiddleware, adminOnly, wrap(async (req, res) => {
    const tecs = (await q("SELECT id, nombre, telefono FROM tecnicos WHERE telefono IS NOT NULL AND telefono<>''")).rows;
    let n = 0;
    for (const t of tecs) {
      const tel = norm(t.telefono); if (!tel) continue;
      await q(`INSERT INTO chatbot_numeros (telefono,nombre,rol,tecnico_id,autorizado) VALUES ($1,$2,'tecnico',$3,true)
        ON CONFLICT (telefono) DO UPDATE SET tecnico_id=$3, nombre=COALESCE(chatbot_numeros.nombre,$2), autorizado=true`, [tel, t.nombre, t.id]);
      n++;
    }
    res.json({ ok: true, importados: n });
  }));

  // Listar grupos donde está el bot (para autorizarlos). Best-effort: prueba varios formatos.
  app.get('/api/chatbot/grupos', authMiddleware, adminOnly, wrap(async (req, res) => {
    const cfg = ((await q("SELECT valor FROM app_config WHERE clave='chatbot'")).rows[0] || {}).valor || {};
    if (!cfg.url) return res.status(400).json({ error: 'Configura la conexión del chatbot primero' });
    const base = cfg.url.replace(/\/+$/, ''); let sid = cfg.session || 'default';
    const headers = { 'X-API-Key': cfg.api_key || '' };
    if (!/^[0-9a-f]{8}-/i.test(sid)) {
      try { const rs = await fetch(base + '/api/sessions', { headers }); const lj = await rs.json().catch(() => null); const list = Array.isArray(lj) ? lj : (lj && (lj.data || lj.sessions)) || []; const f = list.find(x => x.id === sid || x.name === sid); if (f) sid = f.id; } catch {}
    }
    const urls = [base + '/api/' + sid + '/groups', base + '/api/sessions/' + sid + '/groups', base + '/api/' + sid + '/chats?limit=200'];
    for (const u of urls) {
      try {
        const rs = await fetch(u, { headers }); if (!rs.ok) continue;
        const j = await rs.json(); const arr = Array.isArray(j) ? j : (j.data || j.groups || j.chats || []);
        const grupos = arr.map(g => ({ id: (g.id && (g.id._serialized || g.id)) || g.jid || g.chatId || '', nombre: g.subject || g.name || g.formattedTitle || g.title || 'Grupo' }))
          .filter(g => /@g\.us$/i.test(String(g.id)));
        if (grupos.length) return res.json(grupos);
      } catch {}
    }
    res.json([]);
  }));

  // Log reciente (desde auditoria del chatbot)
  app.get('/api/chatbot/log', authMiddleware, adminOnly, wrap(async (req, res) => {
    const r = await q("SELECT ts, metodo, status, detalle FROM auditoria WHERE usuario='chatbot' ORDER BY ts DESC LIMIT 60");
    res.json(r.rows);
  }));

  // Probar un comando desde el panel (no envia WhatsApp, solo muestra la respuesta)
  app.post('/api/chatbot/comando', authMiddleware, adminOnly, wrap(async (req, res) => {
    const texto = (req.body?.texto || '').toString();
    const resp = await processCommand(q, texto, { rol: 'admin', nombre: req.user?.nombre, autorizado: true });
    res.json({ resp });
  }));
}
