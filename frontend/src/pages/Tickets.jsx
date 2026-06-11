import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Loading, Empty, Modal, Field } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';

export const PRIO = { baja: ['Baja', '#2563eb'], media: ['Media', '#ea580c'], alta: ['Alta', '#dc2626'] };
export const EST = { abierto: ['warn', 'Abierto', 'alert'], en_proceso: ['info', 'En proceso', 'clock'], esperando_cliente: ['warn', 'Esperando cliente', 'phone'], resuelto: ['ok', 'Resuelto', 'checkCircle'], cerrado: ['gris', 'Cerrado', 'check'] };
export const esVencido = (t) => !['resuelto', 'cerrado'].includes(t.estado) && t.fecha_max_resolucion && String(t.fecha_max_resolucion).slice(0, 10) < new Date().toISOString().slice(0, 10);
const ESTADOS = [['', 'Todos'], ['abierto', 'Abiertos'], ['en_proceso', 'En proceso'], ['resuelto', 'Resueltos'], ['cerrado', 'Cerrados']];

export function PrioIcon({ p, size = 14 }) {
  const color = (PRIO[p] || PRIO.media)[1];
  const path = p === 'alta' ? 'M4 14l6-6 6 6 M4 9l6-6 6 6' : p === 'baja' ? 'M4 6l6 6 6-6 M4 11l6 6 6-6' : 'M4 8h12 M4 13h12';
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label={'Prioridad ' + p}>
      <path d={path} />
    </svg>
  );
}

export function TkAvatar({ nombre, src, size = 26 }) {
  if (src) return <img className="tkl-av" style={{ width: size, height: size }} src={api.base + src} alt={nombre || ''} />;
  if (!nombre) return <span className="tkl-av empty" style={{ width: size, height: size }}><Icon name="users" size={size * 0.5} /></span>;
  return <span className="tkl-av ini" style={{ width: size, height: size, fontSize: size * 0.42 }}>{nombre.trim().slice(0, 1).toUpperCase()}</span>;
}

export const fmtDur = (desde, hasta) => {
  if (!desde) return '-';
  const ms = (hasta ? new Date(hasta).getTime() : Date.now()) - new Date(desde).getTime();
  if (ms < 0) return '-';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return d + 'd ' + (h % 24) + 'h';
  if (h > 0) return h + 'h ' + (m % 60) + 'm';
  return m + ' min';
};

export function ConfirmModal({ titulo, mensaje, confirmar = 'Eliminar', icono = 'trash', onConfirm, onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="cfm" onClick={e => e.stopPropagation()}>
        <span className="cfm-ic"><Icon name={icono} size={22} /></span>
        <b>{titulo}</b>
        <p>{mensaje}</p>
        <div className="cfm-btns">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn danger" onClick={onConfirm}><Icon name={icono} size={15} />{confirmar}</button>
        </div>
      </div>
    </div>
  );
}

const tmRel = (d) => {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), dd = Math.floor(h / 24);
  if (m < 1) return 'ahora';
  if (m < 60) return 'hace ' + m + ' min';
  if (h < 24) return 'hace ' + h + ' h';
  if (dd < 30) return 'hace ' + dd + ' d';
  return new Date(d).toLocaleDateString('es-UY');
};

export default function Tickets() {
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [tecAv, setTecAv] = useState({});
  const [usuarios, setUsuarios] = useState([]);
  const [estado, setEstado] = useState('');
  const [prio, setPrio] = useState('');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [aBorrar, setABorrar] = useState(null);
  const [ctx, setCtx] = useState(null); // {x,y,t}
  const [sub, setSub] = useState(null); // 'asignar'|'estado'|'prioridad'

  const load = () => api.get('/api/tickets').then(setItems);
  useEffect(() => {
    api.get('/api/clientes').then(setClientes);
    api.get('/api/usuarios/lista').then(us => {
      setUsuarios(us || []);
      const m = {}; (us || []).forEach(u => { if (u.avatar_path) { m[u.nombre] = u.avatar_path; m[u.username] = u.avatar_path; } });
      setTecAv(m);
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, []);

  useEffect(() => { if (!ctx) return; const close = () => { setCtx(null); setSub(null); }; window.addEventListener('click', close); window.addEventListener('scroll', close, true); return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); }; }, [ctx]);
  const cambiarCampo = async (t, campo, valor) => { try { await api.put('/api/tickets/' + t.id, { ...t, [campo]: valor }); toast.ok('Ticket actualizado'); setCtx(null); setSub(null); load(); } catch (e) { toast.err(e.message); } };
  const save = async (f) => {
    try { if (f.id) await api.put('/api/tickets/' + f.id, f); else await api.post('/api/tickets', f); setModal(null); toast.ok('Ticket guardado'); load(); }
    catch (e) { toast.err(e.message); }
  };
  const del = async (t) => { try { await api.del('/api/tickets/' + t.id); toast.ok('Ticket TK-' + t.id + ' eliminado'); setABorrar(null); load(); } catch (e) { toast.err(e.message); } };
  const convertir = async (t) => {
    if (!t.cliente_id) { toast.err('El ticket no tiene cliente asociado'); return; }
    try {
      const v = await api.post('/api/clientes/' + t.cliente_id + '/visitas', { fecha: new Date().toISOString().slice(0, 10), tipo: 'correctiva', asignada_por: 'Ticket TK-' + t.id, ticket_id: t.id, fecha_max_resolucion: t.fecha_max_resolucion || null });
      const fd = new FormData(); fd.append('texto', 'Convirtio el ticket en la visita correctiva #' + v.id);
      await api.upload('/api/tickets/' + t.id + '/comentarios', fd).catch(() => {});
      if (t.estado === 'abierto') await api.put('/api/tickets/' + t.id, { ...t, estado: 'en_proceso' }).catch(() => {});
      toast.ok('Visita correctiva creada');
      nav('/visitas/' + v.id);
    } catch (e) { toast.err(e.message); }
  };

  const shown = (items || []).filter(t =>
    (!estado || (estado === 'vencidos' ? esVencido(t) : t.estado === estado)) &&
    (!prio || t.prioridad === prio) &&
    (!q || ((t.titulo || '') + ' ' + (t.cliente || '') + ' ' + (t.asignado || '') + ' TK-' + t.id).toLowerCase().includes(q.toLowerCase()))
  );
  const cnt = (e) => (items || []).filter(t => t.estado === e).length;
  const cntVenc = (items || []).filter(esVencido).length;

  return (
    <div>
      <PageHeader icon="ticket" title="Tickets" desc="Incidencias y solicitudes de soporte"
        actions={<button className="btn sm" onClick={() => setModal({ titulo: '', cliente_id: '', prioridad: 'media', estado: 'abierto', asignado: '', descripcion: '' })}><Icon name="plus" size={16} />Nuevo ticket</button>} />

      {items !== null && <div className="tkl-stats">
        {[['abierto', 'Abiertos'], ['en_proceso', 'En proceso'], ['esperando_cliente', 'Esperando cliente'], ['resuelto', 'Resueltos'], ['cerrado', 'Cerrados']].map(([e, l]) => {
          const [tone, , ic] = EST[e];
          return (
            <div key={e} className={'tkl-stat ' + tone + (estado === e ? ' on' : '')} onClick={() => setEstado(estado === e ? '' : e)}>
              <span className="ts-ic"><Icon name={ic} size={16} /></span>
              <div><b>{cnt(e)}</b><small>{l}</small></div>
            </div>
          );
        })}
        <div className={'tkl-stat falla' + (estado === 'vencidos' ? ' on' : '')} onClick={() => setEstado(estado === 'vencidos' ? '' : 'vencidos')}>
          <span className="ts-ic"><Icon name="alert" size={16} /></span>
          <div><b>{cntVenc}</b><small>Vencidos</small></div>
        </div>
      </div>}

      <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
        <div className="wa-search" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
          <Icon name="search" size={17} /><input placeholder="Buscar por clave, titulo, cliente o asignado..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="chips">
          <span className={'chip' + (!prio ? ' active' : '')} onClick={() => setPrio('')}>Prioridad</span>
          {Object.entries(PRIO).map(([v, [l]]) => (
            <span key={v} className={'chip' + (prio === v ? ' active' : '')} onClick={() => setPrio(prio === v ? '' : v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PrioIcon p={v} size={12} />{l}</span>
          ))}
        </div>
      </div>

      {items === null ? <Loading /> :
        shown.length === 0 ? <Empty icon="ticket" title="Sin tickets">No hay tickets con esos filtros.</Empty> :
          <div className="tkl card pad-sm" style={{ padding: 6 }}>
            <div className="tkl-headrow">
              <span style={{ width: 28 }} /><span className="tkl-key">Clave</span><span style={{ flex: 1 }}>Ticket</span>
              <span style={{ width: 22 }} data-tip="Prioridad">P</span><span style={{ width: 96 }}>Estado</span>
              <span style={{ width: 26 }} /><span className="tkl-date">Creado</span><span className="tkl-open-h">Abierto</span><span className="tkl-upd">Actividad</span><span style={{ width: 30 }} />
            </div>
            {shown.map(t => {
              const [ec, el, eic] = EST[t.estado] || EST.abierto;
              return (
                <div key={t.id} className={'tkl-row' + (['resuelto', 'cerrado'].includes(t.estado) ? ' done' : '') + (ctx && ctx.t.id === t.id ? ' ctx-on' : '')} onClick={() => nav('/tickets/' + t.id)} onContextMenu={e => { e.preventDefault(); setSub(null); setCtx({ x: e.clientX, y: e.clientY, t }); }}>
                  <span className="tkl-type" data-tip="Incidencia"><Icon name="ticket" size={15} /></span>
                  <span className="tkl-key mono">TK-{t.id}</span>
                  <div className="tkl-main">
                    <b className="tkl-tit">{t.titulo}</b>
                    {t.cliente && <span className="tkl-cli"><Icon name="building" size={12} />{t.cliente}</span>}
                  </div>
                  <span className="tkl-prio" data-tip={'Prioridad ' + (PRIO[t.prioridad] || PRIO.media)[0]}><PrioIcon p={t.prioridad} /></span>
                  <span className={'badge ' + ec}><Icon name={eic} size={12} />{el}</span>
                  <span className="tkl-asig" data-tip={t.asignado || 'Sin asignar'}><TkAvatar nombre={t.asignado} src={tecAv[t.asignado]} /></span>
                  <span className="tkl-date mono" data-tip={'Creado ' + new Date(t.created_at).toLocaleString('es-UY')}>{new Date(t.created_at).toLocaleDateString('es-UY')}</span>
                  <span className={'tkl-open' + (['resuelto', 'cerrado'].includes(t.estado) ? ' fin' : '')} data-tip={['resuelto', 'cerrado'].includes(t.estado) ? 'Tiempo hasta resolverse' : 'Tiempo abierto'}>
                    <Icon name="clock" size={11} />{fmtDur(t.created_at, ['resuelto', 'cerrado'].includes(t.estado) ? t.updated_at : null)}
                  </span>
                  <span className="tkl-upd mono" data-tip={'Actualizado ' + new Date(t.updated_at).toLocaleString('es-UY')}>{tmRel(t.updated_at)}</span>
                  <span className="row tkl-acts" style={{ gap: 0 }}>
                    <button className="btn ghost icon tkl-del" data-tip="Convertir a visita correctiva" aria-label="Convertir a visita" onClick={e => { e.stopPropagation(); convertir(t); }}><Icon name="calendar" size={15} /></button>
                    <button className="btn ghost icon tkl-del" data-tip="Eliminar ticket" aria-label="Eliminar" onClick={e => { e.stopPropagation(); setABorrar(t); }}><Icon name="trash" size={15} /></button>
                  </span>
                </div>
              );
            })}
          </div>}

      {ctx && <div className="tkl-ctx" style={{ left: Math.min(ctx.x, window.innerWidth - 250), top: Math.min(ctx.y, window.innerHeight - 320) }} onClick={e => e.stopPropagation()}>
        <div className="tkl-ctx-h">TK-{ctx.t.id}</div>
        <button className="tkl-ctx-it" onClick={() => setSub(sub === 'asignar' ? null : 'asignar')}><Icon name="users" size={15} />Asignar<Icon name="chevronRight" size={14} style={{ marginLeft: 'auto' }} /></button>
        {sub === 'asignar' && <div className="tkl-ctx-sub">
          <button className="tkl-ctx-it" onClick={() => cambiarCampo(ctx.t, 'asignado', '')}><span className="muted">- Sin asignar -</span></button>
          {usuarios.map(u => <button key={u.id} className={'tkl-ctx-it' + ((ctx.t.asignado === (u.nombre || u.username)) ? ' on' : '')} onClick={() => cambiarCampo(ctx.t, 'asignado', u.nombre || u.username)}><TkAvatar nombre={u.nombre || u.username} src={u.avatar_path} size={22} />{u.nombre || u.username}</button>)}
        </div>}
        <button className="tkl-ctx-it" onClick={() => setSub(sub === 'estado' ? null : 'estado')}><Icon name="checkCircle" size={15} />Cambiar estado<Icon name="chevronRight" size={14} style={{ marginLeft: 'auto' }} /></button>
        {sub === 'estado' && <div className="tkl-ctx-sub">
          {Object.entries(EST).map(([k, [tone, l, ic]]) => <button key={k} className={'tkl-ctx-it' + (ctx.t.estado === k ? ' on' : '')} onClick={() => cambiarCampo(ctx.t, 'estado', k)}><Icon name={ic} size={15} />{l}</button>)}
        </div>}
        <button className="tkl-ctx-it" onClick={() => setSub(sub === 'prioridad' ? null : 'prioridad')}><Icon name="alert" size={15} />Cambiar prioridad<Icon name="chevronRight" size={14} style={{ marginLeft: 'auto' }} /></button>
        {sub === 'prioridad' && <div className="tkl-ctx-sub">
          {['alta', 'media', 'baja'].map(p => <button key={p} className={'tkl-ctx-it' + (ctx.t.prioridad === p ? ' on' : '')} onClick={() => cambiarCampo(ctx.t, 'prioridad', p)}><PrioIcon p={p} size={14} />{PRIO[p][0]}</button>)}
        </div>}
        <div className="tkl-ctx-div" />
        <button className="tkl-ctx-it" onClick={() => { const tk = ctx.t; setCtx(null); convertir(tk); }}><Icon name="calendar" size={15} />Convertir a visita</button>
        <div className="tkl-ctx-div" />
        <button className="tkl-ctx-it" onClick={() => { setCtx(null); setSub(null); }}><Icon name="x" size={15} />Cancelar</button>
      </div>}

      {modal && <TicketModal ticket={modal} clientes={clientes} usuarios={usuarios} onClose={() => setModal(null)} onSave={save} />}
      {aBorrar && <ConfirmModal titulo={'Eliminar TK-' + aBorrar.id} mensaje={'Se eliminara el ticket "' + aBorrar.titulo + '" con todos sus comentarios y adjuntos. Esta accion no se puede deshacer.'} onConfirm={() => del(aBorrar)} onClose={() => setABorrar(null)} />}
    </div>
  );
}

const MOTIVOS_NF = [['garantia', 'Garantia de producto'], ['no_conformidad', 'No conformidad de instalacion'], ['contrato', 'Contrato']];
export function TicketFacturacion({ f, set, variant }) {
  const [contratos, setContratos] = useState([]);
  const [open, setOpen] = useState(false);
  const [habil, setHabil] = useState(false);
  const toggle = variant === 'toggle';
  const dis = toggle && !habil;
  useEffect(() => { if (!f.cliente_id) { setContratos([]); return; } api.get('/api/clientes/' + f.cliente_id + '/contratos').then(c => setContratos(c || [])).catch(() => setContratos([])); }, [f.cliente_id]);
  const marcado = !!(f.solicitante || f.fecha_max_resolucion || f.facturable != null);
  return (
    <div className={'brd-sec' + (dis ? ' tk-fact-dim' : '')}>
      {toggle
        ? <div className="brd-sec-h" style={{ cursor: 'default' }}>
            <Icon name="file" size={15} />Facturacion y seguimiento
            <button type="button" className={'tk-sw' + (habil ? ' on' : '')} style={{ marginLeft: 'auto' }} role="switch" aria-checked={habil} data-tip={habil ? 'Deshabilitar' : 'Habilitar'} onClick={() => setHabil(h => !h)}><span className="tk-sw-k" /></button>
          </div>
        : <button type="button" className="brd-sec-h tk-fact-toggle" onClick={() => setOpen(o => !o)}>
            <Icon name="file" size={15} />Facturacion y seguimiento
            {marcado && !open && <span className="badge gris" style={{ marginLeft: 6 }}>cargado</span>}
            <Icon name={open ? 'minus' : 'plus'} size={15} style={{ marginLeft: 'auto' }} />
          </button>}
      {(toggle || open) && <fieldset className="tk-fact-fields" disabled={dis} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <Field label={<span className="flabel"><Icon name="users" size={13} />Solicitante</span>}><input value={f.solicitante || ''} placeholder="Quien solicita" onChange={e => set('solicitante', e.target.value)} /></Field>
      <Field label={<span className="flabel"><Icon name="clock" size={13} />Fecha maxima de resolucion</span>}><input type="date" value={(f.fecha_max_resolucion || '').slice(0, 10)} onChange={e => set('fecha_max_resolucion', e.target.value)} /></Field>
      <Field label={<span className="flabel"><Icon name="star" size={13} />Facturacion</span>}>
        <div className="tipo-seg">
          <button type="button" className={'tipo-opt' + (f.facturable === true ? ' on' : '')} onClick={() => set('facturable', true)}><Icon name="checkCircle" size={15} />Facturable</button>
          <button type="button" className={'tipo-opt corr' + (f.facturable === false ? ' on' : '')} onClick={() => set('facturable', false)}><Icon name="x" size={15} />No facturable</button>
        </div>
      </Field>
      {f.facturable === true && <Field label={<span className="flabel"><Icon name="file" size={13} />N&deg; de presupuesto (CRM)</span>}><input value={f.presupuesto_crm || ''} placeholder="Numero de presupuesto" onChange={e => set('presupuesto_crm', e.target.value)} /></Field>}
      {f.facturable === false && <>
        <Field label={<span className="flabel"><Icon name="list" size={13} />Motivo no facturable</span>}>
          <select value={f.motivo_no_fact || ''} onChange={e => set('motivo_no_fact', e.target.value)}>
            <option value="">- Seleccionar -</option>
            {MOTIVOS_NF.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {f.motivo_no_fact === 'contrato' && <Field label={<span className="flabel"><Icon name="pen" size={13} />Contrato asociado</span>}>
          {contratos.length === 0
            ? <div className="muted" style={{ fontSize: 12.5 }}>{f.cliente_id ? 'Este cliente no tiene contratos cargados.' : 'Selecciona un cliente primero.'}</div>
            : <select value={f.contrato_id || ''} onChange={e => set('contrato_id', e.target.value)}><option value="">- Seleccionar contrato -</option>{contratos.map(k => <option key={k.id} value={k.id}>{k.titulo}</option>)}</select>}
        </Field>}
      </>}
      </fieldset>}
    </div>
  );
}

export function TicketModal({ ticket, clientes, usuarios = [], onClose, onSave }) {
  const [f, setF] = useState(ticket);
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={f.id ? 'Ticket TK-' + f.id : 'Nuevo ticket'} subtitle="Incidencia o solicitud" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSave(f)} disabled={!f.titulo}><Icon name="check" size={16} />Guardar</button></>}>
      <div className="tk-form">
        <div className="tk-col">
          <Field label={<span className="flabel"><Icon name="ticket" size={13} />Titulo</span>}><input value={f.titulo || ''} onChange={e => set('titulo', e.target.value)} /></Field>
          <div className="grid2">
            <Field label={<span className="flabel"><Icon name="building" size={13} />Cliente</span>}>
              <select value={f.cliente_id || ''} onChange={e => set('cliente_id', e.target.value)}>
                <option value="">- Sin cliente -</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Field>
            <Field label={<span className="flabel"><Icon name="users" size={13} />Asignado a</span>}>
              <select value={f.asignado || ''} onChange={e => set('asignado', e.target.value)}>
                <option value="">- Sin asignar -</option>
                {usuarios.map(u => <option key={u.id} value={u.nombre || u.username}>{u.nombre || u.username}</option>)}
              </select>
            </Field>
            <Field label={<span className="flabel"><Icon name="alert" size={13} />Prioridad</span>}>
              <select value={f.prioridad} onChange={e => set('prioridad', e.target.value)}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select>
            </Field>
            <Field label={<span className="flabel"><Icon name="checkCircle" size={13} />Estado</span>}>
              <select value={f.estado} onChange={e => set('estado', e.target.value)}><option value="abierto">Abierto</option><option value="en_proceso">En proceso</option><option value="esperando_cliente">Esperando cliente</option><option value="resuelto">Resuelto</option><option value="cerrado">Cerrado</option></select>
            </Field>
          </div>
          <Field label={<span className="flabel"><Icon name="file" size={13} />Descripcion</span>}><textarea rows={5} value={f.descripcion || ''} onChange={e => set('descripcion', e.target.value)} /></Field>
        </div>
        <div className="tk-col">
          <TicketFacturacion f={f} set={set} variant="toggle" />
        </div>
      </div>
    </Modal>
  );
}
