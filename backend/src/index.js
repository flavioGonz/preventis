import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { q, pool } from './db.js';
import { buildInformePDF } from './pdf.js';
import { importPruebasExcel, exportPruebasExcel } from './excel.js';
import { mountAuth, ensureAuthSchema } from './auth.js';
import { mount2FA, ensure2FASchema } from './twofa.js';
import { mountChatbot, ensureChatbotSchema } from './chatbot.js';
import { mountExtras } from './extras.js';
import { mountReportes } from './reportes.js';
import { mountOTA } from './ota.js';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { setIO, notify, recentEvents } from './realtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

ensureAuthSchema(q).then(() => ensure2FASchema(q)).then(() => ensureChatbotSchema(q)).catch(e => console.error('auth schema:', e));
mountAuth(app, q);
mount2FA(app, q);
mountChatbot(app, q);
mountExtras(app, q);
mountReportes(app, q);
mountOTA(app, q);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2,8)}${ext}`);
  },
});
const BAD_UPLOAD = /\.(svgz?|html?|xhtml|shtml|js|mjs|php\d?|phtml|phar|xml|htaccess)$/i;
const BAD_MIME = /(svg|html|xhtml|javascript|ecmascript|php)/i;
const safeFilter = (req, file, cb) => { const n = (file.originalname || '').toLowerCase(); if (BAD_UPLOAD.test(n) || BAD_MIME.test(file.mimetype || '')) return cb(null, false); cb(null, true); };
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: safeFilter });
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: safeFilter });

const wrap = fn => (req, res) => fn(req, res).catch(e => {
  console.error(e); res.status(500).json({ error: e.message });
});

// ============== Health ==============
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ============== Catálogos genéricos ==============
function catalogRoutes(tabla, campos) {
  app.get(`/api/${tabla}`, wrap(async (req, res) => {
    const r = await q(`SELECT * FROM ${tabla} ORDER BY id`);
    res.json(r.rows);
  }));
  app.post(`/api/${tabla}`, wrap(async (req, res) => {
    const cols = campos.filter(c => req.body[c] !== undefined);
    const vals = cols.map(c => req.body[c]);
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    try {
      const r = await q(`INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals);
      res.status(201).json(r.rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con ese nombre' });
      throw e;
    }
  }));
  app.put(`/api/${tabla}/:id`, wrap(async (req, res) => {
    const cols = campos.filter(c => req.body[c] !== undefined);
    const sets = cols.map((c, i) => `${c}=$${i + 1}`).join(',');
    const vals = cols.map(c => req.body[c]);
    vals.push(req.params.id);
    const r = await q(`UPDATE ${tabla} SET ${sets} WHERE id=$${vals.length} RETURNING *`, vals);
    res.json(r.rows[0]);
  }));
  app.delete(`/api/${tabla}/:id`, wrap(async (req, res) => {
    await q(`DELETE FROM ${tabla} WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  }));
}
catalogRoutes('tecnicos', ['nombre', 'telefono', 'activo']);
catalogRoutes('sistemas', ['nombre']);
catalogRoutes('tipos_elemento', ['nombre', 'icono']);
catalogRoutes('estados_equipo', ['nombre', 'es_falla', 'orden', 'icono']);

// ============== Clientes ==============
app.get('/api/clientes', wrap(async (req, res) => {
  const { frecuencia, search } = req.query;
  const cond = [], params = [];
  if (frecuencia) { params.push(frecuencia); cond.push(`frecuencia=$${params.length}`); }
  if (search) { params.push(`%${search}%`); cond.push(`(nombre ILIKE $${params.length} OR direccion ILIKE $${params.length})`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const r = await q(`
    SELECT c.*,
      (SELECT count(*) FROM equipos e WHERE e.cliente_id=c.id AND e.activo) AS equipos,
      (SELECT count(*) FROM v_ultima_prueba u JOIN equipos e ON e.id=u.equipo_id WHERE e.cliente_id=c.id AND e.activo AND u.ultima_falla)::int AS fallas,
      (SELECT max(fecha) FROM visitas v WHERE v.cliente_id=c.id) AS ultima_visita,
      (SELECT min(fecha) FROM visitas v WHERE v.cliente_id=c.id AND v.estado='programada' AND v.fecha>=CURRENT_DATE) AS proxima_visita,
      (SELECT COALESCE((SELECT string_agg(t.nombre, ', ') FROM visita_tecnicos vt JOIN tecnicos t ON t.id=vt.tecnico_id WHERE vt.visita_id=lv.id), tt.nombre)
         FROM visitas lv LEFT JOIN tecnicos tt ON tt.id=lv.tecnico_id
         WHERE lv.cliente_id=c.id ORDER BY lv.fecha DESC, lv.id DESC LIMIT 1) AS ultimo_tecnico,
      (SELECT k.id FROM contratos k WHERE k.cliente_id=c.id ORDER BY (k.estado='activo') DESC, k.fecha_fin DESC NULLS LAST LIMIT 1) AS contrato_id,
      (SELECT k.titulo FROM contratos k WHERE k.cliente_id=c.id ORDER BY (k.estado='activo') DESC, k.fecha_fin DESC NULLS LAST LIMIT 1) AS contrato_titulo,
      EXISTS(SELECT 1 FROM visitas v WHERE v.cliente_id=c.id AND v.estado='en_curso') AS en_curso
    FROM clientes c ${where} ORDER BY nombre`, params);
  res.json(r.rows);
}));
app.get('/api/clientes/:id', wrap(async (req, res) => {
  const r = await q('SELECT * FROM clientes WHERE id=$1', [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(r.rows[0]);
}));
app.post('/api/clientes', wrap(async (req, res) => {
  const { nombre, direccion, telefono, frecuencia } = req.body;
  const r = await q(
    'INSERT INTO clientes (nombre,direccion,telefono,frecuencia) VALUES ($1,$2,$3,COALESCE($4::frecuencia_visita,\'mensual\')) RETURNING *',
    [nombre, direccion, telefono, frecuencia]);
  res.status(201).json(r.rows[0]);
}));
app.put('/api/clientes/:id', wrap(async (req, res) => {
  const { nombre, direccion, telefono, frecuencia, activo, notas, vip, contrato_inicio, contrato_fin, contrato_monto, contrato_notas, rut, empresa_monitoreo, nro_abonado } = req.body;
  const r = await q(
    `UPDATE clientes SET nombre=COALESCE($1,nombre), direccion=COALESCE($2,direccion), telefono=COALESCE($3,telefono),
       frecuencia=COALESCE($4::frecuencia_visita,frecuencia), activo=COALESCE($5,activo), notas=COALESCE($6,notas), vip=COALESCE($7,vip),
       contrato_inicio=$9, contrato_fin=$10, contrato_monto=$11, contrato_notas=$12,
       rut=COALESCE($13,rut), empresa_monitoreo=COALESCE($14,empresa_monitoreo), nro_abonado=COALESCE($15,nro_abonado) WHERE id=$8 RETURNING *`,
    [nombre, direccion, telefono, frecuencia, activo, notas, vip, req.params.id,
     contrato_inicio || null, contrato_fin || null, contrato_monto || null, contrato_notas || null,
     rut ?? null, empresa_monitoreo ?? null, nro_abonado ?? null]);
  res.json(r.rows[0]);
}));

// ============== Equipos ==============
app.get('/api/clientes/:id/equipos', wrap(async (req, res) => {
  const r = await q(`
    SELECT e.*, s.nombre AS sistema, t.nombre AS tipo_elemento,
           u.ultima_fecha, u.ultimo_estado, u.ultima_falla,
           (e.cred_password_enc IS NOT NULL) AS cred_has_pass
    FROM equipos e
    LEFT JOIN sistemas s ON s.id=e.sistema_id
    LEFT JOIN tipos_elemento t ON t.id=e.tipo_elemento_id
    LEFT JOIN v_ultima_prueba u ON u.equipo_id=e.id
    WHERE e.cliente_id=$1 AND e.activo
    ORDER BY e.etiqueta, e.id`, [req.params.id]);
  res.json(r.rows);
}));
app.post('/api/clientes/:id/equipos', wrap(async (req, res) => {
  const b = req.body;
  const r = await q(`
    INSERT INTO equipos (cliente_id,sistema_id,direccion,grupo,subgrupo,etiqueta,tipo_elemento_id,modelo,ip_host)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.params.id, b.sistema_id || null, b.direccion, b.grupo, b.subgrupo, b.etiqueta, b.tipo_elemento_id || null, b.modelo, b.ip_host || null]);
  const eq = r.rows[0];
  const codigo = `EQ-${String(eq.id).padStart(6, '0')}`;
  await q('UPDATE equipos SET codigo_qr=$1 WHERE id=$2', [codigo, eq.id]);
  eq.codigo_qr = codigo;
  res.status(201).json(eq);
}));
app.put('/api/equipos/:id', wrap(async (req, res) => {
  const b = req.body;
  const r = await q(`
    UPDATE equipos SET sistema_id=$1,direccion=$2,grupo=$3,subgrupo=$4,
      etiqueta=$5,tipo_elemento_id=$6,modelo=$7,activo=COALESCE($8,activo),ip_host=$9
    WHERE id=$10 RETURNING *`,
    [b.sistema_id || null, b.direccion, b.grupo, b.subgrupo, b.etiqueta, b.tipo_elemento_id || null, b.modelo, b.activo, b.ip_host || null, req.params.id]);
  res.json(r.rows[0]);
}));
app.delete('/api/equipos/:id', wrap(async (req, res) => {
  await q('UPDATE equipos SET activo=FALSE WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// Buscar equipo por código QR
app.get('/api/equipos/qr/:codigo', wrap(async (req, res) => {
  const r = await q(`
    SELECT e.*, s.nombre AS sistema, t.nombre AS tipo_elemento, c.nombre AS cliente
    FROM equipos e
    LEFT JOIN sistemas s ON s.id=e.sistema_id
    LEFT JOIN tipos_elemento t ON t.id=e.tipo_elemento_id
    LEFT JOIN clientes c ON c.id=e.cliente_id
    WHERE e.codigo_qr=$1`, [req.params.codigo]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Equipo no encontrado' });
  res.json(r.rows[0]);
}));
// Imagen QR (PNG) de un equipo
app.get('/api/equipos/:id/qr.png', wrap(async (req, res) => {
  const r = await q('SELECT codigo_qr FROM equipos WHERE id=$1', [req.params.id]);
  if (!r.rows[0]) return res.status(404).end();
  res.type('png');
  res.send(await QRCode.toBuffer(r.rows[0].codigo_qr, { width: 300, margin: 1 }));
}));

// ============== Visitas ==============
// Una visita puede tener varios tecnicos (tabla visita_tecnicos). Para
// compatibilidad seguimos exponiendo `tecnico` como string (nombres unidos por
// coma) y agregamos `tecnico_ids` (array). visitas.tecnico_id queda como "primer
// tecnico" para vistas legadas y orden.
const TEC_AGG = `(SELECT string_agg(t2.nombre, ', ' ORDER BY t2.nombre) FROM visita_tecnicos vt JOIN tecnicos t2 ON t2.id=vt.tecnico_id WHERE vt.visita_id=v.id)`;
const TEC_IDS = `(SELECT array_agg(vt.tecnico_id ORDER BY vt.tecnico_id) FROM visita_tecnicos vt WHERE vt.visita_id=v.id)`;
async function setVisitaTecnicos(visitaId, ids) {
  if (ids === undefined) return; // no tocar
  const clean = Array.isArray(ids) ? [...new Set(ids.map(Number).filter(Boolean))] : [];
  await q('DELETE FROM visita_tecnicos WHERE visita_id=$1', [visitaId]);
  for (const tid of clean) await q('INSERT INTO visita_tecnicos (visita_id,tecnico_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [visitaId, tid]);
  await q('UPDATE visitas SET tecnico_id=$1 WHERE id=$2', [clean[0] || null, visitaId]);
}
app.get('/api/clientes/:id/visitas', wrap(async (req, res) => {
  const r = await q(`
    SELECT v.*, COALESCE(${TEC_AGG}, t.nombre) AS tecnico, ${TEC_IDS} AS tecnico_ids,
      (SELECT count(*) FROM pruebas p WHERE p.visita_id=v.id) AS pruebas,
      (SELECT count(*) FROM pruebas p JOIN estados_equipo est ON est.id=p.estado_id WHERE p.visita_id=v.id AND est.es_falla)::int AS fallas,
      (SELECT count(*) FROM equipos e WHERE e.cliente_id=v.cliente_id AND e.activo)::int AS total_equipos,
      CASE WHEN v.hora_entrada IS NOT NULL AND v.hora_salida IS NOT NULL THEN round(EXTRACT(EPOCH FROM (v.hora_salida - v.hora_entrada))/60)::int END AS duracion_min
    FROM visitas v LEFT JOIN tecnicos t ON t.id=v.tecnico_id
    WHERE v.cliente_id=$1 ORDER BY v.fecha DESC, v.id DESC`, [req.params.id]);
  res.json(r.rows);
}));
app.get('/api/visitas/:id', wrap(async (req, res) => {
  const r = await q(`
    SELECT v.*, COALESCE(${TEC_AGG}, t.nombre) AS tecnico, ${TEC_IDS} AS tecnico_ids, c.nombre AS cliente, c.direccion, c.telefono
    FROM visitas v
    LEFT JOIN tecnicos t ON t.id=v.tecnico_id
    LEFT JOIN clientes c ON c.id=v.cliente_id
    WHERE v.id=$1`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'No encontrada' });
  const visita = r.rows[0];
  const arch = await q('SELECT * FROM visita_archivos WHERE visita_id=$1 ORDER BY id', [req.params.id]);
  visita.archivos = arch.rows;
  visita.jornadas = (await q('SELECT j.*, t.nombre AS tecnico FROM visita_jornadas j LEFT JOIN tecnicos t ON t.id=j.tecnico_id WHERE j.visita_id=$1 ORDER BY j.orden, j.fecha, j.id', [req.params.id])).rows;
  res.json(visita);
}));
app.put('/api/visitas/:id/fecha', wrap(async (req, res) => {
  const { fecha, tecnico_id, hora } = req.body || {};
  if (!fecha && tecnico_id === undefined && hora === undefined) return res.status(400).json({ error: 'Falta fecha, hora o tecnico' });
  if (tecnico_id !== undefined) { await q('UPDATE visitas SET tecnico_id=$1 WHERE id=$2', [tecnico_id === 0 ? null : tecnico_id, req.params.id]); await setVisitaTecnicos(req.params.id, tecnico_id ? [tecnico_id] : []); }
  if (req.body && req.body.hora !== undefined) await q('UPDATE visitas SET hora=$1 WHERE id=$2', [req.body.hora || null, req.params.id]);
  const r = await q('UPDATE visitas SET fecha=COALESCE($1,fecha) WHERE id=$2 RETURNING *', [fecha || null, req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'No encontrada' });
  res.json(r.rows[0]);
}));
app.post('/api/clientes/:id/visitas', wrap(async (req, res) => {
  const b = req.body;
  const r = await q(`
    INSERT INTO visitas (cliente_id,fecha,tecnico_id,situacion_inicial,acciones,situacion_final,asignada_por,tipo,contrato_id,ticket_id,fecha_max_resolucion)
    VALUES ($1,COALESCE($2,CURRENT_DATE),$3,$4,$5,$6,$7,COALESCE($8,'preventiva'),$9,$10,$11) RETURNING *`,
    [req.params.id, b.fecha || null, b.tecnico_id || null, b.situacion_inicial, b.acciones, b.situacion_final, b.asignada_por || req.user?.nombre || req.user?.username || null, b.tipo || null, b.contrato_id || null, b.ticket_id || null, b.fecha_max_resolucion || null]);
  await setVisitaTecnicos(r.rows[0].id, b.tecnico_ids !== undefined ? b.tecnico_ids : (b.tecnico_id ? [b.tecnico_id] : []));
  // Jornadas (visitas de varios dias). Si no se envian dias, se crea una jornada del dia de la visita.
  const vid = r.rows[0].id;
  let dias = Array.isArray(b.dias) ? b.dias.filter(Boolean).map(d => String(d).slice(0, 10)) : [];
  if (!dias.length) {
    const f0 = (b.fecha ? String(b.fecha).slice(0, 10) : null) || (r.rows[0].fecha ? new Date(r.rows[0].fecha).toISOString().slice(0, 10) : null);
    if (f0) dias = [f0];
  }
  dias = [...new Set(dias)].sort();
  if (dias.length) {
    await q('UPDATE visitas SET fecha=$2, fecha_fin=$3, multidia=$4 WHERE id=$1', [vid, dias[0], dias[dias.length - 1], dias.length > 1]);
    for (let i = 0; i < dias.length; i++) await q("INSERT INTO visita_jornadas (visita_id,fecha,orden,tecnico_id,estado) VALUES ($1,$2,$3,$4,'planificada')", [vid, dias[i], i + 1, b.tecnico_id || null]);
  }
  try {
    const c = await q('SELECT nombre FROM clientes WHERE id=$1', [req.params.id]);
    notify({ type: 'visita', icon: 'calendar', text: 'Nueva visita agendada: ' + (c.rows[0]?.nombre || 'cliente'), url: '/visitas/' + r.rows[0].id });
  } catch {}
  res.status(201).json(r.rows[0]);
}));
app.put('/api/visitas/:id', wrap(async (req, res) => {
  const b = req.body;
  const r = await q(`
    UPDATE visitas SET fecha=COALESCE($1,fecha), tecnico_id=$2,
      situacion_inicial=$3, acciones=$4, situacion_final=$5, cerrada=COALESCE($6,cerrada), asignada_por=$8, tipo=COALESCE($9,tipo), fecha_max_resolucion=$10
    WHERE id=$7 RETURNING *`,
    [b.fecha || null, b.tecnico_id || null, b.situacion_inicial, b.acciones, b.situacion_final, b.cerrada, req.params.id, b.asignada_por ?? null, b.tipo || null, b.fecha_max_resolucion || null]);
  if (b.tecnico_ids !== undefined) await setVisitaTecnicos(req.params.id, b.tecnico_ids);
  res.json(r.rows[0]);
}));

// Subir fotos / adjuntos de la visita
app.post('/api/visitas/:id/archivos', upload.array('files', 20), wrap(async (req, res) => {
  const tipo = req.body.tipo || 'foto';
  const out = [];
  for (const f of req.files || []) {
    const r = await q(
      'INSERT INTO visita_archivos (visita_id,tipo,filename,path,mimetype) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, tipo, f.originalname, '/uploads/' + path.basename(f.path), f.mimetype]);
    out.push(r.rows[0]);
  }
  res.status(201).json(out);
}));
app.delete('/api/visita_archivos/:id', wrap(async (req, res) => {
  await q('DELETE FROM visita_archivos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// Guardar firma del cliente (dataURL base64)
app.post('/api/visitas/:id/firma', wrap(async (req, res) => {
  const { dataUrl, lat, lon, firmante_nombre, firmante_doc } = req.body;
  if (!dataUrl) return res.status(400).json({ error: 'Falta dataUrl' });
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'Formato inválido' });
  const fname = `firma_${req.params.id}_${Date.now()}.${m[1]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, fname), Buffer.from(m[2], 'base64'));
  const rel = '/uploads/' + fname;
  await q('UPDATE visitas SET firma_path=$1, firma_lat=$2, firma_lon=$3, firmante_nombre=COALESCE($4,firmante_nombre), firmante_doc=COALESCE($5,firmante_doc) WHERE id=$6', [rel, lat ?? null, lon ?? null, firmante_nombre || null, firmante_doc || null, req.params.id]);
  res.json({ firma_path: rel });
}));

// ============== Sugerencia de equipos a probar ==============
// Orden: 1) en falla en pruebas anteriores  2) más tiempo sin probar
//        3) resto.  (nunca probados se priorizan dentro del grupo 2)
app.get('/api/visitas/:id/sugerencias', wrap(async (req, res) => {
  const v = await q('SELECT cliente_id FROM visitas WHERE id=$1', [req.params.id]);
  if (!v.rows[0]) return res.status(404).json({ error: 'Visita no encontrada' });
  const clienteId = v.rows[0].cliente_id;
  const r = await q(`
    SELECT e.*, s.nombre AS sistema, t.nombre AS tipo_elemento,
           u.ultima_fecha, u.ultimo_estado, u.ultima_falla,
           pv.estado_id AS estado_actual_id, ev.nombre AS estado_actual,
           pv.comentarios AS comentarios_actual, pv.id AS prueba_id,
           CASE
             WHEN u.ultima_falla THEN 1
             WHEN u.ultima_fecha IS NULL THEN 2
             ELSE 3
           END AS prioridad,
           CASE
             WHEN u.ultima_falla THEN 'En falla anterior'
             WHEN u.ultima_fecha IS NULL THEN 'Nunca probado'
             ELSE 'Por antigüedad'
           END AS motivo
    FROM equipos e
    LEFT JOIN sistemas s ON s.id=e.sistema_id
    LEFT JOIN tipos_elemento t ON t.id=e.tipo_elemento_id
    LEFT JOIN v_ultima_prueba u ON u.equipo_id=e.id
    LEFT JOIN pruebas pv ON pv.equipo_id=e.id AND pv.visita_id=$2
    LEFT JOIN estados_equipo ev ON ev.id=pv.estado_id
    WHERE e.cliente_id=$1 AND e.activo
    ORDER BY prioridad ASC,
             u.ultima_fecha ASC NULLS FIRST,
             e.etiqueta, e.id`,
    [clienteId, req.params.id]);
  res.json(r.rows);
}));

// ============== Pruebas (estado de cada equipo en la visita) ==============
app.get('/api/visitas/:id/pruebas', wrap(async (req, res) => {
  const r = await q(`
    SELECT p.*, e.etiqueta, e.direccion, e.grupo, e.subgrupo, e.modelo,
           s.nombre AS sistema, te.nombre AS tipo_elemento, est.nombre AS estado, est.es_falla
    FROM pruebas p
    JOIN equipos e ON e.id=p.equipo_id
    LEFT JOIN sistemas s ON s.id=e.sistema_id
    LEFT JOIN tipos_elemento te ON te.id=e.tipo_elemento_id
    LEFT JOIN estados_equipo est ON est.id=p.estado_id
    WHERE p.visita_id=$1 ORDER BY p.id`, [req.params.id]);
  for (const row of r.rows) {
    const f = await q('SELECT * FROM prueba_fotos WHERE prueba_id=$1', [row.id]);
    row.fotos = f.rows;
  }
  res.json(r.rows);
}));
// Crear o actualizar la prueba de un equipo en la visita
app.post('/api/visitas/:id/pruebas', wrap(async (req, res) => {
  const { equipo_id, estado_id, comentarios, fecha, lat, lon } = req.body;
  const ex = await q('SELECT id FROM pruebas WHERE visita_id=$1 AND equipo_id=$2', [req.params.id, equipo_id]);
  let row;
  if (ex.rows[0]) {
    const r = await q(
      'UPDATE pruebas SET estado_id=$1, comentarios=$2, fecha=COALESCE($3,fecha), lat=COALESCE($4,lat), lon=COALESCE($5,lon) WHERE id=$6 RETURNING *',
      [estado_id || null, comentarios, fecha || null, lat ?? null, lon ?? null, ex.rows[0].id]);
    row = r.rows[0];
  } else {
    const r = await q(
      `INSERT INTO pruebas (visita_id,equipo_id,estado_id,comentarios,fecha,lat,lon)
       VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7) RETURNING *`,
      [req.params.id, equipo_id, estado_id || null, comentarios, fecha || null, lat ?? null, lon ?? null]);
    row = r.rows[0];
  }
  try {
    const est = await q('SELECT nombre, es_falla FROM estados_equipo WHERE id=$1', [estado_id || 0]);
    if (est.rows[0]?.es_falla) {
      const eq = await q('SELECT e.etiqueta, e.codigo_qr, c.nombre AS cliente FROM equipos e JOIN clientes c ON c.id=e.cliente_id WHERE e.id=$1', [equipo_id]);
      const et = eq.rows[0]?.etiqueta || eq.rows[0]?.codigo_qr || 'Equipo';
      notify({ type: 'falla', icon: 'alert', text: 'Equipo en falla: ' + et + ' (' + (eq.rows[0]?.cliente || '') + ')', url: '/equipos/' + equipo_id });
    }
  } catch {}
  res.status(201).json(row);
}));
// Marcar OK en lote: crea pruebas con el estado dado para equipos aun sin probar
app.post('/api/visitas/:id/pruebas/marcar-ok', wrap(async (req, res) => {
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ error: 'Falta el estado a aplicar' });
  const v = await q('SELECT cliente_id FROM visitas WHERE id=$1', [req.params.id]);
  if (!v.rows[0]) return res.status(404).json({ error: 'Visita no encontrada' });
  const r = await q(`INSERT INTO pruebas (visita_id, equipo_id, estado_id, fecha)
     SELECT $1, e.id, $2, CURRENT_DATE FROM equipos e
     WHERE e.cliente_id=$3 AND e.activo
       AND NOT EXISTS (SELECT 1 FROM pruebas p WHERE p.visita_id=$1 AND p.equipo_id=e.id)`,
    [req.params.id, estado_id, v.rows[0].cliente_id]);
  res.json({ creadas: r.rowCount });
}));

// Foto de una prueba
app.post('/api/pruebas/:id/fotos', upload.array('files', 10), wrap(async (req, res) => {
  const out = [];
  for (const f of req.files || []) {
    const r = await q('INSERT INTO prueba_fotos (prueba_id,filename,path) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, f.originalname, '/uploads/' + path.basename(f.path)]);
    out.push(r.rows[0]);
  }
  res.status(201).json(out);
}));

// ============== Carga masiva / exportación Excel ==============
// Importar pruebas desde Excel (reporte de central). Columnas esperadas:
// etiqueta | estado | fecha | comentarios   (o codigo_qr en vez de etiqueta)
app.post('/api/clientes/:id/pruebas/import', memUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta archivo' });
  const result = await importPruebasExcel(req.file.buffer, Number(req.params.id), req.body.visita_id || null);
  res.json(result);
}));
// Exportar pruebas de un cliente a Excel
app.get('/api/clientes/:id/pruebas/export.xlsx', wrap(async (req, res) => {
  const buf = await exportPruebasExcel({ clienteId: Number(req.params.id), desde: req.query.desde, hasta: req.query.hasta });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pruebas_cliente_${req.params.id}.xlsx"`);
  res.send(buf);
}));
// Exportar pruebas de una visita
app.get('/api/visitas/:id/pruebas/export.xlsx', wrap(async (req, res) => {
  const buf = await exportPruebasExcel({ visitaId: Number(req.params.id) });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pruebas_visita_${req.params.id}.xlsx"`);
  res.send(buf);
}));

app.get('/api/notificaciones', wrap(async (req, res) => { res.json(recentEvents()); }));

// ============== Informe PDF de la visita ==============
app.get('/api/visitas/:id/informe.pdf', wrap(async (req, res) => {
  const buf = await buildInformePDF(Number(req.params.id), UPLOAD_DIR);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="informe_visita_${req.params.id}.pdf"`);
  res.send(buf);
}));

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: '*' }, path: '/socket.io' });
io.on('connection', (socket) => { socket.emit('hello', { ok: true }); });
setIO(io);
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => console.log(`Preventis API en ${HOST}:${PORT}`));
