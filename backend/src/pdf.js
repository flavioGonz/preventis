import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { q } from './db.js';

// ===== Paleta Plano Maestro =====
const NAVY = '#0f2742', NAVY2 = '#13325a', BLUE = '#2563eb', SKY = '#9db8d8',
      INK = '#0f172a', GRIS = '#64748b', LINE = '#e3e8ef', SOFT = '#eef3fb', RED = '#dc2626', OK = '#15803d';

function localPath(uploadDir, relUrl) {
  if (!relUrl) return null;
  const p = path.join(uploadDir, path.basename(relUrl));
  return fs.existsSync(p) ? p : null;
}
function logoPath(brandPath, uploadDir) {
  if (brandPath && uploadDir) {
    const p = path.join(uploadDir, path.basename(brandPath));
    if (fs.existsSync(p)) return p;
  }
  for (const p of ['/opt/preventis/frontend/public/logo.png', '/opt/preventis/frontend/dist/logo.png', '/opt/preventis/frontend/public/logo_es.png']) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}
async function getBrand() {
  try { const r = (await q("SELECT valor FROM app_config WHERE clave='branding'")).rows[0]; return r?.valor || {}; }
  catch { return {}; }
}
const fdate = (d) => d ? new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
const pad = (n, l = 4) => String(n).padStart(l, '0');

export async function buildInformePDF(visitaId, uploadDir) {
  const v = (await q(`
    SELECT v.*, COALESCE((SELECT string_agg(t2.nombre, ', ' ORDER BY t2.nombre) FROM visita_tecnicos vt JOIN tecnicos t2 ON t2.id=vt.tecnico_id WHERE vt.visita_id=v.id), t.nombre) AS tecnico,
      c.nombre AS cliente, c.direccion, c.telefono, c.frecuencia
    FROM visitas v LEFT JOIN tecnicos t ON t.id=v.tecnico_id LEFT JOIN clientes c ON c.id=v.cliente_id
    WHERE v.id=$1`, [visitaId])).rows[0];
  if (!v) throw new Error('Visita no encontrada');
  const brand = await getBrand();
  const EMPRESA = (brand.pdf_empresa || brand.empresa || 'IES');
  const MANT = v.tipo === 'correctiva' ? 'Mantenimiento correctivo' : 'Mantenimiento preventivo';
  let PIE = (brand.pdf_pie || (EMPRESA + ' \u00b7 ' + MANT));
  PIE = PIE.replace(/mantenimiento\s+(preventivo|correctivo)/i, MANT);
  const DOCPIE = (brand.pdf_doc_pie || brand.app_nombre || 'Preventis');
  const pruebas = (await q(`
    SELECT p.*, e.etiqueta, e.direccion, e.grupo, e.subgrupo, e.modelo,
           s.nombre AS sistema, te.nombre AS tipo_elemento, est.nombre AS estado, est.es_falla
    FROM pruebas p JOIN equipos e ON e.id=p.equipo_id
    LEFT JOIN sistemas s ON s.id=e.sistema_id LEFT JOIN tipos_elemento te ON te.id=e.tipo_elemento_id
    LEFT JOIN estados_equipo est ON est.id=p.estado_id
    WHERE p.visita_id=$1 ORDER BY s.nombre NULLS LAST, te.nombre NULLS LAST, e.etiqueta`, [visitaId])).rows;
  const fotosVisita = (await q(`SELECT * FROM visita_archivos WHERE visita_id=$1 AND tipo='foto' ORDER BY id`, [visitaId])).rows;

  const doc = new PDFDocument({ size: 'A4', margin: 46, bufferPages: true });
  const chunks = []; doc.on('data', c => chunks.push(c));
  const done = new Promise(r => doc.on('end', r));
  const W = doc.page.width, H = doc.page.height, ML = 46, CW = W - ML * 2;
  const logo = logoPath(brand.pdf_logo_path || brand.logo_path, uploadDir);
  const enFalla = pruebas.filter(p => p.es_falla).length;
  const C = (s) => s.toUpperCase();

  // ============================ PORTADA ============================
  doc.rect(0, 0, W, H).fill(NAVY);
  // Retícula de plano (muy sutil)
  doc.save().opacity(0.06).lineWidth(0.5).strokeColor('#ffffff');
  for (let x = 0; x <= W; x += 26) doc.moveTo(x, 0).lineTo(x, H).stroke();
  for (let y = 0; y <= H; y += 26) doc.moveTo(0, y).lineTo(W, y).stroke();
  doc.restore();
  // Marco fino
  doc.save().opacity(0.28).lineWidth(1).strokeColor(SKY).rect(28, 28, W - 56, H - 56).stroke().restore();

  // Cabecera de portada
  doc.fillColor(SKY).font('Courier-Bold').fontSize(9).text(C('Informe tecnico'), 46, 50, { characterSpacing: 3 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text(EMPRESA, W - 130, 48, { width: 84, align: 'right' });
  doc.fillColor(SKY).font('Courier').fontSize(7).text(C('Ing. en seguridad'), W - 150, 60, { width: 104, align: 'right', characterSpacing: 1 });

  // Sello circular tipo instrumento
  const cx = W / 2, cy = 250, R = 96;
  doc.save();
  doc.opacity(0.5).lineWidth(1).strokeColor(SKY).circle(cx, cy, R).stroke();
  doc.opacity(0.32).circle(cx, cy, R - 9).stroke();
  // marcas radiales
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const long = i % 6 === 0;
    const r0 = R - (long ? 17 : 11), r1 = R - 2;
    doc.opacity(long ? 0.6 : 0.3).lineWidth(long ? 1.1 : 0.6)
      .moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
      .lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1).stroke();
  }
  doc.restore();
  // disco blanco + logo
  doc.circle(cx, cy, 60).fill('#ffffff');
  if (logo) { try { doc.image(logo, cx - 50, cy - 30, { fit: [100, 60], align: 'center', valign: 'center' }); } catch {} }

  // Título
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(31);
  doc.text('INFORME DE', 0, 404, { width: W, align: 'center', characterSpacing: 1 });
  doc.text('MANTENIMIENTO', 0, 436, { width: W, align: 'center', characterSpacing: 1 });

  // Hairline con rombo
  const ly = 500;
  doc.save().opacity(0.5).lineWidth(0.8).strokeColor(SKY)
    .moveTo(cx - 90, ly).lineTo(cx - 8, ly).stroke()
    .moveTo(cx + 8, ly).lineTo(cx + 90, ly).stroke().restore();
  doc.save().translate(cx, ly).rotate(45).rect(-4, -4, 8, 8).fill(BLUE).restore();

  // Cliente
  doc.fillColor(SKY).font('Courier').fontSize(8).text(C('Cliente'), 0, ly + 22, { width: W, align: 'center', characterSpacing: 3 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(v.cliente || '-', ML, ly + 36, { width: CW, align: 'center' });
  doc.fillColor(SKY).font('Helvetica').fontSize(11)
    .text(fdate(v.fecha) + '     ·     ' + (v.tecnico || 'Sin tecnico'), 0, ly + 66, { width: W, align: 'center' });

  // Marcadores de referencia inferiores (clinicos)
  const refs = [['REF', 'V-' + pad(visitaId, 5)]];
  const by = H - 92, seg = CW / refs.length;
  refs.forEach(([k, val], i) => {
    const x = ML + seg * i;
    if (i > 0) doc.save().opacity(0.3).lineWidth(0.7).strokeColor(SKY).moveTo(x, by + 2).lineTo(x, by + 30).stroke().restore();
    doc.fillColor(SKY).font('Courier').fontSize(7).text(C(k), x + 14, by, { characterSpacing: 2 });
    doc.fillColor('#ffffff').font('Courier-Bold').fontSize(13).text(val, x + 14, by + 11);
  });
  doc.page.margins.bottom = 0;
  doc.save().opacity(0.4).fillColor(SKY).font('Courier').fontSize(7)
    .text(C('Documento generado ' + new Date().toLocaleDateString('es-UY') + '  \u00b7  ' + DOCPIE), 46, H - 44, { characterSpacing: 1, lineBreak: false }).restore();

  // ============================ DETALLE ============================
  let secN = 0;
  const runningHeader = () => {
    doc.fillColor(GRIS).font('Courier').fontSize(7.5)
      .text(C(PIE), ML, 30, { characterSpacing: 1, lineBreak: false });
    doc.text(C((v.cliente || '') + '  ·  ' + (v.fecha ? new Date(v.fecha).toLocaleDateString('es-UY') : '')), W / 2, 30, { width: CW / 2, align: 'right', lineBreak: false, characterSpacing: 1 });
    doc.strokeColor(LINE).lineWidth(0.8).moveTo(ML, 44).lineTo(W - ML, 44).stroke();
    doc.y = 64;
  };
  const seccion = (titulo, opts = {}) => {
    if (doc.y > H - 110) { doc.addPage(); runningHeader(); }
    const y = doc.y;
    let x = ML;
    if (!opts.sinNumero) {
      secN++;
      doc.fillColor(BLUE).font('Courier-Bold').fontSize(13).text(pad(secN, 2), ML, y + 4, { lineBreak: false });
      x = ML + 30;
    }
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(C(titulo), x, y + 4);
    doc.strokeColor(LINE).lineWidth(0.8).moveTo(ML, y + 28).lineTo(W - ML, y + 28).stroke();
    doc.y = y + 40;
  };
  // Convierte el HTML del editor enriquecido a texto plano legible para el PDF.
  const htmlToText = (h) => {
    if (h == null) return '';
    let s = String(h)
      .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
      .replace(/<\s*li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0?39;|&#x27;/gi, "'");
    return s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  };
  const parrafo = (txt) => { const t = htmlToText(txt); doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(t || 'Sin observaciones.', ML, doc.y, { width: CW, lineGap: 2 }); doc.moveDown(1); };

  doc.addPage(); runningHeader();

  // Datos de la visita (par etiqueta-valor con hairlines)
  seccion('Datos de la visita');
  const meta = [['Cliente', v.cliente || '-'], ['Direccion', v.direccion || '-'], ['Telefono', v.telefono || '-'],
                ['Fecha', fdate(v.fecha)], ['Tecnico', v.tecnico || '-'], ['Mantenimiento', v.tipo === 'correctiva' ? 'Correctivo' : 'Preventivo']];
  let yy = doc.y;
  meta.forEach(([k, val], i) => {
    const col = i % 2, x = ML + col * (CW / 2);
    if (col === 0) yy = doc.y;
    doc.fillColor(GRIS).font('Courier').fontSize(7.5).text(C(k), x, yy, { characterSpacing: 1.5 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11.5).text(val, x, yy + 11, { width: CW / 2 - 16, lineBreak: false, ellipsis: true });
    doc.save().strokeColor(LINE).lineWidth(0.7).moveTo(x, yy + 30).lineTo(x + CW / 2 - 18, yy + 30).stroke().restore();
    if (col === 1) doc.y = yy + 42; else doc.y = yy;
  });
  doc.moveDown(1.2);

  seccion('Situacion y acciones');
  const sub = (t, txt) => { doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9.5).text(C(t), ML, doc.y, { characterSpacing: 1 }); doc.moveDown(0.25); parrafo(txt); };
  sub('Situacion inicial', v.situacion_inicial);
  sub('Acciones tomadas', v.acciones);
  sub('Situacion final', v.situacion_final);

  // Tabla de equipos (sobria) - siempre arranca en pagina nueva
  doc.addPage(); runningHeader();
  seccion('Equipos probados');
  const cols = [{ t: 'Etiqueta', w: 118, mono: true }, { t: 'Tipo', w: 104 }, { t: 'Estado', w: 86 }, { t: 'Comentarios', w: CW - 118 - 104 - 86 }];
  const fila = (vals, o = {}) => {
    // Altura dinamica: la fila se expande para que ningun dato quede cortado (hasta ~4 lineas)
    let h;
    if (o.header) h = 21;
    else {
      const hs = cols.map((c, i) => {
        doc.font(c.mono ? 'Courier' : 'Helvetica').fontSize(8.6);
        return doc.heightOfString(String(vals[i] ?? ''), { width: c.w - 14, lineGap: 1 });
      });
      h = Math.max(19, Math.min(50, Math.max(...hs) + 10));
    }
    // Salto de pagina usando la altura real de la fila (evita cortes al pie)
    if (!o.header && doc.y + h > H - 64) { doc.addPage(); runningHeader(); fila(cols.map(c => c.t), { header: true }); }
    let x = ML; const y = doc.y;
    if (o.header) doc.rect(ML, y, CW, h).fill(NAVY);
    else if (o.zebra) doc.rect(ML, y, CW, h).fill('#f6f8fb');
    if (o.falla) doc.rect(ML, y, 2.5, h).fill(RED);
    doc.fillColor(o.header ? '#fff' : INK);
    cols.forEach((c, i) => {
      const isEstado = !o.header && i === 2 && o.falla;
      doc.fillColor(o.header ? '#fff' : (isEstado ? RED : INK));
      doc.font(o.header ? 'Courier-Bold' : (c.mono ? 'Courier' : 'Helvetica')).fontSize(o.header ? 8 : 8.6);
      doc.text(String(vals[i] ?? ''), x + 7, y + (o.header ? 6.5 : 5), { width: c.w - 14, height: o.header ? h : h - 7, ellipsis: true, lineGap: 1 });
      x += c.w;
    });
    doc.save().strokeColor(o.header ? NAVY : LINE).lineWidth(0.6).moveTo(ML, y + h).lineTo(W - ML, y + h).stroke().restore();
    doc.y = y + h;
  };
  // Una tabla por sistema (Incendio, CCTV, Redes...): el cliente ve por separado que se reviso de cada uno.
  const grupos = [];
  for (const p of pruebas) {
    const nom = p.sistema || 'Sin sistema asignado';
    let g = grupos.find(x => x.nombre === nom);
    if (!g) { g = { nombre: nom, items: [] }; grupos.push(g); }
    g.items.push(p);
  }
  const tituloSistema = (nom) => {
    // Si no entra el titulo + encabezado + una fila, arranca en pagina nueva (no deja titulos huerfanos).
    if (doc.y + 76 > H - 64) { doc.addPage(); runningHeader(); }
    doc.moveDown(0.7);
    const y = doc.y;
    doc.rect(ML, y, 3, 13).fill(BLUE);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.5).text(C(nom), ML + 9, y + 0.5, { characterSpacing: 0.6 });
    doc.y = y + 18;
  };
  if (!pruebas.length) { doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(GRIS).text('Sin pruebas registradas en esta visita.', ML + 7, doc.y + 6); doc.y += 24; }
  grupos.forEach(g => {
    tituloSistema(g.nombre);
    fila(cols.map(c => c.t), { header: true });
    g.items.forEach((p, i) => {
      fila([p.etiqueta, p.tipo_elemento, p.estado, p.comentarios], { falla: p.es_falla, zebra: i % 2 === 1 });
    });
  });
  // Totales (linea sobria)
  doc.moveDown(0.5);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text('Total equipos probados: ' + pruebas.length, ML, doc.y, { continued: true });
  doc.fillColor(enFalla ? RED : GRIS).text('      En falla: ' + enFalla);
  doc.fillColor(INK);

  // Conformidad anclada al pie de la pagina
  const confH = 150;
  if (doc.y > H - 40 - confH) { doc.addPage(); runningHeader(); }
  doc.y = H - 40 - confH;
  seccion('Conformidad del cliente', { sinNumero: true });
  const fy = doc.y + 10;
  const firma = localPath(uploadDir, v.firma_path);
  if (firma) { try { doc.image(firma, ML, fy, { fit: [200, 60], align: 'left', valign: 'top' }); } catch {} }
  doc.strokeColor('#94a3b8').lineWidth(0.8).moveTo(ML, fy + 70).lineTo(ML + 250, fy + 70).stroke();
  doc.fillColor(GRIS).font('Courier').fontSize(7.5).text(C('Firma del cliente'), ML, fy + 76, { characterSpacing: 1, lineBreak: false });
  if (v.firmante_nombre) {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(v.firmante_nombre, ML, fy + 88, { lineBreak: false });
    if (v.firmante_doc) doc.fillColor(GRIS).font('Helvetica').fontSize(8.5).text('Doc.: ' + v.firmante_doc, ML, fy + 101, { lineBreak: false });
  }

  // ============================ PIE ============================
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    doc.strokeColor(LINE).lineWidth(0.8).moveTo(ML, H - 34).lineTo(W - ML, H - 34).stroke();
    doc.fillColor(GRIS).font('Courier').fontSize(7.5)
      .text(C(DOCPIE + ' \u00b7 V-' + pad(visitaId, 5)), ML, H - 26, { lineBreak: false, characterSpacing: 1 });
    doc.text(C('Pagina ' + (i + 1) + ' / ' + range.count), W - ML - 120, H - 26, { width: 120, align: 'right', lineBreak: false, characterSpacing: 1 });
  }

  doc.flushPages(); doc.end(); await done;
  return Buffer.concat(chunks);
}
