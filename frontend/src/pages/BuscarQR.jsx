import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../api.js';
import { PageHeader } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

export default function BuscarQR() {
  const [codigo, setCodigo] = useState('');
  const [equipo, setEquipo] = useState(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);

  const buscar = async (cod) => {
    const c = (cod ?? codigo).trim();
    if (!c) return;
    setError(''); setEquipo(null);
    try { setEquipo(await api.get('/api/equipos/qr/' + encodeURIComponent(c))); }
    catch (e) { setError('No se encontro ningun equipo con el codigo: ' + c); }
  };

  const startScan = async () => {
    setError(''); setEquipo(null); setScanning(true);
    await new Promise(r => setTimeout(r, 60));
    try {
      const html5 = new Html5Qrcode('qr-reader'); scannerRef.current = html5;
      await html5.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 },
        async (text) => { await stopScan(); setCodigo(text); buscar(text); }, () => {});
    } catch (e) { setError('No se pudo iniciar la camara. Podes buscar el codigo manualmente.'); setScanning(false); }
  };
  const stopScan = async () => { try { await scannerRef.current?.stop(); } catch {} scannerRef.current = null; setScanning(false); };

  useEffect(() => { startScan(); return () => { stopScan(); }; }, []); // eslint-disable-line

  const fields = [
    ['Codigo', equipo?.codigo_qr], ['Sistema', equipo?.sistema], ['Tipo', equipo?.tipo_elemento],
    ['Direccion', equipo?.direccion], ['Grupo / Subgrupo', (equipo?.grupo || '-') + ' / ' + (equipo?.subgrupo || '-')],
    ['Modelo', equipo?.modelo],
  ];

  return (
    <div>
      <PageHeader icon="qr" title="Buscar equipo" desc="Escanea el codigo QR o buscalo manualmente" />

      {scanning ? (
        <div className="card">
          <div className="qr-stage">
            <div id="qr-reader"></div>
            <div className="qr-hint">Apunta la camara al codigo QR del equipo</div>
            <button className="btn danger block" onClick={stopScan}><Icon name="x" size={16} />Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="wa-search" style={{ marginBottom: 12 }}>
            <Icon name="search" size={17} />
            <input autoFocus placeholder="Codigo del equipo, ej: EQ-000001" value={codigo}
              onChange={e => setCodigo(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn grow" onClick={() => buscar()}><Icon name="search" size={16} />Buscar</button>
            <button className="btn sec" onClick={startScan}><Icon name="qr" size={17} />Escanear</button>
          </div>
        </div>
      )}

      {error && <div className="card" style={{ borderColor: 'var(--falla-bd)', background: 'var(--falla-bg)', color: 'var(--falla)' }}>
        <div className="row" style={{ gap: 8 }}><Icon name="alert" size={18} />{error}</div>
      </div>}

      {equipo && (
        <div className="card">
          <div className="row between wrap" style={{ marginBottom: 12, gap: 10 }}>
            <div className="row" style={{ gap: 12 }}>
              <div className="ico" style={{ width: 46, height: 46, background: 'var(--brand-soft)', color: 'var(--brand-600)', overflow: 'hidden', padding: 0 }}>
                {equipo.foto_path ? <img src={api.base + equipo.foto_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="box" size={22} />}
              </div>
              <div>
                <div className="title">{equipo.etiqueta || equipo.codigo_qr}</div>
                <div className="muted" style={{ fontSize: 13 }}>{equipo.cliente}</div>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link className="btn sec sm" to={'/equipos/' + equipo.id}>Ver ficha<Icon name="arrowRight" size={15} /></Link>
              <Link className="btn ghost sm" to={'/clientes/' + equipo.cliente_id}>Cliente</Link>
            </div>
          </div>
          <div className="tablewrap"><table className="table"><tbody>
            {fields.map(([k, v]) => <tr key={k}><th style={{ width: 160 }}>{k}</th><td>{v || '-'}</td></tr>)}
          </tbody></table></div>
        </div>
      )}
    </div>
  );
}
