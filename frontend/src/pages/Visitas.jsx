import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { getUser } from '../auth.js';
import { PageHeader, Loading, Empty, Modal, Field } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import Drawer from '../components/Drawer.jsx';

const EST = { programada: ['gris', 'Programada'], en_curso: ['info', 'En curso'], cerrada: ['ok', 'Cerrada'], cancelada: ['falla', 'Cancelada'] };
const ESTADOS = [['', 'Todas'], ['programada', 'Programadas'], ['en_curso', 'En curso'], ['cerrada', 'Cerradas'], ['cancelada', 'Canceladas']];
const RING = { programada: '', en_curso: 'ring-ok', cerrada: 'ring-info' };
const DOTC = { programada: 'var(--subtle)', en_curso: 'var(--ok)', cerrada: 'var(--info)' };
const TIMEAC = { programada: '', en_curso: ' ac-ok', cerrada: ' ac-info' };

function duracion(v) {
  if (!v.hora_entrada) return '-';
  if (!v.hora_salida) return v.estado === 'en_curso' ? 'en curso' : '-';
  const ms = new Date(v.hora_salida) - new Date(v.hora_entrada);
  if (ms < 0) return '-';
  const min = Math.round(ms / 60000), h = Math.floor(min / 60), m = min % 60;
  return h ? (h + 'h ' + m + 'm') : (m + 'm');
}

export default function Visitas() {
  const [items, setItems] = useState(null);
  const [tecnicos, setTecnicos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [f, setF] = useState({ estado: '', tecnico_id: '', cliente_id: '', desde: '', hasta: '' });
  const [sheet, setSheet] = useState(false);
  const [nuevo, setNuevo] = useState(null);
  const [vista, setVista] = useState('calendario');
  const [esDesk, setEsDesk] = useState(typeof window !== 'undefined' && window.innerWidth >= 900);
  useEffect(() => { const fn = () => setEsDesk(window.innerWidth >= 900); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn); }, []);
  const [q, setQ] = useState('');
  const [aBorrar, setABorrar] = useState(null);
  const esAdmin = getUser()?.rol === 'admin';
  const nav = useNavigate();

  const load = () => {
    const p = new URLSearchParams();
    // El estado se filtra del lado del cliente (para que las tarjetas muestren el total por estado).
    Object.entries(f).forEach(([k, v]) => { if (k !== 'estado' && v) p.set(k, v); });
    setItems(null);
    api.get('/api/visitas?' + p).then(setItems);
  };
  useEffect(() => { api.get('/api/tecnicos').then(setTecnicos); api.get('/api/clientes').then(setClientes); }, []);
  useEffect(load, [f]);
  const set = (k, v) => setF({ ...f, [k]: v });
  const limpiar = () => setF({ estado: '', tecnico_id: '', cliente_id: '', desde: '', hasta: '' });
  const activos = Object.values(f).filter(Boolean).length;

  const resched = async (id, fecha) => {
    try { await api.put('/api/visitas/' + id + '/fecha', { fecha }); toast.ok('Visita reprogramada'); load(); }
    catch (e) { toast.err(e.message); }
  };

  const agendar = async (f) => {
    if (!f.cliente_id) return;
    try {
      const v = await api.post('/api/clientes/' + f.cliente_id + '/visitas', { fecha: f.fecha || null, dias: f.dias || null, tecnico_id: f.tecnico_id || null, asignada_por: f.asignada_por || null, tipo: f.tipo || 'preventiva', contrato_id: f.contrato_id || null });
      toast.ok(f.dias && f.dias.length > 1 ? 'Visita de ' + f.dias.length + ' días agendada' : 'Visita agendada'); setNuevo(null); nav('/visitas/' + v.id);
    } catch (e) { toast.err(e.message); }
  };

  const reabrir = async (e, v) => {
    e.stopPropagation();
    if (!confirm('Reabrir esta visita cerrada?')) return;
    try { await api.post('/api/visitas/' + v.id + '/reabrir', {}); toast.ok('Visita reabierta'); load(); }
    catch (err) { toast.err(err.message); }
  };

  // Chips de filtros activos (removibles)
  const cliName = (id) => clientes.find(c => String(c.id) === String(id))?.nombre || 'Cliente';
  const tecName = (id) => tecnicos.find(t => String(t.id) === String(id))?.nombre || 'Tecnico';
  const chips = [];
  if (f.estado) chips.push(['estado', (ESTADOS.find(x => x[0] === f.estado) || [, f.estado])[1]]);
  if (f.cliente_id) chips.push(['cliente_id', cliName(f.cliente_id)]);
  if (f.tecnico_id) chips.push(['tecnico_id', tecName(f.tecnico_id)]);
  if (f.desde) chips.push(['desde', 'Desde ' + f.desde]);
  if (f.hasta) chips.push(['hasta', 'Hasta ' + f.hasta]);

  const Row = (v, closed) => {
    const [c, l] = EST[v.estado] || EST.programada;
    const dur = duracion(v);
    return (
      <div key={v.id} className={'wa-row' + (closed ? ' wa-closed' : '')} onClick={() => nav('/visitas/' + v.id)}>
        <div className={'wa-av' + (RING[v.estado] ? ' ' + RING[v.estado] : '')}>
          <Icon name="building" size={23} />
          <span className="wa-dot" style={{ background: DOTC[v.estado] || 'var(--subtle)' }} />
        </div>
        <div className="wa-main">
          <div className="wa-top">
            <span className="wa-title">{v.titulo ? v.titulo + ' · ' + v.cliente : v.cliente}</span>
            <span className={'wa-time' + (TIMEAC[v.estado] || '')}>{new Date(v.fecha).toLocaleDateString('es-UY')}</span>
          </div>
          <div className="wa-bot">
            <span className="wa-sub"><Icon name="users" size={13} />{v.tecnico || 'Sin tecnico'} &middot; {v.pruebas} equipos{v.asignada_por ? ' · asign. ' + v.asignada_por : ''}</span>
            <span className="wa-meta">
              {dur !== '-' && <span className="wa-time">{dur}</span>}
              {closed
                ? <button className="btn ghost sm" onClick={(e) => reabrir(e, v)}><Icon name="edit" size={13} />Reabrir</button>
                : <span className={'badge ' + c}><span className="dot" />{l}</span>}
              {esAdmin && <button className="btn ghost icon tkl-del" data-tip="Eliminar visita" aria-label="Eliminar" onClick={(e) => { e.stopPropagation(); setABorrar(v); }}><Icon name="trash" size={14} /></button>}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const HOY = _ymd(new Date());
  const esVenc = (v) => v.estado === 'programada' && (v.fecha || '').slice(0, 10) < HOY;
  const matchEstado = (v) => !f.estado || (f.estado === 'vencida' ? esVenc(v) : v.estado === f.estado);
  const matchQ = (v) => !q || ((v.cliente || '') + ' ' + (v.tecnico || '') + ' ' + (v.asignada_por || '')).toLowerCase().includes(q.toLowerCase());
  const filtrados = (items || []).filter(v => matchQ(v) && matchEstado(v));
  const activas = filtrados.filter(v => v.estado !== 'cerrada');
  const cerradas = filtrados.filter(v => v.estado === 'cerrada');

  return (
    <div>
      <PageHeader icon="calendar" title="Visitas" desc="Todas las visitas de mantenimiento"
        actions={<>
          {activos > 0 && <button className="btn ghost sm" onClick={limpiar}><Icon name="x" size={14} />Limpiar</button>}
          <button className={'btn-filter' + (activos ? ' on' : '')} onClick={() => setSheet(true)}><Icon name="filter" size={16} />Filtros{activos ? <span className="fc">{activos}</span> : null}</button>
          {!esDesk && (() => { const hoyOn = f.desde === HOY && f.hasta === HOY; return <button className={'btn-filter' + (hoyOn ? ' on' : '')} onClick={() => setF({ ...f, desde: hoyOn ? '' : HOY, hasta: hoyOn ? '' : HOY })}><Icon name="calendar" size={16} />Hoy</button>; })()}
          {esDesk && <button className="btn sec sm" onClick={() => setVista(v => v === 'lista' ? 'calendario' : 'lista')}><Icon name={vista === 'lista' ? 'calendar' : 'list'} size={16} />{vista === 'lista' ? 'Calendario' : 'Lista'}</button>}
          <button className="btn sm" onClick={() => setNuevo({ cliente_id: '', fecha: '', tecnico_id: '', tipo: 'preventiva', asignada_por: (getUser()?.nombre || getUser()?.username || '') })}><Icon name="plus" size={16} />Agendar visita</button>
        </>} />

      {esDesk && items !== null && (() => {
        const me = getUser();
        const myTec = tecnicos.find(t => (t.nombre || '').trim().toLowerCase() === (me?.nombre || '').trim().toLowerCase());
        const all = items || [];
        const cnt = (e) => all.filter(v => v.estado === e).length;
        const ICON = { programada: 'calendar', en_curso: 'clock', cerrada: 'check', cancelada: 'x' };
        const misN = myTec ? all.filter(v => (v.tecnico_ids || []).map(String).includes(String(myTec.id))).length : 0;
        return <div className="tkl-stats">
          {[['programada', 'Programadas'], ['en_curso', 'En curso'], ['cerrada', 'Cerradas']].map(([e, l]) => (
            <div key={e} className={'tkl-stat ' + EST[e][0] + (f.estado === e ? ' on' : '')} onClick={() => set('estado', f.estado === e ? '' : e)}>
              <span className="ts-ic"><Icon name={ICON[e]} size={16} /></span>
              <div><b>{cnt(e)}</b><small>{l}</small></div>
            </div>
          ))}
          <div className={'tkl-stat falla' + (f.estado === 'vencida' ? ' on' : '')} onClick={() => set('estado', f.estado === 'vencida' ? '' : 'vencida')}>
            <span className="ts-ic"><Icon name="alert" size={16} /></span>
            <div><b>{all.filter(esVenc).length}</b><small>Vencidas</small></div>
          </div>
          {myTec && <div className={'tkl-stat info' + (String(f.tecnico_id) === String(myTec.id) ? ' on' : '')} onClick={() => set('tecnico_id', String(f.tecnico_id) === String(myTec.id) ? '' : String(myTec.id))}>
            <span className="ts-ic"><Icon name="users" size={16} /></span>
            <div><b>{misN}</b><small>Mis visitas</small></div>
          </div>}
        </div>;
      })()}

      {chips.length > 0 && <div className="active-chips">
        {chips.map(([k, label]) => <span key={k} className="achip" onClick={() => set(k, '')}>{label}<Icon name="x" size={12} /></span>)}
      </div>}

      {(() => {
        const filtroBody = (
          <div className="filter-sheet">
            <div className="field">
              <label>Estado</label>
              <div className="chips">
                {ESTADOS.map(([v, l]) => <span key={v} className={'chip' + (f.estado === v ? ' active' : '')} onClick={() => set('estado', v)}>{l}</span>)}
              </div>
            </div>
            <div className="field"><label>Cliente</label>
              <select value={f.cliente_id} onChange={e => set('cliente_id', e.target.value)}>
                <option value="">Todos</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select></div>
            <div className="field"><label>Tecnico</label>
              <select value={f.tecnico_id} onChange={e => set('tecnico_id', e.target.value)}>
                <option value="">Todos</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select></div>
            <div className="grid2">
              <div className="field"><label>Desde</label><input type="date" value={f.desde} onChange={e => set('desde', e.target.value)} /></div>
              <div className="field"><label>Hasta</label><input type="date" value={f.hasta} onChange={e => set('hasta', e.target.value)} /></div>
            </div>
          </div>
        );
        if (esDesk) return sheet ? <>
          <div className="pop-bg" onClick={() => setSheet(false)} />
          <div className="filters-pop">
            <div className="fp-head"><b className="row" style={{ gap: 6 }}><Icon name="filter" size={15} />Filtros</b><button className="btn ghost icon" onClick={() => setSheet(false)} aria-label="Cerrar"><Icon name="x" size={16} /></button></div>
            {filtroBody}
            <div className="fp-foot"><button className="btn ghost sm" onClick={limpiar}>Limpiar</button><button className="btn sm" onClick={() => setSheet(false)}>Aplicar</button></div>
          </div>
        </> : null;
        return (
          <Drawer open={sheet} onClose={() => setSheet(false)} title="Filtros" side="bottom"
            footer={<><button className="btn ghost" onClick={limpiar}>Limpiar</button><button className="btn" onClick={() => setSheet(false)}>Aplicar</button></>}>
            {filtroBody}
          </Drawer>
        );
      })()}

      {nuevo && <AgendarModal nuevo={nuevo} clientes={clientes} tecnicos={tecnicos} onClose={() => setNuevo(null)} onSave={agendar} />}
      {aBorrar && <BorrarVisitaModal visita={aBorrar} onClose={() => setABorrar(null)} onDone={() => { setABorrar(null); load(); }} />}

      {vista === 'lista' && <div className="wa-search" style={{ marginBottom: 14 }}>
        <Icon name="search" size={17} />
        <input placeholder="Buscar por cliente, tecnico o asignada por..." value={q} onChange={e => setQ(e.target.value)} />
      </div>}

      {esDesk && vista === 'calendario' ?
        <Calendario visitas={items || []} tecnicos={tecnicos} onOpen={(id) => nav('/visitas/' + id)} onReschedule={resched}
          onDelete={async (id) => { if (!confirm('Eliminar esta visita y sus datos? Para auditoria es mejor cancelarla.')) return; try { await api.del('/api/visitas/' + id); toast.ok('Visita eliminada'); load(); } catch (e) { toast.err(e.message); } }}
          onCancelar={async (v) => { const m = (prompt('Motivo de la cancelacion:', '') || '').trim(); if (!m) return; try { await api.post('/api/visitas/' + v.id + '/cancelar', { motivo: m }); toast.ok('Visita cancelada'); load(); } catch (e) { toast.err(e.message); } }}
          onCancelarJornada={async (v) => { const m = (prompt('Motivo de cancelar el dia ' + (v._dia || '') + ':', '') || '').trim(); try { await api.post('/api/visitas/' + v.id + '/jornadas/' + v._jid + '/cancelar', { motivo: m }); toast.ok('Dia cancelado'); load(); } catch (e) { toast.err(e.message); } }}
          onReorder={async (ids) => { try { await api.post('/api/visitas/orden', { ids }); load(); } catch (e) { toast.err(e.message); } }} onReassign={async (id, fecha, tecnico_id) => { try { await api.put('/api/visitas/' + id + '/fecha', { fecha, tecnico_id }); toast.ok('Visita reprogramada'); load(); } catch (e) { toast.err(e.message); } }} onDayNew={(d) => setNuevo({ cliente_id: '', fecha: d, tecnico_id: '', tipo: 'preventiva', asignada_por: (getUser()?.nombre || getUser()?.username || '') })}
          onCreate={async (cid, fecha, tecnico_id) => { try { await api.post('/api/clientes/' + cid + '/visitas', { fecha, tecnico_id: tecnico_id || null, tipo: 'preventiva', asignada_por: getUser()?.nombre || getUser()?.username || '' }); toast.ok('Visita agendada'); load(); } catch (e) { toast.err(e.message); } }}
          onRepeat={async (v, n) => { try { const ids = v.tecnico_ids || []; for (let i = 1; i <= n; i++) { const d = new Date(v.fecha); d.setMonth(d.getMonth() + i); await api.post('/api/clientes/' + v.cliente_id + '/visitas', { fecha: d.toISOString().slice(0, 10), tecnico_ids: ids, tecnico_id: ids[0] || null, tipo: v.tipo || 'preventiva' }); } toast.ok(n + ' visitas creadas'); load(); } catch (e) { toast.err(e.message); } }}
          onSetHora={async (id, hora) => { try { await api.put('/api/visitas/' + id + '/fecha', { hora }); load(); } catch (e) { toast.err(e.message); } }} /> :
      items === null ? <Loading /> :
        items.length === 0 ? <Empty icon="calendar" title="Sin visitas">No hay visitas con esos filtros.</Empty> :
          <>
            {activas.length > 0 && <>
              <div className="muted" style={{ margin: '2px 2px 10px', fontSize: 13 }}>{activas.length} activa(s)</div>
              <div className="wa-wrap"><div className="wa-list">{activas.map(v => Row(v, false))}</div></div>
            </>}
            {cerradas.length > 0 && <>
              <div className="row between" style={{ margin: '20px 2px 10px' }}>
                <div className="muted" style={{ fontSize: 13 }}><Icon name="checkCircle" size={13} /> Cerradas ({cerradas.length})</div>
                <span className="subtle" style={{ fontSize: 12 }}>tocar para ver &middot; reabrir disponible</span>
              </div>
              <div className="wa-wrap cerradas-box"><div className="wa-list">{cerradas.map(v => Row(v, true))}</div></div>
            </>}
          </>}
    </div>
  );
}


// Modal de borrado de visita: diseño estilizado; exige escribir "borrar" para confirmar.
function BorrarVisitaModal({ visita, onClose, onDone }) {
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = txt.trim().toLowerCase() === 'borrar';
  const touched = txt.length > 0;
  const go = async () => {
    if (!ok) return;
    setBusy(true);
    try { await api.del('/api/visitas/' + visita.id); toast.ok('Visita eliminada'); onDone(); }
    catch (e) { toast.err(e.message); setBusy(false); }
  };
  const fecha = visita.fecha ? new Date(visita.fecha).toLocaleDateString('es-UY') : '';
  const borde = ok ? 'var(--ok)' : touched ? 'var(--falla)' : 'var(--border)';
  return (
    <Modal size="sm" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn danger" disabled={!ok || busy} onClick={go}><Icon name="trash" size={15} />{busy ? 'Eliminando…' : 'Eliminar visita'}</button>
      </>}>
      <div style={{ textAlign: 'center', padding: '4px 4px 2px' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--falla-bg)', color: 'var(--falla)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 0 0 6px var(--falla-bg)' }}>
          <Icon name="trash" size={26} />
        </div>
        <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>¿Eliminar esta visita?</h3>
        <div className="muted" style={{ fontSize: 13.5 }}><b style={{ color: 'var(--text)' }}>{visita.cliente}</b>{fecha ? ' · ' + fecha : ''}</div>
      </div>

      <div style={{ margin: '14px 0', padding: '11px 13px', background: 'var(--falla-bg)', border: '1px solid var(--falla-bd)', borderRadius: 12, display: 'flex', gap: 10 }}>
        <Icon name="alert" size={18} color="var(--falla)" />
        <div style={{ fontSize: 13, lineHeight: 1.45 }}>
          Se eliminarán también <b>todas las pruebas, fotos y adjuntos</b> de la visita. Esta acción <b>no se puede deshacer</b>.
        </div>
      </div>

      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        Escribí <span style={{ color: 'var(--falla)', fontFamily: 'monospace' }}>borrar</span> para confirmar
      </label>
      <div style={{ position: 'relative' }}>
        <input value={txt} autoFocus placeholder="borrar" onChange={e => setTxt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ok) go(); }}
          style={{ width: '100%', textAlign: 'center', letterSpacing: 2, fontWeight: 600, padding: '11px 12px', borderRadius: 10, border: '2px solid ' + borde, outline: 'none', transition: 'border-color .15s' }} />
        {ok && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ok)' }}><Icon name="checkCircle" size={18} /></span>}
      </div>
    </Modal>
  );
}

export function AgendarModal({ nuevo, clientes, tecnicos, onClose, onSave }) {
  const [f, setF] = useState({ ...nuevo, modo: nuevo.modo || 'un_dia', hasta: nuevo.hasta || '', sinFinde: nuevo.sinFinde !== false });
  const [contratos, setContratos] = useState([]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  useEffect(() => {
    if (!f.cliente_id) { setContratos([]); return; }
    api.get('/api/clientes/' + f.cliente_id + '/contratos').then(cs => setContratos(cs || [])).catch(() => setContratos([]));
  }, [f.cliente_id]);
  const L = (icon, txt) => <span className="flabel"><Icon name={icon} size={13} />{txt}</span>;
  const dias = React.useMemo(() => {
    if (f.modo !== 'varios' || !f.fecha || !f.hasta) return [];
    const a = new Date(f.fecha + 'T00:00:00'), b = new Date(f.hasta + 'T00:00:00');
    if (isNaN(a) || isNaN(b) || b < a) return [];
    const out = [];
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (f.sinFinde && (dow === 0 || dow === 6)) continue;
      out.push(_ymd(d));
      if (out.length > 60) break;
    }
    return out;
  }, [f.modo, f.fecha, f.hasta, f.sinFinde]);
  const guardar = () => {
    if (f.modo === 'varios') {
      if (!dias.length) { toast.err('Elegi un rango valido (revisa las fechas o el filtro de fin de semana)'); return; }
      onSave({ ...f, fecha: dias[0], dias });
    } else onSave({ ...f, dias: null });
  };
  const fmtCorta = (d) => new Date(d + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' });
  return (
    <Modal title="Agendar visita" subtitle="Selecciona el cliente y la(s) fecha(s)" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar} disabled={!f.cliente_id}><Icon name="calendar" size={16} />Agendar{f.modo === 'varios' && dias.length ? ' (' + dias.length + ' dias)' : ''}</button></>}>
      <Field label={L('building', 'Cliente')}>
        <select value={f.cliente_id} onChange={e => set('cliente_id', e.target.value)}>
          <option value="">- Seleccionar cliente -</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </Field>
      <Field label={L('clock', 'Duracion')}>
        <div className="tipo-seg">
          <button type="button" className={'tipo-opt' + (f.modo !== 'varios' ? ' on' : '')} onClick={() => set('modo', 'un_dia')}><Icon name="calendar" size={15} />Un dia</button>
          <button type="button" className={'tipo-opt' + (f.modo === 'varios' ? ' on' : '')} onClick={() => set('modo', 'varios')}><Icon name="repeat" size={15} />Varios dias</button>
        </div>
      </Field>
      {f.modo !== 'varios' ? (
        <div className="grid2">
          <Field label={L('calendar', 'Fecha')}><input type="date" value={f.fecha || ''} onChange={e => set('fecha', e.target.value)} /></Field>
          <Field label={L('users', 'Tecnico')}>
            <select value={f.tecnico_id} onChange={e => set('tecnico_id', e.target.value)}>
              <option value="">- Sin asignar -</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </Field>
        </div>
      ) : (<>
        <div className="grid2">
          <Field label={L('calendar', 'Desde')}><input type="date" value={f.fecha || ''} onChange={e => set('fecha', e.target.value)} /></Field>
          <Field label={L('calendar', 'Hasta')}><input type="date" value={f.hasta || ''} onChange={e => set('hasta', e.target.value)} /></Field>
        </div>
        <Field label={L('users', 'Tecnico')}>
          <select value={f.tecnico_id} onChange={e => set('tecnico_id', e.target.value)}>
            <option value="">- Sin asignar -</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Field>
        <label className="chk-row"><input type="checkbox" checked={f.sinFinde} onChange={e => set('sinFinde', e.target.checked)} />Excluir sabados y domingos</label>
        {dias.length > 0 ? <div className="jor-prev"><Icon name="calendar" size={13} /><span>{dias.length} jornada(s): {dias.map((d, i) => 'D' + (i + 1) + ' ' + fmtCorta(d)).join('  ·  ')}</span></div>
          : (f.fecha && f.hasta) ? <div className="jor-prev warn"><Icon name="alert" size={13} /><span>El rango no genera dias. Revisa las fechas o el filtro de fin de semana.</span></div> : null}
      </>)}
      <Field label={L('wrench', 'Tipo de visita')}>
        <div className="tipo-seg">
          <button type="button" className={'tipo-opt' + (f.tipo !== 'correctiva' ? ' on' : '')} onClick={() => set('tipo', 'preventiva')}><Icon name="checkCircle" size={15} />Preventiva (contrato)</button>
          <button type="button" className={'tipo-opt corr' + (f.tipo === 'correctiva' ? ' on' : '')} onClick={() => set('tipo', 'correctiva')}><Icon name="alert" size={15} />Correctiva</button>
        </div>
      </Field>
      {contratos.length > 0 && <Field label={L('pen', 'Contrato asociado (opcional)')}>
        <select value={f.contrato_id || ''} onChange={e => set('contrato_id', e.target.value)}>
          <option value="">- Sin contrato -</option>
          {contratos.map(k => <option key={k.id} value={k.id}>{k.titulo}</option>)}
        </select>
      </Field>}
      <Field label={L('pen', 'Asignada por')}><input value={f.asignada_por} placeholder="Quien asigna la visita" onChange={e => set('asignada_por', e.target.value)} /></Field>
    </Modal>
  );
}


const _MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const _DOW = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
function _ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function CalFeedModal({ onClose }) {
  const [feed, setFeed] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/api/agenda/feed').then(setFeed).catch(e => setErr(e.message)); }, []);
  const copiar = (txt) => { navigator.clipboard?.writeText(txt).then(() => toast.ok('Enlace copiado')).catch(() => toast.err('No se pudo copiar')); };
  return (
    <Modal title="Integrar con tu calendario" subtitle="Google Calendar, Apple Calendar y Outlook" onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Listo</button>}>
      {err && <p className="muted">{err}</p>}
      {!feed && !err && <Loading />}
      {feed && <>
        <Field label="Enlace de suscripcion (se actualiza solo)">
          <div className="row" style={{ gap: 8 }}>
            <input readOnly value={feed.url} onFocus={e => e.target.select()} style={{ fontSize: 12 }} />
            <button className="btn sec icon" data-tip="Copiar enlace" onClick={() => copiar(feed.url)}><Icon name="clipboard" size={15} /></button>
          </div>
        </Field>
        <div className="feed-steps">
          <div className="fs-item"><b>Google Calendar</b><span>Configuracion &rarr; Agregar calendario &rarr; <i>Desde URL</i> &rarr; pega el enlace.</span></div>
          <div className="fs-item"><b>Apple Calendar</b><span>Archivo &rarr; <i>Nueva suscripcion a calendario</i> &rarr; pega el enlace, o <a href={feed.webcal}>abrir directo</a>.</span></div>
          <div className="fs-item"><b>Outlook</b><span>Agregar calendario &rarr; <i>Suscribirse desde la web</i> &rarr; pega el enlace.</span></div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>El enlace es personal: incluye tu acceso. No lo compartas.</p>
      </>}
    </Modal>
  );
}

function Calendario({ visitas, tecnicos = [], onOpen, onReschedule, onReassign, onDayNew, onDelete, onCancelar, onCancelarJornada, onReorder, vencimientos = [], onCreate, onRepeat, onSetHora }) {
  const [feedOpen, setFeedOpen] = useState(false);
  const esVenc = (v) => v.estado === 'programada' && (v.fecha || '').slice(0, 10) < _ymd(new Date());
  const [ctx, setCtx] = useState(null);
  const [calView, setCalView] = useState('equipo');
  const [cur, setCur] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [over, setOver] = useState(null);
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(t); }, []); // mueve la linea de "ahora"
  const hoy = _ymd(new Date());
  // Expandir visitas de varios dias: una "tarjeta" por jornada (Dia k/N)
  const eventos = [];
  for (const v of visitas) {
    if (v.multidia && Array.isArray(v.jornadas) && v.jornadas.length) {
      const activos = v.jornadas.filter(j => j.estado !== 'cancelada');
      const tot = activos.length;
      activos.forEach((j, idx) => eventos.push({ ...v, fecha: (j.fecha || '').slice(0, 10), _dia: idx + 1, _diaTot: tot, _jid: j.id, _jorden: j.orden, _jestado: j.estado }));
    } else eventos.push(v);
  }
  const byDay = {};
  for (const v of eventos) { const k = (v.fecha || '').slice(0, 10); if (!k) continue; (byDay[k] = byDay[k] || []).push(v); }
  const monday = (d) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
  const drop = (e, k, tec) => { e.preventDefault(); setOver(null); const dat = e.dataTransfer.getData('text/plain'); if (!dat) return; if (dat.startsWith('n:')) { onCreate && onCreate(Number(dat.slice(2)), k, tec || null); return; } onReschedule(Number(dat), k); };
  const evChip = (v) => { const [c] = EST[v.estado] || EST.programada; return (
    <div key={v.id + '-' + (v._dia || 0)} className={'cal-ev ' + c + (esVenc(v) ? ' venc' : '') + (v._diaTot ? ' multi' : '')} draggable={!v._diaTot} onDragStart={e => { if (v._diaTot) { e.preventDefault(); return; } e.stopPropagation(); e.dataTransfer.setData('text/plain', String(v.id)); }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, v }); }}
      onClick={e => { e.stopPropagation(); onOpen(v.id); }} title={(v.titulo ? v.titulo + ' · ' : '') + v.cliente + (v._diaTot ? ' · Dia ' + v._dia + '/' + v._diaTot : '') + ' - ' + (v.tecnico || '')}>
      <span className="dot" />{v._diaTot ? <b className="cal-dia">D{v._dia}/{v._diaTot}</b> : null}{v.titulo || v.cliente}{v.tecnico ? ' · ' + v.tecnico : ''}
    </div>
  ); };

  const prev = () => setCur(c => { const d = new Date(c); if (calView === 'mes') d.setMonth(d.getMonth() - 1); else if (calView === 'semana' || calView === 'equipo') d.setDate(d.getDate() - 7); else d.setDate(d.getDate() - 1); return d; });
  const next = () => setCur(c => { const d = new Date(c); if (calView === 'mes') d.setMonth(d.getMonth() + 1); else if (calView === 'semana' || calView === 'equipo') d.setDate(d.getDate() + 7); else d.setDate(d.getDate() + 1); return d; });
  const goHoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); setCur(d); };

  let titulo = '';
  if (calView === 'mes') titulo = _MES[cur.getMonth()] + ' ' + cur.getFullYear();
  else if (calView === 'semana' || calView === 'equipo') { const m = monday(cur); const f = new Date(m); f.setDate(m.getDate() + 6); titulo = m.getDate() + ' - ' + f.getDate() + ' ' + _MES[f.getMonth()] + ' ' + f.getFullYear(); }
  else titulo = _DOW[(cur.getDay() + 6) % 7] + ' ' + cur.getDate() + ' de ' + _MES[cur.getMonth()];

  const cell = (d, tall) => {
    const k = _ymd(d); const evs = byDay[k] || []; const otro = calView === 'mes' && d.getMonth() !== cur.getMonth();
    return (
      <div key={k} className={'cal-cell' + (otro ? ' otro' : '') + (k === hoy ? ' hoy' : '') + (over === k ? ' over' : '') + (tall ? ' tall' : '')}
        onClick={() => onDayNew(k)}
        onDragOver={e => { e.preventDefault(); if (over !== k) setOver(k); }} onDragLeave={() => setOver(o => o === k ? null : o)} onDrop={e => drop(e, k)}>
        <div className="cal-daynum">{d.getDate()}</div>
        <div className="cal-evs">
          {(tall ? evs : evs.slice(0, 3)).map(evChip)}
          {!tall && evs.length > 3 && <div className="cal-more" onClick={e => { e.stopPropagation(); onOpen(evs[0].id); }}>+{evs.length - 3} mas</div>}
        </div>
      </div>
    );
  };

  let body = null;
  if (calView === 'mes') {
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const start = monday(first);
    const days = []; for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
    body = <><div className="cal-grid cal-dow">{_DOW.map(d => <div key={d} className="cal-dowc">{d}</div>)}</div>
      <div className="cal-grid">{days.map(d => cell(d, false))}</div></>;
  } else if (calView === 'semana') {
    const m = monday(cur); const days = []; for (let i = 0; i < 7; i++) { const d = new Date(m); d.setDate(m.getDate() + i); days.push(d); }
    body = <><div className="cal-grid cal-dow">{days.map(d => <div key={d} className="cal-dowc">{_DOW[(d.getDay() + 6) % 7]} {d.getDate()}</div>)}</div>
      <div className="cal-grid cal-week">{days.map(d => cell(d, true))}</div></>;
  } else if (calView === 'equipo') {
    const m = monday(cur); const days = []; for (let i = 0; i < 7; i++) { const d = new Date(m); d.setDate(m.getDate() + i); days.push(d); }
    const filas = [...tecnicos.map(t => ({ id: t.id, nombre: t.nombre, avatar: t.avatar_path })), { id: 0, nombre: 'Sin asignar', avatar: null }];
    const ESTI = { cerrada: ['tb-ok', 'check'], en_curso: ['tb-prog', 'clock'], programada: ['tb-pend', 'history'] };
    body = (
      <div className="tb-wrap">
        <div className="tb-grid" style={{ gridTemplateColumns: '160px repeat(7, 1fr)' }}>
          <div className="tb-corner" />
          {days.map(d => <div key={'h' + _ymd(d)} className={'tb-dayh' + (_ymd(d) === hoy ? ' hoy' : '')}>{_DOW[(d.getDay() + 6) % 7]} {d.getDate()}</div>)}
          {filas.map(f => (
            <React.Fragment key={'f' + f.id}>
              <div className="tb-tec">
                {f.avatar ? <img className="hist-av" style={{ width: 30, height: 30 }} src={api.base + f.avatar} alt="" /> : <span className="tk-av" style={{ width: 30, height: 30, fontSize: 12 }}>{f.nombre.slice(0, 1).toUpperCase()}</span>}
                <span className="tb-tecn">{f.nombre}</span>
              </div>
              {days.map(d => {
                const k = _ymd(d);
                const evs = eventos.filter(v => (v.fecha || '').slice(0, 10) === k && ((f.id === 0 && !(v.tecnico_ids || []).length) || (f.id !== 0 && (v.tecnico_ids || []).map(Number).includes(f.id)))).sort((a, b) => ((a.orden ?? 9999) - (b.orden ?? 9999)) || (a.id - b.id));
                return (
                  <div key={'c' + f.id + k} className={'tb-cell' + (over === f.id + '|' + k ? ' over' : '') + (k === hoy ? ' hoy' : '')}
                    onDragOver={e => { e.preventDefault(); const ok = f.id + '|' + k; if (over !== ok) setOver(ok); }}
                    onDragLeave={() => setOver(o => o === f.id + '|' + k ? null : o)}
                    onDrop={e => { e.preventDefault(); setOver(null); const dat = e.dataTransfer.getData('text/plain'); if (!dat) return; if (dat.startsWith('n:')) { onCreate && onCreate(Number(dat.slice(2)), k, f.id); return; } if (onReassign) onReassign(Number(dat), k, f.id); }}
                    onClick={() => onDayNew(k)}>
                    {evs.map(v => { const [cls, ic] = ESTI[v.estado] || ESTI.programada; return (
                      <div key={v.id + '-' + (v._dia || 0)} className={'tb-chip ' + cls + (esVenc(v) ? ' tb-venc' : '') + (v._diaTot ? ' multi' : '')} draggable={!v._diaTot}
                        onDragStart={e => { if (v._diaTot) { e.preventDefault(); return; } e.stopPropagation(); e.dataTransfer.setData('text/plain', String(v.id)); }}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(null); const dat = e.dataTransfer.getData('text/plain'); if (dat.startsWith('n:')) { onCreate && onCreate(Number(dat.slice(2)), k, f.id); return; } const id = Number(dat); if (!id || id === v.id) return;
                          const enCelda = evs.some(x => x.id === id);
                          if (enCelda && onReorder) { const ids = evs.map(x => x.id).filter(x => x !== id); ids.splice(ids.indexOf(v.id), 0, id); onReorder(ids); }
                          else if (onReassign) { onReassign(id, k, f.id); } }}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, v }); }}
                        onClick={e => { e.stopPropagation(); onOpen(v.id); }} title={(v.titulo ? v.titulo + ' · ' : '') + v.cliente + (v._diaTot ? ' · Dia ' + v._dia + '/' + v._diaTot : '') + (v.tipo === 'correctiva' ? ' · Correctiva' : '')}>
                        <Icon name={ic} size={11} />{v.tipo === 'correctiva' && <span className="tb-corr" />}{v._diaTot ? <b className="cal-dia">D{v._dia}/{v._diaTot}</b> : null}<span className="tb-name">{v.titulo || v.cliente}</span>
                      </div>
                    ); })}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <div className="tb-legend">
          <b style={{ fontSize: 12 }}>Leyenda</b>
          <span className="tb-chip tb-ok"><Icon name="check" size={11} />Completado</span>
          <span className="tb-chip tb-prog"><Icon name="clock" size={11} />En progreso</span>
          <span className="tb-chip tb-pend"><Icon name="history" size={11} />Pendiente</span>
        </div>
      </div>
    );
  } else {
    const k = _ymd(cur);
    const evsD = (byDay[k] || []).slice().sort((a, b) => (String(a.hora || '99') < String(b.hora || '99') ? -1 : 1));
    const sinHora = evsD.filter(v => !v.hora);
    const horas = []; for (let h = 8; h <= 18; h++) horas.push(h);
    const ahora = new Date(); const hoyAqui = k === hoy; const nH = ahora.getHours(), nM = ahora.getMinutes();
    const dropH = (e, hh) => { e.preventDefault(); const dat = e.dataTransfer.getData('text/plain'); if (!dat) return; if (dat.startsWith('n:')) { onCreate && onCreate(Number(dat.slice(2)), k, null); return; } const id = Number(dat); if (id && onSetHora) onSetHora(id, hh); };
    body = (
      <div className="cal-hours">
        <div className="ch-row"><div className="ch-h">Sin hora</div><div className="ch-cell" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/plain')); if (id && onSetHora) onSetHora(id, null); }}>{sinHora.map(evChip)}</div></div>
        {horas.map(h => {
          const hh = String(h).padStart(2, '0');
          const evsH = evsD.filter(v => v.hora && String(v.hora).slice(0, 2) === hh);
          return (
            <div key={h} className="ch-row">
              {hoyAqui && h === nH && <div className="cal-now" style={{ top: (nM / 60 * 100) + '%' }}><span className="cal-now-t">{String(nH).padStart(2, '0')}:{String(nM).padStart(2, '0')}</span></div>}
              <div className="ch-h">{hh}:00</div>
              <div className="ch-cell" onDragOver={e => e.preventDefault()} onDrop={e => dropH(e, hh + ':00')} onClick={() => onDayNew(k)}>{evsH.map(evChip)}</div>
            </div>
          );
        })}
        <div className="muted" style={{ padding: '8px 12px', fontSize: 12 }}>Arrastra una visita a una franja para asignarle hora.</div>
      </div>
    );
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sec icon" onClick={prev} aria-label="Anterior"><Icon name="chevronLeft" size={16} /></button>
          <button className="btn sec icon" onClick={next} aria-label="Siguiente"><Icon name="chevronRight" size={16} /></button>
          <button className="btn sec sm" onClick={goHoy}>Hoy</button>
        </div>
        <div className="cal-title">{titulo}</div>
        <div className="row" style={{ gap: 6 }}>
          <a className="btn sec icon" href={api.fileUrl('/api/agenda.ics')} data-tip="Exportar agenda (.ics)" aria-label="Exportar agenda"><Icon name="download" size={15} /></a>
          <button className="btn sec icon" data-tip="Integrar con Google/Apple Calendar" aria-label="Integrar calendario" onClick={() => setFeedOpen(true)}><Icon name="share" size={15} /></button>
          <button className="btn sec icon" data-tip="Enviar agenda de la semana por WhatsApp" aria-label="WhatsApp" onClick={async () => { try { const r = await api.post('/api/chatbot/agenda-semana', {}); r.ok ? toast.ok('Agenda enviada por WhatsApp') : toast.err('No se pudo enviar (revisa Chatbot)'); } catch (e) { toast.err(e.message); } }}><Icon name="whatsapp" size={15} /></button>
        </div>
        <div className="cal-views">
          {[['mes', 'Mes'], ['semana', 'Semana'], ['dia', 'Dia'], ['equipo', 'Tecnicos']].map(([k, l]) =>
            <button key={k} className={'cal-vbtn' + (calView === k ? ' on' : '')} onClick={() => setCalView(k)}>{l}</button>)}
        </div>
      </div>
      {feedOpen && <CalFeedModal onClose={() => setFeedOpen(false)} />}
      {body}
      {ctx && <>
        <div className="ctx-bg" onClick={() => setCtx(null)} onContextMenu={e => { e.preventDefault(); setCtx(null); }} />
        <div className="ctxmenu" style={{ left: Math.min(ctx.x, window.innerWidth - 200), top: Math.min(ctx.y, window.innerHeight - 160) }}>
          <div className="ctx-title">{ctx.v.cliente}</div>
          <button onClick={() => { onOpen(ctx.v.id); setCtx(null); }}><Icon name="edit" size={15} />Abrir / editar</button>
          {ctx.v.estado === 'cerrada' ?
            <button onClick={async () => { try { await api.post('/api/visitas/' + ctx.v.id + '/reabrir', {}); toast.ok('Reabierta'); } catch (e) { toast.err(e.message); } setCtx(null); }}><Icon name="history" size={15} />Reabrir</button> : null}
          {esVenc(ctx.v) && <button onClick={() => { onReschedule(ctx.v.id, _ymd(new Date())); setCtx(null); }}><Icon name="calendar" size={15} />Mover a hoy</button>}
          <button onClick={() => { const n = parseInt(prompt('Repetir mensualmente. ¿Cuantas veces?', '3') || '0', 10); if (n > 0 && onRepeat) onRepeat(ctx.v, Math.min(n, 12)); setCtx(null); }}><Icon name="history" size={15} />Repetir mensualmente</button>
          {getUser()?.rol === 'admin' && ctx.v._jid && ctx.v._jestado !== 'cancelada' && <button onClick={() => { onCancelarJornada && onCancelarJornada(ctx.v); setCtx(null); }} style={{ color: 'var(--falla)' }}><Icon name="x" size={15} />Cancelar el dia {ctx.v._dia}</button>}
          {getUser()?.rol === 'admin' && ctx.v.estado !== 'cancelada' && <button onClick={() => { onCancelar && onCancelar(ctx.v); setCtx(null); }} style={{ color: 'var(--falla)' }}><Icon name="x" size={15} />{ctx.v._diaTot ? 'Cancelar toda la visita' : 'Cancelar visita'}</button>}
          {getUser()?.rol === 'admin' && <button onClick={() => { onDelete && onDelete(ctx.v.id); setCtx(null); }} style={{ color: 'var(--falla)' }}><Icon name="trash" size={15} />Eliminar visita</button>}
        </div>
      </>}
    </div>
  );
}
