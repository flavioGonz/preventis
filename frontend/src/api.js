import { getToken, clearSession } from './auth.js';

const BASE = import.meta.env.VITE_API_BASE || '';

async function req(method, url, body, isForm) {
  const opts = { method, headers: {} };
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body && !isForm) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (isForm) opts.body = body;
  const r = await fetch(BASE + url, opts);
  if (r.status === 401) {
    clearSession();
    window.dispatchEvent(new CustomEvent('app-logout'));
    throw new Error('Sesion expirada, inicia sesion de nuevo');
  }
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : r;
}

// URL de archivo con token en query (para <a href> y <img src>, que no mandan headers)
function fileUrl(path) {
  const t = getToken();
  if (!t) return BASE + path;
  return BASE + path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t);
}

export const api = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b),
  put: (u, b) => req('PUT', u, b),
  del: (u) => req('DELETE', u),
  upload: (u, formData) => req('POST', u, formData, true),
  base: BASE,
  fileUrl,
};
