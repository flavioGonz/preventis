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

async function continueFlow(q, tel, sess, t, sender) {
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
    return '🤖 *Preventis* — hola' + nom + '. Comandos:\n• *estado* — resumen general\n• *visitas* — próximas visitas\n• *agenda* — visitas de la semana' + miAgenda + '\n• *fallas* — equipos en falla\n• *tickets* — tickets abiertos\n• *ticket NN* — estado de un ticket\n• *cliente X* — próxima visita de un cliente\n\n✍️ *Crear* (te hago preguntas):\n• *nuevo ticket*\n• *nueva visita*\n• _cancelar_ — abortar';
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
  return { evt, from, texto, fromMe, isGroup: /@g\.us$/i.test(from) || /-\d{6,}@/.test(from) };
}

// Procesa un mensaje entrante: captura el numero, verifica autorizacion y arma respuesta.
export async function handleIncoming(q, { from, texto, isGroup }) {
  const tel = norm(from);
  if (!tel || !texto) return { resp: null };
  // Captura / actualiza el numero
  await q(`INSERT INTO chatbot_numeros (telefono, ultimo_msg, ultimo_at, msgs)
           VALUES ($1,$2,now(),1)
           ON CONFLICT (telefono) DO UPDATE SET ultimo_msg=$2, ultimo_at=now(), msgs=chatbot_numeros.msgs+1`,
    [tel, String(texto).slice(0, 300)]);
  const sender = (await q('SELECT * FROM chatbot_numeros WHERE telefono=$1', [tel])).rows[0] || {};
  // En grupos, al arrobar al bot el texto llega como "@59891716502 estado": quitamos la mención inicial.
  const t = String(texto).trim().replace(/^(@[\d]{5,}\s*)+/g, '').trim();
  // Palabras que claramente apuntan a Preventis (para no contestarle a quien escribe a OmniAccess).
  const esComandoPreventis = /^(ayuda|hola|menu|buenas|buenos|estado|resumen|visitas|agenda|mi\s|fallas|tickets?\b|cliente\s|nuevo|nueva|crear|agendar|cancelar)/i.test(t);
  if (!sender.autorizado) {
    // Número compartido con OmniAccess: solo respondemos si parece un comando de Preventis; si no, silencio.
    return { authorized: false, resp: esComandoPreventis ? '👋 Soy el asistente de *Preventis*. Tu número no está autorizado todavía. Pedile al administrador que te habilite el acceso.' : null };
  }
  // Cancelar siempre aborta una conversación en curso
  if (/^(cancelar|cancel|salir)$/i.test(t)) { const had = sessions.delete(tel); return { authorized: true, resp: had ? '❌ Operación cancelada.' : 'No hay nada para cancelar. Escribí *ayuda*.' }; }
  // Si hay una conversación en curso, seguirla
  const sess = getSession(tel);
  if (sess) return { authorized: true, resp: await continueFlow(q, tel, sess, t, sender) };
  // En grupos, solo responder a comandos explícitos (evita contestar cada mensaje)
  if (isGroup && !/^(ayuda|hola|menu|buenas|buenos|estado|resumen|visitas|agenda|mi\s|fallas|tickets?\b|cliente\s|nuevo|nueva|crear|agendar|cancelar)/i.test(t)) {
    return { authorized: true, resp: null };
  }
  // Iniciar flujos
  if (/^(nuevo\s*ticket|ticket\s+nuevo|crear\s+ticket)$/i.test(t)) return { authorized: true, resp: startTicket(tel) };
  if (/^(nueva\s*visita|visita\s+nueva|crear\s+visita|agendar\s+visita)$/i.test(t)) return { authorized: true, resp: startVisita(tel) };
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
