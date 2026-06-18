import ExcelJS from 'exceljs';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { exec } from 'child_process';
import { adminOnly, authMiddleware } from './auth.js';
import { notify, setWaSender } from './realtime.js';
import { handleIncoming, parseInbound } from './chatbot.js';
import { dispatchAlerta } from './alertas.js';
import jwt from 'jsonwebtoken';

const __dirX = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_X = path.join(__dirX, '../uploads');
const _BADUP = /\.(svgz?|html?|xhtml|shtml|js|mjs|php\d?|phtml|phar|xml|htaccess)$/i;
const _safeFilter = (r, f, cb) => { const n = (f.originalname || '').toLowerCase(); if (_BADUP.test(n) || /(svg|html|xhtml|javascript|ecmascript|php)/i.test(f.mimetype || '')) return cb(null, false); cb(null, true); };
const upX = multer({ storage: multer.diskStorage({ destination: (r, f, cb) => cb(null, UPLOAD_X), filename: (r, f, cb) => cb(null, Date.now() + '_' + Math.random().toString(36).slice(2, 8) + (path.extname(f.originalname) || '')) }), limits: { fileSize: 30 * 1024 * 1024 }, fileFilter: _safeFilter });
const CKEY = crypto.createHash('sha256').update(process.env.CRED_KEY || process.env.JWT_SECRET || 'preventis-cred-default').digest();
function encCred(t) { if (t == null || t === '') return null; const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', CKEY, iv); const ct = Buffer.concat([c.update(String(t), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'); }
function decCred(b) { if (!b) return ''; try { const r = Buffer.from(b, 'base64'); const iv = r.subarray(0, 12), tag = r.subarray(12, 28), ct = r.subarray(28); const d = crypto.createDecipheriv('aes-256-gcm', CKEY, iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); } catch { return ''; } }

const hav = (a, b, c2, d) => { const R = 6371e3, r = x => x * Math.PI / 180; const h = Math.sin(r(c2 - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c2)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

const INTERVALO = `CASE c.frecuencia
  WHEN 'mensual' THEN interval '1 month'
  WHEN 'bimestral' THEN interval '2 months'
  WHEN 'trimestral' THEN interval '3 months'
  WHEN 'semestral' THEN interval '6 months'
  WHEN 'anual' THEN interval '12 months'
  WHEN 'sin' THEN NULL
  ELSE interval '1 month' END`;

function pruebasFilter(query) {
  const cond = [], params = [];
  if (query.cliente_id) { params.push(query.cliente_id); cond.push(`e.cliente_id=$${params.length}`); }
  if (query.estado_id) { params.push(query.estado_id); cond.push(`p.estado_id=$${params.length}`); }
  if (query.desde) { params.push(query.desde); cond.push(`p.fecha>=$${params.length}`); }
  if (query.hasta) { params.push(query.hasta); cond.push(`p.fecha<=$${params.length}`); }
  if (query.falla === '1') cond.push('est.es_falla');
  return { where: cond.length ? 'WHERE ' + cond.join(' AND ') : '', params };
}

const PRUEBAS_SQL = (where) => `
  SELECT p.id, p.fecha, p.comentarios, p.origen,
         c.id AS cliente_id, c.nombre AS cliente,
         e.etiqueta, e.codigo_qr, e.direccion, e.grupo, e.subgrupo, e.modelo,
         s.nombre AS sistema, te.nombre AS tipo_elemento,
         est.nombre AS estado, est.es_falla,
         v.id AS visita_id, v.fecha AS fecha_visita, t.nombre AS tecnico
  FROM pruebas p
  JOIN equipos e ON e.id=p.equipo_id
  LEFT JOIN clientes c ON c.id=e.cliente_id
  LEFT JOIN visitas v ON v.id=p.visita_id
  LEFT JOIN tecnicos t ON t.id=v.tecnico_id
  LEFT JOIN sistemas s ON s.id=e.sistema_id
  LEFT JOIN tipos_elemento te ON te.id=e.tipo_elemento_id
  LEFT JOIN estados_equipo est ON est.id=p.estado_id
  ${where}
  ORDER BY p.fecha DESC, c.nombre`;

export function mountExtras(app, q) {
  const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: e.message }); });

  // Migracion: estados/horarios de visita + GPS (cliente, visita, prueba)
  q(`ALTER TABLE visitas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'programada';
     ALTER TABLE visitas ADD COLUMN IF NOT EXISTS titulo TEXT;
     ALTER TABLE visitas ADD COLUMN IF NOT EXISTS hora_entrada TIMESTAMPTZ;
     ALTER TABLE visitas ADD COLUMN IF NOT EXISTS hora_salida TIMESTAMPTZ;
     ALTER TABLE visitas ADD COLUMN IF NOT EXISTS firma_lat DOUBLE PRECISION;
     ALTER TABLE visitas ADD COLUMN IF NOT EXISTS firma_lon DOUBLE PRECISION;
     ALTER TABLE visitas ADD COLUMN IF NOT EXISTS entrada_lat DOUBLE PRECISION;
     ALTER TABLE visitas ADD COLUMN IF NOT EXISTS entrada_lon DOUBLE PRECISION;
     ALTER TABLE visitas ADD COLUMN IF NOT EXISTS salida_lat DOUBLE PRECISION;
     ALTER TABLE visitas ADD COLUMN IF NOT EXISTS salida_lon DOUBLE PRECISION;
     ALTER TABLE pruebas ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
     ALTER TABLE pruebas ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
     ALTER TABLE clientes ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
     ALTER TABLE clientes ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;`)
    .then(() => q("UPDATE visitas SET estado='cerrada' WHERE cerrada AND estado='programada'"))
    .then(() => q("INSERT INTO estados_equipo (nombre,es_falla,orden) VALUES ('Reparado',false,7),('Limpio / Mantenido',false,8) ON CONFLICT (nombre) DO NOTHING"))
    .then(() => q(`
      CREATE TABLE IF NOT EXISTS cliente_credenciales (id serial PRIMARY KEY, cliente_id int REFERENCES clientes(id) ON DELETE CASCADE, nombre text, usuario text, password_enc text, url text, notas text, created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS cliente_archivos (id serial PRIMARY KEY, cliente_id int REFERENCES clientes(id) ON DELETE CASCADE, tipo text DEFAULT 'doc', filename text, path text, descripcion text, created_at timestamptz DEFAULT now());
      ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notas text;`))
    .then(() => q(`
      CREATE TABLE IF NOT EXISTS auditoria (id serial PRIMARY KEY, ts timestamptz DEFAULT now(), usuario text, rol text, metodo text, ruta text, status int, detalle text);
      CREATE TABLE IF NOT EXISTS equipos_estandar (id serial PRIMARY KEY, nombre text, tipo text, marca text, modelo text, foto_path text, created_at timestamptz DEFAULT now());
      ALTER TABLE equipos ADD COLUMN IF NOT EXISTS foto_path text;
      ALTER TABLE clientes ADD COLUMN IF NOT EXISTS vip boolean DEFAULT false;
      ALTER TABLE clientes ADD COLUMN IF NOT EXISTS avatar_path text;
      CREATE TABLE IF NOT EXISTS cliente_contactos (id serial PRIMARY KEY, cliente_id int REFERENCES clientes(id) ON DELETE CASCADE, nombre text, email text, telefono text, cargo text, created_at timestamptz DEFAULT now());
      ALTER TABLE clientes ADD COLUMN IF NOT EXISTS rut text;
      ALTER TABLE clientes ADD COLUMN IF NOT EXISTS empresa_monitoreo text;
      ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nro_abonado text;`))
    .then(() => q(`
      ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contrato_inicio date;
      ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contrato_fin date;
      ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contrato_monto text;
      ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contrato_notas text;
      ALTER TABLE visitas ADD COLUMN IF NOT EXISTS asignada_por text;
      ALTER TABLE visitas ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'preventiva';
      ALTER TABLE tipos_elemento ADD COLUMN IF NOT EXISTS icono text;
      ALTER TABLE estados_equipo ADD COLUMN IF NOT EXISTS icono text;
      ALTER TABLE equipos_estandar ADD COLUMN IF NOT EXISTS sistema_id int;
      ALTER TABLE visitas ADD COLUMN IF NOT EXISTS orden int;
      ALTER TABLE visitas ADD COLUMN IF NOT EXISTS hora time;
    ALTER TABLE visitas ADD COLUMN IF NOT EXISTS firmante_nombre text;
    ALTER TABLE visitas ADD COLUMN IF NOT EXISTS firmante_doc text;
    ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS service_cada_km int;
    CREATE TABLE IF NOT EXISTS fin_facturas (id serial PRIMARY KEY, tipo text DEFAULT 'emitida', cliente_id int REFERENCES clientes(id) ON DELETE SET NULL, tercero text, numero text, fecha date DEFAULT CURRENT_DATE, vencimiento date, monto numeric(14,2), moneda text DEFAULT 'UYU', estado text DEFAULT 'pendiente', concepto text, created_at timestamptz DEFAULT now());
    CREATE TABLE IF NOT EXISTS fin_cobros (id serial PRIMARY KEY, cliente_id int REFERENCES clientes(id) ON DELETE SET NULL, factura_id int REFERENCES fin_facturas(id) ON DELETE SET NULL, fecha date DEFAULT CURRENT_DATE, monto numeric(14,2), moneda text DEFAULT 'UYU', medio text, referencia text, notas text, created_at timestamptz DEFAULT now());
    CREATE TABLE IF NOT EXISTS fin_pagos (id serial PRIMARY KEY, tercero text, factura_id int REFERENCES fin_facturas(id) ON DELETE SET NULL, fecha date DEFAULT CURRENT_DATE, monto numeric(14,2), moneda text DEFAULT 'UYU', medio text, categoria text, referencia text, notas text, created_at timestamptz DEFAULT now());
    CREATE TABLE IF NOT EXISTS fin_comprobantes (id serial PRIMARY KEY, tipo text, ref_id int, path text, created_at timestamptz DEFAULT now());
    ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS service_cada_meses int;
    CREATE TABLE IF NOT EXISTS vehiculo_registro_fotos (id serial PRIMARY KEY, registro_id int REFERENCES vehiculo_registros(id) ON DELETE CASCADE, path text, created_at timestamptz DEFAULT now());
    ALTER TABLE ticket_comentarios ADD COLUMN IF NOT EXISTS adjuntos jsonb DEFAULT '[]'::jsonb;
    CREATE TABLE IF NOT EXISTS contratos (
      id SERIAL PRIMARY KEY,
      cliente_id INT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      fecha_inicio DATE,
      fecha_fin DATE,
      deberes TEXT,
      responsabilidades TEXT,
      monto NUMERIC(14,2),
      moneda TEXT DEFAULT 'UYU',
      forma_pago TEXT,
      estado TEXT NOT NULL DEFAULT 'activo',
      creado TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS frecuencia_preventivo text;
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS recurrencia_preventivo text;
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS correctivos_anuales int;
    ALTER TABLE visitas ADD COLUMN IF NOT EXISTS contrato_id int REFERENCES contratos(id) ON DELETE SET NULL;
    ALTER TABLE visitas ADD COLUMN IF NOT EXISTS ticket_id int REFERENCES tickets(id) ON DELETE SET NULL;
    ALTER TABLE visitas ADD COLUMN IF NOT EXISTS fecha_max_resolucion date;
    ALTER TABLE visitas ADD COLUMN IF NOT EXISTS cancelada_motivo text;
    ALTER TABLE visitas ADD COLUMN IF NOT EXISTS cancelada_por text;
    ALTER TABLE visitas ADD COLUMN IF NOT EXISTS cancelada_at timestamptz;
      CREATE TABLE IF NOT EXISTS proveedores (id serial PRIMARY KEY, nombre text, rubro text, direccion text, telefono text, lat double precision, lon double precision, activo boolean DEFAULT true, created_at timestamptz DEFAULT now());
      ALTER TABLE equipos ADD COLUMN IF NOT EXISTS ip_host text;
      ALTER TABLE equipos ADD COLUMN IF NOT EXISTS cred_usuario text;
      ALTER TABLE equipos ADD COLUMN IF NOT EXISTS cred_password_enc text;
      ALTER TABLE equipos ADD COLUMN IF NOT EXISTS cred_url text;
      ALTER TABLE equipos ADD COLUMN IF NOT EXISTS cred_notas text;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avatar_path text;
      ALTER TABLE tecnicos ADD COLUMN IF NOT EXISTS avatar_path text;
      CREATE TABLE IF NOT EXISTS planos (id serial PRIMARY KEY, cliente_id int REFERENCES clientes(id) ON DELETE CASCADE, nombre text, path text, shapes jsonb DEFAULT '[]'::jsonb, created_at timestamptz DEFAULT now());`))
    .then(() => q(`
      CREATE TABLE IF NOT EXISTS visita_tecnicos (
        visita_id int REFERENCES visitas(id) ON DELETE CASCADE,
        tecnico_id int REFERENCES tecnicos(id) ON DELETE CASCADE,
        PRIMARY KEY (visita_id, tecnico_id)
      );
      INSERT INTO visita_tecnicos (visita_id, tecnico_id)
        SELECT v.id, v.tecnico_id FROM visitas v
        WHERE v.tecnico_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM visita_tecnicos vt WHERE vt.visita_id=v.id)
        ON CONFLICT DO NOTHING;`))
    .then(() => q(`
      CREATE TABLE IF NOT EXISTS rol_permisos (rol text PRIMARY KEY, permisos jsonb DEFAULT '{}'::jsonb);
      INSERT INTO rol_permisos (rol, permisos) VALUES
        ('admin', '{"editar_clientes":true,"editar_equipos":true,"moderar_visitas":true,"ver_credenciales":true,"ver_reportes":true,"editar_config":true,"gestionar_usuarios":true}'::jsonb),
        ('tecnico', '{"editar_clientes":false,"editar_equipos":true,"moderar_visitas":true,"ver_credenciales":true,"ver_reportes":true,"editar_config":false,"gestionar_usuarios":false}'::jsonb)
      ON CONFLICT (rol) DO NOTHING;`))
    .then(() => q(`
      CREATE TABLE IF NOT EXISTS vehiculos (id serial PRIMARY KEY, nombre text, patente text, tipo text, marca text, modelo text, anio int, odometro int, notas text, activo boolean DEFAULT true, created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS vehiculo_registros (id serial PRIMARY KEY, vehiculo_id int REFERENCES vehiculos(id) ON DELETE CASCADE, tipo text DEFAULT 'service', fecha date DEFAULT CURRENT_DATE, costo numeric, odometro int, detalle text, created_at timestamptz DEFAULT now());`))
    .then(() => q(`
      CREATE TABLE IF NOT EXISTS tickets (id serial PRIMARY KEY, titulo text, cliente_id int REFERENCES clientes(id) ON DELETE SET NULL, prioridad text DEFAULT 'media', estado text DEFAULT 'abierto', asignado text, descripcion text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS ticket_comentarios (id serial PRIMARY KEY, ticket_id int REFERENCES tickets(id) ON DELETE CASCADE, autor text, texto text, created_at timestamptz DEFAULT now());
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS solicitante text;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS fecha_max_resolucion date;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS facturable boolean;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS presupuesto_crm text;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS motivo_no_fact text;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS contrato_id int REFERENCES contratos(id) ON DELETE SET NULL;
      CREATE TABLE IF NOT EXISTS app_config (clave text PRIMARY KEY, valor jsonb DEFAULT '{}'::jsonb);
      CREATE TABLE IF NOT EXISTS vehiculo_fotos (id serial PRIMARY KEY, vehiculo_id int REFERENCES vehiculos(id) ON DELETE CASCADE, path text, created_at timestamptz DEFAULT now());`))
    .then(() => q(`
      ALTER TABLE visitas ADD COLUMN IF NOT EXISTS facturar boolean;
      CREATE TABLE IF NOT EXISTS visita_tareas (id serial PRIMARY KEY, visita_id int REFERENCES visitas(id) ON DELETE CASCADE, descripcion text, prioridad text DEFAULT 'media', resuelta boolean DEFAULT false, created_at timestamptz DEFAULT now());`))
    .then(() => q(`
      CREATE TABLE IF NOT EXISTS posiciones (id serial PRIMARY KEY, usuario text, nombre text, rol text, lat double precision, lon double precision, accuracy real, ts timestamptz DEFAULT now());
      CREATE INDEX IF NOT EXISTS idx_posiciones_ts ON posiciones(ts DESC);`))
    .then(() => q("ALTER TYPE frecuencia_visita ADD VALUE IF NOT EXISTS 'sin'").catch(() => {}))
    .then(() => q(`
      ALTER TABLE visitas ADD COLUMN IF NOT EXISTS fecha_fin date;
      ALTER TABLE visitas ADD COLUMN IF NOT EXISTS multidia boolean DEFAULT false;
      CREATE TABLE IF NOT EXISTS visita_jornadas (
        id serial PRIMARY KEY,
        visita_id int NOT NULL REFERENCES visitas(id) ON DELETE CASCADE,
        fecha date NOT NULL,
        orden int NOT NULL DEFAULT 1,
        estado text NOT NULL DEFAULT 'planificada',
        tecnico_id int REFERENCES tecnicos(id) ON DELETE SET NULL,
        hora_inicio timestamptz,
        hora_fin timestamptz,
        nota text,
        created_at timestamptz DEFAULT now());
      CREATE INDEX IF NOT EXISTS idx_vjorn_visita ON visita_jornadas(visita_id);
      CREATE INDEX IF NOT EXISTS idx_vjorn_fecha ON visita_jornadas(fecha);`))
    .catch(e => console.error('migr extras:', e.message));

  // ---- Auditoria: registra toda mutacion /api con el usuario ----
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || req.method === 'GET' || req.method === 'OPTIONS' || req.path === '/api/auth/login') return next();
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        let det = ''; try { det = JSON.stringify(req.body || {}); } catch {}
        det = det.replace(/("(?:password|dataUrl)"\s*:\s*)"[^"]*"/g, '$1"***"').slice(0, 500);
        q('INSERT INTO auditoria (usuario,rol,metodo,ruta,status,detalle) VALUES ($1,$2,$3,$4,$5,$6)',
          [req.user?.username || null, req.user?.rol || null, req.method, req.path, res.statusCode, det]).catch(() => {});
      }
    });
    next();
  });

  app.get('/api/dashboard', wrap(async (req, res) => {
    const kpis = (await q(`
      SELECT
        (SELECT count(*) FROM clientes WHERE activo)::int AS clientes,
        (SELECT count(*) FROM equipos WHERE activo)::int AS equipos,
        (SELECT count(*) FROM visitas WHERE date_trunc('month',fecha)=date_trunc('month',CURRENT_DATE))::int AS visitas_mes,
        (SELECT count(*) FROM v_ultima_prueba u JOIN equipos e ON e.id=u.equipo_id WHERE u.ultima_falla AND e.activo)::int AS en_falla
    `)).rows[0];
    const proximas = (await q(`
      SELECT c.id, c.nombre, c.direccion, c.telefono, c.frecuencia, uv.ultima,
             CASE WHEN uv.ultima IS NULL THEN CURRENT_DATE ELSE (uv.ultima + ${INTERVALO})::date END AS proxima
      FROM clientes c
      LEFT JOIN (SELECT cliente_id, max(fecha) AS ultima FROM visitas GROUP BY cliente_id) uv ON uv.cliente_id=c.id
      WHERE c.activo ORDER BY proxima ASC LIMIT 12`)).rows;
    const enFalla = (await q(`
      SELECT e.id, e.etiqueta, e.codigo_qr, e.cliente_id, c.nombre AS cliente, s.nombre AS sistema, u.ultima_fecha, u.ultimo_estado
      FROM v_ultima_prueba u JOIN equipos e ON e.id=u.equipo_id
      LEFT JOIN clientes c ON c.id=e.cliente_id LEFT JOIN sistemas s ON s.id=e.sistema_id
      WHERE u.ultima_falla AND e.activo ORDER BY u.ultima_fecha DESC NULLS LAST LIMIT 20`)).rows;
    res.json({ kpis, proximas, en_falla: enFalla });
  }));

  app.get('/api/clientes/:id/resumen', wrap(async (req, res) => {
    const r = await q(`
      SELECT
        (SELECT count(*) FROM equipos e WHERE e.cliente_id=c.id AND e.activo)::int AS equipos,
        (SELECT count(*) FROM v_ultima_prueba u JOIN equipos e ON e.id=u.equipo_id WHERE e.cliente_id=c.id AND e.activo AND u.ultima_falla)::int AS en_falla,
        (SELECT count(*) FROM visitas v WHERE v.cliente_id=c.id)::int AS visitas,
        uv.ultima,
        CASE WHEN uv.ultima IS NULL THEN CURRENT_DATE ELSE (uv.ultima + ${INTERVALO})::date END AS proxima
      FROM clientes c
      LEFT JOIN (SELECT cliente_id, max(fecha) AS ultima FROM visitas GROUP BY cliente_id) uv ON uv.cliente_id=c.id
      WHERE c.id=$1`, [req.params.id]);
    res.json(r.rows[0] || {});
  }));

  app.get('/api/equipos/:id', wrap(async (req, res) => {
    const r = await q(`
      SELECT e.*, s.nombre AS sistema, te.nombre AS tipo_elemento, c.nombre AS cliente, c.id AS cliente_id,
             u.ultima_fecha, u.ultimo_estado, u.ultima_falla, est.foto_path AS foto_estandar, est.nombre AS estandar_nombre
      FROM equipos e
      LEFT JOIN sistemas s ON s.id=e.sistema_id LEFT JOIN tipos_elemento te ON te.id=e.tipo_elemento_id
      LEFT JOIN clientes c ON c.id=e.cliente_id LEFT JOIN v_ultima_prueba u ON u.equipo_id=e.id
      LEFT JOIN LATERAL (
        SELECT foto_path, nombre FROM equipos_estandar es
        WHERE es.foto_path IS NOT NULL AND e.modelo IS NOT NULL AND btrim(e.modelo) <> ''
          AND (e.modelo ILIKE '%' || es.modelo || '%' OR (es.marca IS NOT NULL AND es.marca <> '' AND e.modelo ILIKE '%' || es.marca || '%'))
        ORDER BY length(es.modelo) DESC NULLS LAST LIMIT 1
      ) est ON true
      WHERE e.id=$1`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Equipo no encontrado' });
    res.json(r.rows[0]);
  }));

  // ---- Credenciales del dispositivo (cifradas) ----
  app.get('/api/equipos/:id/credencial', authMiddleware, adminOnly, wrap(async (req, res) => {
    const r = (await q('SELECT cred_usuario, cred_password_enc, cred_url, cred_notas FROM equipos WHERE id=$1', [req.params.id])).rows[0] || {};
    const tiene = !!(r.cred_usuario || r.cred_password_enc || r.cred_url || r.cred_notas);
    res.json({ usuario: r.cred_usuario || '', password: decCred(r.cred_password_enc), url: r.cred_url || '', notas: r.cred_notas || '', tiene });
  }));
  app.put('/api/equipos/:id/credencial', authMiddleware, wrap(async (req, res) => {
    const b = req.body || {};
    if (b.password != null && b.password !== '') {
      await q('UPDATE equipos SET cred_usuario=$1, cred_password_enc=$2, cred_url=$3, cred_notas=$4 WHERE id=$5',
        [b.usuario || null, encCred(b.password), b.url || null, b.notas || null, req.params.id]);
    } else {
      await q('UPDATE equipos SET cred_usuario=$1, cred_url=$2, cred_notas=$3 WHERE id=$4',
        [b.usuario || null, b.url || null, b.notas || null, req.params.id]);
    }
    res.json({ ok: true });
  }));

  // ---- Roles y permisos ----
  app.get('/api/badges', authMiddleware, wrap(async (req, res) => {
    const one = async (sql) => { try { return (await q(sql)).rows[0].c; } catch { return 0; } };
    res.json({
      fallas: await one("SELECT count(*)::int c FROM v_ultima_prueba u JOIN equipos e ON e.id=u.equipo_id WHERE u.ultima_falla AND e.activo"),
      visitas_pendientes: await one("SELECT count(*)::int c FROM visitas WHERE estado IN ('programada','en_curso')"),
      tickets_abiertos: await one("SELECT count(*)::int c FROM tickets WHERE estado IN ('abierto','en_proceso')"),
      tecnicos_calle: await one("SELECT count(DISTINCT usuario)::int c FROM posiciones WHERE ts > now() - interval '20 minutes'"),
    });
  }));

  app.get('/api/roles', wrap(async (req, res) => {
    res.json((await q('SELECT rol, permisos FROM rol_permisos ORDER BY rol')).rows);
  }));
  app.put('/api/roles/:rol', authMiddleware, adminOnly, wrap(async (req, res) => {
    const permisos = req.body?.permisos || {};
    await q("INSERT INTO rol_permisos (rol,permisos) VALUES ($1,$2) ON CONFLICT (rol) DO UPDATE SET permisos=$2", [req.params.rol, JSON.stringify(permisos)]);
    res.json({ ok: true });
  }));

  // ============== Contable (finanzas) ==============
  const finList = (sql) => wrap(async (req, res) => { res.json((await q(sql)).rows); });

  // Facturas (emitidas a clientes / recibidas de terceros)
  app.get('/api/fin/facturas', authMiddleware, adminOnly, finList(`SELECT f.*, c.nombre AS cliente,
      COALESCE((SELECT sum(co.monto) FROM fin_cobros co WHERE co.factura_id=f.id),0) AS cobrado,
      COALESCE((SELECT sum(p.monto) FROM fin_pagos p WHERE p.factura_id=f.id),0) AS pagado
    FROM fin_facturas f LEFT JOIN clientes c ON c.id=f.cliente_id ORDER BY f.fecha DESC, f.id DESC`));
  app.post('/api/fin/facturas', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q(`INSERT INTO fin_facturas (tipo,cliente_id,tercero,numero,fecha,vencimiento,monto,moneda,estado,concepto)
      VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,COALESCE($8,'UYU'),COALESCE($9,'pendiente'),$10) RETURNING *`,
      [b.tipo || 'emitida', b.cliente_id || null, b.tercero || null, b.numero || null, b.fecha || null, b.vencimiento || null, b.monto || null, b.moneda, b.estado, b.concepto || null]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/fin/facturas/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q(`UPDATE fin_facturas SET tipo=$1,cliente_id=$2,tercero=$3,numero=$4,fecha=$5,vencimiento=$6,monto=$7,moneda=COALESCE($8,moneda),estado=COALESCE($9,estado),concepto=$10 WHERE id=$11 RETURNING *`,
      [b.tipo || 'emitida', b.cliente_id || null, b.tercero || null, b.numero || null, b.fecha || null, b.vencimiento || null, b.monto || null, b.moneda, b.estado, b.concepto || null, req.params.id]);
    res.json(r.rows[0] || {});
  }));
  app.delete('/api/fin/facturas/:id', authMiddleware, adminOnly, wrap(async (req, res) => { await q('DELETE FROM fin_facturas WHERE id=$1', [req.params.id]); res.json({ ok: true }); }));

  // Cobros (ingresos)
  app.get('/api/fin/cobros', authMiddleware, adminOnly, finList(`SELECT co.*, c.nombre AS cliente, f.numero AS factura_numero, COALESCE((SELECT json_agg(json_build_object('id',x.id,'path',x.path) ORDER BY x.id) FROM fin_comprobantes x WHERE x.tipo='cobros' AND x.ref_id=co.id),'[]') AS comprobantes FROM fin_cobros co LEFT JOIN clientes c ON c.id=co.cliente_id LEFT JOIN fin_facturas f ON f.id=co.factura_id ORDER BY co.fecha DESC, co.id DESC`));
  app.post('/api/fin/cobros', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q(`INSERT INTO fin_cobros (cliente_id,factura_id,fecha,monto,moneda,medio,referencia,notas) VALUES ($1,$2,COALESCE($3,CURRENT_DATE),$4,COALESCE($5,'UYU'),$6,$7,$8) RETURNING *`,
      [b.cliente_id || null, b.factura_id || null, b.fecha || null, b.monto || null, b.moneda, b.medio || null, b.referencia || null, b.notas || null]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/fin/cobros/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q(`UPDATE fin_cobros SET cliente_id=$1,factura_id=$2,fecha=$3,monto=$4,moneda=COALESCE($5,moneda),medio=$6,referencia=$7,notas=$8 WHERE id=$9 RETURNING *`,
      [b.cliente_id || null, b.factura_id || null, b.fecha || null, b.monto || null, b.moneda, b.medio || null, b.referencia || null, b.notas || null, req.params.id]);
    res.json(r.rows[0] || {});
  }));
  app.delete('/api/fin/cobros/:id', authMiddleware, adminOnly, wrap(async (req, res) => { await q('DELETE FROM fin_cobros WHERE id=$1', [req.params.id]); res.json({ ok: true }); }));

  // Pagos (egresos)
  app.get('/api/fin/pagos', authMiddleware, adminOnly, finList(`SELECT p.*, f.numero AS factura_numero, COALESCE((SELECT json_agg(json_build_object('id',x.id,'path',x.path) ORDER BY x.id) FROM fin_comprobantes x WHERE x.tipo='pagos' AND x.ref_id=p.id),'[]') AS comprobantes FROM fin_pagos p LEFT JOIN fin_facturas f ON f.id=p.factura_id ORDER BY p.fecha DESC, p.id DESC`));
  app.post('/api/fin/pagos', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q(`INSERT INTO fin_pagos (tercero,factura_id,fecha,monto,moneda,medio,categoria,referencia,notas) VALUES ($1,$2,COALESCE($3,CURRENT_DATE),$4,COALESCE($5,'UYU'),$6,$7,$8,$9) RETURNING *`,
      [b.tercero || null, b.factura_id || null, b.fecha || null, b.monto || null, b.moneda, b.medio || null, b.categoria || null, b.referencia || null, b.notas || null]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/fin/pagos/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q(`UPDATE fin_pagos SET tercero=$1,factura_id=$2,fecha=$3,monto=$4,moneda=COALESCE($5,moneda),medio=$6,categoria=$7,referencia=$8,notas=$9 WHERE id=$10 RETURNING *`,
      [b.tercero || null, b.factura_id || null, b.fecha || null, b.monto || null, b.moneda, b.medio || null, b.categoria || null, b.referencia || null, b.notas || null, req.params.id]);
    res.json(r.rows[0] || {});
  }));
  app.delete('/api/fin/pagos/:id', authMiddleware, adminOnly, wrap(async (req, res) => { await q('DELETE FROM fin_pagos WHERE id=$1', [req.params.id]); res.json({ ok: true }); }));

  // Resumen
  // Comprobantes de pagos/cobros (imagenes)
  app.get('/api/fin/:tipo/:id/comprobantes', authMiddleware, adminOnly, wrap(async (req, res) => {
    if (!['pagos', 'cobros'].includes(req.params.tipo)) return res.status(400).json({ error: 'Tipo invalido' });
    res.json((await q("SELECT id, path FROM fin_comprobantes WHERE tipo=$1 AND ref_id=$2 ORDER BY id", [req.params.tipo, req.params.id])).rows);
  }));
  app.post('/api/fin/:tipo/:id/comprobantes', authMiddleware, adminOnly, upX.array('files', 8), wrap(async (req, res) => {
    if (!['pagos', 'cobros'].includes(req.params.tipo)) return res.status(400).json({ error: 'Tipo invalido' });
    const out = [];
    for (const f of req.files || []) {
      const r = await q("INSERT INTO fin_comprobantes (tipo, ref_id, path) VALUES ($1,$2,$3) RETURNING id, path", [req.params.tipo, req.params.id, '/uploads/' + path.basename(f.path)]);
      out.push(r.rows[0]);
    }
    res.status(201).json(out);
  }));
  app.delete('/api/fin/comprobantes/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    await q("DELETE FROM fin_comprobantes WHERE id=$1", [req.params.id]); res.json({ ok: true });
  }));

  app.get('/api/fin/resumen', authMiddleware, adminOnly, wrap(async (req, res) => {
    const cob = (await q("SELECT COALESCE(sum(monto),0) AS t FROM fin_cobros")).rows[0].t;
    const pag = (await q("SELECT COALESCE(sum(monto),0) AS t FROM fin_pagos")).rows[0].t;
    const pend = (await q("SELECT COALESCE(sum(monto),0) AS t FROM fin_facturas WHERE tipo='emitida' AND estado='pendiente'")).rows[0].t;
    res.json({ cobros: Number(cob), pagos: Number(pag), balance: Number(cob) - Number(pag), por_cobrar: Number(pend) });
  }));

  // ---- Branding (logos, PWA, colores, reportes) ----
  const BRAND_DEF = {
    app_nombre: 'Preventis', empresa: 'IES',
    color_primario: '#2563eb', color_secundario: '#1e40af', theme_color: '#1d4ed8',
    logo_path: '', icon_path: '', pdf_logo_path: '',
    pdf_empresa: 'IES', pdf_pie: 'IES \u00b7 Mantenimiento preventivo', pdf_doc_pie: 'Preventis',
  };
  async function getBranding() {
    const r = (await q("SELECT valor FROM app_config WHERE clave='branding'")).rows[0];
    return { ...BRAND_DEF, ...(r?.valor || {}) };
  }
  app.get('/api/branding', wrap(async (req, res) => { res.json(await getBranding()); }));
  app.put('/api/branding', authMiddleware, adminOnly, wrap(async (req, res) => {
    const cur = await getBranding();
    const next = { ...cur, ...(req.body || {}) };
    await q("INSERT INTO app_config (clave,valor) VALUES ('branding',$1) ON CONFLICT (clave) DO UPDATE SET valor=$1", [JSON.stringify(next)]);
    res.json(next);
  }));
  app.post('/api/branding/logo', authMiddleware, adminOnly, upX.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
    const campo = req.body?.campo || 'logo_path';
    if (!['logo_path', 'icon_path', 'pdf_logo_path'].includes(campo)) return res.status(400).json({ error: 'Campo invalido' });
    const cur = await getBranding();
    const next = { ...cur, [campo]: '/uploads/' + path.basename(req.file.path) };
    await q("INSERT INTO app_config (clave,valor) VALUES ('branding',$1) ON CONFLICT (clave) DO UPDATE SET valor=$1", [JSON.stringify(next)]);
    res.json(next);
  }));
  app.get('/api/manifest.webmanifest', wrap(async (req, res) => {
    const b = await getBranding();
    const icon = b.icon_path || '/icon-192.png';
    res.setHeader('Content-Type', 'application/manifest+json');
    res.json({
      name: b.app_nombre || 'Preventis', short_name: b.app_nombre || 'Preventis',
      start_url: '/', display: 'standalone', background_color: '#ffffff', theme_color: b.theme_color || '#1d4ed8',
      icons: [
        { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    });
  }));

  // ---- Chatbot (openwa) ----
  app.get('/api/chatbot/config', authMiddleware, adminOnly, wrap(async (req, res) => {
    const r = (await q("SELECT valor FROM app_config WHERE clave='chatbot'")).rows[0];
    res.json(r?.valor || { url: '', api_key: '', session: '', numero_prueba: '', notificar: false });
  }));
  app.put('/api/chatbot/config', authMiddleware, adminOnly, wrap(async (req, res) => {
    await q("INSERT INTO app_config (clave,valor) VALUES ('chatbot',$1) ON CONFLICT (clave) DO UPDATE SET valor=$1", [JSON.stringify(req.body || {})]);
    res.json({ ok: true });
  }));
  app.post('/api/chatbot/test', authMiddleware, adminOnly, wrap(async (req, res) => {
    const cfg = ((await q("SELECT valor FROM app_config WHERE clave='chatbot'")).rows[0] || {}).valor || {};
    if (!cfg.url) return res.status(400).json({ error: 'Configura la URL de openwa primero' });
    const to = (req.body?.numero || cfg.numero_prueba || '').replace(/[^0-9]/g, '');
    if (!to) return res.status(400).json({ error: 'Falta numero de prueba' });
    const msg = req.body?.mensaje || 'Mensaje de prueba desde Preventis';
    const base = cfg.url.replace(/\/+$/, '');
    const ses = cfg.session || 'default';
    const tipos = cfg.api_tipo && cfg.api_tipo !== 'auto' ? [cfg.api_tipo] : ['openwa', 'wa-automate', 'wppconnect', 'evolution'];
    const intentos = [];
    for (const t of tipos) {
      let url, body, headers = { 'Content-Type': 'application/json' };
      if (t === 'openwa') {
        let sid = ses;
        if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(sid)) {
          try {
            const rs = await fetch(base + '/api/sessions', { headers: { 'X-API-Key': cfg.api_key || '' } });
            const lj = await rs.json().catch(() => null);
            const list = Array.isArray(lj) ? lj : (lj && (lj.data || lj.sessions)) || [];
            const found = list.find(x => x.id === sid || x.name === sid || x.sessionName === sid || x.sessionId === sid);
            if (found) sid = found.id || found.sessionId || sid;
          } catch {}
        }
        url = base + '/api/sessions/' + sid + '/messages/send-text';
        body = { chatId: to + '@c.us', text: msg };
        if (cfg.api_key) headers['X-API-Key'] = cfg.api_key;
      }
      else if (t === 'wa-automate') { url = base + '/sendText'; body = { args: { to: to + '@c.us', content: msg } }; if (cfg.api_key) headers.api_key = cfg.api_key; }
      else if (t === 'wppconnect') { url = base + '/api/' + ses + '/send-message'; body = { phone: to, message: msg }; if (cfg.api_key) headers.Authorization = 'Bearer ' + cfg.api_key; }
      else { url = base + '/message/sendText/' + ses; body = { number: to, text: msg }; if (cfg.api_key) headers.apikey = cfg.api_key; }
      try {
        const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        intentos.push({ tipo: t, url, status: r.status });
        if (r.ok) {
          await q("INSERT INTO app_config (clave,valor) VALUES ('chatbot',$1) ON CONFLICT (clave) DO UPDATE SET valor=$1", [JSON.stringify({ ...cfg, api_tipo: t })]);
          return res.json({ ok: true, tipo: t, respuesta: j });
        }
      } catch (e) { intentos.push({ tipo: t, url, error: e.message }); }
    }
    res.status(502).json({ error: 'Ningun formato de API respondio OK. Revisa URL/puerto y tipo de API.', intentos });
  }));

  // ---- Chatbot: envio generico + alertas + webhook de comandos ----
  const chatbotCfg = async () => ((await q("SELECT valor FROM app_config WHERE clave='chatbot'")).rows[0] || {}).valor || {};
  async function waSend(texto, to) {
    try {
      const cfg = await chatbotCfg(); if (!cfg.url) return false;
      const dest = (to || cfg.numero_alertas || cfg.numero_prueba || '').toString();
      const chatId = dest.includes('@') ? dest : dest.replace(/[^0-9]/g, '') + '@c.us';
      if (!chatId || chatId === '@c.us') return false;
      let sid = cfg.session || 'default';
      const base = cfg.url.replace(/\/+$/, '');
      if (!/^[0-9a-f]{8}-/i.test(sid)) {
        try { const rs = await fetch(base + '/api/sessions', { headers: { 'X-API-Key': cfg.api_key || '' } }); const lj = await rs.json().catch(() => null); const list = Array.isArray(lj) ? lj : (lj && (lj.data || lj.sessions)) || []; const f2 = list.find(x => x.id === sid || x.name === sid); if (f2) sid = f2.id; } catch {}
      }
      const r = await fetch(base + '/api/sessions/' + sid + '/messages/send-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.api_key || '' },
        body: JSON.stringify({ chatId, text: texto }),
      });
      q("INSERT INTO auditoria (usuario,rol,metodo,ruta,status,detalle) VALUES ('chatbot','whatsapp','OUT','/chatbot/enviado',$1,$2)", [r.status, (chatId + ' :: ' + texto).slice(0, 480)]).catch(() => {});
      return r.ok;
    } catch (e) {
      q("INSERT INTO auditoria (usuario,rol,metodo,ruta,status,detalle) VALUES ('chatbot','whatsapp','OUT','/chatbot/error',502,$1)", [String(e.message).slice(0, 480)]).catch(() => {});
      return false;
    }
  }
  // alertas del sistema -> whatsapp (si esta activado)
  setWaSender(async (evt) => { try { const cfg = await chatbotCfg(); if (cfg.notificar && evt?.text) waSend('\u{1F514} Preventis: ' + evt.text); } catch {} });

  async function agendaTexto(tecnicoId) {
    const cond = tecnicoId ? ' AND v.tecnico_id=' + Number(tecnicoId) : '';
    const rows = (await q(`SELECT v.fecha, v.hora, c.nombre AS cliente, t.nombre AS tecnico FROM visitas v JOIN clientes c ON c.id=v.cliente_id LEFT JOIN tecnicos t ON t.id=v.tecnico_id WHERE v.estado IN ('programada','en_curso') AND v.fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + 6 ${cond} ORDER BY v.fecha, COALESCE(v.orden,999)`)).rows;
    if (!rows.length) return 'Sin visitas esta semana \u2705';
    return '\u{1F4C5} *Agenda de la semana*\n' + rows.map(r => '\u2022 ' + new Date(r.fecha).toLocaleDateString('es-UY') + (r.hora ? ' ' + String(r.hora).slice(0, 5) : '') + ' - ' + r.cliente + (r.tecnico ? ' (' + r.tecnico + ')' : '')).join('\n');
  }
  app.post('/api/chatbot/agenda-semana', authMiddleware, wrap(async (req, res) => {
    const ok = await waSend(await agendaTexto(req.body?.tecnico_id), req.body?.numero);
    res.json({ ok });
  }));
  // ---- Contratos (montos solo admin) ----
  const contratoRow = (r, esAdmin) => esAdmin ? r : (({ monto, moneda, forma_pago, ...rest }) => rest)(r);
  const PREV_X_ANIO = { mensual: 12, bimestral: 6, trimestral: 4, semestral: 2, anual: 1 };
  const CUMPLIMIENTO = `
    (SELECT count(*) FROM visitas v WHERE v.contrato_id=k.id AND v.tipo='preventiva' AND v.fecha >= CURRENT_DATE - 365) AS prev_realizados,
    (SELECT count(*) FROM visitas v WHERE v.contrato_id=k.id AND v.tipo='correctiva' AND v.fecha >= CURRENT_DATE - 365) AS corr_realizados`;
  const conCumpl = (x) => ({ ...x, prev_contratados: PREV_X_ANIO[x.frecuencia_preventivo] || 0, corr_contratados: x.correctivos_anuales || 0 });
  app.get('/api/contratos', wrap(async (req, res) => {
    const esAdmin = req.user?.rol === 'admin';
    const r = await q(`SELECT k.*, c.nombre AS cliente, ${CUMPLIMIENTO} FROM contratos k JOIN clientes c ON c.id=k.cliente_id ORDER BY (k.estado='activo') DESC, c.nombre, k.fecha_fin NULLS LAST`);
    res.json(r.rows.map(x => contratoRow(conCumpl(x), esAdmin)));
  }));
  app.get('/api/clientes/:id/contratos', wrap(async (req, res) => {
    const esAdmin = req.user?.rol === 'admin';
    const r = await q(`SELECT k.*, ${CUMPLIMIENTO} FROM contratos k WHERE k.cliente_id=$1 ORDER BY (k.estado='activo') DESC, k.fecha_fin NULLS LAST`, [req.params.id]);
    res.json(r.rows.map(x => contratoRow(conCumpl(x), esAdmin)));
  }));
  app.post('/api/contratos', adminOnly, wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.cliente_id || !b.titulo) return res.status(400).json({ error: 'Cliente y titulo son requeridos' });
    const r = await q(`INSERT INTO contratos (cliente_id,titulo,descripcion,fecha_inicio,fecha_fin,deberes,responsabilidades,monto,moneda,forma_pago,estado,frecuencia_preventivo,recurrencia_preventivo,correctivos_anuales)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,'UYU'),$10,COALESCE($11,'activo'),$12,$13,$14) RETURNING *`,
      [b.cliente_id, b.titulo, b.descripcion || null, b.fecha_inicio || null, b.fecha_fin || null, b.deberes || null, b.responsabilidades || null, b.monto || null, b.moneda, b.forma_pago || null, b.estado, b.frecuencia_preventivo || null, b.recurrencia_preventivo || null, b.correctivos_anuales || null]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/contratos/:id', adminOnly, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q(`UPDATE contratos SET titulo=COALESCE($1,titulo), descripcion=$2, fecha_inicio=$3, fecha_fin=$4, deberes=$5, responsabilidades=$6,
      monto=$7, moneda=COALESCE($8,moneda), forma_pago=$9, estado=COALESCE($10,estado), cliente_id=COALESCE($11,cliente_id),
      frecuencia_preventivo=$13, recurrencia_preventivo=$14, correctivos_anuales=$15 WHERE id=$12 RETURNING *`,
      [b.titulo, b.descripcion || null, b.fecha_inicio || null, b.fecha_fin || null, b.deberes || null, b.responsabilidades || null, b.monto || null, b.moneda, b.forma_pago || null, b.estado, b.cliente_id, req.params.id, b.frecuencia_preventivo || null, b.recurrencia_preventivo || null, b.correctivos_anuales || null]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Contrato no encontrado' });
    res.json(r.rows[0]);
  }));
  app.delete('/api/contratos/:id', adminOnly, wrap(async (req, res) => {
    await q('DELETE FROM contratos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  }));

  // ---- Mensaje directo a un tecnico (notificacion en su PWA) ----
  app.post('/api/tecnicos/mensaje', wrap(async (req, res) => {
    const { usuario, texto } = req.body || {};
    if (!usuario || !texto) return res.status(400).json({ error: 'Usuario y texto requeridos' });
    const de = req.user?.nombre || req.user?.username || 'Sistema';
    notify({ type: 'mensaje', icon: 'mail', text: '\u{1F4AC} ' + de + ': ' + String(texto).slice(0, 300), para: usuario });
    q("INSERT INTO auditoria (usuario,rol,metodo,ruta,status,detalle) VALUES ($1,$2,'OUT','/tecnicos/mensaje',200,$3)", [req.user?.username || '?', req.user?.rol || '?', (usuario + ' :: ' + texto).slice(0, 480)]).catch(() => {});
    res.json({ ok: true });
  }));

  // ---- URL de suscripcion al calendario (Google/Apple) ----
  app.get('/api/agenda/feed', wrap(async (req, res) => {
    const SECRET = process.env.JWT_SECRET || 'preventis-dev-secret-change-me';
    const t = jwt.sign({ id: req.user.id, username: req.user.username, rol: req.user.rol, feed: true }, SECRET, { expiresIn: '1825d' });
    const base = (req.headers['x-forwarded-proto'] ? req.headers['x-forwarded-proto'] + '://' + req.headers['x-forwarded-host'] : 'https://' + (req.headers.host || ''));
    const url = base.replace(/\/$/, '') + '/api/agenda.ics?token=' + t + (req.query.tecnico_id ? '&tecnico_id=' + Number(req.query.tecnico_id) : '');
    res.json({ url, webcal: url.replace(/^https?/, 'webcal') });
  }));

  app.get('/api/agenda.ics', wrap(async (req, res) => {
    const cond = req.query.tecnico_id ? ' AND v.tecnico_id=' + Number(req.query.tecnico_id) : '';
    const rows = (await q(`SELECT v.id, v.fecha, v.tipo, c.nombre AS cliente, t.nombre AS tecnico FROM visitas v JOIN clientes c ON c.id=v.cliente_id LEFT JOIN tecnicos t ON t.id=v.tecnico_id WHERE v.estado IN ('programada','en_curso') AND v.fecha >= CURRENT_DATE - 7 ${cond} ORDER BY v.fecha`)).rows;
    const dt = d => new Date(d).toISOString().slice(0, 10).replace(/-/g, '');
    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Preventis//ES\r\n';
    for (const r of rows) ics += 'BEGIN:VEVENT\r\nUID:visita-' + r.id + '@preventis\r\nDTSTART;VALUE=DATE:' + dt(r.fecha) + '\r\nSUMMARY:' + (r.tipo === 'correctiva' ? '[Correctiva] ' : '') + 'Visita ' + r.cliente + (r.tecnico ? ' (' + r.tecnico + ')' : '') + '\r\nEND:VEVENT\r\n';
    ics += 'END:VCALENDAR\r\n';
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="agenda_preventis.ics"');
    res.send(ics);
  }));

  // webhook de recepcion (configurar en el panel OpenWA -> Webhooks, evento message.received)
  const _wb = { win: 0, n: 0 };
  app.post('/api/chatbot/webhook', wrap(async (req, res) => {
    // Autenticacion opcional por secreto compartido (?key= o header X-Webhook-Token). Si no hay env, no se exige.
    const WBK = process.env.CHATBOT_WEBHOOK_SECRET;
    if (WBK && (req.query.key || req.get('x-webhook-token') || '') !== WBK) return res.status(401).json({ error: 'unauthorized' });
    // Rate limit liviano anti-DoS: 150 req/min
    const _now = Date.now();
    if (_now - _wb.win > 60000) { _wb.win = _now; _wb.n = 0; }
    if (++_wb.n > 150) return res.status(429).json({ error: 'rate' });
    const body = req.body || {};
    const { evt, from, texto, fromMe, isGroup } = parseInbound(body);
    // Loguear SIEMPRE lo que llega (asi se ve en el panel aunque no se pueda procesar)
    const detalle = (from || texto) ? (from + ' :: ' + texto) : ('RAW ' + JSON.stringify(body));
    q("INSERT INTO auditoria (usuario,rol,metodo,ruta,status,detalle) VALUES ('chatbot','whatsapp','IN','/chatbot/recibido',200,$1)", [detalle.slice(0, 470)]).catch(() => {});
    if (evt && !/message|msg|upsert|received|text/i.test(evt)) return res.json({ status: 'ignored', reason: evt });
    if (!from || !texto || fromMe) return res.json({ status: 'ignored', parsed: { from: !!from, texto: !!texto, fromMe } });
    const { resp } = await handleIncoming(q, { from, texto, isGroup });
    if (resp) await waSend(resp, from);
    res.json({ ok: true, respondido: !!resp });
  }));

  // ---- Lista liviana de usuarios (para selector "Asignada por") ----
  app.get('/api/usuarios/lista', authMiddleware, wrap(async (req, res) => {
    res.json((await q('SELECT id, username, nombre, avatar_path FROM usuarios WHERE activo ORDER BY nombre, username')).rows);
  }));

  // ---- Perfil propio (avatar + permisos del rol) ----
  app.get('/api/perfil', authMiddleware, wrap(async (req, res) => {
    const u = (await q('SELECT id, username, nombre, rol, avatar_path FROM usuarios WHERE id=$1', [req.user.id])).rows[0] || { id: req.user.id, username: req.user.username, nombre: req.user.nombre, rol: req.user.rol };
    const p = (await q('SELECT permisos FROM rol_permisos WHERE rol=$1', [u.rol])).rows[0];
    res.json({ ...u, permisos: p?.permisos || {} });
  }));

  // ---- Avatares (usuarios y tecnicos) ----
  app.post('/api/usuarios/:id/avatar', authMiddleware, upX.single('file'), wrap(async (req, res) => {
    if (req.user.rol !== 'admin' && String(req.user.id) !== String(req.params.id)) return res.status(403).json({ error: 'No autorizado' });
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
    const p2 = '/uploads/' + path.basename(req.file.path);
    await q('UPDATE usuarios SET avatar_path=$1 WHERE id=$2', [p2, req.params.id]);
    res.json({ avatar_path: p2 });
  }));
  app.post('/api/tecnicos/:id/avatar', authMiddleware, upX.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
    const p2 = '/uploads/' + path.basename(req.file.path);
    await q('UPDATE tecnicos SET avatar_path=$1 WHERE id=$2', [p2, req.params.id]);
    res.json({ avatar_path: p2 });
  }));
  app.post('/api/clientes/:id/avatar', authMiddleware, upX.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
    const p2 = '/uploads/' + path.basename(req.file.path);
    await q('UPDATE clientes SET avatar_path=$1 WHERE id=$2', [p2, req.params.id]);
    res.json({ avatar_path: p2 });
  }));

  app.get('/api/equipos/:id/historial', wrap(async (req, res) => {
    const r = await q(`
      SELECT p.id, p.fecha, p.comentarios, p.origen, p.visita_id, p.lat, p.lon,
             est.nombre AS estado, est.es_falla, t.nombre AS tecnico, v.fecha AS fecha_visita,
             COALESCE((SELECT json_agg(pf.path) FROM prueba_fotos pf WHERE pf.prueba_id=p.id), '[]') AS fotos
      FROM pruebas p
      LEFT JOIN estados_equipo est ON est.id=p.estado_id
      LEFT JOIN visitas v ON v.id=p.visita_id LEFT JOIN tecnicos t ON t.id=v.tecnico_id
      WHERE p.equipo_id=$1 ORDER BY p.fecha DESC, p.id DESC`, [req.params.id]);
    res.json(r.rows);
  }));

  app.get('/api/pruebas', wrap(async (req, res) => {
    const { where, params } = pruebasFilter(req.query);
    const r = await q(PRUEBAS_SQL(where) + ' LIMIT 1000', params);
    res.json(r.rows);
  }));

  app.get('/api/pruebas/export.xlsx', wrap(async (req, res) => {
    const { where, params } = pruebasFilter(req.query);
    const rows = (await q(PRUEBAS_SQL(where), params)).rows;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Pruebas');
    ws.columns = [
      { header: 'Cliente', key: 'cliente', width: 22 }, { header: 'Fecha visita', key: 'fecha_visita', width: 13 },
      { header: 'Tecnico', key: 'tecnico', width: 18 }, { header: 'Codigo QR', key: 'codigo_qr', width: 12 },
      { header: 'Etiqueta', key: 'etiqueta', width: 14 }, { header: 'Sistema', key: 'sistema', width: 18 },
      { header: 'Direccion', key: 'direccion', width: 16 }, { header: 'Grupo', key: 'grupo', width: 12 },
      { header: 'Subgrupo', key: 'subgrupo', width: 12 }, { header: 'Tipo elemento', key: 'tipo_elemento', width: 16 },
      { header: 'Modelo', key: 'modelo', width: 14 }, { header: 'Estado', key: 'estado', width: 16 },
      { header: 'Comentarios', key: 'comentarios', width: 30 }, { header: 'Fecha prueba', key: 'fecha', width: 13 },
      { header: 'Origen', key: 'origen', width: 10 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    rows.forEach(r => ws.addRow(r));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_pruebas.xlsx"');
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  }));

  // ---- Flujo de visita (con GPS de entrada/salida) ----
  app.post('/api/visitas/:id/iniciar', wrap(async (req, res) => {
    const { lat, lon } = req.body || {};
    const r = await q("UPDATE visitas SET estado='en_curso', hora_entrada=COALESCE(hora_entrada, now()), entrada_lat=COALESCE($2,entrada_lat), entrada_lon=COALESCE($3,entrada_lon), cerrada=false WHERE id=$1 RETURNING *", [req.params.id, lat ?? null, lon ?? null]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrada' });
    try {
      const c = (await q('SELECT nombre, lat, lon FROM clientes WHERE id=$1', [r.rows[0].cliente_id])).rows[0];
      notify({ type: 'inicio', icon: 'arrowRight', text: 'Visita iniciada: ' + (c?.nombre || ''), url: '/visitas/' + r.rows[0].id });
      const la = (req.body || {}).lat, lo = (req.body || {}).lon;
      if (c?.lat != null && la != null) {
        const d = hav(Number(la), Number(lo), Number(c.lat), Number(c.lon));
        if (d > 500) notify({ type: 'geocerca', icon: 'pin', text: 'Atencion: visita iniciada a ' + Math.round(d) + ' m del cliente ' + c.nombre, url: '/visitas/' + r.rows[0].id });
      }
    } catch {}
    res.json(r.rows[0]);
  }));

  app.get('/api/visitas/:id/checklist', wrap(async (req, res) => {
    const v = (await q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (!v) return res.status(404).json({ error: 'No encontrada' });
    const pend = (await q("SELECT count(*)::int c FROM equipos e WHERE e.cliente_id=$1 AND e.activo AND NOT EXISTS (SELECT 1 FROM pruebas p WHERE p.visita_id=$2 AND p.equipo_id=e.id)", [v.cliente_id, req.params.id])).rows[0].c;
    const tot = (await q('SELECT count(*)::int c FROM equipos WHERE cliente_id=$1 AND activo', [v.cliente_id])).rows[0].c;
    const fotos = (await q("SELECT (EXISTS(SELECT 1 FROM visita_archivos WHERE visita_id=$1 AND tipo='foto') OR EXISTS(SELECT 1 FROM prueba_fotos pf JOIN pruebas p ON p.id=pf.prueba_id WHERE p.visita_id=$1)) AS hay", [req.params.id])).rows[0].hay;
    res.json({ tecnico: !!v.tecnico_id, situacion_final: !!(v.situacion_final && String(v.situacion_final).trim()), firma: !!v.firma_path, fotos: !!fotos, pendientes: pend, total: tot, estado: v.estado, hora_entrada: v.hora_entrada, hora_salida: v.hora_salida });
  }));

  app.post('/api/visitas/:id/cerrar', wrap(async (req, res) => {
    const v = (await q('SELECT * FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    if (!v) return res.status(404).json({ error: 'No encontrada' });
    const { lat, lon, requireEquipos, facturar } = req.body || {};
    const faltan = [];
    if (!v.tecnico_id) faltan.push('Asignar tecnico');
    if (!v.situacion_final || !String(v.situacion_final).trim()) faltan.push('Completar situacion final');
    if (!v.firma_path) faltan.push('Firma del cliente');
    const hayFoto = (await q("SELECT (EXISTS(SELECT 1 FROM visita_archivos WHERE visita_id=$1 AND tipo='foto') OR EXISTS(SELECT 1 FROM prueba_fotos pf JOIN pruebas p ON p.id=pf.prueba_id WHERE p.visita_id=$1)) AS hay", [req.params.id])).rows[0].hay;
    if (!hayFoto) faltan.push('Adjuntar al menos una foto');
    const pend = (await q("SELECT count(*)::int c FROM equipos e WHERE e.cliente_id=$1 AND e.activo AND NOT EXISTS (SELECT 1 FROM pruebas p WHERE p.visita_id=$2 AND p.equipo_id=e.id)", [v.cliente_id, req.params.id])).rows[0].c;
    if (requireEquipos && pend > 0) faltan.push(pend + ' equipo(s) sin probar');
    if (faltan.length) return res.status(400).json({ error: 'Faltan requisitos para cerrar', faltan, pendientes: pend });
    const r = await q("UPDATE visitas SET estado='cerrada', cerrada=true, hora_salida=COALESCE(hora_salida, now()), salida_lat=COALESCE($2,salida_lat), salida_lon=COALESCE($3,salida_lon), facturar=COALESCE($4,facturar) WHERE id=$1 RETURNING *", [req.params.id, lat ?? null, lon ?? null, facturar ?? null]);
    try { const c = await q('SELECT nombre FROM clientes WHERE id=$1', [v.cliente_id]); notify({ type: 'cierre', icon: 'checkCircle', text: 'Visita cerrada: ' + (c.rows[0]?.nombre || ''), url: '/visitas/' + req.params.id }); dispatchAlerta(q, 'visita_cerrada', { titulo: 'Visita cerrada · ' + (c.rows[0]?.nombre || ''), texto: 'El informe está disponible.', url: '/visitas/' + req.params.id, clienteId: v.cliente_id, tecnicoId: v.tecnico_id }).catch(() => {}); } catch {}
    res.json(r.rows[0]);
  }));

  // ---------------- Jornadas (visitas de varios dias) ----------------
  const listarJornadas = (id) => q('SELECT j.*, t.nombre AS tecnico FROM visita_jornadas j LEFT JOIN tecnicos t ON t.id=j.tecnico_id WHERE j.visita_id=$1 ORDER BY j.orden, j.fecha, j.id', [id]).then(r => r.rows);

  app.get('/api/visitas/:id/jornadas', wrap(async (req, res) => {
    res.json(await listarJornadas(req.params.id));
  }));

  app.post('/api/visitas/:id/jornadas/:jid/iniciar', wrap(async (req, res) => {
    const { lat, lon } = req.body || {};
    const j = (await q("UPDATE visita_jornadas SET estado='en_curso', hora_inicio=COALESCE(hora_inicio, now()) WHERE id=$1 AND visita_id=$2 RETURNING *", [req.params.jid, req.params.id])).rows[0];
    if (!j) return res.status(404).json({ error: 'Jornada no encontrada' });
    await q("UPDATE visitas SET estado='en_curso', hora_entrada=COALESCE(hora_entrada, now()), entrada_lat=COALESCE($2,entrada_lat), entrada_lon=COALESCE($3,entrada_lon), cerrada=false WHERE id=$1", [req.params.id, lat ?? null, lon ?? null]);
    res.json(j);
  }));

  app.post('/api/visitas/:id/jornadas/:jid/pausar', wrap(async (req, res) => {
    // Cierra la jornada del dia (continua otro dia); la visita sigue abierta
    const j = (await q("UPDATE visita_jornadas SET estado='completada', hora_fin=COALESCE(hora_fin, now()), nota=COALESCE($3,nota) WHERE id=$1 AND visita_id=$2 RETURNING *", [req.params.jid, req.params.id, (req.body || {}).nota ?? null])).rows[0];
    if (!j) return res.status(404).json({ error: 'Jornada no encontrada' });
    res.json(j);
  }));

  app.put('/api/visitas/:id/jornadas/:jid', wrap(async (req, res) => {
    const b = req.body || {};
    const j = (await q("UPDATE visita_jornadas SET tecnico_id=$3, nota=COALESCE($4,nota), fecha=COALESCE($5,fecha), estado=COALESCE($6,estado) WHERE id=$1 AND visita_id=$2 RETURNING *", [req.params.jid, req.params.id, b.tecnico_id === 0 ? null : (b.tecnico_id ?? null), b.nota ?? null, b.fecha ?? null, b.estado ?? null])).rows[0];
    if (!j) return res.status(404).json({ error: 'Jornada no encontrada' });
    await recomputeRango(req.params.id);
    res.json(j);
  }));

  app.post('/api/visitas/:id/jornadas', wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.fecha) return res.status(400).json({ error: 'Falta la fecha' });
    const ord = (await q('SELECT COALESCE(max(orden),0)+1 AS o FROM visita_jornadas WHERE visita_id=$1', [req.params.id])).rows[0].o;
    const j = (await q("INSERT INTO visita_jornadas (visita_id,fecha,orden,tecnico_id,estado) VALUES ($1,$2,$3,$4,'planificada') RETURNING *", [req.params.id, String(b.fecha).slice(0, 10), ord, b.tecnico_id || null])).rows[0];
    await recomputeRango(req.params.id);
    res.status(201).json(j);
  }));

  app.delete('/api/visitas/:id/jornadas/:jid', wrap(async (req, res) => {
    await q('DELETE FROM visita_jornadas WHERE id=$1 AND visita_id=$2', [req.params.jid, req.params.id]);
    await recomputeRango(req.params.id);
    res.json({ ok: true });
  }));

  // Cancelar una sola jornada (dia) sin tocar el resto de la visita
  app.post('/api/visitas/:id/jornadas/:jid/cancelar', wrap(async (req, res) => {
    const motivo = ((req.body || {}).motivo || '').trim();
    const j = (await q("UPDATE visita_jornadas SET estado='cancelada', nota=COALESCE(NULLIF($3,''), nota) WHERE id=$1 AND visita_id=$2 RETURNING *", [req.params.jid, req.params.id, motivo ? ('Cancelada: ' + motivo) : ''])).rows[0];
    if (!j) return res.status(404).json({ error: 'Jornada no encontrada' });
    await recomputeRango(req.params.id);
    res.json(j);
  }));

  // Recalcula fecha/fecha_fin/multidia de la visita a partir de sus jornadas NO canceladas
  async function recomputeRango(id) {
    const r = (await q("SELECT min(fecha) AS ini, max(fecha) AS fin, count(*)::int AS n FROM visita_jornadas WHERE visita_id=$1 AND estado <> 'cancelada'", [id])).rows[0];
    if (r && r.n > 0) await q('UPDATE visitas SET fecha=$2, fecha_fin=$3, multidia=$4 WHERE id=$1', [id, r.ini, r.fin, r.n > 1]);
  }

  app.post('/api/visitas/orden', authMiddleware, wrap(async (req, res) => {
    const ids = (req.body || {}).ids || [];
    for (let i = 0; i < ids.length; i++) await q('UPDATE visitas SET orden=$1 WHERE id=$2', [i, ids[i]]);
    res.json({ ok: true });
  }));
  app.delete('/api/visitas/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    const id = req.params.id;
    await q('DELETE FROM prueba_fotos WHERE prueba_id IN (SELECT id FROM pruebas WHERE visita_id=$1)', [id]);
    await q('DELETE FROM pruebas WHERE visita_id=$1', [id]);
    await q('DELETE FROM visita_archivos WHERE visita_id=$1', [id]);
    await q('DELETE FROM visita_tareas WHERE visita_id=$1', [id]);
    await q('DELETE FROM visitas WHERE id=$1', [id]);
    res.json({ ok: true });
  }));

  app.post('/api/visitas/:id/cancelar', authMiddleware, adminOnly, wrap(async (req, res) => {
    const motivo = (req.body?.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'El motivo de cancelacion es obligatorio' });
    const quien = req.user?.nombre || req.user?.username || 'admin';
    const r = await q("UPDATE visitas SET estado='cancelada', cerrada=false, cancelada_motivo=$1, cancelada_por=$2, cancelada_at=now() WHERE id=$3 RETURNING *",
      [motivo.slice(0, 500), quien, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrada' });
    q("INSERT INTO auditoria (usuario,rol,metodo,ruta,status,detalle) VALUES ($1,$2,'CANCEL','/visitas/' || $3 || '/cancelar',200,$4)",
      [req.user?.username || '?', req.user?.rol || '?', req.params.id, ('Visita cancelada: ' + motivo).slice(0, 480)]).catch(() => {});
    try { const c = await q('SELECT nombre FROM clientes WHERE id=$1', [r.rows[0].cliente_id]); notify({ type: 'visita', icon: 'x', text: 'Visita cancelada: ' + (c.rows[0]?.nombre || '') + ' - ' + motivo, url: '/visitas/' + req.params.id }); } catch {}
    res.json(r.rows[0]);
  }));

  app.post('/api/visitas/:id/reabrir', wrap(async (req, res) => {
    const cur = (await q('SELECT estado FROM visitas WHERE id=$1', [req.params.id])).rows[0];
    const nuevoEstado = cur?.estado === 'cancelada' ? 'programada' : 'en_curso';
    const r = await q("UPDATE visitas SET estado=$2, cerrada=false, hora_salida=NULL, cancelada_motivo=NULL, cancelada_por=NULL, cancelada_at=NULL WHERE id=$1 RETURNING *", [req.params.id, nuevoEstado]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json(r.rows[0]);
  }));

  // ---- Ubicacion del cliente ----
  app.put('/api/clientes/:id/ubicacion', wrap(async (req, res) => {
    const { lat, lon } = req.body || {};
    const r = await q('UPDATE clientes SET lat=$1, lon=$2 WHERE id=$3 RETURNING id, lat, lon', [lat ?? null, lon ?? null, req.params.id]);
    res.json(r.rows[0] || {});
  }));

  // ---- Tracking GPS: ping de posicion del usuario ----
  app.post('/api/posiciones', wrap(async (req, res) => {
    const { lat, lon, accuracy } = req.body || {};
    if (lat == null || lon == null) return res.status(400).json({ error: 'lat/lon requeridos' });
    await q('INSERT INTO posiciones (usuario,nombre,rol,lat,lon,accuracy) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user?.username || null, req.user?.nombre || req.user?.username || null, req.user?.rol || null, lat, lon, accuracy ?? null]);
    res.json({ ok: true });
  }));

  app.get('/api/posiciones/usuarios', wrap(async (req, res) => {
    res.json((await q("SELECT DISTINCT usuario, COALESCE(nombre,usuario) AS nombre FROM posiciones WHERE ts::date=CURRENT_DATE ORDER BY 2")).rows);
  }));
  app.get('/api/posiciones/historial', wrap(async (req, res) => {
    if (!req.query.usuario) return res.json([]);
    res.json((await q("SELECT lat, lon, ts FROM posiciones WHERE usuario=$1 AND ts::date=COALESCE($2::date, CURRENT_DATE) ORDER BY ts", [req.query.usuario, req.query.fecha || null])).rows);
  }));

  // ---- Mapa: tecnicos en calle (ultima posicion) + clientes geolocalizados ----
  app.get('/api/mapa', wrap(async (req, res) => {
    const tecnicos = (await q(`
      WITH pts AS (
        SELECT v.tecnico_id, v.entrada_lat AS lat, v.entrada_lon AS lon, v.hora_entrada AS ts
          FROM visitas v WHERE v.entrada_lat IS NOT NULL AND v.tecnico_id IS NOT NULL
        UNION ALL
        SELECT v.tecnico_id, v.firma_lat, v.firma_lon, COALESCE(v.hora_salida, v.hora_entrada)
          FROM visitas v WHERE v.firma_lat IS NOT NULL AND v.tecnico_id IS NOT NULL
        UNION ALL
        SELECT v.tecnico_id, v.salida_lat, v.salida_lon, v.hora_salida
          FROM visitas v WHERE v.salida_lat IS NOT NULL AND v.tecnico_id IS NOT NULL
        UNION ALL
        SELECT v.tecnico_id, p.lat, p.lon, p.created_at
          FROM pruebas p JOIN visitas v ON v.id=p.visita_id
          WHERE p.lat IS NOT NULL AND v.tecnico_id IS NOT NULL
      )
      SELECT DISTINCT ON (pts.tecnico_id) pts.tecnico_id, t.nombre AS tecnico, pts.lat, pts.lon, pts.ts
      FROM pts JOIN tecnicos t ON t.id=pts.tecnico_id
      ORDER BY pts.tecnico_id, pts.ts DESC NULLS LAST`)).rows;
    const live = (await q(`
      SELECT DISTINCT ON (p.usuario) p.usuario, COALESCE(p.nombre, p.usuario) AS tecnico, p.lat, p.lon, p.ts, p.accuracy, p.rol, u.avatar_path
      FROM posiciones p LEFT JOIN usuarios u ON u.username=p.usuario
      WHERE p.ts > now() - interval '20 minutes' AND p.lat IS NOT NULL
      ORDER BY p.usuario, p.ts DESC`)).rows;
    const clientes = (await q(`
      SELECT c.id, c.nombre, c.direccion, c.lat, c.lon,
        (SELECT count(*)::int FROM v_ultima_prueba u JOIN equipos e ON e.id=u.equipo_id WHERE e.cliente_id=c.id AND e.activo AND u.ultima_falla) AS fallas,
        CASE WHEN uv.ultima IS NULL THEN false ELSE (uv.ultima + ${INTERVALO})::date < CURRENT_DATE END AS vencida
      FROM clientes c LEFT JOIN (SELECT cliente_id, max(fecha) AS ultima FROM visitas GROUP BY cliente_id) uv ON uv.cliente_id=c.id
      WHERE c.lat IS NOT NULL AND c.lon IS NOT NULL AND c.activo`)).rows;
    const rutas = (await q(`
      SELECT v.tecnico_id, t.nombre AS tecnico, v.id, c.nombre AS cliente, c.lat, c.lon
      FROM visitas v JOIN clientes c ON c.id=v.cliente_id JOIN tecnicos t ON t.id=v.tecnico_id
      WHERE v.fecha=CURRENT_DATE AND v.estado IN ('programada','en_curso') AND c.lat IS NOT NULL AND v.tecnico_id IS NOT NULL
      ORDER BY v.tecnico_id, COALESCE(v.orden,999), v.id`)).rows;
    const visitas_activas = (await q(`SELECT v.id, v.hora_entrada, c.nombre AS cliente, t.nombre AS tecnico, c.lat, c.lon
      FROM visitas v JOIN clientes c ON c.id=v.cliente_id LEFT JOIN tecnicos t ON t.id=v.tecnico_id
      WHERE v.estado='en_curso' ORDER BY v.hora_entrada DESC`)).rows;
    const proveedores = (await q('SELECT id, nombre, rubro, direccion, lat, lon FROM proveedores WHERE lat IS NOT NULL AND lon IS NOT NULL AND activo')).rows;
    res.json({ tecnicos: live.length ? live : tecnicos, tecnicos_visita: tecnicos, live, clientes, proveedores, visitas_activas, rutas });
  }));

  // ---- Ficha tecnica: credenciales (cifradas) ----
  // ---- Contactos del cliente ----
  app.get('/api/clientes/:id/contactos', authMiddleware, wrap(async (req, res) => {
    res.json((await q('SELECT * FROM cliente_contactos WHERE cliente_id=$1 ORDER BY nombre, id', [req.params.id])).rows);
  }));
  app.post('/api/clientes/:id/contactos', authMiddleware, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q('INSERT INTO cliente_contactos (cliente_id,nombre,email,telefono,cargo) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, b.nombre || null, b.email || null, b.telefono || null, b.cargo || null]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/contactos/:id', authMiddleware, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q('UPDATE cliente_contactos SET nombre=$1,email=$2,telefono=$3,cargo=$4 WHERE id=$5 RETURNING *',
      [b.nombre || null, b.email || null, b.telefono || null, b.cargo || null, req.params.id]);
    res.json(r.rows[0] || {});
  }));
  app.delete('/api/contactos/:id', authMiddleware, wrap(async (req, res) => {
    await q('DELETE FROM cliente_contactos WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  app.get('/api/clientes/:id/credenciales', authMiddleware, adminOnly, wrap(async (req, res) => {
    const r = await q('SELECT id, cliente_id, nombre, usuario, password_enc, url, notas FROM cliente_credenciales WHERE cliente_id=$1 ORDER BY id', [req.params.id]);
    res.json(r.rows.map(x => ({ id: x.id, cliente_id: x.cliente_id, nombre: x.nombre, usuario: x.usuario, password: decCred(x.password_enc), url: x.url, notas: x.notas })));
  }));
  app.post('/api/clientes/:id/credenciales', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body;
    const r = await q('INSERT INTO cliente_credenciales (cliente_id,nombre,usuario,password_enc,url,notas) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [req.params.id, b.nombre, b.usuario, encCred(b.password), b.url, b.notas]);
    res.status(201).json({ id: r.rows[0].id });
  }));
  app.put('/api/credenciales/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body;
    if (b.password !== undefined && b.password !== '') await q('UPDATE cliente_credenciales SET password_enc=$1 WHERE id=$2', [encCred(b.password), req.params.id]);
    await q('UPDATE cliente_credenciales SET nombre=$1, usuario=$2, url=$3, notas=$4 WHERE id=$5', [b.nombre, b.usuario, b.url, b.notas, req.params.id]);
    res.json({ ok: true });
  }));
  app.delete('/api/credenciales/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    await q('DELETE FROM cliente_credenciales WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  // ---- Ficha tecnica: archivos (respaldos / fotos / docs) ----
  app.get('/api/clientes/:id/archivos', wrap(async (req, res) => {
    const r = await q('SELECT * FROM cliente_archivos WHERE cliente_id=$1 ORDER BY id DESC', [req.params.id]);
    res.json(r.rows);
  }));
  app.post('/api/clientes/:id/archivos', upX.array('files', 20), wrap(async (req, res) => {
    const tipo = req.body.tipo || 'doc'; const desc = req.body.descripcion || null; const out = [];
    for (const f of req.files || []) {
      const r = await q('INSERT INTO cliente_archivos (cliente_id,tipo,filename,path,descripcion) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [req.params.id, tipo, f.originalname, '/uploads/' + path.basename(f.path), desc]);
      out.push(r.rows[0]);
    }
    res.status(201).json(out);
  }));
  app.delete('/api/cliente_archivos/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    await q('DELETE FROM cliente_archivos WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  app.get('/api/clientes/vencimientos', wrap(async (req, res) => {
    res.json((await q(`
      SELECT c.id, c.nombre, c.frecuencia, uv.ultima,
        CASE WHEN uv.ultima IS NULL THEN CURRENT_DATE ELSE (uv.ultima + ${INTERVALO})::date END AS proxima
      FROM clientes c LEFT JOIN (SELECT cliente_id, max(fecha) AS ultima FROM visitas GROUP BY cliente_id) uv ON uv.cliente_id=c.id
      WHERE c.activo
        AND NOT EXISTS (SELECT 1 FROM visitas v WHERE v.cliente_id=c.id AND v.estado IN ('programada','en_curso') AND v.fecha >= CURRENT_DATE)
        AND (uv.ultima IS NULL OR (uv.ultima + ${INTERVALO})::date <= CURRENT_DATE + 7)
      ORDER BY proxima, c.nombre LIMIT 40`)).rows);
  }));

  // ---- Rupturas (fallas historicas) del cliente ----
  app.get('/api/clientes/:id/rupturas', wrap(async (req, res) => {
    res.json((await q(`
      SELECT p.id, p.fecha, p.comentarios, p.visita_id, e.id AS equipo_id, e.etiqueta, e.codigo_qr,
             s.nombre AS sistema, est.nombre AS estado
      FROM pruebas p
      JOIN equipos e ON e.id=p.equipo_id
      JOIN estados_equipo est ON est.id=p.estado_id AND est.es_falla
      LEFT JOIN sistemas s ON s.id=e.sistema_id
      WHERE e.cliente_id=$1
      ORDER BY p.fecha DESC, p.id DESC LIMIT 200`, [req.params.id])).rows);
  }));

  // ---- Planos del cliente (imagen + dibujos/anotaciones) ----
  // Alias sin la palabra "planos" (los adblockers bloquean URLs con /planos)
  const dsnList = wrap(async (req, res) => {
    res.json((await q('SELECT * FROM planos WHERE cliente_id=$1 ORDER BY id', [req.params.id])).rows);
  });
  app.get('/api/clientes/:id/dsn', dsnList);
  app.post('/api/clientes/:id/dsn', upX.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
    const r = await q("INSERT INTO planos (cliente_id, nombre, path, shapes) VALUES ($1,$2,$3,'[]'::jsonb) RETURNING *",
      [req.params.id, req.body?.nombre || req.file.originalname || 'Plano', '/uploads/' + path.basename(req.file.path)]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/dsn/:id', wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q('UPDATE planos SET nombre=COALESCE($1,nombre), shapes=COALESCE($2,shapes) WHERE id=$3 RETURNING *',
      [b.nombre, b.shapes !== undefined ? JSON.stringify(b.shapes) : null, req.params.id]);
    res.json(r.rows[0] || {});
  }));
  app.delete('/api/dsn/:id', wrap(async (req, res) => {
    await q('DELETE FROM planos WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  app.get('/api/clientes/:id/planos', wrap(async (req, res) => {
    const r = await q('SELECT id, nombre, path, shapes, created_at FROM planos WHERE cliente_id=$1 ORDER BY id', [req.params.id]);
    res.json(r.rows);
  }));
  app.post('/api/clientes/:id/planos', upX.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo del plano' });
    const r = await q('INSERT INTO planos (cliente_id, nombre, path, shapes) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, req.body.nombre || req.file.originalname || 'Plano', '/uploads/' + path.basename(req.file.path), '[]']);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/planos/:id', wrap(async (req, res) => {
    const { shapes, nombre } = req.body || {};
    const r = await q('UPDATE planos SET shapes=COALESCE($1,shapes), nombre=COALESCE($2,nombre) WHERE id=$3 RETURNING *',
      [shapes != null ? JSON.stringify(shapes) : null, nombre || null, req.params.id]);
    res.json(r.rows[0] || {});
  }));
  app.delete('/api/planos/:id', wrap(async (req, res) => {
    await q('DELETE FROM planos WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));


  // ---- Auditoria (admin) ----
  app.get('/api/auditoria', authMiddleware, adminOnly, wrap(async (req, res) => {
    const r = await q('SELECT * FROM auditoria ORDER BY id DESC LIMIT 300');
    res.json(r.rows);
  }));

  // ---- Equipos estandar (catalogo con mini-fotos) ----
  app.get('/api/equipos_estandar', wrap(async (req, res) => {
    const r = await q('SELECT ee.*, s.nombre AS sistema FROM equipos_estandar ee LEFT JOIN sistemas s ON s.id=ee.sistema_id ORDER BY s.nombre NULLS LAST, ee.nombre, ee.id'); res.json(r.rows);
  }));
  app.post('/api/equipos_estandar', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body;
    const r = await q('INSERT INTO equipos_estandar (nombre,tipo,marca,modelo,sistema_id) VALUES ($1,$2,$3,$4,$5) RETURNING *', [b.nombre, b.tipo, b.marca, b.modelo, b.sistema_id || null]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/equipos_estandar/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    const b = req.body;
    const r = await q('UPDATE equipos_estandar SET nombre=$1,tipo=$2,marca=$3,modelo=$4,sistema_id=$5 WHERE id=$6 RETURNING *', [b.nombre, b.tipo, b.marca, b.modelo, b.sistema_id || null, req.params.id]);
    res.json(r.rows[0]);
  }));
  app.delete('/api/equipos_estandar/:id', authMiddleware, adminOnly, wrap(async (req, res) => {
    await q('DELETE FROM equipos_estandar WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));
  app.post('/api/equipos_estandar/:id/foto', authMiddleware, adminOnly, upX.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta archivo' });
    const rel = '/uploads/' + path.basename(req.file.path);
    await q('UPDATE equipos_estandar SET foto_path=$1 WHERE id=$2', [rel, req.params.id]);
    res.json({ foto_path: rel });
  }));
  // Foto de un equipo del cliente (para inventario)
  app.post('/api/equipos/:id/foto', upX.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta archivo' });
    const rel = '/uploads/' + path.basename(req.file.path);
    await q('UPDATE equipos SET foto_path=$1 WHERE id=$2', [rel, req.params.id]);
    res.json({ foto_path: rel });
  }));

  // ---- Respaldos (admin) ----
  app.get('/api/respaldos', authMiddleware, adminOnly, wrap(async (req, res) => {
    const dir = '/opt/preventis/backups'; let files = [];
    try { files = fs.readdirSync(dir).map(f => { const st = fs.statSync(dir + '/' + f); return { name: f, size: st.size, ts: st.mtime }; }).sort((a, b) => new Date(b.ts) - new Date(a.ts)); } catch {}
    res.json(files);
  }));
  app.post('/api/respaldos/run', authMiddleware, adminOnly, wrap(async (req, res) => {
    exec('/opt/preventis/backup.sh', () => {});
    res.json({ ok: true });
  }));
  app.get('/api/respaldos/download', authMiddleware, adminOnly, wrap(async (req, res) => {
    const name = String(req.query.name || '');
    if (!/^[\w.\-]+$/.test(name)) return res.status(400).json({ error: 'Nombre invalido' });
    const fp = path.join('/opt/preventis/backups', name);
    if (!fp.startsWith('/opt/preventis/backups/') || !fs.existsSync(fp)) return res.status(404).json({ error: 'No existe' });
    res.download(fp, name);
  }));

  // ---- Geocodificacion (Nominatim / OpenStreetMap) ----
  async function geocode(direccion) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(direccion);
    const r = await fetch(url, { headers: { 'User-Agent': 'Preventis/1.0 (mantenimientos preventivos)' } });
    const j = await r.json();
    if (!j.length) return null;
    return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
  }
  app.post('/api/clientes/:id/geocodificar', wrap(async (req, res) => {
    const c = (await q('SELECT direccion FROM clientes WHERE id=$1', [req.params.id])).rows[0];
    if (!c?.direccion) return res.status(400).json({ error: 'El cliente no tiene direccion' });
    const g = await geocode(c.direccion);
    if (!g) return res.status(404).json({ error: 'No se pudo geolocalizar esa direccion' });
    await q('UPDATE clientes SET lat=$1, lon=$2 WHERE id=$3', [g.lat, g.lon, req.params.id]);
    res.json(g);
  }));
  app.post('/api/geocodificar-todos', authMiddleware, adminOnly, wrap(async (req, res) => {
    const cs = (await q("SELECT id, direccion FROM clientes WHERE activo AND (lat IS NULL OR lon IS NULL) AND direccion IS NOT NULL AND direccion <> ''")).rows;
    let ok = 0;
    for (const c of cs) {
      try { const g = await geocode(c.direccion); if (g) { await q('UPDATE clientes SET lat=$1, lon=$2 WHERE id=$3', [g.lat, g.lon, c.id]); ok++; } } catch {}
      await new Promise(r => setTimeout(r, 1100));
    }
    res.json({ geocodificados: ok, total: cs.length });
  }));

  // ---- Proveedores (con geocodificacion automatica de la direccion) ----
  app.get('/api/proveedores', wrap(async (req, res) => {
    res.json((await q('SELECT * FROM proveedores WHERE activo ORDER BY nombre, id')).rows);
  }));
  app.post('/api/proveedores', authMiddleware, wrap(async (req, res) => {
    const b = req.body || {};
    let lat = b.lat ?? null, lon = b.lon ?? null;
    if ((lat == null || lon == null) && b.direccion) { try { const g = await geocode(b.direccion); if (g) { lat = g.lat; lon = g.lon; } } catch {} }
    const r = await q('INSERT INTO proveedores (nombre,rubro,direccion,telefono,lat,lon) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [b.nombre, b.rubro || null, b.direccion || null, b.telefono || null, lat, lon]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/proveedores/:id', authMiddleware, wrap(async (req, res) => {
    const b = req.body || {};
    let lat = b.lat ?? null, lon = b.lon ?? null;
    if ((lat == null || lon == null) && b.direccion) { try { const g = await geocode(b.direccion); if (g) { lat = g.lat; lon = g.lon; } } catch {} }
    const r = await q('UPDATE proveedores SET nombre=$1,rubro=$2,direccion=$3,telefono=$4,lat=COALESCE($5,lat),lon=COALESCE($6,lon) WHERE id=$7 RETURNING *',
      [b.nombre, b.rubro || null, b.direccion || null, b.telefono || null, lat, lon, req.params.id]);
    res.json(r.rows[0] || {});
  }));
  app.delete('/api/proveedores/:id', authMiddleware, wrap(async (req, res) => {
    await q('UPDATE proveedores SET activo=false WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  // ---- Flota (vehiculos + registros: service, nafta, reparaciones) ----
  app.get('/api/vehiculos', wrap(async (req, res) => {
    res.json((await q(`
      SELECT ve.*,
        (SELECT COALESCE(sum(costo),0) FROM vehiculo_registros r WHERE r.vehiculo_id=ve.id) AS gasto_total,
        (SELECT max(fecha) FROM vehiculo_registros r WHERE r.vehiculo_id=ve.id) AS ultimo_registro,
        (SELECT path FROM vehiculo_fotos f WHERE f.vehiculo_id=ve.id ORDER BY id LIMIT 1) AS foto_path,
        (SELECT fecha FROM vehiculo_registros r WHERE r.vehiculo_id=ve.id AND r.tipo='service' ORDER BY fecha DESC, id DESC LIMIT 1) AS ult_service_fecha,
        (SELECT odometro FROM vehiculo_registros r WHERE r.vehiculo_id=ve.id AND r.tipo='service' AND r.odometro IS NOT NULL ORDER BY fecha DESC, id DESC LIMIT 1) AS ult_service_km
      FROM vehiculos ve WHERE ve.activo ORDER BY ve.nombre, ve.id`)).rows);
  }));
  app.post('/api/vehiculos', authMiddleware, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q('INSERT INTO vehiculos (nombre,patente,tipo,marca,modelo,anio,odometro,notas,service_cada_km,service_cada_meses) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [b.nombre, b.patente || null, b.tipo || 'camioneta', b.marca || null, b.modelo || null, b.anio || null, b.odometro || null, b.notas || null, b.service_cada_km || null, b.service_cada_meses || null]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/vehiculos/:id', authMiddleware, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q('UPDATE vehiculos SET nombre=$1,patente=$2,tipo=$3,marca=$4,modelo=$5,anio=$6,odometro=$7,notas=$8,service_cada_km=$9,service_cada_meses=$10 WHERE id=$11 RETURNING *',
      [b.nombre, b.patente || null, b.tipo || 'camioneta', b.marca || null, b.modelo || null, b.anio || null, b.odometro || null, b.notas || null, b.service_cada_km || null, b.service_cada_meses || null, req.params.id]);
    res.json(r.rows[0] || {});
  }));
  app.delete('/api/vehiculos/:id', authMiddleware, wrap(async (req, res) => {
    await q('UPDATE vehiculos SET activo=false WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));
  app.get('/api/vehiculos/:id', wrap(async (req, res) => {
    const r = await q(`SELECT ve.*,
      (SELECT COALESCE(sum(costo),0) FROM vehiculo_registros r WHERE r.vehiculo_id=ve.id) AS gasto_total,
      (SELECT max(fecha) FROM vehiculo_registros r WHERE r.vehiculo_id=ve.id) AS ultimo_registro,
      (SELECT path FROM vehiculo_fotos f WHERE f.vehiculo_id=ve.id ORDER BY id LIMIT 1) AS foto_path,
        (SELECT fecha FROM vehiculo_registros r WHERE r.vehiculo_id=ve.id AND r.tipo='service' ORDER BY fecha DESC, id DESC LIMIT 1) AS ult_service_fecha,
        (SELECT odometro FROM vehiculo_registros r WHERE r.vehiculo_id=ve.id AND r.tipo='service' AND r.odometro IS NOT NULL ORDER BY fecha DESC, id DESC LIMIT 1) AS ult_service_km
      FROM vehiculos ve WHERE ve.id=$1`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  }));
  app.get('/api/vehiculos/:id/registros', wrap(async (req, res) => {
    res.json((await q(`SELECT r.*,
        COALESCE((SELECT json_agg(json_build_object('id',f.id,'path',f.path) ORDER BY f.id) FROM vehiculo_registro_fotos f WHERE f.registro_id=r.id), '[]') AS fotos
       FROM vehiculo_registros r WHERE r.vehiculo_id=$1 ORDER BY fecha DESC, id DESC`, [req.params.id])).rows);
  }));
  app.post('/api/vehiculos/:id/registros', authMiddleware, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q('INSERT INTO vehiculo_registros (vehiculo_id,tipo,fecha,costo,odometro,detalle) VALUES ($1,$2,COALESCE($3,CURRENT_DATE),$4,$5,$6) RETURNING *',
      [req.params.id, b.tipo || 'service', b.fecha || null, b.costo || null, b.odometro || null, b.detalle || null]);
    if (b.odometro) await q('UPDATE vehiculos SET odometro=GREATEST(COALESCE(odometro,0),$1) WHERE id=$2', [b.odometro, req.params.id]);
    res.status(201).json(r.rows[0]);
  }));
  app.delete('/api/vehiculo_registros/:id', authMiddleware, wrap(async (req, res) => {
    await q('DELETE FROM vehiculo_registros WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));
  app.post('/api/vehiculo_registros/:id/fotos', authMiddleware, upX.array('files', 10), wrap(async (req, res) => {
    const out = [];
    for (const f of req.files || []) {
      const r = await q('INSERT INTO vehiculo_registro_fotos (registro_id, path) VALUES ($1,$2) RETURNING *', [req.params.id, '/uploads/' + path.basename(f.path)]);
      out.push(r.rows[0]);
    }
    res.status(201).json(out);
  }));
  app.delete('/api/vehiculo_registro_fotos/:id', authMiddleware, wrap(async (req, res) => {
    await q('DELETE FROM vehiculo_registro_fotos WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));
  app.get('/api/vehiculos/:id/fotos', wrap(async (req, res) => {
    res.json((await q('SELECT * FROM vehiculo_fotos WHERE vehiculo_id=$1 ORDER BY id', [req.params.id])).rows);
  }));
  app.post('/api/vehiculos/:id/fotos', authMiddleware, upX.array('files', 10), wrap(async (req, res) => {
    const out = [];
    for (const f of req.files || []) {
      const r = await q('INSERT INTO vehiculo_fotos (vehiculo_id, path) VALUES ($1,$2) RETURNING *', [req.params.id, '/uploads/' + path.basename(f.path)]);
      out.push(r.rows[0]);
    }
    res.status(201).json(out);
  }));
  app.delete('/api/vehiculo_fotos/:id', authMiddleware, wrap(async (req, res) => {
    await q('DELETE FROM vehiculo_fotos WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  // ---- Tickets / incidencias ----
  app.get('/api/tickets', wrap(async (req, res) => {
    const cond = [], params = [];
    if (req.query.estado) { params.push(req.query.estado); cond.push('t.estado=$' + params.length); }
    if (req.query.cliente_id) { params.push(req.query.cliente_id); cond.push('t.cliente_id=$' + params.length); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    res.json((await q(`SELECT t.*, c.nombre AS cliente FROM tickets t LEFT JOIN clientes c ON c.id=t.cliente_id ${where} ORDER BY (t.estado IN ('resuelto','cerrado')) ASC, t.updated_at DESC, t.id DESC`, params)).rows);
  }));
  app.post('/api/tickets', authMiddleware, wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q(`INSERT INTO tickets (titulo,cliente_id,prioridad,estado,asignado,descripcion,solicitante,fecha_max_resolucion,facturable,presupuesto_crm,motivo_no_fact,contrato_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [b.titulo, b.cliente_id || null, b.prioridad || 'media', b.estado || 'abierto', b.asignado || null, b.descripcion || null,
       b.solicitante || null, b.fecha_max_resolucion || null, (b.facturable === undefined ? null : !!b.facturable), b.presupuesto_crm || null, b.motivo_no_fact || null, b.contrato_id || null]);
    notify({ type: 'ticket', icon: 'alert', text: 'Nuevo ticket: ' + (b.titulo || ''), url: '/tickets' });
    dispatchAlerta(q, 'ticket_nuevo', { titulo: 'Ticket nuevo · ' + (b.titulo || ''), texto: 'Prioridad ' + (b.prioridad || 'media'), url: '/tickets/' + r.rows[0].id, clienteId: b.cliente_id }).catch(() => {});
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/tickets/:id', authMiddleware, wrap(async (req, res) => {
    const b = req.body || {};
    const prev = (await q('SELECT estado, cliente_id FROM tickets WHERE id=$1', [req.params.id])).rows[0] || {};
    const r = await q(`UPDATE tickets SET titulo=$1,cliente_id=$2,prioridad=$3,estado=$4,asignado=$5,descripcion=$6,
       solicitante=$8,fecha_max_resolucion=$9,facturable=$10,presupuesto_crm=$11,motivo_no_fact=$12,contrato_id=$13,updated_at=now() WHERE id=$7 RETURNING *`,
      [b.titulo, b.cliente_id || null, b.prioridad || 'media', b.estado || 'abierto', b.asignado || null, b.descripcion || null, req.params.id,
       b.solicitante || null, b.fecha_max_resolucion || null, (b.facturable === undefined ? null : !!b.facturable), b.presupuesto_crm || null, b.motivo_no_fact || null, b.contrato_id || null]);
    const nt = r.rows[0] || {};
    if (nt.id && prev.estado && b.estado && b.estado !== prev.estado) {
      dispatchAlerta(q, 'ticket_actualizado', { titulo: 'Ticket actualizado · ' + (nt.titulo || ''), texto: 'Estado: ' + prev.estado + ' → ' + b.estado, url: '/tickets/' + nt.id, clienteId: nt.cliente_id }).catch(() => {});
    }
    res.json(nt);
  }));
  app.delete('/api/tickets/:id', authMiddleware, wrap(async (req, res) => {
    await q('DELETE FROM tickets WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));
  app.get('/api/tickets/:id', wrap(async (req, res) => {
    const r = await q('SELECT t.*, c.nombre AS cliente FROM tickets t LEFT JOIN clientes c ON c.id=t.cliente_id WHERE t.id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  }));
  app.get('/api/tickets/:id/visitas', authMiddleware, wrap(async (req, res) => {
    res.json((await q(`SELECT v.id, v.fecha, v.fecha_fin, v.multidia, v.estado, v.tipo, t.nombre AS tecnico,
      (SELECT json_agg(json_build_object('orden',j.orden,'fecha',j.fecha,'estado',j.estado) ORDER BY j.orden) FROM visita_jornadas j WHERE j.visita_id=v.id) AS jornadas
      FROM visitas v LEFT JOIN tecnicos t ON t.id=v.tecnico_id
      WHERE v.ticket_id=$1 ORDER BY v.fecha DESC, v.id DESC`, [req.params.id])).rows);
  }));
  app.get('/api/tickets/:id/comentarios', wrap(async (req, res) => {
    res.json((await q('SELECT * FROM ticket_comentarios WHERE ticket_id=$1 ORDER BY id', [req.params.id])).rows);
  }));
  app.post('/api/tickets/:id/comentarios', authMiddleware, upX.array('files', 8), wrap(async (req, res) => {
    const adj = (req.files || []).map(f => ({ path: '/uploads/' + path.basename(f.path), nombre: f.originalname || 'archivo', mime: f.mimetype || '' }));
    const r = await q('INSERT INTO ticket_comentarios (ticket_id,autor,texto,adjuntos) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, req.user?.nombre || req.user?.username || null, (req.body || {}).texto || '', JSON.stringify(adj)]);
    await q('UPDATE tickets SET updated_at=now() WHERE id=$1', [req.params.id]);
    res.status(201).json(r.rows[0]);
  }));


  // ---- Visitas (global, para el menu Visitas) ----
  app.get('/api/visitas', wrap(async (req, res) => {
    const cond = [], params = [];
    if (req.query.estado) { params.push(req.query.estado); cond.push('v.estado=$' + params.length); }
    if (req.query.tecnico_id) { params.push(req.query.tecnico_id); cond.push('(v.tecnico_id=$' + params.length + ' OR EXISTS (SELECT 1 FROM visita_tecnicos vt WHERE vt.visita_id=v.id AND vt.tecnico_id=$' + params.length + '))'); }
    if (req.query.cliente_id) { params.push(req.query.cliente_id); cond.push('v.cliente_id=$' + params.length); }
    if (req.query.desde) { params.push(req.query.desde); cond.push('v.fecha>=$' + params.length); }
    if (req.query.hasta) { params.push(req.query.hasta); cond.push('v.fecha<=$' + params.length); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const r = await q(`
      SELECT v.id, v.fecha, v.fecha_fin, v.multidia, v.estado, v.cerrada, v.hora_entrada, v.hora_salida, v.cliente_id, v.asignada_por, v.tipo, v.orden, v.hora, c.nombre AS cliente,
             COALESCE((SELECT string_agg(t2.nombre, ', ' ORDER BY t2.nombre) FROM visita_tecnicos vt JOIN tecnicos t2 ON t2.id=vt.tecnico_id WHERE vt.visita_id=v.id), t.nombre) AS tecnico,
             (SELECT array_agg(vt.tecnico_id ORDER BY vt.tecnico_id) FROM visita_tecnicos vt WHERE vt.visita_id=v.id) AS tecnico_ids,
             (SELECT count(*) FROM pruebas p WHERE p.visita_id=v.id)::int AS pruebas,
             (SELECT json_agg(json_build_object('id',j.id,'fecha',j.fecha,'orden',j.orden,'estado',j.estado) ORDER BY j.orden) FROM visita_jornadas j WHERE j.visita_id=v.id) AS jornadas
      FROM visitas v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN tecnicos t ON t.id=v.tecnico_id
      ${where} ORDER BY v.fecha DESC, v.id DESC LIMIT 500`, params);
    res.json(r.rows);
  }));

  // ---- Inventario (global de equipos instalados) ----
  app.get('/api/inventario', wrap(async (req, res) => {
    const cond = ['e.activo'], params = [];
    if (req.query.cliente_id) { params.push(req.query.cliente_id); cond.push('e.cliente_id=$' + params.length); }
    if (req.query.sistema_id) { params.push(req.query.sistema_id); cond.push('e.sistema_id=$' + params.length); }
    if (req.query.search) { params.push('%' + req.query.search + '%'); cond.push('(e.etiqueta ILIKE $' + params.length + ' OR e.codigo_qr ILIKE $' + params.length + ' OR e.modelo ILIKE $' + params.length + ')'); }
    if (req.query.estado) {
      const es = String(req.query.estado);
      if (es === 'falla') cond.push('u.ultima_falla');
      else if (es === 'ok') cond.push('(u.ultima_fecha IS NOT NULL AND NOT u.ultima_falla)');
      else if (es === 'sin_probar') cond.push('u.ultima_fecha IS NULL');
      else { params.push(es); cond.push('u.ultimo_estado=$' + params.length); }
    }
    const where = 'WHERE ' + cond.join(' AND ');
    const r = await q(`
      SELECT e.id, e.etiqueta, e.codigo_qr, e.direccion, e.grupo, e.modelo, e.foto_path, e.cliente_id,
             c.nombre AS cliente, s.nombre AS sistema, te.nombre AS tipo_elemento,
             u.ultima_fecha, u.ultimo_estado, u.ultima_falla
      FROM equipos e
      LEFT JOIN clientes c ON c.id=e.cliente_id LEFT JOIN sistemas s ON s.id=e.sistema_id
      LEFT JOIN tipos_elemento te ON te.id=e.tipo_elemento_id LEFT JOIN v_ultima_prueba u ON u.equipo_id=e.id
      ${where} ORDER BY c.nombre, e.etiqueta LIMIT 2000`, params);
    res.json(r.rows);
  }));


  // ---- Tareas adicionales detectadas en la visita ----
  app.get('/api/visitas/:id/tareas', wrap(async (req, res) => {
    const r = await q('SELECT * FROM visita_tareas WHERE visita_id=$1 ORDER BY resuelta ASC, id DESC', [req.params.id]);
    res.json(r.rows);
  }));
  app.post('/api/visitas/:id/tareas', wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.descripcion) return res.status(400).json({ error: 'Falta descripcion' });
    const r = await q("INSERT INTO visita_tareas (visita_id,descripcion,prioridad) VALUES ($1,$2,COALESCE($3,'media')) RETURNING *", [req.params.id, b.descripcion, b.prioridad]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/tareas/:id', wrap(async (req, res) => {
    const b = req.body || {};
    const r = await q('UPDATE visita_tareas SET descripcion=COALESCE($1,descripcion), prioridad=COALESCE($2,prioridad), resuelta=COALESCE($3,resuelta) WHERE id=$4 RETURNING *', [b.descripcion, b.prioridad, b.resuelta, req.params.id]);
    res.json(r.rows[0]);
  }));
  app.delete('/api/tareas/:id', wrap(async (req, res) => {
    await q('DELETE FROM visita_tareas WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));


  // ---- Fotos del cliente (mosaico): de visitas, pruebas, archivos y equipos ----
  app.get('/api/clientes/:id/fotos', wrap(async (req, res) => {
    const id = req.params.id;
    const va = (await q("SELECT va.path, va.created_at AS fecha, 'Visita' AS origen FROM visita_archivos va JOIN visitas v ON v.id=va.visita_id WHERE v.cliente_id=$1 AND va.tipo='foto'", [id])).rows;
    const pf = (await q("SELECT pf.path, pf.created_at AS fecha, COALESCE(e.etiqueta,'Equipo') AS origen FROM prueba_fotos pf JOIN pruebas p ON p.id=pf.prueba_id JOIN equipos e ON e.id=p.equipo_id WHERE e.cliente_id=$1", [id])).rows;
    const ca = (await q("SELECT path, created_at AS fecha, COALESCE(descripcion,'Archivo') AS origen FROM cliente_archivos WHERE cliente_id=$1 AND tipo='foto'", [id])).rows;
    const ef = (await q("SELECT foto_path AS path, NULL AS fecha, COALESCE(etiqueta,'Equipo') AS origen FROM equipos WHERE cliente_id=$1 AND foto_path IS NOT NULL AND activo", [id])).rows;
    const all = [...va, ...pf, ...ca, ...ef].filter(x => x.path);
    all.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    res.json(all);
  }));

}
