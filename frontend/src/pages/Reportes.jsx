import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { PageHeader, Loading, Empty, estadoBadge } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import Drawer from '../components/Drawer.jsx';
import { toast } from '../components/toast.jsx';

const TABS = [
  ['equipos', 'Equipos', 'box'],
  ['visitas', 'Visitas', 'clipboard'],
  ['tickets', 'Tickets', 'alert'],
];

export default function Reportes() {
  const [tab, setTab] = useState('equipos');
  return (
    <div>
      <PageHeader icon="file" title="Reportes" desc="Extrae informacion de equipos, visitas y tickets y exporta a Excel o PDF" />
      <div className="rep-seg">
        {TABS.map(([k, l, ic]) => (
          <button key={k} className={'rep-seg-b' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
            <Icon name={ic} size={16} />{l}
          </button>
        ))}
      </div>
      {tab === 'equipos' && <RepEquipos />}
      {tab === 'visitas' && <RepVisitas />}
      {tab === 'tickets' && <RepTickets />}
    </div>
  );
}

function fdate(d) { return d ? new Date(d).toLocaleDateString('es-UY') : '-'; }
function fdt(d) { return d ? new Date(d).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'; }
function dur(m) { if (m == null) return '-'; const h = Math.floor(m / 60), mm = m % 60; return h ? h + 'h ' + mm + 'm' : mm + 'm'; }
function Stat({ n, label, kind, icon, on, onClick }) {
  return (
    <div className={'tkl-stat ' + (kind || '') + (on ? ' on' : '')} onClick={onClick} style={onClick ? { cursor: 'pointer' } : null}>
      <span className="ts-ic"><Icon name={icon} size={16} /></span>
      <div><b>{n}</b><small>{label}</small></div>
    </div>
  );
}
const VEST = { programada: ['info', 'Programada'], en_curso: ['warn', 'En curso'], cerrada: ['ok', 'Cerrada'], cancelada: ['gris', 'Cancelada'] };
const TEST = { abierto: ['warn', 'Abierto'], en_proceso: ['info', 'En proceso'], esperando_cliente: ['warn', 'Esperando'], resuelto: ['ok', 'Resuelto'], cerrado: ['gris', 'Cerrado'] };
const PRIO = { alta: ['falla', 'Alta'], media: ['warn', 'Media'], baja: ['info', 'Baja'] };
function Badge({ map, v }) { const m = (map[v] || ['gris', v || '-']); return <span className={'badge ' + m[0]}><span className="dot" />{m[1]}</span>; }

// ====================== REPORTE: EQUIPOS (pruebas) ======================
function RepEquipos() {
  const [clientes, setClientes] = useState([]);
  const [estados, setEstados] = useState([]);
  const [f, setF] = useState({ cliente_id: '', estado_id: '', desde: '', hasta: '', falla: false });
  const [rows, setRows] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [q2, setQ2] = useState('');
  const [tecAv, setTecAv] = useState({});
  const nav = useNavigate();

  useEffect(() => {
    api.get('/api/clientes').then(setClientes);
    api.get('/api/estados_equipo').then(setEstados);
    api.get('/api/tecnicos').then(ts => { const m = {}; (ts || []).forEach(t => { if (t.avatar_path) m[t.nombre] = t.avatar_path; }); setTecAv(m); }).catch(() => {});
  }, []);
  const params = () => {
    const p = new URLSearchParams();
    if (f.cliente_id) p.set('cliente_id', f.cliente_id);
    if (f.estado_id) p.set('estado_id', f.estado_id);
    if (f.desde) p.set('desde', f.desde);
    if (f.hasta) p.set('hasta', f.hasta);
    if (f.falla) p.set('falla', '1');
    return p;
  };
  const buscar = () => { setRows(null); api.get('/api/pruebas?' + params()).then(setRows).catch(e => toast.err(e.message)); };
  useEffect(buscar, []);
  const set = (k, v) => setF({ ...f, [k]: v });
  const activos = (f.cliente_id ? 1 : 0) + (f.estado_id ? 1 : 0) + (f.desde ? 1 : 0) + (f.hasta ? 1 : 0) + (f.falla ? 1 : 0);

  return (
    <div>
      <div className="rep-bar">
        <div className="wa-search" style={{ flex: 1 }}>
          <Icon name="search" size={17} />
          <input placeholder="Buscar por cliente, etiqueta, tecnico o comentario..." value={q2} onChange={e => setQ2(e.target.value)} />
        </div>
        <button className={'btn-filter' + (activos ? ' on' : '')} onClick={() => setSheet(true)}><Icon name="filter" size={16} />Filtros{activos ? <span className="fc">{activos}</span> : null}</button>
        <a className="btn ghost" href={api.fileUrl('/api/pruebas/export.xlsx?' + params())}><Icon name="download" size={16} />Excel</a>
      </div>

      <Drawer open={sheet} onClose={() => setSheet(false)} title="Filtros del reporte" side="bottom"
        footer={<><button className="btn ghost" onClick={() => setF({ cliente_id: '', estado_id: '', desde: '', hasta: '', falla: false })}>Limpiar</button><button className="btn" onClick={() => { setSheet(false); buscar(); }}><Icon name="search" size={15} />Buscar</button></>}>
        <div className="filter-sheet">
          <div className="field"><label><span className="flabel"><Icon name="building" size={13} />Cliente</span></label>
            <select value={f.cliente_id} onChange={e => set('cliente_id', e.target.value)}>
              <option value="">Todos</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></div>
          <div className="field"><label><span className="flabel"><Icon name="alert" size={13} />Estado</span></label>
            <select value={f.estado_id} onChange={e => set('estado_id', e.target.value)}>
              <option value="">Todos</option>{estados.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select></div>
          <div className="grid2">
            <div className="field"><label><span className="flabel"><Icon name="calendar" size={13} />Desde</span></label><input type="date" value={f.desde} onChange={e => set('desde', e.target.value)} /></div>
            <div className="field"><label><span className="flabel"><Icon name="calendar" size={13} />Hasta</span></label><input type="date" value={f.hasta} onChange={e => set('hasta', e.target.value)} /></div>
          </div>
          <label className="row" style={{ gap: 7, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={f.falla} onChange={e => set('falla', e.target.checked)} />
            Solo equipos en falla
          </label>
        </div>
      </Drawer>

      {rows === null ? <Loading /> :
        (() => { const shown = rows.filter(r => !q2 || ((r.cliente || '') + ' ' + (r.etiqueta || '') + ' ' + (r.tecnico || '') + ' ' + (r.comentarios || '')).toLowerCase().includes(q2.toLowerCase())); return shown.length === 0 ? <Empty icon="file" title="Sin resultados">No hay pruebas que coincidan con los filtros.</Empty> :
          <>
            <div className="muted" style={{ margin: '4px 2px 10px', fontSize: 13 }}>{shown.length} prueba(s)</div>
            <div className="card pad-sm"><div className="tablewrap"><table className="table">
              <thead><tr><th>Fecha</th><th>Cliente</th><th>Etiqueta</th><th>Sistema</th><th>Estado</th><th>Tecnico</th><th>Comentarios</th></tr></thead>
              <tbody>{shown.map(r => (
                <tr key={r.id} style={{ cursor: r.visita_id ? 'pointer' : 'default' }} onClick={() => r.visita_id && nav('/visitas/' + r.visita_id)}>
                  <td className="mono">{fdate(r.fecha)}</td>
                  <td>{r.cliente}</td>
                  <td><b>{r.etiqueta || '-'}</b><div className="subtle mono" style={{ fontSize: 11 }}>{r.codigo_qr}</div></td>
                  <td>{r.sistema || '-'}</td>
                  <td>{estadoBadge(r.estado, r.es_falla)}</td>
                  <td>{r.tecnico ? <span className="row" style={{ gap: 7 }}>{tecAv[r.tecnico] ? <img className="hist-av" style={{ width: 26, height: 26 }} src={api.base + tecAv[r.tecnico]} alt="" /> : <span className="tk-av" style={{ width: 26, height: 26, fontSize: 11 }}>{r.tecnico.slice(0, 1).toUpperCase()}</span>}{r.tecnico}</span> : '-'}</td>
                  <td className="muted">{r.comentarios || '-'}</td>
                </tr>
              ))}</tbody>
            </table></div></div>
          </>; })()}
    </div>
  );
}

// ====================== REPORTE: VISITAS ======================
async function emailRep(tipo, params) {
  const to = prompt('Enviar el reporte por email a:'); if (!to || !to.trim()) return;
  try { await api.post('/api/reportes/' + tipo + '/email?' + params(), { to: to.trim(), formato: 'pdf' }); toast.ok('Reporte enviado a ' + to.trim()); }
  catch (e) { toast.err(e.message); }
}

function RepVisitas() {
  const [clientes, setClientes] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [f, setF] = useState({ cliente_id: '', tecnico_id: '', estado: '', tipo: '', desde: '', hasta: '' });
  const [rows, setRows] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [q2, setQ2] = useState('');
  const nav = useNavigate();

  useEffect(() => { api.get('/api/clientes').then(setClientes); api.get('/api/tecnicos').then(setTecnicos).catch(() => {}); }, []);
  const params = () => { const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => v && p.set(k, v)); return p; };
  const buscar = () => { setRows(null); api.get('/api/reportes/visitas?' + params()).then(setRows).catch(e => toast.err(e.message)); };
  useEffect(buscar, []);
  const set = (k, v) => setF({ ...f, [k]: v });
  const activos = Object.values(f).filter(Boolean).length;
  const shown = (rows || []).filter(r => !q2 || ((r.cliente || '') + ' ' + (r.tecnico || '') + ' ' + (r.asignada_por || '')).toLowerCase().includes(q2.toLowerCase()));
  const cnt = (e) => shown.filter(r => r.estado === e).length;
  const totalPr = shown.reduce((a, r) => a + Number(r.pruebas || 0), 0);
  const conFallas = shown.filter(r => Number(r.fallas) > 0).length;

  return (
    <div>
      <div className="rep-bar">
        <div className="wa-search" style={{ flex: 1 }}>
          <Icon name="search" size={17} />
          <input placeholder="Buscar por cliente, tecnico o asignador..." value={q2} onChange={e => setQ2(e.target.value)} />
        </div>
        <button className={'btn-filter' + (activos ? ' on' : '')} onClick={() => setSheet(true)}><Icon name="filter" size={16} />Filtros{activos ? <span className="fc">{activos}</span> : null}</button>
        <a className="btn ghost" href={api.fileUrl('/api/reportes/visitas/export.xlsx?' + params())}><Icon name="download" size={16} />Excel</a>
        <a className="btn ghost" target="_blank" rel="noreferrer" href={api.fileUrl('/api/reportes/visitas/export.pdf?' + params())}><Icon name="file" size={16} />PDF</a>
        <button className="btn ghost" onClick={() => emailRep('visitas', params)}><Icon name="mail" size={16} />Email</button>
      </div>

      {rows !== null && <div className="tkl-stats">
        <Stat n={shown.length} label="Visitas" kind="info" icon="clipboard" />
        <Stat n={cnt('programada')} label="Programadas" kind="info" icon="calendar" on={f.estado === 'programada'} onClick={() => { set('estado', f.estado === 'programada' ? '' : 'programada'); }} />
        <Stat n={cnt('en_curso')} label="En curso" kind="warn" icon="clock" on={f.estado === 'en_curso'} onClick={() => set('estado', f.estado === 'en_curso' ? '' : 'en_curso')} />
        <Stat n={cnt('cerrada')} label="Cerradas" kind="ok" icon="checkCircle" on={f.estado === 'cerrada'} onClick={() => set('estado', f.estado === 'cerrada' ? '' : 'cerrada')} />
        <Stat n={conFallas} label="Con fallas" kind="falla" icon="alert" />
        <Stat n={totalPr} label="Pruebas" kind="" icon="box" />
      </div>}

      <Drawer open={sheet} onClose={() => setSheet(false)} title="Filtros de visitas" side="bottom"
        footer={<><button className="btn ghost" onClick={() => setF({ cliente_id: '', tecnico_id: '', estado: '', tipo: '', desde: '', hasta: '' })}>Limpiar</button><button className="btn" onClick={() => { setSheet(false); buscar(); }}><Icon name="search" size={15} />Buscar</button></>}>
        <div className="filter-sheet">
          <div className="field"><label><span className="flabel"><Icon name="building" size={13} />Cliente</span></label>
            <select value={f.cliente_id} onChange={e => set('cliente_id', e.target.value)}><option value="">Todos</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          <div className="field"><label><span className="flabel"><Icon name="users" size={13} />Tecnico</span></label>
            <select value={f.tecnico_id} onChange={e => set('tecnico_id', e.target.value)}><option value="">Todos</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
          <div className="grid2">
            <div className="field"><label><span className="flabel"><Icon name="alert" size={13} />Estado</span></label>
              <select value={f.estado} onChange={e => set('estado', e.target.value)}><option value="">Todos</option><option value="programada">Programada</option><option value="en_curso">En curso</option><option value="cerrada">Cerrada</option><option value="cancelada">Cancelada</option></select></div>
            <div className="field"><label><span className="flabel"><Icon name="clipboard" size={13} />Tipo</span></label>
              <select value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="">Todos</option><option value="preventiva">Preventivo</option><option value="correctiva">Correctivo</option></select></div>
          </div>
          <div className="grid2">
            <div className="field"><label><span className="flabel"><Icon name="calendar" size={13} />Desde</span></label><input type="date" value={f.desde} onChange={e => set('desde', e.target.value)} /></div>
            <div className="field"><label><span className="flabel"><Icon name="calendar" size={13} />Hasta</span></label><input type="date" value={f.hasta} onChange={e => set('hasta', e.target.value)} /></div>
          </div>
        </div>
      </Drawer>

      {rows === null ? <Loading /> : shown.length === 0 ? <Empty icon="clipboard" title="Sin visitas">No hay visitas que coincidan con los filtros.</Empty> :
        <div className="card pad-sm"><div className="tablewrap"><table className="table">
          <thead><tr><th>Fecha visita</th><th>Cliente</th><th>Tipo</th><th>Ticket</th><th>Tecnico(s)</th><th>Estado</th><th>Fecha max. resol.</th><th style={{ textAlign: 'right' }}>Dias</th><th>Trabajado</th><th>Ejecucion</th><th style={{ textAlign: 'right' }}>Pruebas</th><th style={{ textAlign: 'right' }}>Fallas</th></tr></thead>
          <tbody>{shown.map(r => (
            <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => nav('/visitas/' + r.id)}>
              <td className="mono">{fdate(r.fecha)}</td>
              <td><b>{r.cliente || '-'}</b>{r.asignada_por ? <div className="subtle" style={{ fontSize: 11 }}>por {r.asignada_por}</div> : null}</td>
              <td>{r.tipo === 'correctiva' ? <span className="badge warn">Correctivo</span> : <span className="badge info">Preventivo</span>}</td>
              <td className="mono">{r.ticket_id ? <a onClick={e => { e.stopPropagation(); nav('/tickets/' + r.ticket_id); }} style={{ color: 'var(--brand-700)', cursor: 'pointer' }}>TK-{r.ticket_id}</a> : <span className="subtle">-</span>}</td>
              <td>{r.tecnico || '-'}</td>
              <td><Badge map={VEST} v={r.estado} /></td>
              <td className="mono">{fdate(r.fecha_max_resolucion)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{r.multidia ? <span className="badge info" title="dias trabajados / planificados">{r.dias_trab}/{r.dias_plan}</span> : <span className="subtle">-</span>}</td>
              <td className="mono">{dur(r.trabajado_min)}</td>
              <td className="mono">{dur(r.duracion_min)}</td>
              <td style={{ textAlign: 'right' }}>{r.pruebas}</td>
              <td style={{ textAlign: 'right' }}>{Number(r.fallas) > 0 ? <span className="badge falla">{r.fallas}</span> : <span className="subtle">0</span>}</td>
            </tr>
          ))}</tbody>
        </table></div></div>}
    </div>
  );
}

// ====================== REPORTE: TICKETS ======================
function RepTickets() {
  const [clientes, setClientes] = useState([]);
  const [f, setF] = useState({ cliente_id: '', estado: '', prioridad: '', desde: '', hasta: '' });
  const [rows, setRows] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [q2, setQ2] = useState('');
  const nav = useNavigate();

  useEffect(() => { api.get('/api/clientes').then(setClientes); }, []);
  const params = () => { const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => v && p.set(k, v)); return p; };
  const buscar = () => { setRows(null); api.get('/api/reportes/tickets?' + params()).then(setRows).catch(e => toast.err(e.message)); };
  useEffect(buscar, []);
  const set = (k, v) => setF({ ...f, [k]: v });
  const activos = Object.values(f).filter(Boolean).length;
  const shown = (rows || []).filter(r => !q2 || (('tk-' + r.id) + ' ' + (r.titulo || '') + ' ' + (r.cliente || '') + ' ' + (r.asignado || '') + ' ' + (r.solicitante || '')).toLowerCase().includes(q2.toLowerCase()));
  const cnt = (e) => shown.filter(r => r.estado === e).length;
  const cerrados = shown.filter(r => ['resuelto', 'cerrado'].includes(r.estado));
  const promH = cerrados.length ? Math.round(cerrados.reduce((a, r) => a + Number(r.horas_resolucion || 0), 0) / cerrados.length) : 0;

  return (
    <div>
      <div className="rep-bar">
        <div className="wa-search" style={{ flex: 1 }}>
          <Icon name="search" size={17} />
          <input placeholder="Buscar por numero, titulo, cliente o asignado..." value={q2} onChange={e => setQ2(e.target.value)} />
        </div>
        <button className={'btn-filter' + (activos ? ' on' : '')} onClick={() => setSheet(true)}><Icon name="filter" size={16} />Filtros{activos ? <span className="fc">{activos}</span> : null}</button>
        <a className="btn ghost" href={api.fileUrl('/api/reportes/tickets/export.xlsx?' + params())}><Icon name="download" size={16} />Excel</a>
        <a className="btn ghost" target="_blank" rel="noreferrer" href={api.fileUrl('/api/reportes/tickets/export.pdf?' + params())}><Icon name="file" size={16} />PDF</a>
        <button className="btn ghost" onClick={() => emailRep('tickets', params)}><Icon name="mail" size={16} />Email</button>
      </div>

      {rows !== null && <div className="tkl-stats">
        <Stat n={shown.length} label="Tickets" kind="info" icon="alert" />
        <Stat n={cnt('abierto')} label="Abiertos" kind="warn" icon="alert" on={f.estado === 'abierto'} onClick={() => set('estado', f.estado === 'abierto' ? '' : 'abierto')} />
        <Stat n={cnt('en_proceso')} label="En proceso" kind="info" icon="clock" on={f.estado === 'en_proceso'} onClick={() => set('estado', f.estado === 'en_proceso' ? '' : 'en_proceso')} />
        <Stat n={cnt('resuelto')} label="Resueltos" kind="ok" icon="checkCircle" on={f.estado === 'resuelto'} onClick={() => set('estado', f.estado === 'resuelto' ? '' : 'resuelto')} />
        <Stat n={cnt('cerrado')} label="Cerrados" kind="gris" icon="check" on={f.estado === 'cerrado'} onClick={() => set('estado', f.estado === 'cerrado' ? '' : 'cerrado')} />
        <Stat n={promH ? promH + 'h' : '-'} label="Prom. resol." kind="" icon="clock" />
      </div>}

      <Drawer open={sheet} onClose={() => setSheet(false)} title="Filtros de tickets" side="bottom"
        footer={<><button className="btn ghost" onClick={() => setF({ cliente_id: '', estado: '', prioridad: '', desde: '', hasta: '' })}>Limpiar</button><button className="btn" onClick={() => { setSheet(false); buscar(); }}><Icon name="search" size={15} />Buscar</button></>}>
        <div className="filter-sheet">
          <div className="field"><label><span className="flabel"><Icon name="building" size={13} />Cliente</span></label>
            <select value={f.cliente_id} onChange={e => set('cliente_id', e.target.value)}><option value="">Todos</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          <div className="grid2">
            <div className="field"><label><span className="flabel"><Icon name="alert" size={13} />Estado</span></label>
              <select value={f.estado} onChange={e => set('estado', e.target.value)}><option value="">Todos</option><option value="abierto">Abierto</option><option value="en_proceso">En proceso</option><option value="esperando_cliente">Esperando cliente</option><option value="resuelto">Resuelto</option><option value="cerrado">Cerrado</option></select></div>
            <div className="field"><label><span className="flabel"><Icon name="alert" size={13} />Prioridad</span></label>
              <select value={f.prioridad} onChange={e => set('prioridad', e.target.value)}><option value="">Todas</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
          </div>
          <div className="grid2">
            <div className="field"><label><span className="flabel"><Icon name="calendar" size={13} />Creado desde</span></label><input type="date" value={f.desde} onChange={e => set('desde', e.target.value)} /></div>
            <div className="field"><label><span className="flabel"><Icon name="calendar" size={13} />Creado hasta</span></label><input type="date" value={f.hasta} onChange={e => set('hasta', e.target.value)} /></div>
          </div>
        </div>
      </Drawer>

      {rows === null ? <Loading /> : shown.length === 0 ? <Empty icon="alert" title="Sin tickets">No hay tickets que coincidan con los filtros.</Empty> :
        <div className="card pad-sm"><div className="tablewrap"><table className="table">
          <thead><tr><th>N</th><th>Titulo</th><th>Cliente</th><th>Prioridad</th><th>Estado</th><th>Solicitante</th><th>Asignado</th><th>Creado</th><th>Fecha max. resol.</th><th>Facturable</th><th>Nro CRM</th><th>Motivo no fact.</th><th style={{ textAlign: 'right' }}>Resol.</th></tr></thead>
          <tbody>{shown.map(r => (
            <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => nav('/tickets/' + r.id)}>
              <td className="mono">TK-{r.id}</td>
              <td><b>{r.titulo || '-'}</b></td>
              <td>{r.cliente || '-'}</td>
              <td><Badge map={PRIO} v={r.prioridad} /></td>
              <td><Badge map={TEST} v={r.estado} /></td>
              <td className="muted">{r.solicitante || '-'}</td>
              <td className="muted">{r.asignado || '-'}</td>
              <td className="mono">{fdate(r.created_at)}</td>
              <td className="mono">{fdate(r.fecha_max_resolucion)}</td>
              <td>{r.facturable === true ? <span className="badge ok">Si</span> : r.facturable === false ? <span className="badge gris">No</span> : <span className="subtle">-</span>}</td>
              <td className="mono">{r.presupuesto_crm || '-'}</td>
              <td className="muted" style={{ maxWidth: 220, whiteSpace: 'normal' }}>{r.motivo_no_fact || '-'}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{r.horas_resolucion != null ? r.horas_resolucion + 'h' : '-'}</td>
            </tr>
          ))}</tbody>
        </table></div></div>}
    </div>
  );
}
