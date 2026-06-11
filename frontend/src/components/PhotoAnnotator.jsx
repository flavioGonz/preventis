import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';

// Editor para marcar fallas sobre una foto: flecha, circulo, trazo libre.
// Recibe un File/Blob, devuelve un dataURL JPEG con las marcas aplicadas.
const COLORS = ['#dc2626', '#f59e0b', '#16a34a', '#2563eb', '#ffffff'];
const TOOLS = [['flecha', 'Flecha', 'arrowRight'], ['circulo', 'Circulo', 'alert'], ['libre', 'Lapiz', 'pen']];

export default function PhotoAnnotator({ file, onSave, onCancel }) {
  const wrapRef = useRef(null);
  const baseRef = useRef(null);  // imagen base (canvas)
  const drawRef = useRef(null);  // capa de dibujo (canvas)
  const imgRef = useRef(null);
  const [tool, setTool] = useState('flecha');
  const [color, setColor] = useState('#dc2626');
  const [shapes, setShapes] = useState([]);
  const drawing = useRef(null);

  // Cargar imagen y dimensionar canvas al ancho disponible
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const maxW = Math.min(wrapRef.current?.clientWidth || 640, 900);
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      [baseRef.current, drawRef.current].forEach(cv => { cv.width = w; cv.height = h; cv.style.width = w + 'px'; cv.style.height = h + 'px'; });
      const bctx = baseRef.current.getContext('2d');
      bctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      redraw([]);
    };
    img.src = url;
  }, [file]);

  const redraw = (sh) => {
    const cv = drawRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    sh.forEach(s => paint(ctx, s));
  };
  useEffect(() => { redraw(shapes); }, [shapes]);

  const paint = (ctx, s) => {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineWidth = Math.max(3, Math.round((drawRef.current?.width || 600) / 160));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.type === 'libre') {
      ctx.beginPath(); s.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    } else if (s.type === 'circulo') {
      const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
      ctx.beginPath(); ctx.ellipse(Math.min(s.x1, s.x2) + rx, Math.min(s.y1, s.y2) + ry, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (s.type === 'flecha') {
      const { x1, y1, x2, y2 } = s; const a = Math.atan2(y2 - y1, x2 - x1); const head = ctx.lineWidth * 4;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(a - Math.PI / 6), y2 - head * Math.sin(a - Math.PI / 6));
      ctx.lineTo(x2 - head * Math.cos(a + Math.PI / 6), y2 - head * Math.sin(a + Math.PI / 6));
      ctx.closePath(); ctx.fill();
    }
  };

  const pos = (e) => {
    const r = drawRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left), y: (t.clientY - r.top) };
  };
  const down = (e) => { e.preventDefault(); const p = pos(e); drawing.current = tool === 'libre' ? { type: 'libre', color, pts: [p] } : { type: tool, color, x1: p.x, y1: p.y, x2: p.x, y2: p.y }; };
  const move = (e) => {
    if (!drawing.current) return; e.preventDefault(); const p = pos(e);
    if (drawing.current.type === 'libre') drawing.current.pts.push(p); else { drawing.current.x2 = p.x; drawing.current.y2 = p.y; }
    const ctx = drawRef.current.getContext('2d'); redraw(shapes); paint(ctx, drawing.current);
  };
  const up = () => { if (drawing.current) { setShapes(s => [...s, drawing.current]); drawing.current = null; } };

  const guardar = () => {
    const cv = document.createElement('canvas');
    cv.width = baseRef.current.width; cv.height = baseRef.current.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(baseRef.current, 0, 0);
    ctx.drawImage(drawRef.current, 0, 0);
    onSave(cv.toDataURL('image/jpeg', 0.85));
  };

  return (
    <div className="pann">
      <div className="pann-tools">
        {TOOLS.map(([k, l, ic]) => (
          <button key={k} type="button" className={'pann-t' + (tool === k ? ' on' : '')} data-tip={l} onClick={() => setTool(k)}><Icon name={ic} size={16} /></button>
        ))}
        <span className="pann-sep" />
        {COLORS.map(c => (
          <button key={c} type="button" className={'pann-c' + (color === c ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} aria-label={'Color ' + c} />
        ))}
        <span className="pann-sep" />
        <button type="button" className="pann-t" data-tip="Deshacer" disabled={!shapes.length} onClick={() => setShapes(s => s.slice(0, -1))}><Icon name="history" size={16} /></button>
        <button type="button" className="pann-t" data-tip="Borrar todo" disabled={!shapes.length} onClick={() => setShapes([])}><Icon name="trash" size={16} /></button>
      </div>
      <div className="pann-stage" ref={wrapRef}>
        <canvas ref={baseRef} className="pann-base" />
        <canvas ref={drawRef} className="pann-draw"
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up} />
      </div>
      <div className="pann-foot">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn" onClick={guardar}><Icon name="check" size={16} />Usar foto marcada</button>
      </div>
    </div>
  );
}
