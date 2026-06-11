import React, { useRef, useEffect, useState } from 'react';

export default function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef();
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = 180 * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; const c = canvasRef.current.getContext('2d'); const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const c = canvasRef.current.getContext('2d'); const p = pos(e); c.lineTo(p.x, p.y); c.stroke(); setEmpty(false); };
  const end = () => { drawing.current = false; };

  const limpiar = () => {
    const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); setEmpty(true);
  };
  const guardar = () => onSave(canvasRef.current.toDataURL('image/png'));

  return (
    <div>
      <canvas ref={canvasRef} className="firma" style={{ height: 180 }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="row between" style={{ marginTop: 10 }}>
        <button className="btn ghost sm" onClick={limpiar}>Limpiar</button>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn" onClick={guardar} disabled={empty}>Guardar firma</button>
        </div>
      </div>
    </div>
  );
}
