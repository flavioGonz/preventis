// Importación/exportación masiva de clientes: plantilla Excel + previsualización + commit.
// Patrón de 2 pasos: /preview (valida, no guarda) -> /commit (inserta filas confirmadas).
import ExcelJS from 'exceljs';
import { q } from './db.js';

export const FRECUENCIAS = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'];

// Columnas de la plantilla (el orden define el orden en el Excel).
const COLS = [
  { key: 'nombre', header: 'Nombre *', width: 30, req: true },
  { key: 'direccion', header: 'Dirección', width: 32 },
  { key: 'telefono', header: 'Teléfono', width: 16 },
  { key: 'frecuencia', header: 'Frecuencia', width: 14, list: FRECUENCIAS },
  { key: 'rut', header: 'RUT', width: 16 },
  { key: 'empresa_monitoreo', header: 'Empresa de monitoreo', width: 22 },
  { key: 'nro_abonado', header: 'Nº de abonado', width: 16 },
  { key: 'vip', header: 'VIP', width: 8, list: ['No', 'Sí'] },
  { key: 'notas', header: 'Notas', width: 30 },
  { key: 'contacto_nombre', header: 'Contacto: nombre', width: 22 },
  { key: 'contacto_email', header: 'Contacto: email', width: 26 },
  { key: 'contacto_telefono', header: 'Contacto: teléfono', width: 18 },
  { key: 'contacto_cargo', header: 'Contacto: cargo', width: 18 },
];

const norm = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') v = v.text ?? v.result ?? v.hyperlink ?? v.richText?.map(t => t.text).join('') ?? '';
  return String(v).trim();
};
const lc = (v) => norm(v).toLowerCase();
const isVip = (v) => ['sí', 'si', 'true', '1', 'x', 'yes', 'vip'].includes(lc(v));

// ---------- Plantilla descargable ----------
export async function buildClientesTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Preventis';
  const ws = wb.addWorksheet('Clientes');
  ws.columns = COLS.map(c => ({ header: c.header, key: c.key, width: c.width }));

  const head = ws.getRow(1);
  head.height = 22;
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle' };
  COLS.forEach((c, i) => {
    head.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.req ? 'FFB91C1C' : 'FF1F2937' } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Fila de ejemplo (en gris/itálica, se debe borrar).
  ws.addRow({
    nombre: 'Ej: Supermercado Centro', direccion: 'Av. Italia 1234', telefono: '099123456',
    frecuencia: 'mensual', rut: '210001230011', empresa_monitoreo: 'Central XYZ', nro_abonado: 'A-1024',
    vip: 'No', notas: 'Fila de ejemplo — borrar antes de importar',
    contacto_nombre: 'Juan Pérez', contacto_email: 'juan@cliente.com', contacto_telefono: '099765432', contacto_cargo: 'Encargado',
  });
  ws.getRow(2).font = { italic: true, color: { argb: 'FF9CA3AF' } };

  // Listas desplegables (validación de datos) para columnas cerradas.
  const LAST = 1000;
  COLS.forEach((c, i) => {
    if (!c.list) return;
    const letter = ws.getColumn(i + 1).letter;
    for (let r = 2; r <= LAST; r++) {
      ws.getCell(letter + r).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: ['"' + c.list.join(',') + '"'],
        showErrorMessage: true, errorStyle: 'stop',
        errorTitle: 'Valor inválido', error: 'Elegí un valor de la lista.',
      };
    }
  });

  // Hoja de instrucciones.
  const ins = wb.addWorksheet('Instrucciones');
  ins.getColumn(1).width = 110;
  const lines = [
    'IMPORTACIÓN MASIVA DE CLIENTES — PREVENTIS',
    '',
    '1. Completá una fila por cliente en la hoja "Clientes".',
    '2. La columna "Nombre" es obligatoria (encabezado en rojo). El resto es opcional.',
    '3. Frecuencia: elegí de la lista (mensual, bimestral, trimestral, semestral, anual). Si la dejás vacía, se usa "mensual".',
    '4. VIP: elegí Sí o No.',
    '5. RUT: se usa para detectar clientes repetidos. Si un RUT ya existe en el sistema, esa fila se OMITE (no se duplica).',
    '   Si la fila no tiene RUT, se compara por nombre.',
    '6. Las columnas "Contacto:" cargan un contacto principal del cliente (opcional).',
    '7. Borrá la fila de ejemplo antes de importar.',
    '8. Al importar verás una previsualización (filas OK, con error y duplicadas). Nada se guarda hasta que confirmes.',
  ];
  lines.forEach((t, i) => { const r = ins.addRow([t]); if (i === 0) r.font = { bold: true, size: 14 }; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Lectura de filas ----------
async function readRows(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Clientes') || wb.worksheets[0];
  if (!ws) return [];

  // Mapear encabezados -> key (por nombre); si no se reconoce ninguno, se asume el orden de COLS.
  const idxToKey = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = lc(cell.value).replace(/\s*\*$/, '').trim();
    const found = COLS.find(c => lc(c.header).replace(/\s*\*$/, '').trim() === h);
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
function validateRow(datos, existentes, seenRut, seenNombre) {
  const motivos = [];
  const nombre = norm(datos.nombre);
  if (!nombre) motivos.push('Falta el nombre');

  let frecuencia = lc(datos.frecuencia) || 'mensual';
  if (!FRECUENCIAS.includes(frecuencia)) motivos.push('Frecuencia inválida: "' + norm(datos.frecuencia) + '"');

  const email = norm(datos.contacto_email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) motivos.push('Email de contacto inválido');

  const rut = norm(datos.rut);
  const vip = isVip(datos.vip);

  let estado = motivos.length ? 'error' : 'ok';
  if (estado === 'ok') {
    const rl = lc(rut), nl = lc(nombre);
    if (rl && (existentes.ruts.has(rl) || seenRut.has(rl))) { estado = 'duplicado'; motivos.push('RUT ya existe — se omite'); }
    else if (!rl && (existentes.nombres.has(nl) || seenNombre.has(nl))) { estado = 'duplicado'; motivos.push('Nombre ya existe — se omite'); }
    else { if (rl) seenRut.add(rl); seenNombre.add(nl); }
  }

  const limpio = {
    nombre, direccion: norm(datos.direccion), telefono: norm(datos.telefono), frecuencia, rut,
    empresa_monitoreo: norm(datos.empresa_monitoreo), nro_abonado: norm(datos.nro_abonado), vip, notas: norm(datos.notas),
    contacto_nombre: norm(datos.contacto_nombre), contacto_email: email,
    contacto_telefono: norm(datos.contacto_telefono), contacto_cargo: norm(datos.contacto_cargo),
  };
  return { estado, motivos, datos: limpio };
}

async function getExistentes() {
  const r = await q("SELECT lower(coalesce(rut,'')) rut, lower(coalesce(nombre,'')) nombre FROM clientes WHERE activo");
  const ruts = new Set(), nombres = new Set();
  for (const row of r.rows) { if (row.rut) ruts.add(row.rut); if (row.nombre) nombres.add(row.nombre); }
  return { ruts, nombres };
}

// Previsualización: parsea, valida y detecta duplicados. NO inserta nada.
export async function previewClientesExcel(buffer) {
  const raw = await readRows(buffer);
  const existentes = await getExistentes();
  const seenRut = new Set(), seenNombre = new Set();
  const filas = raw.map(r => ({ fila: r.fila, ...validateRow(r.datos, existentes, seenRut, seenNombre) }));
  const resumen = {
    total: filas.length,
    ok: filas.filter(f => f.estado === 'ok').length,
    error: filas.filter(f => f.estado === 'error').length,
    duplicado: filas.filter(f => f.estado === 'duplicado').length,
  };
  return { columnas: COLS.map(c => ({ key: c.key, header: c.header.replace(/\s*\*$/, ''), req: !!c.req })), filas, resumen };
}

// Commit: re-valida server-side e inserta sólo las filas OK (por fila, sin transacción global).
export async function commitClientesExcel(filasInput) {
  const arr = Array.isArray(filasInput) ? filasInput : [];
  const existentes = await getExistentes();
  const seenRut = new Set(), seenNombre = new Set();
  let creados = 0, omitidos = 0;
  const errores = [];
  for (const item of arr) {
    const v = validateRow(item || {}, existentes, seenRut, seenNombre);
    if (v.estado === 'error') { errores.push({ nombre: norm(item?.nombre) || '(sin nombre)', motivos: v.motivos }); continue; }
    if (v.estado === 'duplicado') { omitidos++; continue; }
    const d = v.datos;
    try {
      const ins = await q(
        `INSERT INTO clientes (nombre,direccion,telefono,frecuencia,rut,empresa_monitoreo,nro_abonado,vip,notas)
         VALUES ($1,$2,$3,$4::frecuencia_visita,$5,$6,$7,$8,$9) RETURNING id`,
        [d.nombre, d.direccion || null, d.telefono || null, d.frecuencia, d.rut || null,
          d.empresa_monitoreo || null, d.nro_abonado || null, d.vip, d.notas || null]
      );
      const cid = ins.rows[0].id;
      // Marcar como existente para que no se dupliquen filas idénticas dentro del mismo lote.
      if (d.rut) existentes.ruts.add(lc(d.rut)); else existentes.nombres.add(lc(d.nombre));
      if (d.contacto_nombre || d.contacto_email || d.contacto_telefono || d.contacto_cargo) {
        await q('INSERT INTO cliente_contactos (cliente_id,nombre,email,telefono,cargo) VALUES ($1,$2,$3,$4,$5)',
          [cid, d.contacto_nombre || null, d.contacto_email || null, d.contacto_telefono || null, d.contacto_cargo || null]);
      }
      creados++;
    } catch (e) {
      errores.push({ nombre: d.nombre, motivos: ['Error al guardar: ' + e.message] });
    }
  }
  return { creados, omitidos, errores };
}
