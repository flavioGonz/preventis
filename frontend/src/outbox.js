// Cola de acciones offline (IndexedDB). Encola firma/prueba/estado cuando no hay red
// y las reenvia al reconectar. Las lecturas se cachean via service worker.
import { getToken } from './auth.js';

const DBNAME = 'preventis', STORE = 'outbox';
const BASE = import.meta.env.VITE_API_BASE || '';

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBNAME, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function store(mode) { const d = await openDB(); return d.transaction(STORE, mode).objectStore(STORE); }

export async function getAll() {
  const s = await store('readonly');
  return new Promise((res, rej) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
}
async function add(op) {
  const s = await store('readwrite');
  return new Promise((res, rej) => { const r = s.add({ op, ts: Date.now() }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function del(id) {
  const s = await store('readwrite');
  return new Promise((res) => { const r = s.delete(id); r.onsuccess = () => res(); r.onerror = () => res(); });
}
export async function count() { return (await getAll()).length; }

const OP_LABEL = { estado: 'Cambio de estado', firma: 'Firma del cliente', prueba: 'Prueba de equipo', archivo: 'Fotos / adjuntos' };
export async function getPendientes() {
  const items = await getAll();
  return items.map(it => ({ id: it.id, ts: it.ts, tipo: it.op.type, label: OP_LABEL[it.op.type] || it.op.type, visitaId: it.op.visitaId }));
}

const listeners = new Set();
export function subscribe(cb) { listeners.add(cb); count().then(cb).catch(() => {}); return () => listeners.delete(cb); }
async function notify() { let c = 0; try { c = await count(); } catch {} listeners.forEach(f => f(c)); }

async function call(method, url, body, isForm) {
  const opts = { method, headers: {} };
  const t = getToken(); if (t) opts.headers['Authorization'] = 'Bearer ' + t;
  if (body && !isForm) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (isForm) opts.body = body;
  const r = await fetch(BASE + url, opts);
  if (!r.ok) { let m = r.statusText; try { const j = await r.json(); m = j.error || m; } catch {} const e = new Error(m); e.http = r.status; throw e; }
  const ct = r.headers.get('content-type') || ''; return ct.includes('json') ? r.json() : r;
}
function dataURLtoBlob(d) {
  const [h, b] = d.split(','); const mime = (h.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: mime });
}

async function execute(op) {
  if (op.type === 'estado') return call('POST', '/api/visitas/' + op.visitaId + '/' + op.accion, { lat: op.lat, lon: op.lon });
  if (op.type === 'firma') return call('POST', '/api/visitas/' + op.visitaId + '/firma', { dataUrl: op.dataUrl, firmante_nombre: op.firmante_nombre, firmante_doc: op.firmante_doc, lat: op.lat, lon: op.lon });
  if (op.type === 'archivo') {
    const fd = new FormData();
    (op.files || []).forEach((d, i) => fd.append('files', dataURLtoBlob(d), (op.nombres && op.nombres[i]) || ('archivo' + i + '.jpg')));
    fd.append('tipo', op.tipo || 'foto');
    return call('POST', '/api/visitas/' + op.visitaId + '/archivos', fd, true);
  }
  if (op.type === 'prueba') {
    const p = await call('POST', '/api/visitas/' + op.visitaId + '/pruebas', { equipo_id: op.equipo_id, estado_id: op.estado_id, comentarios: op.comentarios, lat: op.lat, lon: op.lon });
    if (op.fotos && op.fotos.length) {
      const fd = new FormData();
      op.fotos.forEach((d, i) => fd.append('files', dataURLtoBlob(d), 'foto' + i + '.jpg'));
      await call('POST', '/api/pruebas/' + p.id + '/fotos', fd, true);
    }
    return p;
  }
  throw new Error('op desconocida');
}
function isNet(e) { return (e instanceof TypeError) || e.message === 'Failed to fetch' || !navigator.onLine; }

// Intenta online; si no hay red, encola. Devuelve {queued:true} si quedo en cola.
export async function trySave(op) {
  try { const result = await execute(op); return { ok: true, result }; }
  catch (e) { if (isNet(e)) { await add(op); notify(); return { ok: true, queued: true }; } throw e; }
}

let flushing = false;
export async function flush() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  let synced = 0;
  try {
    const items = await getAll();
    for (const it of items) {
      try { await execute(it.op); await del(it.id); synced++; }
      catch (e) { if (isNet(e)) break; else { await del(it.id); } } // descarta op invalida (no-red)
    }
  } finally { flushing = false; notify(); if (synced) window.dispatchEvent(new CustomEvent('app-synced')); }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flush());
}
