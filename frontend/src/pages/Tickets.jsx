import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Loading, Empty, Modal, Field, ClienteSelect } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import { AgendarModal } from './Visitas.jsx';
import Drawer from '../components/Drawer.jsx';

export const PRIO = { baja: ['Baja', '#2563eb'], media: ['Media', '#ea580c'], alta: ['Alta', '#dc2626'] };
export const EST = { abierto: ['warn', 'Abierto', 'alert'], en_proceso: ['info', 'En proceso', 'clock'], esperando_cliente: ['warn', 'Esperando cliente', 'phone'], esperando_ies: ['warn', 'Esperando IES', 'truck'], resuelto: ['ok', 'Resuelto', 'checkCircle'], cerrado: ['gris', 'Cerrado', 'check'] };
export const esVencido = (t) => !['resuelto', 'cerrado'].includes(t.estado) && t.fecha_max_resolucion && String(t.fecha_max_resolucion).slice(0, 10) < new Date().toISOString().slice(0, 10);
const ESTADOS = [['', 'Todos'], ['abierto', 'Abiertos'], ['en_proceso', 'En proceso'], ['resuelto', 'Resueltos'], ['cerrado', 'Cerrados']];
// Chips de visitas asociadas al ticket, por estado de la visita.
const VIS_META = [['programada', 'info', 'calendar', 'Programada'], ['en_curso', 'warn', 'clock', 'En curso'], ['cerrada', 'ok', 'checkCircle', 'Cerrada'], ['cancelada', 'gris', 'x', 'Cancelada']];
function VisitasCell({ t }) {
  const m = t.visitas_por_estado || {};
  const tot = t.visitas_total || 0;
  return (
    <span className="tkl-vis" style={{ width: 128, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      {tot === 0 ? <span className="subtle" style={{ fontSize: 12 }}>—</span>
        : VIS_META.filter(([k]) => m[k]).map(([k, cls, ic, lbl]) => (
          <span key={k} className={'badge ' + cls} style={{ padding: '1px 6px', fontSize: 11, gap: 3 }} data-tip={m[k] + ' ' + lbl + (m[k] > 1 ? 's' : '')}><Icon name={ic} size={10} />{m[k]}</span>
        ))}
    </span>
  );
}

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
  if (!nombre) return <span className="tkl-av ini" style={{ width: size, height: size, minWidth: size, flexShrink: 0, alignSelf: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#dcfce7', color: '#16a34a' }} data-tip="Sin asignar"><Icon name="plus" size={Math.round(size * 0.55)} /></span>;
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
    <div className="modal-bg">
      <div className="cfm">
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
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [convNuevo, setConvNuevo] = useState(null);
  const [tecAv, setTecAv] = useState({});
  const [usuarios, setUsuarios] = useState([]);
  const [estado, setEstado] = useState([]);
  const [prio, setPrio] = useState([]);
  const [clienteId, setClienteId] = useState([]);
  const [asignado, setAsignado] = useState([]);
  const [conVisita, setConVisita] = useState('');
  const [visitaAbierta, setVisitaAbierta] = useState('');
  const [cliQ, setCliQ] = useState('');
  const [sheet, setSheet] = useState(false);
  const [q, setQ] = useState('');
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const [modal, setModal] = useState(null);
  const [aBorrar, setABorrar] = useState(null);
  const [ctx, setCtx] = useState(null); // {x,y,t}
  const [sub, setSub] = useState(null); // 'asignar'|'estado'|'prioridad'

  const LIMIT = 40;
  const load = () => {
    const p = new URLSearchParams();
    estado.forEach(v => p.append('estado', v));
    prio.forEach(v => p.append('prioridad', v));
    clienteId.forEach(v => p.append('cliente_id', v));
    asignado.forEach(v => p.append('asignado', v));
    if (conVisita) p.set('con_visita', conVisita);
    if (visitaAbierta) p.set('visita_abierta', visitaAbierta);
    if (q) p.set('search', q);
    p.set('page', page); p.set('limit', LIMIT);
    api.get('/api/tickets?' + p).then(r => {
      if (Array.isArray(r)) { setItems(r); setMeta({ total: r.length, page: 1, pages: 1 }); }
      else { setItems(r.rows); setMeta({ total: r.total, page: r.page, pages: r.pages }); }
    });
  };
  const loadStats = () => api.get('/api/tickets/stats').then(setStats).catch(() => {});
  const reload = () => { load(); loadStats(); };
  useEffect(() => {
    api.get('/api/clientes').then(setClientes);
    api.get('/api/tecnicos').then(setTecnicos).catch(() => {});
    api.get('/api/usuarios/lista').then(us => {
      setUsuarios(us || []);
      const m = {}; (us || []).forEach(u => { if (u.avatar_path) { m[u.nombre] = u.avatar_path; m[u.username] = u.avatar_path; } });
      setTecAv(m);
    }).catch(() => {});
    loadStats();
  }, []);
  useEffect(() => { setPage(1); }, [estado, prio, clienteId, asignado, conVisita, visitaAbierta, q]);
  useEffect(() => { const tmr = setTimeout(load, 250); return () => clearTimeout(tmr); }, [estado, prio, clienteId, asignado, conVisita, visitaAbierta, q, page]);

  // Filtros activos (chips removibles) y contador para el boton "Filtros".
  const ESTADO_OPTS = [['abierto', 'Abierto'], ['en_proceso', 'En proceso'], ['esperando_cliente', 'Esperando cliente'], ['esperando_ies', 'Esperando IES'], ['resuelto', 'Resuelto'], ['cerrado', 'Cerrado'], ['vencidos', 'Vencidos']];
  const nomCliente = (id) => (clientes.find(c => String(c.id) === String(id)) || {}).nombre || ('Cliente ' + id);
  const estLabel = (e) => e === 'vencidos' ? 'Vencidos' : (EST[e] ? EST[e][1] : e);
  const filtCount = estado.length + prio.length + clienteId.length + asignado.length + (conVisita ? 1 : 0) + (visitaAbierta ? 1 : 0);
  const limpiar = () => { setEstado([]); setPrio([]); setClienteId([]); setAsignado([]); setConVisita(''); setVisitaAbierta(''); setQ(''); };
  const activos = [
    ...estado.map(e => ({ key: 'e' + e, label: 'Estado: ' + estLabel(e), clear: () => setEstado(estado.filter(x => x !== e)) })),
    ...prio.map(p => ({ key: 'p' + p, label: 'Prioridad: ' + (PRIO[p] || [''])[0], clear: () => setPrio(prio.filter(x => x !== p)) })),
    ...clienteId.map(c => ({ key: 'c' + c, label: 'Cliente: ' + nomCliente(c), clear: () => setClienteId(clienteId.filter(x => x !== c)) })),
    ...asignado.map(a => ({ key: 'a' + a, label: 'Asignado: ' + (a === '__none__' ? 'Sin asignar' : a), clear: () => setAsignado(asignado.filter(x => x !== a)) })),
    ...(conVisita ? [{ key: 'vis', label: conVisita === 'con' ? 'Con visita' : 'Sin visita', clear: () => setConVisita('') }] : []),
    ...(visitaAbierta ? [{ key: 'va', label: visitaAbierta === 'con' ? 'Con visita abierta' : 'Sin visita abierta', clear: () => setVisitaAbierta('') }] : []),
    ...(q ? [{ key: 'q', label: 'Búsqueda: “' + q + '”', clear: () => setQ('') }] : []),
  ];

  useEffect(() => { if (!ctx) return; const close = () => { setCtx(null); setSub(null); }; window.addEventListener('click', close); window.addEventListener('scroll', close, true); return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); }; }, [ctx]);
  const cambiarCampo = async (t, campo, valor) => { try { await api.put('/api/tickets/' + t.id, { ...t, [campo]: valor }); toast.ok('Ticket actualizado'); setCtx(null); setSub(null); reload(); } catch (e) { toast.err(e.message); } };
  const save = async (f, pend = []) => {
    try {
      let id = f.id;
      if (f.id) await api.put('/api/tickets/' + f.id, f);
      else { const r = await api.post('/api/tickets', f); id = r.id; }
      if (id && pend.length) {
        for (const tipo of ['foto', 'adjunto']) {
          const fs = pend.filter(p => p.tipo === tipo).map(p => p.file);
          if (fs.length) { const fd = new FormData(); fs.forEach(file => fd.append('files', file)); fd.append('tipo', tipo); await api.upload('/api/tickets/' + id + '/archivos', fd).catch(() => {}); }
        }
      }
      setModal(null); toast.ok('Ticket guardado'); reload();
    } catch (e) { toast.err(e.message); }
  };
  const del = async (t) => { try { await api.del('/api/tickets/' + t.id); toast.ok('Ticket TK-' + t.id + ' eliminado'); setABorrar(null); reload(); } catch (e) { toast.err(e.message); } };
  // Abre el modal "Agendar visita" prellenado con el ticket, para poder elegir 1 o varios días.
  const convertir = (t) => {
    if (!t.cliente_id) { toast.err('El ticket no tiene cliente asociado'); return; }
    setConvNuevo({ cliente_id: t.cliente_id, fecha: new Date().toISOString().slice(0, 10), tipo: 'correctiva', titulo: t.titulo || '', situacion_inicial: t.descripcion || '', ticket_id: t.id, asignada_por: 'Ticket TK-' + t.id, fecha_max_resolucion: t.fecha_max_resolucion || null, _ticket: t });
  };
  const guardarVisitaTicket = async (f) => {
    const t = f._ticket || {};
    try {
      const v = await api.post('/api/clientes/' + f.cliente_id + '/visitas', { fecha: f.fecha || null, dias: f.dias || null, tecnico_id: f.tecnico_id || null, tipo: 'correctiva', titulo: f.titulo || null, situacion_inicial: f.situacion_inicial || null, ticket_id: f.ticket_id || null, asignada_por: f.asignada_por || null, fecha_max_resolucion: f.fecha_max_resolucion || null, contrato_id: f.contrato_id || null });
      const fd = new FormData(); fd.append('texto', 'Convirtio el ticket en la visita correctiva #' + v.id);
      await api.upload('/api/tickets/' + t.id + '/comentarios', fd).catch(() => {});
      if (t.estado === 'abierto') await api.put('/api/tickets/' + t.id, { ...t, estado: 'en_proceso' }).catch(() => {});
      toast.ok(f.dias && f.dias.length > 1 ? 'Visita de ' + f.dias.length + ' días creada' : 'Visita correctiva creada');
      setConvNuevo(null);
      nav('/visitas/' + v.id);
    } catch (e) { toast.err(e.message); }
  };

  const shown = items || [];

  return (
    <div>
      <PageHeader icon="ticket" title="Tickets" desc="Incidencias y solicitudes de soporte"
        actions={<button className="btn sm" onClick={() => setModal({ titulo: '', cliente_id: '', prioridad: 'media', estado: 'abierto', asignado: '', descripcion: '' })}><Icon name="plus" size={16} />Nuevo ticket</button>} />

      {stats && <div className="tkl-stats">
        {[['abierto', 'Abiertos'], ['en_proceso', 'En proceso'], ['esperando_cliente', 'Esperando cliente'], ['esperando_ies', 'Esperando IES'], ['resuelto', 'Resueltos'], ['cerrado', 'Cerrados']].map(([e, l]) => {
          const [tone, , ic] = EST[e];
          return (
            <div key={e} className={'tkl-stat ' + tone + (estado.includes(e) ? ' on' : '')} onClick={() => toggle(estado, setEstado, e)}>
              <span className="ts-ic"><Icon name={ic} size={16} /></span>
              <div><b>{stats[e] || 0}</b><small>{l}</small></div>
            </div>
          );
        })}
        <div className={'tkl-stat falla' + (estado.includes('vencidos') ? ' on' : '')} onClick={() => toggle(estado, setEstado, 'vencidos')}>
          <span className="ts-ic"><Icon name="alert" size={16} /></span>
          <div><b>{stats.vencidos || 0}</b><small>Vencidos</small></div>
        </div>
      </div>}

      <div className="row wrap" style={{ gap: 10, marginBottom: activos.length ? 8 : 14 }}>
        <div className="wa-search" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
          <Icon name="search" size={17} /><input placeholder="Buscar por clave, titulo, cliente o asignado..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button className={'btn-filter' + (filtCount ? ' on' : '')} onClick={() => setSheet(true)}>
          <Icon name="filter" size={16} />Filtros{filtCount ? <span className="fc">{filtCount}</span> : null}
        </button>
      </div>

      {activos.length > 0 && <div className="row wrap" style={{ gap: 6, marginBottom: 14, alignItems: 'center' }}>
        {activos.map(a => (
          <span key={a.key} className="chip active" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {a.label}
            <button onClick={a.clear} aria-label="Quitar filtro" style={{ display: 'inline-flex', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'inherit', opacity: .7 }}><Icon name="x" size={12} /></button>
          </span>
        ))}
        <button className="btn ghost sm" onClick={limpiar} style={{ height: 26 }}><Icon name="x" size={13} />Limpiar filtros</button>
      </div>}

      <Drawer open={sheet} onClose={() => setSheet(false)} title="Filtros de tickets" side="bottom"
        footer={<><button className="btn ghost" onClick={limpiar}>Limpiar</button><button className="btn" onClick={() => setSheet(false)}>Aplicar</button></>}>
        <div className="filter-sheet">
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Podés elegir varios de cada tipo. Dentro de un tipo suma (o); entre tipos se combinan (y).</div>
          <div className="field"><label>Estado {estado.length > 0 && <span className="fc">{estado.length}</span>}</label>
            <div className="chips">
              {ESTADO_OPTS.map(([v, l]) => <span key={v} className={'chip' + (estado.includes(v) ? ' active' : '')} onClick={() => toggle(estado, setEstado, v)}>{l}</span>)}
            </div></div>
          <div className="field"><label>Prioridad {prio.length > 0 && <span className="fc">{prio.length}</span>}</label>
            <div className="chips">
              {Object.entries(PRIO).map(([v, [l]]) => <span key={v} className={'chip' + (prio.includes(v) ? ' active' : '')} onClick={() => toggle(prio, setPrio, v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PrioIcon p={v} size={12} />{l}</span>)}
            </div></div>
          <div className="field"><label>Asignado a {asignado.length > 0 && <span className="fc">{asignado.length}</span>}</label>
            <div className="chips">
              <span className={'chip' + (asignado.includes('__none__') ? ' active' : '')} onClick={() => toggle(asignado, setAsignado, '__none__')}>Sin asignar</span>
              {usuarios.map(u => { const nm = u.nombre || u.username; return <span key={u.id} className={'chip' + (asignado.includes(nm) ? ' active' : '')} onClick={() => toggle(asignado, setAsignado, nm)}>{nm}</span>; })}
            </div></div>
          <div className="field"><label>Cliente {clienteId.length > 0 && <span className="fc">{clienteId.length}</span>}</label>
            {clienteId.length > 0 && <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
              {clienteId.map(id => <span key={id} className="chip active" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{nomCliente(id)}<button onClick={() => setClienteId(clienteId.filter(x => x !== id))} aria-label="Quitar" style={{ display: 'inline-flex', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'inherit', opacity: .7 }}><Icon name="x" size={11} /></button></span>)}
            </div>}
            <div className="wa-search" style={{ marginBottom: 0 }}>
              <Icon name="search" size={16} /><input placeholder="Buscar cliente para agregar…" value={cliQ} onChange={e => setCliQ(e.target.value)} />
            </div>
            {cliQ.trim() && (() => {
              const res = clientes.filter(c => (c.nombre || '').toLowerCase().includes(cliQ.toLowerCase()) && !clienteId.includes(String(c.id))).slice(0, 25);
              return <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10, marginTop: 6 }}>
                {res.length === 0 ? <div className="muted" style={{ padding: '8px 10px', fontSize: 13 }}>Sin coincidencias</div>
                  : res.map(c => <div key={c.id} className="row" style={{ gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 14 }} onClick={() => { toggle(clienteId, setClienteId, String(c.id)); setCliQ(''); }}>
                    <Icon name="plus" size={13} color="var(--brand-600)" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                  </div>)}
              </div>;
            })()}
          </div>
          <div className="field"><label>Visitas asociadas</label>
            <div className="chips">
              {[['', 'Todas'], ['con', 'Con visita'], ['sin', 'Sin visita']].map(([v, l]) => <span key={v || 'all'} className={'chip' + (conVisita === v ? ' active' : '')} onClick={() => setConVisita(v)}>{l}</span>)}
            </div></div>
          <div className="field"><label>Visita abierta <span className="subtle" style={{ fontWeight: 400, fontSize: 12 }}>(programada o en curso)</span></label>
            <div className="chips">
              {[['', 'Todas'], ['con', 'Con visita abierta'], ['sin', 'Sin visita abierta']].map(([v, l]) => <span key={v || 'all'} className={'chip' + (visitaAbierta === v ? ' active' : '')} onClick={() => setVisitaAbierta(v)}>{l}</span>)}
            </div></div>
        </div>
      </Drawer>

      {items === null ? <Loading /> :
        shown.length === 0 ? <Empty icon="ticket" title="Sin tickets">No hay tickets con esos filtros.</Empty> :
          <div className="tkl card pad-sm" style={{ padding: 6 }}>
            <div className="tkl-headrow">
              <span style={{ width: 28 }} /><span className="tkl-key">Clave</span><span style={{ flex: 1 }}>Ticket</span>
              <span style={{ width: 22 }} data-tip="Prioridad">P</span><span style={{ width: 96 }}>Estado</span>
              <span style={{ width: 128 }} data-tip="Visitas asociadas y su estado">Visitas</span>
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
                  <VisitasCell t={t} />
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

      {meta.pages > 1 && <div className="row between wrap" style={{ marginTop: 12, alignItems: 'center', gap: 10 }}>
        <span className="muted" style={{ fontSize: 13 }}>{meta.total} tickets · pág. {meta.page}/{meta.pages}</span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sec sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><Icon name="chevronLeft" size={15} />Anterior</button>
          <button className="btn sec sm" disabled={page >= meta.pages} onClick={() => setPage(p => Math.min(meta.pages, p + 1))}>Siguiente<Icon name="chevronRight" size={15} /></button>
        </div>
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
      {convNuevo && <AgendarModal nuevo={convNuevo} clientes={clientes} tecnicos={tecnicos} onClose={() => setConvNuevo(null)} onSave={guardarVisitaTicket} />}
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
  const [pend, setPend] = useState([]);
  const set = (k, v) => setF({ ...f, [k]: v });
  const addFiles = (e, tipo) => { const fs = [...e.target.files].map(file => ({ file, tipo })); setPend(p => [...p, ...fs]); e.target.value = ''; };
  return (
    <Modal title={f.id ? 'Ticket TK-' + f.id : 'Nuevo ticket'} subtitle="Incidencia o solicitud" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSave(f, pend)} disabled={!f.titulo}><Icon name="check" size={16} />Guardar</button></>}>
      <div className="tk-form">
        <div className="tk-col">
          <Field label={<span className="flabel"><Icon name="ticket" size={13} />Titulo</span>}><input value={f.titulo || ''} onChange={e => set('titulo', e.target.value)} /></Field>
          <div className="grid2">
            <Field label={<span className="flabel"><Icon name="building" size={13} />Cliente</span>}>
              <ClienteSelect clientes={clientes} value={f.cliente_id} onChange={v => set('cliente_id', v)} placeholder="Buscar cliente…" allowEmpty />
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
              <select value={f.estado} onChange={e => set('estado', e.target.value)}><option value="abierto">Abierto</option><option value="en_proceso">En proceso</option><option value="esperando_cliente">Esperando cliente</option><option value="esperando_ies">Esperando IES</option><option value="resuelto">Resuelto</option><option value="cerrado">Cerrado</option></select>
            </Field>
          </div>
          <Field label={<span className="flabel"><Icon name="file" size={13} />Descripcion</span>}><textarea rows={5} value={f.descripcion || ''} onChange={e => set('descripcion', e.target.value)} /></Field>
          <Field label={<span className="flabel"><Icon name="camera" size={13} />Fotos, videos y adjuntos</span>}>
            <div className="row wrap" style={{ gap: 8 }}>
              <label className="btn sec sm" style={{ cursor: 'pointer' }}><Icon name="camera" size={15} />Foto<input type="file" accept="image/*" multiple hidden onChange={e => addFiles(e, 'foto')} /></label>
              <label className="btn sec sm" style={{ cursor: 'pointer' }}><Icon name="paperclip" size={15} />Adjunto<input type="file" multiple hidden onChange={e => addFiles(e, 'adjunto')} /></label>
            </div>
            {pend.length > 0 && <div className="stack" style={{ gap: 4, marginTop: 6 }}>
              {pend.map((p, i) => <div key={i} className="row between" style={{ fontSize: 13 }}>
                <span className="row" style={{ gap: 6, minWidth: 0 }}><Icon name={p.tipo === 'foto' ? 'camera' : 'file'} size={13} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.file.name}</span></span>
                <button type="button" className="btn ghost icon sm" aria-label="Quitar" onClick={() => setPend(arr => arr.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>
              </div>)}
            </div>}
          </Field>
        </div>
        <div className="tk-col">
          <TicketFacturacion f={f} set={set} variant="toggle" />
        </div>
      </div>
    </Modal>
  );
}
