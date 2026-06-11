import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { getUser } from '../auth.js';
import { PageHeader, Loading, Empty, Modal, Field } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';

const ESTADOS = { activo: ['ok', 'Activo'], vencido: ['falla', 'Vencido'], suspendido: ['warn', 'Suspendido'], finalizado: ['gris', 'Finalizado'] };
const fmtFecha = (d) => d ? new Date(d).toLocaleDateString('es-UY') : '-';
const fmtMonto = (m, mon) => m == null ? '-' : (mon || 'UYU') + ' ' + Number(m).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const FREC_PREV = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'];
const FREC_LBL = { mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
function Cumpl({ label, hecho, total }) {
  const t = Number(total) || 0, h = Number(hecho) || 0;
  const pct = t ? Math.min(100, Math.round((h / t) * 100)) : 0;
  const tone = !t ? 'gris' : h >= t ? 'ok' : h >= t * 0.5 ? 'warn' : 'falla';
  return (
    <div className="cumpl">
      <div className="cumpl-h"><span>{label}</span><b className={'cumpl-n ' + tone}>{h}{t ? ' / ' + t : ''}</b></div>
      <div className="cumpl-bar"><div className={'cumpl-fill ' + tone} style={{ width: (t ? pct : 0) + '%' }} /></div>
    </div>
  );
}

export default function Contratos() {
  const [items, setItems] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [q, setQ] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [edit, setEdit] = useState(null);
  const [ver, setVer] = useState(null);
  const nav = useNavigate();
  const esAdmin = getUser()?.rol === 'admin';

  const load = () => api.get('/api/contratos').then(setItems).catch(e => { toast.err(e.message); setItems([]); });
  useEffect(() => { load(); api.get('/api/clientes').then(setClientes).catch(() => {}); }, []);
  if (!items) return <Loading />;

  const vencePronto = (c) => c.estado === 'activo' && c.fecha_fin && (new Date(c.fecha_fin) - Date.now()) < 30 * 86400000;
  const filtrados = items.filter(c =>
    (!fEstado || c.estado === fEstado) &&
    (!q || ((c.titulo || '') + ' ' + (c.cliente || '')).toLowerCase().includes(q.toLowerCase()))
  );

  const guardar = async (f) => {
    try {
      if (f.id) await api.put('/api/contratos/' + f.id, f);
      else await api.post('/api/contratos', f);
      toast.ok('Contrato guardado');
      setEdit(null); load();
    } catch (e) { toast.err(e.message); }
  };
  const eliminar = async (c) => {
    if (!confirm('Eliminar el contrato "' + c.titulo + '"?')) return;
    try { await api.del('/api/contratos/' + c.id); toast.ok('Contrato eliminado'); setVer(null); load(); }
    catch (e) { toast.err(e.message); }
  };

  return (
    <div>
      <PageHeader icon="clipboard" title="Contratos" desc="Contratos de mantenimiento por cliente"
        actions={esAdmin && <button className="btn sm" onClick={() => setEdit({ cliente_id: '', titulo: '', estado: 'activo', moneda: 'UYU' })}><Icon name="plus" size={16} />Nuevo contrato</button>} />

      <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="wa-search" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
          <Icon name="search" size={17} />
          <input placeholder="Buscar por cliente o titulo..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="chips">
          <span className={'chip' + (!fEstado ? ' active' : '')} onClick={() => setFEstado('')}>Todos</span>
          {Object.entries(ESTADOS).map(([v, [, l]]) => <span key={v} className={'chip' + (fEstado === v ? ' active' : '')} onClick={() => setFEstado(v)}>{l}</span>)}
        </div>
      </div>

      {filtrados.length === 0 ? <Empty icon="clipboard" title="Sin contratos">No hay contratos con esos filtros.{esAdmin ? ' Crea el primero con "Nuevo contrato".' : ''}</Empty> :
        <div className="contr-grid">
          {filtrados.map(c => {
            const [tone, lbl] = ESTADOS[c.estado] || ['gris', c.estado];
            return (
              <div key={c.id} className="card contr-card" onClick={() => setVer(c)}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <b className="contr-tit">{c.titulo}</b>
                  <span className={'badge ' + tone}><span className="dot" />{lbl}</span>
                </div>
                <div className="subtle row" style={{ gap: 6 }}><Icon name="building" size={13} />{c.cliente}</div>
                <div className="contr-meta">
                  <span><Icon name="calendar" size={13} /> {fmtFecha(c.fecha_inicio)} &rarr; {fmtFecha(c.fecha_fin)}</span>
                  {vencePronto(c) && <span className="badge warn" style={{ fontSize: 11 }}>Vence pronto</span>}
                </div>
                {(c.prev_contratados > 0 || c.corr_contratados > 0) && <div className="contr-cumpl">
                  {c.prev_contratados > 0 && <Cumpl label="Preventivos (ult. ano)" hecho={c.prev_realizados} total={c.prev_contratados} />}
                  {c.corr_contratados > 0 && <Cumpl label="Correctivos (ult. ano)" hecho={c.corr_realizados} total={c.corr_contratados} />}
                </div>}
                {esAdmin && <div className="contr-monto"><Icon name="star" size={13} /> {fmtMonto(c.monto, c.moneda)}{c.forma_pago ? <small className="muted"> &middot; {c.forma_pago}</small> : null}</div>}
              </div>
            );
          })}
        </div>}

      {ver && <Modal title={ver.titulo} subtitle={ver.cliente} onClose={() => setVer(null)}
        footer={<>
          <button className="btn ghost" onClick={() => nav('/clientes/' + ver.cliente_id)}><Icon name="building" size={15} />Ver cliente</button>
          {esAdmin && <button className="btn ghost" style={{ color: 'var(--falla)' }} onClick={() => eliminar(ver)}><Icon name="trash" size={15} />Eliminar</button>}
          {esAdmin && <button className="btn" onClick={() => { setEdit(ver); setVer(null); }}><Icon name="edit" size={15} />Editar</button>}
        </>}>
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {(() => { const [tone, lbl] = ESTADOS[ver.estado] || ['gris', ver.estado]; return <span className={'badge ' + tone}><span className="dot" />{lbl}</span>; })()}
          <span className="badge gris"><Icon name="calendar" size={12} /> {fmtFecha(ver.fecha_inicio)} &rarr; {fmtFecha(ver.fecha_fin)}</span>
        </div>
        <div className="contr-view">
          <div className="cv-col">
            {ver.descripcion && <Field label="Descripcion"><p className="contr-text">{ver.descripcion}</p></Field>}
            <Field label="Deberes del servicio"><p className="contr-text">{ver.deberes || 'Sin especificar.'}</p></Field>
            <Field label="Responsabilidades del cliente"><p className="contr-text">{ver.responsabilidades || 'Sin especificar.'}</p></Field>
            {esAdmin && <div className="contr-money-box">
              <b><Icon name="star" size={14} /> Datos economicos (solo administradores)</b>
              <div className="grid2" style={{ marginTop: 8 }}>
                <div><small className="muted">Monto</small><div>{fmtMonto(ver.monto, ver.moneda)}</div></div>
                <div><small className="muted">Forma de pago</small><div>{ver.forma_pago || '-'}</div></div>
              </div>
            </div>}
          </div>
          <div className="cv-col cv-right">
            <div className="contr-money-box" style={{ margin: 0 }}>
              <b><Icon name="calendar" size={14} /> Plan de mantenimiento</b>
              <div className="cv-plan">
                <div><small className="muted">Frecuencia preventivo</small><div>{FREC_LBL[ver.frecuencia_preventivo] || '-'}{ver.prev_contratados ? ' (' + ver.prev_contratados + '/ano)' : ''}</div></div>
                <div><small className="muted">Recurrencia</small><div>{ver.recurrencia_preventivo || '-'}</div></div>
                <div><small className="muted">Correctivos anuales</small><div>{ver.correctivos_anuales || '-'}</div></div>
              </div>
              {(ver.prev_contratados > 0 || ver.corr_contratados > 0) && <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ver.prev_contratados > 0 && <Cumpl label="Preventivos realizados (ultimo ano)" hecho={ver.prev_realizados} total={ver.prev_contratados} />}
                {ver.corr_contratados > 0 && <Cumpl label="Correctivos realizados (ultimo ano)" hecho={ver.corr_realizados} total={ver.corr_contratados} />}
              </div>}
              {!(ver.frecuencia_preventivo || ver.recurrencia_preventivo || ver.correctivos_anuales) && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Sin plan de mantenimiento definido.</div>}
            </div>
          </div>
        </div>
      </Modal>}

      {edit && <ContratoModal f0={edit} clientes={clientes} onClose={() => setEdit(null)} onSave={guardar} />}
    </div>
  );
}

function ContratoModal({ f0, clientes, onClose, onSave }) {
  const [f, setF] = useState(f0);
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={f.id ? 'Editar contrato' : 'Nuevo contrato'} subtitle="Los datos economicos solo los ven administradores" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={!f.cliente_id || !f.titulo} onClick={() => onSave(f)}><Icon name="save" size={15} />Guardar</button></>}>
      <div className="contr-form">
        <div className="cf-col">
          <div className="grid2">
            <Field label="Cliente">
              <select value={f.cliente_id} onChange={e => set('cliente_id', e.target.value)}>
                <option value="">- Seleccionar -</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select value={f.estado} onChange={e => set('estado', e.target.value)}>
                {Object.entries(ESTADOS).map(([v, [, l]]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Titulo del contrato"><input value={f.titulo} placeholder="Ej: Mantenimiento preventivo anual" onChange={e => set('titulo', e.target.value)} /></Field>
          <Field label="Descripcion"><textarea rows={2} value={f.descripcion || ''} onChange={e => set('descripcion', e.target.value)} /></Field>
          <div className="grid2">
            <Field label="Fecha de inicio"><input type="date" value={(f.fecha_inicio || '').slice(0, 10)} onChange={e => set('fecha_inicio', e.target.value)} /></Field>
            <Field label="Fecha de fin"><input type="date" value={(f.fecha_fin || '').slice(0, 10)} onChange={e => set('fecha_fin', e.target.value)} /></Field>
          </div>
        </div>
        <div className="cf-col cf-right">
          <div className="contr-money-box" style={{ marginBottom: 12 }}>
            <b><Icon name="calendar" size={14} /> Plan de mantenimiento</b>
            <div className="grid2" style={{ marginTop: 8 }}>
              <Field label="Frecuencia preventivo"><select value={f.frecuencia_preventivo || ''} onChange={e => set('frecuencia_preventivo', e.target.value)}><option value="">- Sin definir -</option>{FREC_PREV.map(x => <option key={x} value={x}>{FREC_LBL[x]}</option>)}</select></Field>
              <Field label="Correctivos anuales"><input type="number" min="0" value={f.correctivos_anuales ?? ''} onChange={e => set('correctivos_anuales', e.target.value === '' ? null : e.target.value)} /></Field>
            </div>
            <Field label="Recurrencia preventivo"><input placeholder="Ej: primer jueves, tercer martes..." value={f.recurrencia_preventivo || ''} onChange={e => set('recurrencia_preventivo', e.target.value)} /></Field>
          </div>
          <Field label="Deberes del servicio (que incluye)"><textarea rows={9} placeholder="Visitas mensuales, prueba de sensores, informe PDF..." value={f.deberes || ''} onChange={e => set('deberes', e.target.value)} /></Field>
          <Field label="Responsabilidades del cliente"><textarea rows={9} placeholder="Acceso a las instalaciones, aviso de fallas, energia electrica..." value={f.responsabilidades || ''} onChange={e => set('responsabilidades', e.target.value)} /></Field>
          <div className="contr-money-box">
            <b><Icon name="star" size={14} /> Datos economicos</b>
            <div className="grid2" style={{ marginTop: 8 }}>
              <Field label="Monto"><input type="number" step="0.01" value={f.monto ?? ''} onChange={e => set('monto', e.target.value === '' ? null : e.target.value)} /></Field>
              <Field label="Moneda">
                <select value={f.moneda || 'UYU'} onChange={e => set('moneda', e.target.value)}>
                  <option value="UYU">UYU ($)</option><option value="USD">USD (U$S)</option><option value="UI">UI</option>
                </select>
              </Field>
            </div>
            <Field label="Forma de pago"><input placeholder="Mensual, trimestral, contado..." value={f.forma_pago || ''} onChange={e => set('forma_pago', e.target.value)} /></Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}
