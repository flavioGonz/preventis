import React, { useState } from 'react';
import { api } from '../api.js';
import { Modal } from './ui.jsx';
import { Icon } from './icons.jsx';
import { toast } from './toast.jsx';

const CHIP = {
  ok: { cls: 'ok', label: 'OK', icon: 'checkCircle' },
  duplicado: { cls: 'warn', label: 'Duplicado', icon: 'alert' },
  error: { cls: 'falla', label: 'Error', icon: 'x' },
};

// Modal de importación masiva de clientes: descargar plantilla -> elegir archivo
// -> previsualizar (OK/duplicado/error) -> confirmar. Nada se guarda hasta confirmar.
export default function ImportClientes({ onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState(null);   // { columnas, filas, resumen }
  const [fileName, setFileName] = useState('');

  const elegir = async (ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    setFileName(f.name); setBusy(true); setPrev(null);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await api.upload('/api/clientes/import/preview', fd);
      setPrev(r);
      if (!r.filas.length) toast.err('El archivo no tiene filas con datos');
    } catch (e) { toast.err(e.message); }
    setBusy(false);
  };

  const confirmar = async () => {
    if (!prev) return;
    const filas = prev.filas.filter(f => f.estado === 'ok').map(f => f.datos);
    if (!filas.length) { toast.err('No hay filas válidas para importar'); return; }
    setBusy(true);
    try {
      const r = await api.post('/api/clientes/import/commit', { filas });
      let msg = 'Se crearon ' + r.creados + ' cliente(s)';
      if (r.omitidos) msg += ', ' + r.omitidos + ' omitido(s)';
      if (r.errores?.length) msg += ', ' + r.errores.length + ' con error';
      toast.ok(msg);
      onDone && onDone();
      onClose();
    } catch (e) { toast.err(e.message); }
    setBusy(false);
  };

  const okCount = prev?.resumen?.ok || 0;

  return (
    <Modal title="Importar clientes" subtitle="Carga masiva desde Excel" size="lg" onClose={onClose}
      footer={
        <div className="row between" style={{ width: '100%' }}>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn" onClick={confirmar} disabled={busy || !okCount}>
            <Icon name="check" size={16} />{busy ? 'Importando…' : 'Confirmar importación' + (okCount ? ' (' + okCount + ')' : '')}
          </button>
        </div>
      }>

      {/* Paso 1: plantilla + archivo */}
      <div className="card" style={{ background: 'var(--surface-2)', marginBottom: 14 }}>
        <div className="row between wrap" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="ph-ic" style={{ width: 40, height: 40, background: '#dcfce7', color: '#166534' }}><Icon name="download" size={20} /></span>
            <div>
              <div style={{ fontWeight: 700 }}>1. Descargá la plantilla</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Excel con los campos y listas. Completá una fila por cliente.</div>
            </div>
          </div>
          <a className="btn sec" href={api.fileUrl('/api/clientes/import/template.xlsx')}><Icon name="download" size={15} />Plantilla .xlsx</a>
        </div>
        <div className="row between wrap" style={{ gap: 10, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="ph-ic" style={{ width: 40, height: 40, background: '#dbeafe', color: '#2563eb' }}><Icon name="upload" size={20} /></span>
            <div>
              <div style={{ fontWeight: 700 }}>2. Subí el archivo completado</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{fileName ? fileName : 'Te mostramos una previsualización antes de guardar.'}</div>
            </div>
          </div>
          <label className="btn">
            <Icon name="upload" size={15} />Elegir archivo
            <input type="file" hidden accept=".xlsx,.xls" onChange={elegir} />
          </label>
        </div>
      </div>

      {busy && !prev && <div className="muted" style={{ textAlign: 'center', padding: 16 }}>Analizando archivo…</div>}

      {/* Paso 2: previsualización */}
      {prev && (
        <>
          <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
            <span className="badge ok"><Icon name="checkCircle" size={13} />{prev.resumen.ok} a crear</span>
            <span className="badge warn"><Icon name="alert" size={13} />{prev.resumen.duplicado} duplicado(s)</span>
            <span className="badge falla"><Icon name="x" size={13} />{prev.resumen.error} con error</span>
            <span className="badge gris">{prev.resumen.total} fila(s)</span>
          </div>

          <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table className="tbl" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>Fila</th>
                  <th style={{ width: 100 }}>Estado</th>
                  <th>Nombre</th>
                  <th>RUT</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {prev.filas.map((f) => {
                  const c = CHIP[f.estado] || CHIP.error;
                  return (
                    <tr key={f.fila}>
                      <td style={{ textAlign: 'center', color: 'var(--muted)' }}>{f.fila}</td>
                      <td><span className={'badge ' + c.cls}><Icon name={c.icon} size={12} />{c.label}</span></td>
                      <td style={{ fontWeight: 600 }}>{f.datos?.nombre || <span className="muted">—</span>}</td>
                      <td className="muted">{f.datos?.rut || '—'}</td>
                      <td className="muted" style={{ fontSize: 12 }}>{(f.motivos || []).join(' · ') || (f.estado === 'ok' ? 'Listo para crear' : '')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Sólo se crearán las filas en estado <b>OK</b>. Los duplicados y errores se omiten.
          </div>
        </>
      )}
    </Modal>
  );
}
