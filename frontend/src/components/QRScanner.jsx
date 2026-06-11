import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

let qid = 0;
export default function QRScanner({ onScan }) {
  const idRef = useRef('qrsc-' + (++qid));
  const scanned = useRef(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const h = new Html5Qrcode(idRef.current);
    const cfg = { fps: 10, qrbox: 240 };
    const ok = (text) => { if (scanned.current) return; scanned.current = true; onScan(text); };
    const start = (cam) => h.start(cam, cfg, ok, () => {});
    // intenta camara trasera; si falla, usa la primera disponible
    start({ facingMode: { exact: 'environment' } })
      .catch(() => start({ facingMode: 'environment' }))
      .catch(() => Html5Qrcode.getCameras().then(cams => {
        if (!cams || !cams.length) throw new Error('Sin camaras');
        const back = cams.find(c => /back|rear|trase|environment/i.test(c.label)) || cams[cams.length - 1];
        return start(back.id);
      }))
      .catch(e => setErr('No se pudo iniciar la camara: ' + (e.message || e)));
    return () => { try { h.stop().then(() => h.clear()).catch(() => {}); } catch {} };
  }, []);

  return (
    <div>
      <div id={idRef.current} style={{ width: '100%', maxWidth: 340, margin: '0 auto', borderRadius: 12, overflow: 'hidden' }} />
      {err && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{err}</div>}
    </div>
  );
}
