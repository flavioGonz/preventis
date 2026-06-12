import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

// ===== Reportes de Visitas y Tickets (listados + Excel + PDF membretado) =====
export function mountReportes(app, q) {
  const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: e.message }); });

  async function getBrand() {
    try { const r = (await q("SELECT valor FROM app_config WHERE clave='branding'")).rows[0]; return r?.valor || {}; }
    catch { return {}; }
  }
  function logoPath(brandPath) {
    if (brandPath) { const p = path.join('/opt/preventis/backend/uploads', path.basename(brandPath)); if (fs.existsSync(p)) return p; }
    for (const p of ['/opt/preventis/frontend/public/logo.png', '/opt/preventis/frontend/dist/logo.png', '/opt/preventis/frontend/public/logo_es.png']) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
  const fdate = (d) => d ? new Date(d).toLocaleDateString('es-UY') : '-';
  const hm = (min) => { if (min == null) return '-'; const h = Math.floor(min / 60), m = min % 60; return h ? (h + 'h' + (m ? ' ' + m + 'm' : '')) : (m + 'm'); };

  const fdt = (d) => d ? new Date(d).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const TIPO = (t) => t === 'correctiva' ? 'Correctivo' : t === 'preventiva' ? 'Preventivo' : (t || '-');
  function rangoTxt(query) {
    if (query.desde && query.hasta) return fdate(query.desde) + ' a ' + fdate(query.hasta);
    if (query.desde) return 'Desde ' + fdate(query.desde);
    if (query.hasta) return 'Hasta ' + fdate(query.hasta);
    return 'Todos los registros';
  }

  // ---------------- VISITAS ----------------
  function visitasFilter(query) {
    const cond = [], params = [];
    if (query.cliente_id) { params.push(query.cliente_id); cond.push('v.cliente_id=$' + params.length); }
    if (query.tecnico_id) { params.push(query.tecnico_id); cond.push('(v.tecnico_id=$' + params.length + ' OR EXISTS (SELECT 1 FROM visita_tecnicos vt WHERE vt.visita_id=v.id AND vt.tecnico_id=$' + params.length + '))'); }
    if (query.estado) { params.push(query.estado); cond.push('v.estado=$' + params.length); }
    if (query.tipo) { params.push(query.tipo); cond.push('v.tipo=$' + params.length); }
    if (query.desde) { params.push(query.desde); cond.push('v.fecha>=$' + params.length); }
    if (query.hasta) { params.push(query.hasta); cond.push('v.fecha<=$' + params.length); }
    return { where: cond.length ? 'WHERE ' + cond.join(' AND ') : '', params };
  }
  const VISITAS_SQL = (where) => `
    SELECT v.id, v.fecha, v.fecha_fin, v.multidia, v.estado, v.tipo, v.cerrada, v.asignada_por, v.ticket_id, v.fecha_max_resolucion, v.hora_entrada, v.hora_salida,
      CASE WHEN v.hora_entrada IS NOT NULL AND v.hora_salida IS NOT NULL
        THEN round(EXTRACT(EPOCH FROM (v.hora_salida - v.hora_entrada))/60)::int END AS duracion_min,
      COALESCE((SELECT NULLIF(round(SUM(EXTRACT(EPOCH FROM (j.hora_fin - j.hora_inicio)))/60)::int, 0) FROM visita_jornadas j WHERE j.visita_id=v.id AND j.hora_inicio IS NOT NULL AND j.hora_fin IS NOT NULL),
        CASE WHEN v.hora_entrada IS NOT NULL AND v.hora_salida IS NOT NULL THEN round(EXTRACT(EPOCH FROM (v.hora_salida - v.hora_entrada))/60)::int END) AS trabajado_min,
      (SELECT count(*)::int FROM visita_jornadas j WHERE j.visita_id=v.id AND j.estado <> 'cancelada') AS dias_plan,
      (SELECT count(*)::int FROM visita_jornadas j WHERE j.visita_id=v.id AND j.hora_inicio IS NOT NULL AND j.estado <> 'cancelada') AS dias_trab,
      c.nombre AS cliente,
      COALESCE((SELECT string_agg(t2.nombre, ', ' ORDER BY t2.nombre) FROM visita_tecnicos vt JOIN tecnicos t2 ON t2.id=vt.tecnico_id WHERE vt.visita_id=v.id), t.nombre) AS tecnico,
      (SELECT count(*) FROM pruebas p WHERE p.visita_id=v.id)::int AS pruebas,
      (SELECT count(*) FROM pruebas p JOIN estados_equipo est ON est.id=p.estado_id WHERE p.visita_id=v.id AND est.es_falla)::int AS fallas
    FROM visitas v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN tecnicos t ON t.id=v.tecnico_id
    ${where} ORDER BY v.fecha DESC, v.id DESC`;

  app.get('/api/reportes/visitas', wrap(async (req, res) => {
    const { where, params } = visitasFilter(req.query);
    res.json((await q(VISITAS_SQL(where) + ' LIMIT 5000', params)).rows);
  }));

  app.get('/api/reportes/visitas/export.xlsx', wrap(async (req, res) => {
    const { where, params } = visitasFilter(req.query);
    const rows = (await q(VISITAS_SQL(where), params)).rows;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Visitas');
    ws.columns = [
      { header: 'Fecha visita', key: 'fecha', width: 13 }, { header: 'Cliente', key: 'cliente', width: 26 },
      { header: 'Tipo', key: 'tipo', width: 13 }, { header: 'Ticket', key: 'ticket', width: 10 },
      { header: 'Tecnico(s)', key: 'tecnico', width: 24 }, { header: 'Estado', key: 'estado', width: 13 },
      { header: 'Fecha max. resol.', key: 'fmax', width: 15 },
      { header: 'Entrada', key: 'entrada', width: 17 }, { header: 'Salida', key: 'salida', width: 17 },
      { header: 'Ejecucion (min)', key: 'duracion_min', width: 14 },
      { header: 'Trabajado (min)', key: 'trabajado_min', width: 15 },
      { header: 'Dias plan.', key: 'dias_plan', width: 9 }, { header: 'Dias trab.', key: 'dias_trab', width: 9 },
      { header: 'Fecha fin', key: 'ffin', width: 13 },
      { header: 'Pruebas', key: 'pruebas', width: 9 }, { header: 'Fallas', key: 'fallas', width: 8 },
      { header: 'Asignada por', key: 'asignada_por', width: 18 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    rows.forEach(r => ws.addRow({ ...r, fecha: fdate(r.fecha), tipo: TIPO(r.tipo), ticket: r.ticket_id ? 'TK-' + r.ticket_id : '', fmax: fdate(r.fecha_max_resolucion), ffin: r.multidia ? fdate(r.fecha_fin) : '', entrada: fdt(r.hora_entrada), salida: fdt(r.hora_salida) }));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_visitas.xlsx"');
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  }));

  app.get('/api/reportes/visitas/export.pdf', wrap(async (req, res) => {
    const { where, params } = visitasFilter(req.query);
    const rows = (await q(VISITAS_SQL(where), params)).rows;
    await tablePDF(res, {
      titulo: 'Reporte de visitas', subtitulo: rangoTxt(req.query) + '  ·  ' + rows.length + ' visitas', filename: 'reporte_visitas.pdf', rows,
      columns: [
        { h: 'Fecha', w: 54, get: r => fdate(r.fecha) },
        { h: 'Cliente', w: 124, get: r => r.cliente },
        { h: 'Tipo', w: 64, get: r => TIPO(r.tipo) },
        { h: 'Ticket', w: 44, get: r => r.ticket_id ? 'TK-' + r.ticket_id : '-' },
        { h: 'Tecnico(s)', w: 116, get: r => r.tecnico },
        { h: 'Estado', w: 62, get: r => r.estado },
        { h: 'F.max resol', w: 58, get: r => fdate(r.fecha_max_resolucion) },
        { h: 'Entrada', w: 82, get: r => fdt(r.hora_entrada) },
        { h: 'Dias', w: 38, align: 'right', get: r => r.multidia ? (r.dias_trab + '/' + r.dias_plan) : '-' },
        { h: 'Trabajado', w: 56, align: 'right', get: r => hm(r.trabajado_min) },
        { h: 'Pru.', w: 34, align: 'right', get: r => r.pruebas },
        { h: 'Fallas', w: 40, align: 'right', get: r => r.fallas, color: r => r.fallas > 0 ? '#dc2626' : '#0f172a' },
      ],
    });
  }));

  // ---------------- TICKETS ----------------
  function ticketsFilter(query) {
    const cond = [], params = [];
    if (query.cliente_id) { params.push(query.cliente_id); cond.push('t.cliente_id=$' + params.length); }
    if (query.estado) { params.push(query.estado); cond.push('t.estado=$' + params.length); }
    if (query.prioridad) { params.push(query.prioridad); cond.push('t.prioridad=$' + params.length); }
    if (query.desde) { params.push(query.desde); cond.push('t.created_at>=$' + params.length); }
    if (query.hasta) { params.push(query.hasta); cond.push('t.created_at < ($' + params.length + '::date + 1)'); }
    return { where: cond.length ? 'WHERE ' + cond.join(' AND ') : '', params };
  }
  const TICKETS_SQL = (where) => `
    SELECT t.id, t.titulo, t.prioridad, t.estado, t.asignado, t.solicitante,
      t.created_at, t.updated_at, t.fecha_max_resolucion, t.facturable, t.presupuesto_crm, t.motivo_no_fact,
      CASE WHEN t.estado IN ('resuelto','cerrado') THEN round(EXTRACT(EPOCH FROM (t.updated_at - t.created_at))/3600)::int END AS horas_resolucion,
      c.nombre AS cliente
    FROM tickets t LEFT JOIN clientes c ON c.id=t.cliente_id
    ${where} ORDER BY t.created_at DESC, t.id DESC`;

  app.get('/api/reportes/tickets', wrap(async (req, res) => {
    const { where, params } = ticketsFilter(req.query);
    res.json((await q(TICKETS_SQL(where) + ' LIMIT 5000', params)).rows);
  }));

  app.get('/api/reportes/tickets/export.xlsx', wrap(async (req, res) => {
    const { where, params } = ticketsFilter(req.query);
    const rows = (await q(TICKETS_SQL(where), params)).rows;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Tickets');
    ws.columns = [
      { header: 'N', key: 'id', width: 7 }, { header: 'Titulo', key: 'titulo', width: 30 },
      { header: 'Cliente', key: 'cliente', width: 24 }, { header: 'Prioridad', key: 'prioridad', width: 11 },
      { header: 'Estado', key: 'estado', width: 14 }, { header: 'Solicitante', key: 'solicitante', width: 18 },
      { header: 'Asignado', key: 'asignado', width: 18 }, { header: 'Creado', key: 'creado', width: 17 },
      { header: 'Fecha max. resol.', key: 'limite', width: 15 }, { header: 'Resuelto (h)', key: 'horas_resolucion', width: 12 },
      { header: 'Facturable', key: 'facturable', width: 11 }, { header: 'Nro CRM', key: 'presupuesto_crm', width: 14 },
      { header: 'Motivo no facturable', key: 'motivo_no_fact', width: 28 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    rows.forEach(r => ws.addRow({ ...r, creado: fdt(r.created_at), limite: fdate(r.fecha_max_resolucion), facturable: r.facturable === true ? 'Si' : r.facturable === false ? 'No' : '' }));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_tickets.xlsx"');
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  }));

  app.get('/api/reportes/tickets/export.pdf', wrap(async (req, res) => {
    const { where, params } = ticketsFilter(req.query);
    const rows = (await q(TICKETS_SQL(where), params)).rows;
    await tablePDF(res, {
      titulo: 'Reporte de tickets', subtitulo: rangoTxt(req.query) + '  ·  ' + rows.length + ' tickets', filename: 'reporte_tickets.pdf', rows,
      columns: [
        { h: 'N', w: 36, get: r => 'TK-' + r.id },
        { h: 'Titulo', w: 124, get: r => r.titulo },
        { h: 'Cliente', w: 92, get: r => r.cliente },
        { h: 'Prior.', w: 46, get: r => r.prioridad },
        { h: 'Estado', w: 64, get: r => r.estado },
        { h: 'Solicitante', w: 74, get: r => r.solicitante },
        { h: 'Asignado', w: 74, get: r => r.asignado },
        { h: 'Creado', w: 52, get: r => fdate(r.created_at) },
        { h: 'F.max', w: 52, get: r => fdate(r.fecha_max_resolucion) },
        { h: 'Fact.', w: 36, get: r => r.facturable === true ? 'Si' : r.facturable === false ? 'No' : '-' },
        { h: 'Nro CRM', w: 56, get: r => r.presupuesto_crm },
        { h: 'Motivo no fact.', w: 100, get: r => r.motivo_no_fact },
        { h: 'Resol.', w: 40, align: 'right', get: r => r.horas_resolucion != null ? r.horas_resolucion + 'h' : '-' },
      ],
    });
  }));

  // ---------------- Generador genérico de PDF tabular (membretado) ----------------
  async function tablePDF(res, { titulo, subtitulo, columns, rows, filename }) {
    const brand = await getBrand();
    const EMPRESA = (brand.pdf_empresa || brand.empresa || 'IES');
    const DOCPIE = (brand.pdf_doc_pie || brand.app_nombre || 'Preventis');
    const logo = logoPath(brand.pdf_logo_path || brand.logo_path);
    const NAVY = '#0f2742', INK = '#0f172a', GRIS = '#64748b', LINE = '#e3e8ef', SOFT = '#eef3fb', SKY = '#9db8d8';
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
    const chunks = []; doc.on('data', c => chunks.push(c));
    const done = new Promise(r => doc.on('end', r));
    const W = doc.page.width, H = doc.page.height, ML = 36, CW = W - ML * 2;

    function band() {
      doc.rect(0, 0, W, 60).fill(NAVY);
      let tx = ML;
      if (logo) { try { doc.image(logo, ML, 13, { fit: [110, 34] }); tx = ML + 122; } catch { tx = ML; } }
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text(titulo, tx, 14, { width: CW - 300, lineBreak: false });
      doc.fillColor(SKY).font('Helvetica').fontSize(8.5).text(subtitulo || '', tx, 35, { width: CW - 300, lineBreak: false });
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text(EMPRESA, W - ML - 200, 18, { width: 200, align: 'right' });
      doc.fillColor(SKY).font('Helvetica').fontSize(7.5).text('Generado: ' + new Date().toLocaleString('es-UY'), W - ML - 200, 36, { width: 200, align: 'right' });
    }
    const totalW = columns.reduce((a, c) => a + c.w, 0);
    const scale = CW / totalW;
    const colW = columns.map(c => c.w * scale);
    let y = 72;
    function headerRow() {
      doc.rect(ML, y, CW, 20).fill(SOFT);
      let x = ML;
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8);
      columns.forEach((c, i) => { doc.text(c.h.toUpperCase(), x + 5, y + 6, { width: colW[i] - 8, align: c.align || 'left', lineBreak: false }); x += colW[i]; });
      y += 20;
    }
    band(); headerRow();
    doc.font('Helvetica').fontSize(8);
    if (!rows.length) {
      doc.fillColor(GRIS).font('Helvetica-Oblique').fontSize(10).text('No hay registros para los filtros seleccionados.', ML, y + 16, { width: CW, align: 'center' });
    }
    rows.forEach((r, idx) => {
      const cells = columns.map(c => { const v = c.get(r); return v == null || v === '' ? '-' : String(v); });
      const hs = cells.map((t, i) => doc.heightOfString(t, { width: colW[i] - 8 }));
      const rh = Math.max(15, ...hs) + 6;
      if (y + rh > H - 34) { doc.addPage(); y = 40; headerRow(); doc.font('Helvetica').fontSize(8); }
      if (idx % 2 === 1) doc.rect(ML, y, CW, rh).fill('#f6f9fc');
      let x = ML;
      columns.forEach((c, i) => { doc.fillColor(c.color ? c.color(r) : INK).font('Helvetica').fontSize(8).text(cells[i], x + 5, y + 4, { width: colW[i] - 8, align: c.align || 'left' }); x += colW[i]; });
      doc.strokeColor(LINE).lineWidth(0.5).moveTo(ML, y + rh).lineTo(ML + CW, y + rh).stroke();
      y += rh;
    });
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fillColor(GRIS).font('Helvetica').fontSize(8).text(DOCPIE + '  ·  ' + rows.length + ' registros', ML, H - 24, { width: CW / 2, lineBreak: false });
      doc.text('Pagina ' + (i + 1) + ' de ' + range.count, ML + CW / 2, H - 24, { width: CW / 2, align: 'right', lineBreak: false });
    }
    doc.end(); await done;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
    res.send(Buffer.concat(chunks));
  }
}
