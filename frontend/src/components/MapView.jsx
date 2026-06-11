import React, { useEffect, useRef } from 'react';

let uid = 0;

const BASES = {
  calles: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { maxZoom: 19, attribution: '&copy; OpenStreetMap' } },
  satelite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opts: { maxZoom: 19, attribution: 'Esri' } },
  oscuro: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', opts: { maxZoom: 20, subdomains: 'abcd', attribution: '&copy; OpenStreetMap, &copy; CARTO' } },
};

// SVG de cada tipo de marcador (forma de pin con icono dentro)
const GLYPH = {
  cli: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h2M9 13h2M9 17h2M13 9h2M13 13h2M13 17h2" />',
  tec: '<path d="M3 12h11l3 4h3v3h-1a2 2 0 1 1-4 0H9a2 2 0 1 1-4 0H3z M14 12V7H3v5" />',
  prov: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.3 7 12 12l8.7-5 M12 22V12" />',
  pin: '<circle cx="12" cy="10" r="3" />',
};

function pinIcon(L, m) {
  const color = m.color || '#1d4ed8';
  const kind = m.kind || 'pin';
  let inner;
  if (kind === 'tec' && m.avatarUrl) {
    inner = `<img src="${m.avatarUrl}" class="mk-av" />`;
  } else {
    const g = GLYPH[kind] || GLYPH.pin;
    inner = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${g}</svg>`;
  }
  const live = m.live ? '<span class="mk-pulse"></span>' : '';
  const html = `<div class="mk-pin ${kind}" style="--mk:${color}">${live}<span class="mk-body" style="background:${color}">${inner}</span></div>`;
  return L.divIcon({ className: 'mk-wrap', html, iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -38] });
}

export default function MapView({ markers = [], lines = [], center, zoom = 14, height = 320, fill = false, baseLayer = 'calles', onMarker, onReady }) {
  const ref = useRef(null);
  const idRef = useRef('map-' + (++uid));
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const mkLayer = useRef(null);
  const lnLayer = useRef(null);
  const fitted = useRef(false);
  const onMarkerRef = useRef(onMarker);
  onMarkerRef.current = onMarker;

  // init una sola vez
  useEffect(() => {
    let cancelled = false; const timers = []; let ro = null;
    const init = () => {
      if (cancelled) return;
      const L = window.L;
      if (!L || !ref.current) { timers.push(setTimeout(init, 200)); return; }
      const map = L.map(ref.current, { scrollWheelZoom: fill, zoomControl: false }).setView(center || [-34.9011, -56.1645], zoom);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const b = BASES[baseLayer] || BASES.calles;
      tileRef.current = L.tileLayer(b.url, b.opts).addTo(map);
      lnLayer.current = L.layerGroup().addTo(map);
      mkLayer.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      paintMarkers(); paintLines();
      if (onReady) onReady(map);
      const inval = () => { try { map.invalidateSize(); } catch {} };
      timers.push(setTimeout(inval, 0), setTimeout(inval, 160), setTimeout(inval, 460));
      try { ro = new ResizeObserver(inval); ro.observe(ref.current); } catch {}
      window.addEventListener('resize', inval); map._inval = inval;
    };
    init();
    return () => {
      cancelled = true; timers.forEach(clearTimeout);
      const map = mapRef.current;
      if (map) { if (map._inval) window.removeEventListener('resize', map._inval); if (ro) ro.disconnect(); if (onReady) onReady(null); try { map.remove(); } catch {} }
      mapRef.current = null;
    };
  }, []);

  // cambiar mapa base sin recrear el mapa
  useEffect(() => {
    const map = mapRef.current, L = window.L; if (!map || !L) return;
    const b = BASES[baseLayer] || BASES.calles;
    if (tileRef.current) map.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(b.url, b.opts).addTo(map);
    tileRef.current.bringToBack();
  }, [baseLayer]);

  function paintMarkers() {
    const L = window.L, map = mapRef.current; if (!L || !map || !mkLayer.current) return;
    mkLayer.current.clearLayers();
    const pts = markers.filter(m => m.lat != null && m.lon != null);
    pts.forEach(m => {
      const mk = L.marker([m.lat, m.lon], { icon: pinIcon(L, m) }).addTo(mkLayer.current);
      const cb = onMarkerRef.current;
      if (cb) {
        const handler = (ev) => { if (ev.originalEvent) { ev.originalEvent.preventDefault(); ev.originalEvent.stopPropagation(); } const oe = ev.originalEvent || {}; cb(m, { x: oe.clientX || 0, y: oe.clientY || 0 }); };
        mk.on('contextmenu', handler); mk.on('click', handler);
      } else if (m.popup) { mk.bindPopup(m.popup); }
    });
    if (!fitted.current && pts.length > 1 && !center) { try { map.fitBounds(L.latLngBounds(pts.map(m => [m.lat, m.lon])).pad(0.25)); fitted.current = true; } catch {} }
  }
  function paintLines() {
    const L = window.L, map = mapRef.current; if (!L || !map || !lnLayer.current) return;
    lnLayer.current.clearLayers();
    (lines || []).forEach(l => {
      if (!l.points || l.points.length < 2) return;
      const pl = L.polyline(l.points, { color: l.color || '#2563eb', weight: l.weight || 4, dashArray: l.dashed ? '7 8' : null, opacity: l.opacity ?? 0.9, className: l.className || '' }).addTo(lnLayer.current);
      if (l.label) pl.bindTooltip(l.label, { sticky: true });
    });
  }
  useEffect(() => { paintMarkers(); }, [JSON.stringify(markers)]);
  useEffect(() => { paintLines(); }, [JSON.stringify(lines)]);

  if (fill) {
    return <div className={'mapfill-inner base-' + baseLayer} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><div ref={ref} id={idRef.current} style={{ position: 'absolute', inset: 0 }} /></div>;
  }
  return <div ref={ref} id={idRef.current} style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }} />;
}
