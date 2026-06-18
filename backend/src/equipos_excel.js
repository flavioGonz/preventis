// Importación masiva de EQUIPOS de un cliente: plantilla Excel + previsualización + commit.
// Mismo criterio que la importación de clientes (clientes_excel.js):
//   plantilla descargable con listas desplegables -> previsualizar (OK/duplicado/error) -> confirmar.
// Particularidades de equipos: no hay campo único; dedup por Etiqueta dentro del cliente.
// Sistema y Tipo de elemento se resuelven por nombre contra los catálogos; si no matchea, se deja vacío.
import ExcelJS from 'exceljs';
import { q } from './db.js';

// Columnas núcleo (orden = orden en el Excel).
const COLS = [
  { key: 'sistema', header: 'Sistema', width: 24, cat: 'sistema' },
  { key: 'direccion', header: 'Dirección', width: 26 },
  { key: 'grupo', header: 'Grupo', width: 18 },
  { key: 'subgrupo', header: 'Subgrupo', width: 18 },
  { key: 'etiqueta', header: 'Etiqueta', width: 20 },
  { key: 'tipo_elemento', header: 'Tipo de elemento', width: 22, cat: 'tipo' },
  { key: 'modelo', header: 'Modelo', width: 20 },
];

const norm = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') v = v.text ?? v.result ?? v.hyperlink ?? v.richText?.map(t => t.text).join('') ?? '';
  return String(v).trim();
};
const lc = (v) => norm(v).toLowerCase();

async function getCatalogos() {
  const sis = (await q('SELECT id, nombre FROM sistemas ORDER BY nombre')).rows;
  const tip = (await q('SELECT id, nombre FROM tipos_elemento ORDER BY nombre')).rows;
  const sisMap = new Map(sis.map(r => [lc(r.nombre), r.id]));
  const tipMap = new Map(tip.map(r => [lc(r.nombre), r.id]));
  return { sis, tip, sisMap, tipMap };
}

// ---------- Plantilla descargable ----------
export async function buildEquiposTemplate() {
  const { sis, tip } = await getCatalogos();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Preventis';
  const ws = wb.addWorksheet('Equipos');
  ws.columns = COLS.map(c => ({ header: c.header, key: c.key, width: c.width }));

  const head = ws.getRow(1);
  head.height = 22;
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle' };
  COLS.forEach((c, i) => { head.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Fila de ejemplo (itálica gris, se debe borrar).
  ws.addRow({
    sistema: sis[0]?.nombre || 'Detección de incendios', direccion: 'Piso 1 - Sector A', grupo: 'Lazo 1',
    subgrupo: 'Zona 3', etiqueta: 'D-101', tipo_elemento: tip[0]?.nombre || 'Detector de humo', modelo: 'XYZ-100',
  });
  ws.getRow(2).font = { italic: true, color: { argb: 'FF9CA3AF' } };

  // Hoja oculta con las listas de catálogos (referenciadas por las validaciones).
  const lst = wb.addWorksheet('Listas', { state: 'veryHidden' });
  sis.forEach((r, i) => { lst.getCell('A' + (i + 1)).value = r.nombre; });
  tip.forEach((r, i) => { lst.getCell('B' + (i + 1)).value = r.nombre; });
  const sisRange = sis.length ? 'Listas!$A$1:$A$' + sis.length : null;
  const tipRange = tip.length ? 'Listas!$B$1:$B$' + tip.length : null;

  const LAST = 2000;
  COLS.forEach((c, i) => {
    const range = c.cat === 'sistema' ? sisRange : c.cat === 'tipo' ? tipRange : null;
    if (!range) return;
    const letter = ws.getColumn(i + 1).letter;
    for (let r = 2; r <= LAST; r++) {
      ws.getCell(letter + r).dataValidation = {
        type: 'list', allowBlank: true, formulae: [range],
        showErrorMessage: false, // permite escribir un valor fuera de lista (se intenta resolver por nombre)
      };
    }
  });

  // Instrucciones.
  const ins = wb.addWorksheet('Instrucciones');
  ins.getColumn(1).width = 110;
  const lines = [
    'IMPORTACIÓN MASIVA DE EQUIPOS — PREVENTIS',
    '',
    '1. Completá una fila por equipo en la hoja "Equipos". Todos los campos son opcionales.',
    '2. Sistema y Tipo de elemento: elegí de la lista desplegable (vienen de los catálogos del sistema).',
    '   Si escribís un valor que no existe en el catálogo, el equipo se importa igual pero con ese campo vacío.',
    '3. Etiqueta: se usa para detectar repetidos. Si ya existe un equipo con esa Etiqueta en este cliente, la fila se OMITE.',
    '   Las filas sin Etiqueta siempre se crean.',
    '4. El código QR de cada equipo se genera automáticamente al importar.',
    '5. Borrá la fila de ejemplo antes de importar.',
    '6. Al importar verás una previsualización (a crear / duplicados). Nada se guarda hasta que confirmes.',
  ];
  lines.forEach((t, i) => { const r = ins.addRow([t]); if (i === 0) r.font = { bold: true, size: 14 }; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Lectura de filas ----------
async function readRows(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Equipos') || wb.worksheets[0];
  if (!ws) return [];

  const idxToKey = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = lc(cell.value).trim();
    const found = COLS.find(c => lc(c.header).trim() === h);
    if (found) idxToKey[col] = found.key;
  });
  const keyToIdx = {};
  Object.keys(idxToKey).forEach(col => { keyToIdx[idxToKey[col]] = Number(col); });
  const hasHeaders = Object.keys(idxToKey).length > 0;

  const out = [];
  ws.eachRow((row, rn) => {
    if (rn === 1) return;
    const datos = {};
    let any = false;
    COLS.forEach((c, i) => {
      const idx = hasHeaders ? keyToIdx[c.key] : (i + 1);
      const val = idx ? norm(row.getCell(idx).value) : '';
      datos[c.key] = val;
      if (val) any = true;
    });
    if (any) out.push({ fila: rn, datos });
  });
  return out;
}

// ---------- Validación + clasificación ----------
function validateRow(datos, cat, existentesEtiq, seenEtiq) {
  const motivos = [];
  const sistema = norm(datos.sistema);
  const tipo = norm(datos.tipo_elemento);
  const etiqueta = norm(datos.etiqueta);

  let sistema_id = null, tipo_elemento_id = null;
  if (sistema) {
    sistema_id = cat.sisMap.get(lc(sistema)) || null;
    if (!sistema_id) motivos.push('Sistema "' + sistema + '" no está en el catálogo — se deja vacío');
  }
  if (tipo) {
    tipo_elemento_id = cat.tipMap.get(lc(tipo)) || null;
    if (!tipo_elemento_id) motivos.push('Tipo "' + tipo + '" no está en el catálogo — se deja vacío');
  }

  let estado = 'ok';
  if (etiqueta) {
    const el = lc(etiqueta);
    if (existentesEtiq.has(el) || seenEtiq.has(el)) { estado = 'duplicado'; motivos.push('Ya existe un equipo con esa etiqueta — se omite'); }
    else seenEtiq.add(el);
  }

  const limpio = {
    sistema, tipo_elemento: tipo, sistema_id, tipo_elemento_id,
    direccion: norm(datos.direccion), grupo: norm(datos.grupo), subgrupo: norm(datos.subgrupo),
    etiqueta, modelo: norm(datos.modelo),
  };
  return { estado, motivos, datos: limpio };
}

async function getEtiquetasCliente(clienteId) {
  const r = await q("SELECT lower(etiqueta) e FROM equipos WHERE cliente_id=$1 AND activo AND etiqueta IS NOT NULL AND etiqueta<>''", [clienteId]);
  return new Set(r.rows.map(x => x.e));
}

// Previsualización: parsea, resuelve catálogos, detecta duplicados por etiqueta. NO inserta.
export async function previewEquiposExcel(clienteId, buffer) {
  const raw = await readRows(buffer);
  const cat = await getCatalogos();
  const existentesEtiq = await getEtiquetasCliente(clienteId);
  const seenEtiq = new Set();
  const filas = raw.map(r => ({ fila: r.fila, ...validateRow(r.datos, cat, existentesEtiq, seenEtiq) }));
  const resumen = {
    total: filas.length,
    ok: filas.filter(f => f.estado === 'ok').length,
    error: filas.filter(f => f.estado === 'error').length,
    duplicado: filas.filter(f => f.estado === 'duplicado').length,
  };
  return { columnas: COLS.map(c => ({ key: c.key, header: c.header })), filas, resumen };
}

// Commit: re-valida server-side e inserta sólo las filas OK; genera codigo_qr (EQ-######).
export async function commitEquiposExcel(clienteId, filasInput) {
  const arr = Array.isArray(filasInput) ? filasInput : [];
  const cat = await getCatalogos();
  const existentesEtiq = await getEtiquetasCliente(clienteId);
  const seenEtiq = new Set();
  let creados = 0, omitidos = 0;
  const errores = [];
  for (const item of arr) {
    const v = validateRow(item || {}, cat, existentesEtiq, seenEtiq);
    if (v.estado === 'error') { errores.push({ etiqueta: norm(item?.etiqueta) || '(sin etiqueta)', motivos: v.motivos }); continue; }
    if (v.estado === 'duplicado') { omitidos++; continue; }
    const d = v.datos;
    try {
      const ins = await q(
        `INSERT INTO equipos (cliente_id,sistema_id,direccion,grupo,subgrupo,etiqueta,tipo_elemento_id,modelo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [clienteId, d.sistema_id || null, d.direccion || null, d.grupo || null, d.subgrupo || null,
          d.etiqueta || null, d.tipo_elemento_id || null, d.modelo || null]
      );
      const eqId = ins.rows[0].id;
      await q('UPDATE equipos SET codigo_qr=$1 WHERE id=$2', ['EQ-' + String(eqId).padStart(6, '0'), eqId]);
      if (d.etiqueta) existentesEtiq.add(lc(d.etiqueta));
      creados++;
    } catch (e) {
      errores.push({ etiqueta: d.etiqueta || '(sin etiqueta)', motivos: ['Error al guardar: ' + e.message] });
    }
  }
  return { creados, omitidos, errores };
}
