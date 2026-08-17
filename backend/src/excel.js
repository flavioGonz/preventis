import ExcelJS from 'exceljs';
import { q } from './db.js';

// ---- Importar pruebas desde Excel ----
// Columnas reconocidas (case-insensitive, en la primera fila):
//   etiqueta | codigo_qr | estado | fecha | comentarios
// Si no se especifica visita_id se crea/usa una visita "de importación" del día.
export async function importPruebasExcel(buffer, clienteId, visitaIdArg) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('El archivo no tiene hojas');

  // Detectar la fila de encabezados. Los archivos EXPORTADOS por la app llevan un título en la
  // fila 1 y un subtítulo en la 2, con los encabezados reales en la fila 3; una plantilla simple
  // los tiene en la fila 1. Buscamos la primera fila (de las primeras 12) que contenga alguno de
  // los nombres reconocidos, y toleramos variantes ("Codigo QR" vs codigo_qr, "Fecha prueba", etc.).
  const norm = (v) => String(v == null ? '' : (typeof v === 'object' && v.text ? v.text : v)).trim().toLowerCase();
  const KNOWN = ['etiqueta', 'codigo_qr', 'codigo qr', 'codigo', 'estado', 'fecha', 'fecha prueba', 'comentarios', 'comentario'];
  let headerRow = 1, headers = {};
  for (let r = 1; r <= Math.min(12, ws.rowCount); r++) {
    const map = {};
    ws.getRow(r).eachCell((cell, col) => { const k = norm(cell.value); if (k) map[k] = col; });
    if (Object.keys(map).some(k => KNOWN.includes(k))) { headerRow = r; headers = map; break; }
  }
  const colOf = (names) => { for (const n of names) if (headers[n]) return headers[n]; return null; };
  const get = (row, names) => {
    const c = colOf(names);
    if (!c) return null;
    const v = row.getCell(c).value;
    return v == null ? null : (typeof v === 'object' && v.text ? v.text : v);
  };

  // Catálogo de estados por nombre (insensible)
  const estados = (await q('SELECT id,nombre FROM estados_equipo')).rows;
  const estadoByName = n => {
    if (!n) return null;
    const s = estados.find(e => e.nombre.toLowerCase() === String(n).trim().toLowerCase());
    return s ? s.id : null;
  };

  // Visita destino
  let visitaId = visitaIdArg ? Number(visitaIdArg) : null;
  if (!visitaId) {
    const r = await q(
      `INSERT INTO visitas (cliente_id,fecha,situacion_inicial)
       VALUES ($1,CURRENT_DATE,'Carga masiva desde Excel (reporte de central)') RETURNING id`,
      [clienteId]);
    visitaId = r.rows[0].id;
  }

  let creadas = 0, sinEquipo = 0;
  const errores = [];
  for (let i = headerRow + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const etiqueta = get(row, ['etiqueta']);
    const codigo = get(row, ['codigo_qr', 'codigo qr', 'codigo']);
    const estado = get(row, ['estado']);
    const fecha = get(row, ['fecha', 'fecha prueba']);
    const comentarios = get(row, ['comentarios', 'comentario']);
    if (!etiqueta && !codigo) continue;

    // Buscar equipo
    let eq;
    if (codigo) {
      eq = (await q('SELECT id FROM equipos WHERE codigo_qr=$1 AND cliente_id=$2', [String(codigo).trim(), clienteId])).rows[0];
    }
    if (!eq && etiqueta) {
      eq = (await q('SELECT id FROM equipos WHERE etiqueta=$1 AND cliente_id=$2 ORDER BY id LIMIT 1',
        [String(etiqueta).trim(), clienteId])).rows[0];
    }
    if (!eq) { sinEquipo++; errores.push(`Fila ${i}: equipo no encontrado (${etiqueta || codigo})`); continue; }

    const estadoId = estadoByName(estado);
    let fechaVal = null;
    if (fecha instanceof Date) fechaVal = fecha.toISOString().slice(0, 10);
    else if (fecha) fechaVal = String(fecha).slice(0, 10);

    await q(
      `INSERT INTO pruebas (visita_id,equipo_id,estado_id,comentarios,fecha,origen)
       VALUES ($1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),'excel')`,
      [visitaId, eq.id, estadoId, comentarios ? String(comentarios) : null, fechaVal]);
    creadas++;
  }
  return { visita_id: visitaId, creadas, sin_equipo: sinEquipo, errores: errores.slice(0, 50) };
}

// ---- Exportar pruebas a Excel ----
export async function exportPruebasExcel({ clienteId, visitaId, desde, hasta }) {
  const cond = [], params = [];
  if (visitaId) { params.push(visitaId); cond.push(`p.visita_id=$${params.length}`); }
  if (clienteId) { params.push(clienteId); cond.push(`e.cliente_id=$${params.length}`); }
  if (desde) { params.push(desde); cond.push(`p.fecha>=$${params.length}`); }
  if (hasta) { params.push(hasta); cond.push(`p.fecha<=$${params.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

  const rows = (await q(`
    SELECT c.nombre AS cliente, v.fecha AS fecha_visita, t.nombre AS tecnico,
           e.codigo_qr, e.etiqueta, s.nombre AS sistema, e.direccion, e.grupo, e.subgrupo,
           te.nombre AS tipo_elemento, e.modelo,
           est.nombre AS estado, p.comentarios, p.fecha, p.origen
    FROM pruebas p
    JOIN equipos e ON e.id=p.equipo_id
    LEFT JOIN clientes c ON c.id=e.cliente_id
    LEFT JOIN visitas v ON v.id=p.visita_id
    LEFT JOIN tecnicos t ON t.id=v.tecnico_id
    LEFT JOIN sistemas s ON s.id=e.sistema_id
    LEFT JOIN tipos_elemento te ON te.id=e.tipo_elemento_id
    LEFT JOIN estados_equipo est ON est.id=p.estado_id
    ${where}
    ORDER BY p.fecha DESC, e.etiqueta`, params)).rows;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Preventis - IES';
  const ws = wb.addWorksheet('Pruebas', { views: [{ state: 'frozen', ySplit: 3 }] });
  const defs = [
    ['cliente', 'Cliente', 22], ['fecha_visita', 'Fecha visita', 13], ['tecnico', 'Tecnico', 18],
    ['codigo_qr', 'Codigo QR', 13], ['etiqueta', 'Etiqueta', 14], ['sistema', 'Sistema', 18],
    ['direccion', 'Direccion', 16], ['grupo', 'Grupo', 12], ['subgrupo', 'Subgrupo', 12],
    ['tipo_elemento', 'Tipo elemento', 16], ['modelo', 'Modelo', 14], ['estado', 'Estado', 16],
    ['comentarios', 'Comentarios', 32], ['fecha', 'Fecha prueba', 13], ['origen', 'Origen', 10],
  ];
  ws.columns = defs.map(d => ({ key: d[0], width: d[2] }));
  const NC = defs.length, lastCol = String.fromCharCode(64 + NC);
  ws.mergeCells('A1:' + lastCol + '1');
  const t = ws.getCell('A1');
  t.value = 'IES  \u00b7  INFORME DE PRUEBAS DE MANTENIMIENTO';
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  t.alignment = { vertical: 'middle', indent: 1 };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2742' } };
  ws.getRow(1).height = 30;
  ws.mergeCells('A2:' + lastCol + '2');
  const st = ws.getCell('A2');
  st.value = 'Generado ' + new Date().toLocaleDateString('es-UY') + '  \u00b7  Preventis';
  st.font = { size: 9, color: { argb: 'FF64748B' } };
  st.alignment = { indent: 1 };
  ws.getRow(2).height = 16;
  const hrow = ws.getRow(3);
  defs.forEach((d, i) => { hrow.getCell(i + 1).value = d[1]; });
  hrow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hrow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF13325A' } };
  hrow.alignment = { vertical: 'middle' };
  hrow.height = 20;
  rows.forEach((r, idx) => {
    const row = ws.addRow(r);
    if (idx % 2 === 1) row.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6FB' } }; });
    const est = String(r.estado || '').toLowerCase();
    if (est.includes('falla') || est.startsWith('no ')) row.getCell(12).font = { color: { argb: 'FFDC2626' }, bold: true };
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: NC } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---- Inventario de equipos a Excel: 1 hoja, cada equipo seguido de su historial de eventos ----
export async function exportInventarioExcel(filtros = {}) {
  const cond = ['e.activo'], params = [];
  if (filtros.cliente_id) { params.push(filtros.cliente_id); cond.push('e.cliente_id=$' + params.length); }
  if (filtros.sistema_id) { params.push(filtros.sistema_id); cond.push('e.sistema_id=$' + params.length); }
  if (filtros.search) { params.push('%' + filtros.search + '%'); cond.push('(e.etiqueta ILIKE $' + params.length + ' OR e.codigo_qr ILIKE $' + params.length + ' OR e.modelo ILIKE $' + params.length + ')'); }
  if (filtros.estado) {
    const es = String(filtros.estado);
    if (es === 'falla') cond.push('u.ultima_falla');
    else if (es === 'ok') cond.push('(u.ultima_fecha IS NOT NULL AND NOT u.ultima_falla)');
    else if (es === 'sin_probar') cond.push('u.ultima_fecha IS NULL');
    else { params.push(es); cond.push('u.ultimo_estado=$' + params.length); }
  }
  const where = 'WHERE ' + cond.join(' AND ');
  const equipos = (await q(`
    SELECT e.id, e.etiqueta, e.codigo_qr, e.direccion, e.grupo, e.subgrupo, e.modelo,
           c.nombre AS cliente, s.nombre AS sistema, te.nombre AS tipo_elemento,
           u.ultima_fecha, u.ultimo_estado, u.ultima_falla
    FROM equipos e
    LEFT JOIN clientes c ON c.id=e.cliente_id LEFT JOIN sistemas s ON s.id=e.sistema_id
    LEFT JOIN tipos_elemento te ON te.id=e.tipo_elemento_id LEFT JOIN v_ultima_prueba u ON u.equipo_id=e.id
    ${where} ORDER BY c.nombre, s.nombre, e.etiqueta LIMIT 5000`, params)).rows;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Preventis';
  const ws = wb.addWorksheet('Inventario');
  ws.columns = [{ width: 28 }, { width: 24 }, { width: 48 }, { width: 18 }];
  const fdate = (d) => { try { return d ? new Date(d).toLocaleDateString('es-UY') : '—'; } catch { return '—'; } };
  const fillRow = (row, argb) => row.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; });

  for (const e of equipos) {
    // Fila título del equipo
    const h = ws.addRow([e.etiqueta || '(sin etiqueta)', e.sistema || '—', e.tipo_elemento || '—', e.codigo_qr || '']);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11.5 };
    fillRow(h, 'FF1F2937');
    // Datos del equipo
    ws.addRow(['Cliente: ' + (e.cliente || '—'), 'Dirección: ' + (e.direccion || '—'), 'Grupo: ' + [e.grupo, e.subgrupo].filter(Boolean).join(' / ') || '—', 'Modelo: ' + (e.modelo || '—')]).font = { size: 10, color: { argb: 'FF475569' } };
    // Historial de eventos
    const evs = (await q(`
      SELECT COALESCE(p.fecha, v.fecha) AS fecha, est.nombre AS estado, est.es_falla, p.comentarios, v.fecha AS visita_fecha, v.id AS visita_id
      FROM pruebas p
      LEFT JOIN estados_equipo est ON est.id=p.estado_id
      LEFT JOIN visitas v ON v.id=p.visita_id
      WHERE p.equipo_id=$1 ORDER BY COALESCE(p.fecha, v.fecha) DESC NULLS LAST, p.id DESC`, [e.id])).rows;
    const eh = ws.addRow(['Fecha', 'Estado', 'Comentario', 'Visita']);
    eh.font = { bold: true, size: 10, color: { argb: 'FF334155' } };
    fillRow(eh, 'FFEEF2F7');
    if (!evs.length) {
      ws.addRow(['—', 'Sin pruebas registradas', '', '']).font = { italic: true, color: { argb: 'FF94A3B8' } };
    } else {
      for (const ev of evs) {
        const r = ws.addRow([fdate(ev.fecha), ev.estado || '—', ev.comentarios || '', ev.visita_id ? ('V-' + String(ev.visita_id).padStart(5, '0') + ' · ' + fdate(ev.visita_fecha)) : '']);
        if (ev.es_falla) r.getCell(2).font = { color: { argb: 'FFDC2626' }, bold: true };
      }
    }
    ws.addRow([]); // separador
  }
  if (!equipos.length) ws.addRow(['Sin equipos para los filtros seleccionados.']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
