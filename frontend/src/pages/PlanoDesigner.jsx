import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Loading, Empty } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';

function smoothPath(pts) {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]}`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

const KINDS = {
  cctv: { label: 'Camara CCTV', icon: 'camera', fov: 60, range: 0.26, color: '#2563eb' },
  presencia: { label: 'Sensor de presencia', icon: 'eye', fov: 110, range: 0.16, color: '#15803d' },
  wifi: { label: 'Antena WiFi', icon: 'pin', fov: 360, range: 0.14, color: '#7c3aed' },
  ptp: { label: 'Antena punto a punto', icon: 'arrowRight', fov: 14, range: 0.5, color: '#b45309' },
};

const CABLE = { utp: 'UTP', coaxial: 'Coaxial', fibra: 'Fibra optica', energia: 'Energia', datos: 'Datos', otro: 'Otro' };
function hexA(h, a) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return 'rgba(37,99,235,' + a + ')'; const n = parseInt(m[1], 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
function distToSeg(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy || 1; let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }

export default function PlanoDesigner() {
  const { id } = useParams();
  const nav = useNavigate();
  const [planos, setPlanos] = useState(null);
  const [sel, setSel] = useState(null);
  const [shapes, setShapes] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState('vista');
  const [tool, setTool] = useState('mano');
  const [color, setColor] = useState('#2563eb');
  const [draft, setDraft] = useState(null);
  const [selIdx, setSelIdx] = useState(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [box, setBox] = useState({ w: 1, h: 1 });
  const [aspect, setAspect] = useState(1.5);
  const [equipos, setEquipos] = useState([]);
  const [busq, setBusq] = useState('');
  const [eqOpen, setEqOpen] = useState(false);
  const [sensorKind, setSensorKind] = useState('cctv');
  const [colorOpen, setColorOpen] = useState(false);
  const stageRef = useRef(null);
  const pan = useRef(null);
  const drag = useRef(null);
  const aim = useRef(null);
  const baseW = box.w, baseH = box.w / aspect;

  const selectPlano = (p) => { setSel(p); setShapes(Array.isArray(p.shapes) ? p.shapes : []); setDirty(false); setDraft(null); setSelIdx(null); setView({ scale: 1, tx: 0, ty: 0 }); };
  useEffect(() => {
    api.get('/api/clientes/' + id + '/dsn').then(ps => { setPlanos(ps); if (ps.length) selectPlano(ps[0]); });
    api.get('/api/clientes/' + id + '/equipos').then(setEquipos).catch(() => setEquipos([]));
  }, [id]);
  useEffect(() => {
    if (!stageRef.current) return;
    const ro = new ResizeObserver(() => { const r = stageRef.current.getBoundingClientRect(); setBox({ w: r.width, h: r.height }); });
    ro.observe(stageRef.current); return () => ro.disconnect();
  }, [sel]);
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const h = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [sel, box.w, aspect]);

  const zoomAt = (f, cx, cy) => {
    const el = stageRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = cx == null ? r.width / 2 : cx, py = cy == null ? r.height / 2 : cy;
    setView(v => { const ns = Math.min(8, Math.max(0.3, v.scale * f)); const k = ns / v.scale; return { scale: ns, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k }; });
  };
  const toNorm = (cx, cy) => { const r = stageRef.current.getBoundingClientRect(); return { x: (cx - r.left - view.tx) / (view.scale * baseW), y: (cy - r.top - view.ty) / (view.scale * baseH) }; };

  const subir = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file); fd.append('nombre', file.name.replace(/\.[^.]+$/, ''));
    try { const p = await api.upload('/api/clientes/' + id + '/dsn', fd); toast.ok('Plano subido'); const ps = await api.get('/api/clientes/' + id + '/dsn'); setPlanos(ps); selectPlano(p); setMode('edicion'); }
    catch (err) { toast.err(err.message); }
    e.target.value = '';
  };

  const down = (e) => { const ev = e.touches ? e.touches[0] : e; pan.current = { x: ev.clientX, y: ev.clientY, tx: view.tx, ty: view.ty, moved: false }; };
  const move = (e) => {
    const ev = e.touches ? e.touches[0] : e;
    if (drag.current) { const n = toNorm(ev.clientX, ev.clientY); updIdx(drag.current.idx, { x: Math.min(1, Math.max(0, n.x)), y: Math.min(1, Math.max(0, n.y)) }); drag.current.moved = true; return; }
    if (aim.current) { const n = toNorm(ev.clientX, ev.clientY); const s = shapes[aim.current.idx]; if (s) { const dxp = (n.x - s.x) * baseW, dyp = (n.y - s.y) * baseH; const dir = (Math.atan2(dyp, dxp) * 180 / Math.PI + 360) % 360; const range = Math.min(0.6, Math.max(0.05, Math.hypot(dxp, dyp) / baseW)); updIdx(aim.current.idx, { dir, range }); } return; }
    const p = pan.current; if (!p) return;
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true;
    if ((mode === 'vista' || tool === 'mano') && p.moved) setView(v => ({ ...v, tx: p.tx + dx, ty: p.ty + dy }));
  };
  const up = (e) => {
    if (drag.current || aim.current) { drag.current = null; aim.current = null; setDirty(true); return; }
    const p = pan.current; pan.current = null;
    if (!p || p.moved) return;
    const ev = e.changedTouches ? e.changedTouches[0] : e;
    const n = toNorm(ev.clientX, ev.clientY);
    if (n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) return;
    if (mode !== 'edicion') return;
    if (tool === 'sensor') { const k = KINDS[sensorKind] || KINDS.cctv; const s = { type: 'sensor', kind: sensorKind, x: n.x, y: n.y, dir: 0, fov: k.fov, range: k.range, color: k.color, label: k.label }; setShapes(a => { const na = [...a, s]; setSelIdx(na.length - 1); return na; }); setDirty(true); setTool('select'); }
    else if (tool === 'equipo') { setEqOpen(true); window._pend = n; }
    else if (tool === 'linea' || tool === 'curva') { setDraft(d => { const base = d || { type: 'line', curved: tool === 'curva', color, points: [], tipo: 'utp', longitud: '' }; return { ...base, color, curved: tool === 'curva', points: [...base.points, [n.x, n.y]] }; }); }
    else if (tool === 'select') {
      const px = n.x * baseW, py = n.y * baseH; let best = null, bd = 14;
      shapes.forEach((sh, idx) => { if (sh.type !== 'line') return; for (let k = 0; k < sh.points.length - 1; k++) { const a = sh.points[k], b = sh.points[k + 1]; const d2 = distToSeg(px, py, a[0] * baseW, a[1] * baseH, b[0] * baseW, b[1] * baseH); if (d2 < bd) { bd = d2; best = idx; } } });
      setSelIdx(best);
    }
  };
  const placeEquipo = (eq) => { const n = window._pend || window._pend; const pt = window._pend; setEqOpen(false); setBusq(''); const p = pt; if (!p) return; setShapes(a => { const na = [...a, { type: 'marker', x: p.x, y: p.y, color, equipo_id: eq.id, label: eq.etiqueta || eq.codigo_qr || ('Eq ' + eq.id) }]; return na; }); setDirty(true); setTool('select'); };

  const finalizar = () => { setDraft(d => { if (d && d.points.length >= 2) { setShapes(a => [...a, d]); setDirty(true); } return null; }); };
  const commitDraft = (arr) => (draft && draft.points.length >= 2) ? [...arr, draft] : arr;
  const guardar = async () => {
    const finalShapes = commitDraft(shapes);
    try { await api.put('/api/dsn/' + sel.id, { shapes: finalShapes }); setShapes(finalShapes); setDraft(null); setDirty(false); toast.ok('Plano guardado'); }
    catch (e) { toast.err(e.message); }
  };
  const undo = () => { if (draft) { setDraft(d => d.points.length > 1 ? { ...d, points: d.points.slice(0, -1) } : null); return; } setShapes(a => a.slice(0, -1)); setSelIdx(null); setDirty(true); };
  const delPlano = async () => { if (!confirm('Eliminar este plano?')) return; try { await api.del('/api/dsn/' + sel.id); const ps = await api.get('/api/clientes/' + id + '/dsn'); setPlanos(ps); ps.length ? selectPlano(ps[0]) : setSel(null); } catch (e) { toast.err(e.message); } };
  const updIdx = (i, patch) => setShapes(a => a.map((s, k) => k === i ? { ...s, ...patch } : s));
  const updSel = (patch) => { setShapes(a => a.map((s, i) => i === selIdx ? { ...s, ...patch } : s)); setDirty(true); };
  const delSel = () => { setShapes(a => a.filter((_, i) => i !== selIdx)); setSelIdx(null); setDirty(true); };

  const exportPNG = () => {
    if (!sel) return;
    const img = new Image();
    img.onload = () => {
      const W = img.naturalWidth || 1600, H = img.naturalHeight || 1000;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H);
      const lw = Math.max(2, W * 0.0028);
      const fs = Math.max(12, W * 0.013);
      const label = (x, y, txt, color) => { ctx.font = '700 ' + fs + 'px sans-serif'; const tw = ctx.measureText(txt).width; const px = x - tw / 2 - 7, py = y - fs - 16; ctx.fillStyle = 'rgba(15,23,42,.85)'; const rw = tw + 14, rh = fs + 9, rr = 5; ctx.beginPath(); ctx.moveTo(px + rr, py); ctx.arcTo(px + rw, py, px + rw, py + rh, rr); ctx.arcTo(px + rw, py + rh, px, py + rh, rr); ctx.arcTo(px, py + rh, px, py, rr); ctx.arcTo(px, py, px + rw, py, rr); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; ctx.fillText(txt, px + 7, py + 4.5); };
      const dot = (x, y, color) => { const r = Math.max(5, W * 0.006); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = r * 0.4; ctx.strokeStyle = '#fff'; ctx.stroke(); };
      shapes.filter(s => s.type === 'line').forEach(ln => {
        const pts = ln.points.map(p => [p[0] * W, p[1] * H]); if (!pts.length) return;
        ctx.strokeStyle = ln.color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
        if (ln.curved && pts.length > 2) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2; ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); } }
        else { pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); }
        ctx.stroke();
        if (ln.longitud) { const m = pts[Math.floor(pts.length / 2)] || pts[0]; label(m[0], m[1], ln.longitud + ' m' + (ln.tipo ? ' · ' + (CABLE[ln.tipo] || ln.tipo) : ''), ln.color); }
      });
      shapes.filter(s => s.type === 'sensor').forEach(s => {
        const cx = s.x * W, cy = s.y * H, r = s.range * W;
        ctx.fillStyle = hexA(s.color, 0.2); ctx.strokeStyle = s.color; ctx.lineWidth = lw * 0.6; ctx.beginPath();
        if (s.fov >= 359) { ctx.arc(cx, cy, r, 0, Math.PI * 2); } else { const a0 = (s.dir - s.fov / 2) * Math.PI / 180, a1 = (s.dir + s.fov / 2) * Math.PI / 180; ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath(); }
        ctx.fill(); ctx.stroke(); dot(cx, cy, s.color); if (s.label) label(cx, cy, s.label, s.color);
      });
      shapes.filter(s => s.type === 'marker').forEach(s => { const cx = s.x * W, cy = s.y * H; dot(cx, cy, s.color); if (s.label) label(cx, cy, s.label, s.color); });
      cv.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (sel.nombre || 'plano') + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast.ok('Plano exportado'); });
    };
    img.onerror = () => toast.err('No se pudo cargar la imagen del plano');
    img.src = api.base + sel.path;
  };

  if (planos === null) return <div style={{ padding: 24 }}><Loading /></div>;

  const P = (n) => [n[0] * baseW, n[1] * baseH];
  const scr = (x, y) => ({ left: view.tx + x * baseW * view.scale, top: view.ty + y * baseH * view.scale });
  const conePath = (s) => {
    const c = P([s.x, s.y]); const r = s.range * baseW;
    const a0 = (s.dir - s.fov / 2) * Math.PI / 180, a1 = (s.dir + s.fov / 2) * Math.PI / 180;
    const x0 = c[0] + Math.cos(a0) * r, y0 = c[1] + Math.sin(a0) * r, x1 = c[0] + Math.cos(a1) * r, y1 = c[1] + Math.sin(a1) * r;
    return `M${c[0]} ${c[1]} L${x0} ${y0} A${r} ${r} 0 ${s.fov > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
  };
  const eqFiltrados = busq ? equipos.filter(e => (e.etiqueta || '').toLowerCase().includes(busq.toLowerCase()) || (e.codigo_qr || '').toLowerCase().includes(busq.toLowerCase())).slice(0, 10) : equipos.slice(0, 10);
  const lines = shapes.filter(s => s.type === 'line').concat(draft ? [draft] : []);
  const sensors = shapes.map((s, i) => ({ s, i })).filter(o => o.s.type === 'sensor');
  const markers = shapes.map((s, i) => ({ s, i })).filter(o => o.s.type === 'marker');
  const selShape = selIdx != null ? shapes[selIdx] : null;
  const Tip = (t) => ({ 'data-tip': t, 'aria-label': t });

  return (
    <div className="pdz">
      {!sel ? (
        <div className="pdz-empty">
          <Empty icon="pin" title="Sin planos">Subi un plano para empezar a diseñar.</Empty>
          <label className="btn" style={{ cursor: 'pointer', marginTop: 12 }}><Icon name="upload" size={16} />Subir plano<input type="file" accept="image/*" hidden onChange={subir} /></label>
        </div>
      ) : (
        <div className="pdz-stage" ref={stageRef}
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={() => { pan.current = null; }}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up}
          onDoubleClick={() => mode === 'edicion' && finalizar()}
          style={{ cursor: mode === 'edicion' && tool !== 'mano' ? 'crosshair' : 'grab' }}>
          <div className="pdz-inner" style={{ width: baseW, height: baseH, transformOrigin: '0 0', transform: `translate(${view.tx}px,${view.ty}px) scale(${view.scale})` }}>
            <img src={api.base + sel.path} alt="" draggable={false} onLoad={e => setAspect((e.target.naturalWidth || 3) / (e.target.naturalHeight || 2))} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
            <svg className="pdz-svg" viewBox={`0 0 ${baseW} ${baseH}`} preserveAspectRatio="none">
              {sensors.map(({ s, i }) => s.fov >= 359
                ? <circle key={'s' + i} cx={s.x * baseW} cy={s.y * baseH} r={s.range * baseW} fill={s.color} fillOpacity={selIdx === i ? 0.32 : 0.2} stroke={s.color} strokeOpacity="0.7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                : <path key={'s' + i} d={conePath(s)} fill={s.color} fillOpacity={selIdx === i ? 0.32 : 0.2} stroke={s.color} strokeOpacity="0.7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
              {lines.map((ln, i) => ln.curved
                ? <path key={'l' + i} d={smoothPath(ln.points.map(P))} fill="none" stroke={ln.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                : <polyline key={'l' + i} points={ln.points.map(p => P(p).join(',')).join(' ')} fill="none" stroke={ln.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />)}
            </svg>
          </div>

          {/* marcadores y sensores (tamaño constante, sobre la capa transformada) */}
          {markers.map(({ s, i }) => (
            <div key={'m' + i} className={'pdz-mk' + (selIdx === i ? ' on' : '')} style={{ ...scr(s.x, s.y), background: s.color }}
              onMouseDown={(e) => { if (mode === 'edicion' && tool !== 'linea' && tool !== 'curva') { e.stopPropagation(); drag.current = { idx: i }; setSelIdx(i); } }}
              onTouchStart={(e) => { if (mode === 'edicion' && tool !== 'linea' && tool !== 'curva') { e.stopPropagation(); drag.current = { idx: i }; setSelIdx(i); } }}
              onClick={(e) => { e.stopPropagation(); if (mode === 'edicion') setSelIdx(i); else if (s.equipo_id) nav('/equipos/' + s.equipo_id); }}>
              <Icon name="box" size={11} color="#fff" /><span className="pdz-lbl">{s.label}</span>
            </div>
          ))}
          {sensors.map(({ s, i }) => (
            <div key={'sc' + i} className={'pdz-sensor' + (selIdx === i ? ' on' : '')} style={{ ...scr(s.x, s.y), background: s.color }}
              onMouseDown={(e) => { if (mode === 'edicion' && tool !== 'linea' && tool !== 'curva') { e.stopPropagation(); drag.current = { idx: i }; setSelIdx(i); } }}
              onTouchStart={(e) => { if (mode === 'edicion' && tool !== 'linea' && tool !== 'curva') { e.stopPropagation(); drag.current = { idx: i }; setSelIdx(i); } }}
              onClick={(e) => { e.stopPropagation(); if (mode === 'edicion') setSelIdx(i); }}>
              <Icon name={(KINDS[s.kind] || {}).icon || 'eye'} size={11} color="#fff" /><span className="pdz-lbl">{s.label}</span>
            </div>
          ))}
          {shapes.map((s, i) => (s.type === 'line' && s.longitud && s.points.length) ? (() => { const mid = s.points[Math.floor(s.points.length / 2)] || s.points[0]; return <div key={'cl' + i} className="pdz-clbl" style={{ ...scr(mid[0], mid[1]), color: s.color, borderColor: s.color }} onClick={(e) => { e.stopPropagation(); if (mode === 'edicion') setSelIdx(i); }}>{s.longitud} m{s.tipo ? ' · ' + (CABLE[s.tipo] || s.tipo) : ''}</div>; })() : null)}
          {mode === 'edicion' && selShape && selShape.type === 'sensor' && (() => { const a = selShape.dir * Math.PI / 180; const tnx = selShape.x + Math.cos(a) * selShape.range; const tny = selShape.y + Math.sin(a) * selShape.range * (baseW / baseH); return <div className="pdz-aim" style={scr(tnx, tny)} onMouseDown={(e) => { e.stopPropagation(); aim.current = { idx: selIdx }; }} onTouchStart={(e) => { e.stopPropagation(); aim.current = { idx: selIdx }; }} {...Tip('Arrastra para apuntar y ajustar el alcance')} />; })()}
          {draft && draft.points.map((p, i) => <div key={'d' + i} className="pdz-vtx" style={{ ...scr(p[0], p[1]), borderColor: draft.color }} />)}
        </div>
      )}

      {/* ===== Overlays ===== */}
      <button className="pdz-close" onClick={() => nav('/clientes/' + id)} {...Tip('Cerrar diseñador')}><Icon name="x" size={20} /></button>

      {/* Top-left: planos + subir */}
      <button className="pdz-back" onClick={() => nav('/clientes/' + id)} {...Tip('Volver a la ficha del cliente')}><Icon name="chevronLeft" size={17} />Volver</button>

      {sel && <div className="pdz-top">
        <div className="pdz-planos">
          {planos.map(p => <button key={p.id} className={'pdz-chip' + (sel.id === p.id ? ' on' : '')} onClick={() => selectPlano(p)}>{p.nombre}</button>)}
        </div>
        <label className="pdz-ic" {...Tip('Subir plano')} style={{ cursor: 'pointer' }}><Icon name="upload" size={17} /><input type="file" accept="image/*" hidden onChange={subir} /></label>
      </div>}

      {/* Pill vertical de controles (derecha) */}
      {sel && <div className="pdz-rail" onClick={e => e.stopPropagation()}>
        <div className="pdz-seg">
          <button className={'pdz-segb' + (mode === 'vista' ? ' on' : '')} onClick={() => { setMode('vista'); setTool('mano'); setDraft(null); setSelIdx(null); }} {...Tip('Modo vista')}><Icon name="eye" size={15} /></button>
          <button className={'pdz-segb' + (mode === 'edicion' ? ' on' : '')} onClick={() => setMode('edicion')} {...Tip('Modo edicion')}><Icon name="edit" size={15} /></button>
        </div>
        {mode === 'edicion' && <>
          <div className="pdz-rdiv" />
          <button className={'pdz-ic' + (tool === 'mano' ? ' on' : '')} onClick={() => setTool('mano')} {...Tip('Mover / desplazar')}><Icon name="move" size={16} /></button>
          <button className={'pdz-ic' + (tool === 'select' ? ' on' : '')} onClick={() => setTool('select')} {...Tip('Seleccionar')}><Icon name="search" size={16} /></button>
          <button className={'pdz-ic' + (tool === 'equipo' ? ' on' : '')} onClick={() => setTool('equipo')} {...Tip('Colocar equipo')}><Icon name="box" size={16} /></button>
          <button className={'pdz-ic' + (tool === 'sensor' ? ' on' : '')} onClick={() => setTool('sensor')} {...Tip('Colocar sensor')}><Icon name="eye" size={16} /></button>
          <button className={'pdz-ic' + (tool === 'linea' ? ' on' : '')} onClick={() => { setTool('linea'); setDraft(null); }} {...Tip('Linea recta')}><Icon name="line" size={16} /></button>
          <button className={'pdz-ic' + (tool === 'curva' ? ' on' : '')} onClick={() => { setTool('curva'); setDraft(null); }} {...Tip('Linea curva')}><Icon name="curve" size={16} /></button>
          <div className="pdz-rdiv" />
          <div className="pdz-colorpick">
            <button className="pdz-ic" onClick={() => setColorOpen(o => !o)} {...Tip('Color del trazo')}><span className="pdz-colordot" style={{ background: color }} /></button>
            {colorOpen && <div className="pdz-colorpop">
              {['#2563eb', '#dc2626', '#15803d', '#b45309', '#7c3aed', '#0f172a'].map(c => <button key={c} className={'pdz-col' + (color === c ? ' on' : '')} style={{ background: c }} onClick={() => { setColor(c); setColorOpen(false); }} {...Tip('Color')} />)}
            </div>}
          </div>
        </>}
        <div className="pdz-rdiv" />
        <button className="pdz-ic" onClick={exportPNG} {...Tip('Exportar PNG')}><Icon name="download" size={16} /></button>
      </div>}

      {/* Bottom actions (solo edicion) */}
      {sel && mode === 'edicion' && <div className="pdz-actions">
        {draft && draft.points.length >= 2 && <button className="btn sm" onClick={finalizar} {...Tip('Finalizar linea')}><Icon name="check" size={15} />Finalizar</button>}
        <button className="pdz-ic" onClick={undo} {...Tip('Deshacer')}><Icon name="history" size={16} /></button>
        <button className="pdz-ic" onClick={delPlano} {...Tip('Eliminar plano')}><Icon name="trash" size={16} color="var(--falla)" /></button>
        <button className={'btn sm' + (dirty ? '' : ' ghost')} onClick={guardar} disabled={!dirty} {...Tip('Guardar cambios')}><Icon name="save" size={15} />Guardar</button>
      </div>}

      {/* Panel de propiedades del elemento seleccionado */}
      {sel && mode === 'edicion' && selShape && (selShape.type === 'sensor' || selShape.type === 'marker' || selShape.type === 'line') && (
        <div className="pdz-props">
          <div className="row between" style={{ marginBottom: 10 }}>
            <b style={{ fontSize: 13.5 }}>{selShape.type === 'sensor' ? 'Sensor / camara' : selShape.type === 'line' ? 'Cable / linea' : 'Equipo'}</b>
            <button className="btn ghost icon" onClick={() => setSelIdx(null)} {...Tip('Cerrar')}><Icon name="x" size={15} /></button>
          </div>
          <label className="pdz-field">Etiqueta<input value={selShape.label || ''} onChange={e => updSel({ label: e.target.value })} /></label>
          {selShape.type === 'sensor' && <>
            <label className="pdz-field">Tipo<select value={selShape.kind || 'cctv'} onChange={e => { const k = KINDS[e.target.value]; updSel({ kind: e.target.value, fov: k.fov, range: k.range, color: k.color }); }}>{Object.entries(KINDS).map(([kk, v]) => <option key={kk} value={kk}>{v.label}</option>)}</select></label>
            <label className="pdz-field">Direccion <span>{Math.round(selShape.dir)}°</span><input type="range" min="0" max="359" value={selShape.dir} onChange={e => updSel({ dir: Number(e.target.value) })} /></label>
            <label className="pdz-field">Angulo de vision <span>{Math.round(selShape.fov)}°</span><input type="range" min="15" max="160" value={selShape.fov} onChange={e => updSel({ fov: Number(e.target.value) })} /></label>
            <label className="pdz-field">Alcance <span>{Math.round(selShape.range * 100)}%</span><input type="range" min="5" max="60" value={Math.round(selShape.range * 100)} onChange={e => updSel({ range: Number(e.target.value) / 100 })} /></label>
          </>}
          {selShape.type === 'line' && <>
            <label className="pdz-field">Tipo de cable<select value={selShape.tipo || 'utp'} onChange={e => updSel({ tipo: e.target.value })}>{Object.entries(CABLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="pdz-field">Longitud (m)<input value={selShape.longitud || ''} placeholder="Ej: 25" onChange={e => updSel({ longitud: e.target.value })} /></label>
          </>}
          <div className="pdz-colors" style={{ margin: '6px 0' }}>
            {['#2563eb', '#dc2626', '#15803d', '#b45309', '#7c3aed', '#0f172a'].map(c => <button key={c} className={'pdz-col' + (selShape.color === c ? ' on' : '')} style={{ background: c }} onClick={() => updSel({ color: c })} />)}
          </div>
          <button className="btn sec sm block" onClick={delSel}><Icon name="trash" size={14} />Quitar elemento</button>
        </div>
      )}

      {sel && mode === 'edicion' && tool === 'sensor' && <div className="pdz-kinds">
        <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Tipo a colocar</div>
        {Object.entries(KINDS).map(([k, v]) => <button key={k} className={'pdz-kindb' + (sensorKind === k ? ' on' : '')} onClick={() => setSensorKind(k)}><Icon name={v.icon} size={15} />{v.label}</button>)}
        <div className="subtle" style={{ fontSize: 11.5, marginTop: 6 }}>Toca el plano para colocarlo.</div>
      </div>}

      {/* Buscador de equipos para colocar */}
      {sel && eqOpen && <div className="pdz-eq">
        <div className="row between" style={{ marginBottom: 8 }}><b style={{ fontSize: 13.5 }}>Elegi el equipo a colocar</b><button className="btn ghost icon" onClick={() => setEqOpen(false)}><Icon name="x" size={15} /></button></div>
        <div className="wa-search" style={{ marginBottom: 8 }}><Icon name="search" size={16} /><input autoFocus placeholder="Buscar equipo..." value={busq} onChange={e => setBusq(e.target.value)} /></div>
        <div className="stack" style={{ gap: 4, maxHeight: 240, overflowY: 'auto' }}>
          {eqFiltrados.map(eq => <div key={eq.id} className="p2eqrow" onClick={() => placeEquipo(eq)}><Icon name="box" size={14} /><b>{eq.etiqueta || eq.codigo_qr}</b><span className="subtle" style={{ fontSize: 12 }}>{eq.sistema || ''}</span></div>)}
          {eqFiltrados.length === 0 && <div className="muted" style={{ fontSize: 13, padding: 8 }}>Sin equipos.</div>}
        </div>
      </div>}
    </div>
  );
}
