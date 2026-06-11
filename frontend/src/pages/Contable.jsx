import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { PageHeader, Loading, Empty, Modal, Field } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import { compressToFile } from '../img.js';

const money = (n, mon) => n == null || n === '' ? '-' : (mon || 'UYU') + ' ' + Number(n).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fdate = (d) => d ? new Date(d).toLocaleDateString('es-UY') : '-';
const EST_FAC = { pendiente: ['warn', 'Pendiente'], pagada: ['ok', 'Pagada'], vencida: ['falla', 'Vencida'], anulada: ['gris', 'Anulada'] };
const MEDIOS = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Debito automatico', 'Otro'];

export default function Contable() {
  const [tab, setTab] = useState('cobros');
  const [clientes, setClientes] = useState([]);
  useEffect(() => {
    api.get('/api/clientes').then(setClientes).catch(() => {});
  }, [tab]);

  return (
    <div>
      <PageHeader icon="file" title="Contable" desc="Finanzas: pagos, cobros y facturas" />

      <div className="tab-anim" key={tab}>
        {tab === 'cobros' && <Cobros clientes={clientes} tabs={<FinTabs tab={tab} setTab={setTab} />} />}
        {tab === 'pagos' && <Pagos tabs={<FinTabs tab={tab} setTab={setTab} />} />}
        {tab === 'facturas' && <Facturas clientes={clientes} tabs={<FinTabs tab={tab} setTab={setTab} />} />}
      </div>
    </div>
  );
}


function Lightbox({ src, onClose }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return createPortal(
    <div className="lightbox" onClick={onClose}>
      <button className="lb-x" aria-label="Cerrar" onClick={onClose}><Icon name="x" size={22} /></button>
      <img src={src} alt="" onClick={e => e.stopPropagation()} />
    </div>, document.body);
}

function Comprobantes({ tipo, itemId, subidos = [], pend, setPend, onReload }) {
  const [lb, setLb] = useState(null);
  const ref = React.useRef();
  const add = (files) => { const fs = [...(files || [])].filter(f => /^image\//.test(f.type)); if (fs.length) setPend(p => [...p, ...fs]); };
  React.useEffect(() => {
    const handler = (e) => {
      const dt = e.clipboardData; if (!dt) return;
      const imgs = [];
      for (const it of dt.items || []) { if (it.kind === 'file' && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) imgs.push(f); } }
      if (!imgs.length) for (const f of dt.files || []) { if (/^image\//.test(f.type)) imgs.push(f); }
      if (imgs.length) { e.preventDefault(); add(imgs); toast.ok(imgs.length + ' comprobante(s) pegado(s)'); }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, []);
  const delSubido = async (c) => { try { await api.del('/api/fin/comprobantes/' + c.id); toast.ok('Comprobante eliminado'); onReload && onReload(); } catch (e) { toast.err(e.message); } };
  const vacio = subidos.length === 0 && pend.length === 0;

  return (
    <div className="comp-zone">
      <div className="comp-zone-h">
        <span className="czh-title"><Icon name="camera" size={14} />Comprobante</span>
        <button type="button" className="czh-up" data-tip="Subir / tomar foto" aria-label="Subir" onClick={() => ref.current?.click()}><Icon name="upload" size={15} /></button>
        <input ref={ref} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => { add(e.target.files); e.target.value = ''; }} />
      </div>
      <div className="comp-zone-body" onClick={() => vacio && ref.current?.click()}>
        {vacio
          ? <div className="comp-empty"><Icon name="camera" size={26} /></div>
          : <>
              {subidos.map(c => <div key={'s' + c.id} className="comp-img"><img src={api.base + c.path} alt="" style={{ cursor: 'zoom-in' }} onClick={() => setLb(api.base + c.path)} /><button type="button" className="comp-x" onClick={() => delSubido(c)} aria-label="Eliminar"><Icon name="x" size={13} /></button></div>)}
              {pend.map((f, i) => { const u = URL.createObjectURL(f); return <div key={'p' + i} className="comp-img"><img src={u} alt="" style={{ cursor: 'zoom-in' }} onClick={() => setLb(u)} /><button type="button" className="comp-x" onClick={() => setPend(p => p.filter((_, j) => j !== i))} aria-label="Quitar"><Icon name="x" size={13} /></button></div>; })}
            </>}
      </div>
      <div className="comp-zone-foot">Pegar comprobante aqui (Ctrl+V)</div>
      {lb && <Lightbox src={lb} onClose={() => setLb(null)} />}
    </div>
  );
}

const TABS = [['cobros', 'Cobros', 'download'], ['pagos', 'Pagos', 'upload'], ['facturas', 'Facturas', 'file']];
function FinTabs({ tab, setTab }) {
  return (
    <div className="fin-tabs">
      {TABS.map(([k, l, ic]) => (
        <button key={k} className={'fin-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}><Icon name={ic} size={15} />{l}</button>
      ))}
    </div>
  );
}

function Toolbar({ q, setQ, onNew, placeholder, total, tabs }) {
  return (
    <div className="fin-bar">
      <div className="wa-search" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
        <Icon name="search" size={17} /><input placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {total != null && <span className="muted fin-total">Total: <b>{money(total)}</b></span>}
      <button className="btn sm" onClick={onNew}><Icon name="plus" size={16} />Nuevo</button>
      {tabs}
    </div>
  );
}

/* ---------------- Cobros ---------------- */
function Cobros({ clientes, onChange, tabs }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [pend, setPend] = useState([]);
  const load = () => api.get('/api/fin/cobros').then(setItems);
  useEffect(() => { load(); }, []);
  const save = async (f) => { try { let id = f.id; if (f.id) await api.put('/api/fin/cobros/' + f.id, f); else { const r = await api.post('/api/fin/cobros', f); id = r.id; } if (id && pend.length) { const fd = new FormData(); for (const p of pend) fd.append('files', await compressToFile(p)); await api.upload('/api/fin/cobros/' + id + '/comprobantes', fd).catch(() => {}); } setModal(null); setPend([]); toast.ok('Cobro guardado'); load(); onChange && onChange(); } catch (e) { toast.err(e.message); } };
  const del = async (r) => { if (!confirm('Eliminar cobro?')) return; try { await api.del('/api/fin/cobros/' + r.id); load(); onChange && onChange(); } catch (e) { toast.err(e.message); } };
  if (items === null) return <Loading />;
  const shown = items.filter(r => !q || ((r.cliente || '') + ' ' + (r.referencia || '') + ' ' + (r.medio || '')).toLowerCase().includes(q.toLowerCase()));
  const total = shown.reduce((a, r) => a + Number(r.monto || 0), 0);
  return (
    <div>
      <Toolbar q={q} setQ={setQ} tabs={tabs} placeholder="Buscar por cliente, medio o referencia..." total={total} onNew={() => { setPend([]); setModal({ cliente_id: '', fecha: new Date().toISOString().slice(0, 10), monto: '', moneda: 'UYU', medio: 'Transferencia', referencia: '', notas: '' }); }} />
      {shown.length === 0 ? <Empty icon="arrowRight" title="Sin cobros">Registra los ingresos recibidos.</Empty> :
        <div className="card pad-sm"><div className="tablewrap"><table className="table">
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Medio</th><th>Referencia</th><th style={{ textAlign: 'right' }}>Monto</th><th></th></tr></thead>
          <tbody>{shown.map(r => (
            <tr key={r.id}>
              <td className="mono">{fdate(r.fecha)}</td>
              <td><b>{r.cliente || '-'}</b>{r.factura_numero ? <div className="subtle" style={{ fontSize: 11.5 }}>Fact. {r.factura_numero}</div> : null}</td>
              <td>{r.medio || '-'}</td>
              <td className="subtle">{r.referencia || '-'}{Array.isArray(r.comprobantes) && r.comprobantes.length > 0 && <span className="comp-badge" data-tip={r.comprobantes.length + ' comprobante(s)'}><Icon name="paperclip" size={12} />{r.comprobantes.length}</span>}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ok)' }}>{money(r.monto, r.moneda)}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn ghost icon" onClick={() => { setPend([]); setModal({ ...r, fecha: (r.fecha || '').slice(0, 10) }); }}><Icon name="edit" size={15} /></button>
                <button className="btn ghost icon" onClick={() => del(r)}><Icon name="trash" size={15} color="var(--falla)" /></button>
              </td>
            </tr>
          ))}</tbody>
        </table></div></div>}
      {modal && <Modal title={<span className="row" style={{ gap: 8 }}><span className="modal-ico ok"><Icon name="download" size={16} /></span>{modal.id ? 'Editar cobro' : 'Nuevo cobro'}</span>} subtitle="Ingreso recibido" onClose={() => setModal(null)}
        footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn" disabled={!modal.monto} onClick={() => save(modal)}><Icon name="check" size={16} />Guardar</button></>}>
        <div className="fin-form">
          <div className="ff-col">
            <div className="grid2">
              <Field label={<span className="flabel"><Icon name="building" size={13} />Cliente</span>}><select value={modal.cliente_id || ''} onChange={e => setModal({ ...modal, cliente_id: e.target.value })}><option value="">- Sin cliente -</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
              <Field label={<span className="flabel"><Icon name="calendar" size={13} />Fecha</span>}><input type="date" value={modal.fecha} onChange={e => setModal({ ...modal, fecha: e.target.value })} /></Field>
              <Field label={<span className="flabel"><Icon name="star" size={13} />Monto</span>}><input type="number" step="0.01" value={modal.monto} onChange={e => setModal({ ...modal, monto: e.target.value })} /></Field>
              <Field label={<span className="flabel"><Icon name="curve" size={13} />Moneda</span>}><select value={modal.moneda} onChange={e => setModal({ ...modal, moneda: e.target.value })}><option>UYU</option><option>USD</option><option>UI</option></select></Field>
              <Field label={<span className="flabel"><Icon name="file" size={13} />Medio</span>}><select value={modal.medio} onChange={e => setModal({ ...modal, medio: e.target.value })}>{MEDIOS.map(m => <option key={m}>{m}</option>)}</select></Field>
              <Field label={<span className="flabel"><Icon name="paperclip" size={13} />Referencia</span>}><input value={modal.referencia || ''} onChange={e => setModal({ ...modal, referencia: e.target.value })} /></Field>
            </div>
            <Field label={<span className="flabel"><Icon name="pen" size={13} />Notas</span>}><textarea value={modal.notas || ''} onChange={e => setModal({ ...modal, notas: e.target.value })} /></Field>
          </div>
          <div className="ff-right">
            <Comprobantes tipo="cobros" itemId={modal.id} subidos={modal.comprobantes || []} pend={pend} setPend={setPend} onReload={() => { load(); api.get('/api/fin/cobros').then(d => { const it = d.find(x => x.id === modal.id); if (it) setModal(m => ({ ...m, comprobantes: it.comprobantes })); }).catch(() => {}); }} />
          </div>
        </div>
      </Modal>}
    </div>
  );
}

/* ---------------- Pagos ---------------- */
function Pagos({ onChange, tabs }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [pend, setPend] = useState([]);
  const load = () => api.get('/api/fin/pagos').then(setItems);
  useEffect(() => { load(); }, []);
  const save = async (f) => { try { let id = f.id; if (f.id) await api.put('/api/fin/pagos/' + f.id, f); else { const r = await api.post('/api/fin/pagos', f); id = r.id; } if (id && pend.length) { const fd = new FormData(); for (const p of pend) fd.append('files', await compressToFile(p)); await api.upload('/api/fin/pagos/' + id + '/comprobantes', fd).catch(() => {}); } setModal(null); setPend([]); toast.ok('Pago guardado'); load(); onChange && onChange(); } catch (e) { toast.err(e.message); } };
  const del = async (r) => { if (!confirm('Eliminar pago?')) return; try { await api.del('/api/fin/pagos/' + r.id); load(); onChange && onChange(); } catch (e) { toast.err(e.message); } };
  if (items === null) return <Loading />;
  const shown = items.filter(r => !q || ((r.tercero || '') + ' ' + (r.categoria || '') + ' ' + (r.referencia || '')).toLowerCase().includes(q.toLowerCase()));
  const total = shown.reduce((a, r) => a + Number(r.monto || 0), 0);
  return (
    <div>
      <Toolbar q={q} setQ={setQ} tabs={tabs} placeholder="Buscar por proveedor, categoria o referencia..." total={total} onNew={() => { setPend([]); setModal({ tercero: '', fecha: new Date().toISOString().slice(0, 10), monto: '', moneda: 'UYU', medio: 'Transferencia', categoria: '', referencia: '', notas: '' }); }} />
      {shown.length === 0 ? <Empty icon="arrowRight" title="Sin pagos">Registra los egresos realizados.</Empty> :
        <div className="card pad-sm"><div className="tablewrap"><table className="table">
          <thead><tr><th>Fecha</th><th>Proveedor / a quien</th><th>Categoria</th><th>Medio</th><th>Referencia</th><th style={{ textAlign: 'right' }}>Monto</th><th></th></tr></thead>
          <tbody>{shown.map(r => (
            <tr key={r.id}>
              <td className="mono">{fdate(r.fecha)}</td>
              <td><b>{r.tercero || '-'}</b></td>
              <td>{r.categoria || '-'}</td>
              <td>{r.medio || '-'}</td>
              <td className="subtle">{r.referencia || '-'}{Array.isArray(r.comprobantes) && r.comprobantes.length > 0 && <span className="comp-badge" data-tip={r.comprobantes.length + ' comprobante(s)'}><Icon name="paperclip" size={12} />{r.comprobantes.length}</span>}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--falla)' }}>{money(r.monto, r.moneda)}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn ghost icon" onClick={() => { setPend([]); setModal({ ...r, fecha: (r.fecha || '').slice(0, 10) }); }}><Icon name="edit" size={15} /></button>
                <button className="btn ghost icon" onClick={() => del(r)}><Icon name="trash" size={15} color="var(--falla)" /></button>
              </td>
            </tr>
          ))}</tbody>
        </table></div></div>}
      {modal && <Modal title={<span className="row" style={{ gap: 8 }}><span className="modal-ico falla"><Icon name="upload" size={16} /></span>{modal.id ? 'Editar pago' : 'Nuevo pago'}</span>} subtitle="Egreso realizado" onClose={() => setModal(null)}
        footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn" disabled={!modal.monto} onClick={() => save(modal)}><Icon name="check" size={16} />Guardar</button></>}>
        <div className="fin-form">
          <div className="ff-col">
            <div className="grid2">
              <Field label={<span className="flabel"><Icon name="truck" size={13} />Proveedor / a quien</span>}><input value={modal.tercero || ''} onChange={e => setModal({ ...modal, tercero: e.target.value })} /></Field>
              <Field label={<span className="flabel"><Icon name="calendar" size={13} />Fecha</span>}><input type="date" value={modal.fecha} onChange={e => setModal({ ...modal, fecha: e.target.value })} /></Field>
              <Field label={<span className="flabel"><Icon name="star" size={13} />Monto</span>}><input type="number" step="0.01" value={modal.monto} onChange={e => setModal({ ...modal, monto: e.target.value })} /></Field>
              <Field label={<span className="flabel"><Icon name="curve" size={13} />Moneda</span>}><select value={modal.moneda} onChange={e => setModal({ ...modal, moneda: e.target.value })}><option>UYU</option><option>USD</option><option>UI</option></select></Field>
              <Field label={<span className="flabel"><Icon name="list" size={13} />Categoria</span>}><input value={modal.categoria || ''} placeholder="Combustible, sueldos, repuestos..." onChange={e => setModal({ ...modal, categoria: e.target.value })} /></Field>
              <Field label={<span className="flabel"><Icon name="file" size={13} />Medio</span>}><select value={modal.medio} onChange={e => setModal({ ...modal, medio: e.target.value })}>{MEDIOS.map(m => <option key={m}>{m}</option>)}</select></Field>
            </div>
            <Field label={<span className="flabel"><Icon name="paperclip" size={13} />Referencia</span>}><input value={modal.referencia || ''} onChange={e => setModal({ ...modal, referencia: e.target.value })} /></Field>
            <Field label={<span className="flabel"><Icon name="pen" size={13} />Notas</span>}><textarea value={modal.notas || ''} onChange={e => setModal({ ...modal, notas: e.target.value })} /></Field>
          </div>
          <div className="ff-right">
            <Comprobantes tipo="pagos" itemId={modal.id} subidos={modal.comprobantes || []} pend={pend} setPend={setPend} onReload={() => { load(); api.get('/api/fin/pagos').then(d => { const it = d.find(x => x.id === modal.id); if (it) setModal(m => ({ ...m, comprobantes: it.comprobantes })); }).catch(() => {}); }} />
          </div>
        </div>
      </Modal>}
    </div>
  );
}

/* ---------------- Facturas ---------------- */
function Facturas({ clientes, onChange, tabs }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [modal, setModal] = useState(null);
  const load = () => api.get('/api/fin/facturas').then(setItems);
  useEffect(() => { load(); }, []);
  const save = async (f) => { try { if (f.id) await api.put('/api/fin/facturas/' + f.id, f); else await api.post('/api/fin/facturas', f); setModal(null); toast.ok('Factura guardada'); load(); onChange && onChange(); } catch (e) { toast.err(e.message); } };
  const del = async (r) => { if (!confirm('Eliminar factura?')) return; try { await api.del('/api/fin/facturas/' + r.id); load(); onChange && onChange(); } catch (e) { toast.err(e.message); } };
  if (items === null) return <Loading />;
  const shown = items.filter(r => (!fTipo || r.tipo === fTipo) && (!q || ((r.cliente || '') + ' ' + (r.tercero || '') + ' ' + (r.numero || '') + ' ' + (r.concepto || '')).toLowerCase().includes(q.toLowerCase())));
  const total = shown.reduce((a, r) => a + Number(r.monto || 0), 0);
  return (
    <div>
      <div className="fin-bar">
        <div className="wa-search" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}><Icon name="search" size={17} /><input placeholder="Buscar por numero, cliente o concepto..." value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="chips">
          <span className={'chip' + (!fTipo ? ' active' : '')} onClick={() => setFTipo('')}>Todas</span>
          <span className={'chip' + (fTipo === 'emitida' ? ' active' : '')} onClick={() => setFTipo('emitida')}>Emitidas</span>
          <span className={'chip' + (fTipo === 'recibida' ? ' active' : '')} onClick={() => setFTipo('recibida')}>Recibidas</span>
        </div>
        <button className="btn sm" onClick={() => setModal({ tipo: 'emitida', cliente_id: '', tercero: '', numero: '', fecha: new Date().toISOString().slice(0, 10), vencimiento: '', monto: '', moneda: 'UYU', estado: 'pendiente', concepto: '' })}><Icon name="plus" size={16} />Nueva</button>
        {tabs}
      </div>
      {shown.length === 0 ? <Empty icon="file" title="Sin facturas">Registra facturas emitidas y recibidas.</Empty> :
        <div className="card pad-sm"><div className="tablewrap"><table className="table">
          <thead><tr><th>Numero</th><th>Tipo</th><th>Cliente / tercero</th><th>Fecha</th><th>Vence</th><th>Estado</th><th style={{ textAlign: 'right' }}>Monto</th><th></th></tr></thead>
          <tbody>{shown.map(r => {
            const [tone, lbl] = EST_FAC[r.estado] || EST_FAC.pendiente;
            return (
              <tr key={r.id}>
                <td><b>{r.numero || '#' + r.id}</b>{r.concepto ? <div className="subtle" style={{ fontSize: 11.5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.concepto}</div> : null}</td>
                <td><span className={'badge mini ' + (r.tipo === 'emitida' ? 'info' : 'gris')}>{r.tipo === 'emitida' ? 'Emitida' : 'Recibida'}</span></td>
                <td>{r.cliente || r.tercero || '-'}</td>
                <td className="mono">{fdate(r.fecha)}</td>
                <td className="mono">{fdate(r.vencimiento)}</td>
                <td><span className={'badge ' + tone}><span className="dot" />{lbl}</span></td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(r.monto, r.moneda)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn ghost icon" onClick={() => setModal({ ...r, fecha: (r.fecha || '').slice(0, 10), vencimiento: (r.vencimiento || '').slice(0, 10) })}><Icon name="edit" size={15} /></button>
                  <button className="btn ghost icon" onClick={() => del(r)}><Icon name="trash" size={15} color="var(--falla)" /></button>
                </td>
              </tr>
            );
          })}</tbody>
        </table></div><div className="row between" style={{ padding: '10px 4px 2px' }}><span className="muted" style={{ fontSize: 13 }}>Total mostrado</span><b>{money(total)}</b></div></div>}
      {modal && <Modal title={<span className="row" style={{ gap: 8 }}><span className="modal-ico brand"><Icon name="file" size={16} /></span>{modal.id ? 'Editar factura' : 'Nueva factura'}</span>} subtitle="Emitida a cliente o recibida de un tercero" onClose={() => setModal(null)}
        footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn" onClick={() => save(modal)}><Icon name="check" size={16} />Guardar</button></>}>
        <Field label={<span className="flabel"><Icon name="file" size={13} />Tipo</span>}>
          <div className="tipo-seg">
            <button type="button" className={'tipo-opt' + (modal.tipo !== 'recibida' ? ' on' : '')} onClick={() => setModal({ ...modal, tipo: 'emitida' })}><Icon name="arrowRight" size={15} />Emitida (a cliente)</button>
            <button type="button" className={'tipo-opt corr' + (modal.tipo === 'recibida' ? ' on' : '')} onClick={() => setModal({ ...modal, tipo: 'recibida' })}><Icon name="arrowRight" size={15} style={{ transform: 'rotate(180deg)' }} />Recibida (de tercero)</button>
          </div>
        </Field>
        <div className="grid2">
          {modal.tipo !== 'recibida'
            ? <Field label={<span className="flabel"><Icon name="building" size={13} />Cliente</span>}><select value={modal.cliente_id || ''} onChange={e => setModal({ ...modal, cliente_id: e.target.value })}><option value="">- Sin cliente -</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
            : <Field label={<span className="flabel"><Icon name="truck" size={13} />Proveedor / tercero</span>}><input value={modal.tercero || ''} onChange={e => setModal({ ...modal, tercero: e.target.value })} /></Field>}
          <Field label={<span className="flabel"><Icon name="file" size={13} />Numero</span>}><input value={modal.numero || ''} onChange={e => setModal({ ...modal, numero: e.target.value })} /></Field>
          <Field label={<span className="flabel"><Icon name="calendar" size={13} />Fecha</span>}><input type="date" value={modal.fecha} onChange={e => setModal({ ...modal, fecha: e.target.value })} /></Field>
          <Field label={<span className="flabel"><Icon name="clock" size={13} />Vencimiento</span>}><input type="date" value={modal.vencimiento || ''} onChange={e => setModal({ ...modal, vencimiento: e.target.value })} /></Field>
          <Field label={<span className="flabel"><Icon name="star" size={13} />Monto</span>}><input type="number" step="0.01" value={modal.monto} onChange={e => setModal({ ...modal, monto: e.target.value })} /></Field>
          <Field label={<span className="flabel"><Icon name="curve" size={13} />Moneda</span>}><select value={modal.moneda} onChange={e => setModal({ ...modal, moneda: e.target.value })}><option>UYU</option><option>USD</option><option>UI</option></select></Field>
          <Field label={<span className="flabel"><Icon name="checkCircle" size={13} />Estado</span>}><select value={modal.estado} onChange={e => setModal({ ...modal, estado: e.target.value })}>{Object.entries(EST_FAC).map(([v, [, l]]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        </div>
        <Field label={<span className="flabel"><Icon name="pen" size={13} />Concepto</span>}><textarea value={modal.concepto || ''} onChange={e => setModal({ ...modal, concepto: e.target.value })} /></Field>
      </Modal>}
    </div>
  );
}
