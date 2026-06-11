import { api } from './api.js';

let current = null;
const listeners = new Set();

export function getBranding() { return current; }
export function onBranding(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Convierte #rrggbb a {r,g,b} y mezcla con blanco/negro
function hex2rgb(h) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h || '');
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}
function rgb2hex({ r, g, b }) { return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
function mix(c, t, p) { return { r: c.r + (t.r - c.r) * p, g: c.g + (t.g - c.g) * p, b: c.b + (t.b - c.b) * p }; }
const WHITE = { r: 255, g: 255, b: 255 }, BLACK = { r: 0, g: 0, b: 0 };

export function applyBranding(b) {
  current = b;
  const root = document.documentElement;
  const prim = hex2rgb(b.color_primario);
  const sec = hex2rgb(b.color_secundario) || (prim && mix(prim, BLACK, 0.2));
  if (prim) {
    root.style.setProperty('--brand-50', rgb2hex(mix(prim, WHITE, 0.92)));
    root.style.setProperty('--brand-100', rgb2hex(mix(prim, WHITE, 0.85)));
    root.style.setProperty('--brand-200', rgb2hex(mix(prim, WHITE, 0.72)));
    root.style.setProperty('--brand-500', rgb2hex(prim));
    root.style.setProperty('--brand-600', rgb2hex(sec ? mix(prim, sec, 0.5) : mix(prim, BLACK, 0.12)));
    root.style.setProperty('--brand-700', rgb2hex(sec || mix(prim, BLACK, 0.25)));
    root.style.setProperty('--brand-900', rgb2hex(mix(sec || prim, BLACK, 0.45)));
    root.style.setProperty('--brand', rgb2hex(sec ? mix(prim, sec, 0.4) : prim));
    root.style.setProperty('--brand-soft', rgb2hex(mix(prim, WHITE, 0.92)));
  }
  // Titulo
  if (b.app_nombre) document.title = b.app_nombre + (b.empresa ? ' - ' + b.empresa : '');
  // theme-color
  const tc = b.theme_color || b.color_secundario || b.color_primario;
  if (tc) { let m = document.querySelector('meta[name="theme-color"]'); if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); } m.content = tc; }
  // favicon
  if (b.icon_path) { let l = document.querySelector('link[rel="icon"]'); if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); } l.href = api.base + b.icon_path; }
  // manifest dinamico (PWA)
  let mf = document.querySelector('link[rel="manifest"]');
  if (!mf) { mf = document.createElement('link'); mf.rel = 'manifest'; document.head.appendChild(mf); }
  mf.href = api.base + '/api/manifest.webmanifest';
  listeners.forEach(fn => { try { fn(b); } catch {} });
}

export async function loadBranding() {
  try { const b = await api.get('/api/branding'); applyBranding(b); return b; }
  catch { return null; }
}
