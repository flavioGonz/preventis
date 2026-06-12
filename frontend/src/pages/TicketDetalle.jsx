import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { Loading } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import { PRIO, EST, PrioIcon, TkAvatar, ConfirmModal, fmtDur, TicketFacturacion } from './Tickets.jsx';

const FLUJO = [['abierto', 'Abierto', 'alert'], ['en_proceso', 'En proceso', 'clock'], ['esperando_cliente', 'Esperando cliente', 'phone'], ['resuelto', 'Resuelto', 'checkCircle'], ['cerrado', 'Cerrado', 'check']];

const fmtDT = (d) => d ? new Date(d).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const esImg = (a) => /^image\//.test(a.mime || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.path || '');

export default function TicketDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const [t, setT] = useState(null);
  const [visitas, setVisitas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [perfil, setPerfil] = useState(null);
  const [equipos, setEquipos] = useState(null);
  const [eqOpen, setEqOpen] = useState(false);
  const [coms, setComs] = useState(null);
  const [txt, setTxt] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confBorrar, setConfBorrar] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.get('/api/tickets/' + id).then(setT);
  const loadC = () => api.get('/api/tickets/' + id + '/comentarios').then(setComs);
  useEffect(() => {
    load(); loadC();
    api.get('/api/clientes').then(setClientes);
    api.get('/api/usuarios/lista').then(setUsuarios).catch(() => {});
    api.get('/api/perfil').then(setPerfil).catch(() => {});
    api.get('/api/tickets/' + id + '/visitas').then(setVisitas).catch(() => setVisitas([]));
  }, [id]);
  useEffect(() => {
    if (!t?.cliente_id) { setEquipos(null); return; }
    api.get('/api/clientes/' + t.cliente_id + '/equipos').then(setEquipos).catch(() => setEquipos([]));
  }, [t?.cliente_id]);
  const set = (k, v) => { setT(p => ({ ...p, [k]: v })); setDirty(true); };

  const avatarDe = (nombre) => (usuarios.find(u => u.nombre === nombre || u.username === nombre) || {}).avatar_path || null;

  const guardar = async () => {
    setSaving(true);
    try { await api.put('/api/tickets/' + id, t); toast.ok('Ticket guardado'); setDirty(false); load(); } catch (e) { toast.err(e.message); }
    setSaving(false);
  };
  const cambiarEstado = async (estado) => {
    if (estado === t.estado) return;
    try {
      await api.put('/api/tickets/' + id, { ...t, estado });
      setT(p => ({ ...p, estado }));
      const fd = new FormData(); fd.append('texto', 'Cambio el estado a "' + (EST[estado] || [])[1] + '"');
      await api.upload('/api/tickets/' + id + '/comentarios', fd).catch(() => {});
      loadC();
      toast.ok('Estado: ' + (EST[estado] || [])[1]);
    } catch (e) { toast.err(e.message); }
  };
  const agregarArchivos = (lista) => {
    const fs = Array.from(lista || []).filter(f => f && f.size <= 30 * 1024 * 1024);
    if (fs.length) setFiles(p => [...p, ...fs].slice(0, 8));
  };
  const onPaste = (e) => {
    const fs = Array.from(e.clipboardData?.files || []);
    if (fs.length) { e.preventDefault(); agregarArchivos(fs); toast.ok(fs.length + ' archivo(s) adjuntado(s)'); }
  };
  const comentar = async () => {
    if (!txt.trim() && files.length === 0) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('texto', txt);
      files.forEach(f => fd.append('files', f, f.name || 'imagen.png'));
      await api.upload('/api/tickets/' + id + '/comentarios', fd);
      setTxt(''); setFiles([]); loadC();
    } catch (e) { toast.err(e.message); }
    setSending(false);
  };
  const borrar = async () => { try { await api.del('/api/tickets/' + id); toast.ok('Ticket eliminado'); nav('/tickets'); } catch (e) { toast.err(e.message); } };
  const convertir = async () => {
    if (!t.cliente_id) { toast.err('Asocia un cliente al ticket primero'); return; }
    try {
      const v = await api.post('/api/clientes/' + t.cliente_id + '/visitas', { fecha: new Date().toISOString().slice(0, 10), tipo: 'correctiva', asignada_por: 'Ticket TK-' + t.id, ticket_id: t.id, fecha_max_resolucion: t.fecha_max_resolucion || null });
      const fd = new FormData(); fd.append('texto', 'Convirtio el ticket en la visita correctiva #' + v.id);
      await api.upload('/api/tickets/' + id + '/comentarios', fd).catch(() => {});
      if (t.estado === 'abierto') await api.put('/api/tickets/' + id, { ...t, estado: 'en_proceso' }).catch(() => {});
      toast.ok('Visita correctiva creada');
      api.get('/api/tickets/' + id + '/visitas').then(setVisitas).catch(() => {});
      nav('/visitas/' + v.id);
    } catch (e) { toast.err(e.message); }
  };

  if (!t) return <Loading />;
  const pasoIdx = FLUJO.findIndex(([k]) => k === t.estado);

  const eventos = [
    { id: 'creado', tipo: 'evento', autor: 'Sistema', texto: 'Ticket creado', ts: t.created_at, adjuntos: [] },
    ...(coms || []).map(c => ({ id: c.id, tipo: /^Cambio el estado/.test(c.texto || '') ? 'estado' : 'comentario', autor: c.autor || 'Sistema', texto: c.texto, ts: c.created_at, adjuntos: Array.isArray(c.adjuntos) ? c.adjuntos : [] })),
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts));

  const eqFalla = (equipos || []).filter(e => e.ultima_falla);

  return (
    <div className="tkd">
      <div className="tkd-bread">
        <Link to="/tickets"><Icon name="ticket" size={14} />Tickets</Link>
        <Icon name="chevronRight" size={13} />
        <span className="mono">TK-{t.id}</span>
      </div>

      <div className="page-head" style={{ marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input className="tkd-title" value={t.titulo || ''} onChange={e => set('titulo', e.target.value)} placeholder="Titulo del ticket" />
        </div>
        <div className="row" style={{ gap: 8 }}>
          {dirty && <button className="btn sm" onClick={guardar} disabled={saving}><Icon name="save" size={15} />{saving ? 'Guardando...' : 'Guardar'}</button>}
          <button className="btn ghost icon" data-tip="Eliminar ticket" aria-label="Eliminar" onClick={() => setConfBorrar(true)}><Icon name="trash" size={17} color="var(--falla)" /></button>
        </div>
      </div>

      <div className="tkd-flow">
        {FLUJO.map(([k, l, ic], i) => (
          <React.Fragment key={k}>
            {i > 0 && <span className={'tf-line' + (i <= pasoIdx ? ' on' : '')} />}
            <button className={'tf-step' + (i < pasoIdx ? ' past' : '') + (i === pasoIdx ? ' on' : '')} onClick={() => cambiarEstado(k)}>
              <span className="tf-dot"><Icon name={i < pasoIdx ? 'check' : ic} size={13} /></span>
              {l}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="tkd-grid">
        <div className="tkd-main">
          <div className="card">
            <div className="sec-head"><span className="fc-ic"><Icon name="file" size={17} /></span><b>Descripcion</b></div>
            <textarea className="tkd-desc" placeholder="Describe la incidencia, pasos para reproducirla, equipos afectados..."
              value={t.descripcion || ''} onChange={e => set('descripcion', e.target.value)} />
          </div>

          <div className="card" style={{ paddingTop: 14 }}>
            <TicketFacturacion f={t} set={set} />
          </div>

          {t.cliente_id && <div className="card">
            <div className="sec-head" style={{ cursor: 'pointer' }} onClick={() => setEqOpen(o => !o)}>
              <span className="fc-ic"><Icon name="box" size={17} /></span><b>Equipos instalados en {t.cliente}</b>
              <span className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                {eqFalla.length > 0 && <span className="badge falla"><Icon name="alert" size={11} />{eqFalla.length} en falla</span>}
                <span className="badge gris">{(equipos || []).length}</span>
                <Icon name={eqOpen ? 'minus' : 'plus'} size={15} />
              </span>
            </div>
            {eqOpen && (equipos === null ? <Loading rows={2} header={false} /> :
              equipos.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Este cliente no tiene equipos cargados.</div> :
                <div className="tkd-eqs">
                  {equipos.map(e => (
                    <div key={e.id} className="tkd-eq" onClick={() => nav('/equipos/' + e.id)}>
                      <span className={'tkd-eq-dot' + (e.ultima_falla ? ' falla' : e.ultimo_estado ? ' ok' : '')} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <b>{e.etiqueta || e.tipo_elemento || 'Equipo ' + e.id}</b>
                        <small className="subtle">{[e.sistema, e.tipo_elemento, e.direccion].filter(Boolean).join(' - ') || 'Sin datos'}</small>
                      </div>
                      {e.ultimo_estado && <span className={'badge ' + (e.ultima_falla ? 'falla' : 'ok')}>{e.ultimo_estado}</span>}
                      {e.ultima_fecha && <span className="subtle mono" style={{ fontSize: 11 }}>{new Date(e.ultima_fecha).toLocaleDateString('es-UY')}</span>}
                    </div>
                  ))}
                </div>)}
          </div>}

          <div className="card">
            <div className="sec-head"><span className="fc-ic"><Icon name="history" size={17} /></span><b>Actividad</b><span className="badge gris" style={{ marginLeft: 'auto' }}>{eventos.length}</span></div>
            <div className="tkd-composer">
              <TkAvatar nombre={perfil?.nombre || perfil?.username} src={perfil?.avatar_path} size={30} />
              <input placeholder="Comenta... (pega imagenes con Ctrl+V)" value={txt} onChange={e => setTxt(e.target.value)}
                onPaste={onPaste} onKeyDown={e => e.key === 'Enter' && comentar()} />
              <button className="btn sec icon" data-tip="Adjuntar archivos" aria-label="Adjuntar" onClick={() => fileRef.current?.click()}><Icon name="paperclip" size={15} /></button>
              <input ref={fileRef} type="file" multiple hidden onChange={e => { agregarArchivos(e.target.files); e.target.value = ''; }} />
              <button className="btn sm" onClick={comentar} disabled={sending || (!txt.trim() && files.length === 0)}><Icon name="arrowRight" size={15} /></button>
            </div>
            {files.length > 0 && <div className="tkd-pend">
              {files.map((f, i) => (
                <span key={i} className="tkd-pf">
                  {/^image\//.test(f.type) ? <img src={URL.createObjectURL(f)} alt="" /> : <Icon name="file" size={14} />}
                  <small>{f.name || 'imagen'}</small>
                  <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))} aria-label="Quitar"><Icon name="x" size={12} /></button>
                </span>
              ))}
            </div>}
            {coms === null ? <Loading rows={2} header={false} /> :
              <div className="tkd-tl">
                {eventos.map(ev => (
                  <div key={ev.id} className={'tl-item ' + ev.tipo}>
                    <div className="tl-rail">
                      <span className={'tl-dot ' + ev.tipo}>
                        {ev.tipo === 'comentario' ? <TkAvatar nombre={ev.autor} src={avatarDe(ev.autor)} size={28} /> : <Icon name={ev.tipo === 'estado' ? 'arrowRight' : 'plus'} size={12} />}
                      </span>
                    </div>
                    <div className="tl-body">
                      <div className="tl-head"><b>{ev.autor}</b><span className="subtle">{fmtDT(ev.ts)}</span></div>
                      {ev.tipo === 'comentario' ? <>
                        {ev.texto && <div className="tl-text">{ev.texto}</div>}
                        {ev.adjuntos.length > 0 && <div className="tl-adj">
                          {ev.adjuntos.map((a, i) => esImg(a)
                            ? <a key={i} href={api.fileUrl(a.path)} target="_blank" rel="noreferrer"><img src={api.fileUrl(a.path)} alt={a.nombre} /></a>
                            : <a key={i} className="tl-doc" href={api.fileUrl(a.path)} target="_blank" rel="noreferrer"><Icon name="file" size={14} />{a.nombre}</a>)}
                        </div>}
                      </> : <div className="tl-evt">{ev.texto}</div>}
                    </div>
                  </div>
                ))}
              </div>}
          </div>
        </div>

        <aside className="tkd-side">
          <div className="card pad-sm">
            <div className="tkd-side-head"><Icon name="settings" size={14} />Detalles</div>
            <div className="tkd-fields">
              <div className="tkd-f">
                <label><Icon name="checkCircle" size={13} />Estado</label>
                <select value={t.estado} onChange={e => cambiarEstado(e.target.value)}>
                  {FLUJO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="tkd-f">
                <label><Icon name="alert" size={13} />Prioridad</label>
                <div className="row" style={{ gap: 8 }}>
                  <PrioIcon p={t.prioridad} size={15} />
                  <select value={t.prioridad} onChange={e => set('prioridad', e.target.value)} style={{ flex: 1 }}>
                    <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
                  </select>
                </div>
              </div>
              <div className="tkd-f">
                <label><Icon name="users" size={13} />Asignado a</label>
                <div className="row" style={{ gap: 8 }}>
                  <TkAvatar nombre={t.asignado} src={avatarDe(t.asignado)} size={26} />
                  <select value={t.asignado || ''} onChange={e => set('asignado', e.target.value)} style={{ flex: 1 }}>
                    <option value="">- Sin asignar -</option>
                    {usuarios.map(u => <option key={u.id} value={u.nombre || u.username}>{u.nombre || u.username}</option>)}
                    {t.asignado && !usuarios.some(u => (u.nombre || u.username) === t.asignado) && <option value={t.asignado}>{t.asignado}</option>}
                  </select>
                </div>
              </div>
              <div className="tkd-f">
                <label><Icon name="building" size={13} />Cliente</label>
                <select value={t.cliente_id || ''} onChange={e => set('cliente_id', e.target.value)}>
                  <option value="">- Sin cliente -</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                {t.cliente_id && <Link className="tkd-link" to={'/clientes/' + t.cliente_id}><Icon name="arrowRight" size={12} />Ver ficha del cliente</Link>}
              </div>
              <div className="tkd-meta">
                <div><Icon name="plus" size={12} /><span>Creado</span><b>{fmtDT(t.created_at)}</b></div>
                <div><Icon name="clock" size={12} /><span>{['resuelto', 'cerrado'].includes(t.estado) ? 'Resuelto en' : 'Abierto hace'}</span><b>{fmtDur(t.created_at, ['resuelto', 'cerrado'].includes(t.estado) ? t.updated_at : null)}</b></div>
                <div><Icon name="clock" size={12} /><span>Actualizado</span><b>{fmtDT(t.updated_at)}</b></div>
                <div><Icon name="ticket" size={12} /><span>Clave</span><b className="mono">TK-{t.id}</b></div>
              </div>
            </div>
          </div>

          {visitas.length > 0 && <div className="card pad-sm">
            <div className="tkd-side-head"><Icon name="calendar" size={14} />Visitas asociadas</div>
            <div className="stack" style={{ gap: 4 }}>
              {visitas.map(v => { const VEST = { programada: ['gris', 'Programada'], en_curso: ['info', 'En curso'], cerrada: ['ok', 'Cerrada'], cancelada: ['falla', 'Cancelada'] }; const [tone, lbl] = VEST[v.estado] || VEST.programada; const js = (v.jornadas || []).filter(j => j.estado !== 'cancelada'); const jdone = js.filter(j => j.estado === 'completada').length; const fd = (d) => new Date(d).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' }); return (
                <Link key={v.id} to={'/visitas/' + v.id} className="tkd-visita">
                  <span className="ico" style={{ width: 28, height: 28, background: 'var(--brand-soft)', color: 'var(--brand-600)' }}><Icon name="calendar" size={14} /></span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13 }}>V-{String(v.id).padStart(5, '0')}{v.tipo ? ' · ' + (v.tipo === 'correctiva' ? 'Correctiva' : 'Preventiva') : ''}{v.multidia ? ' · ' + js.length + ' dias' : ''}</b>
                    <div className="subtle" style={{ fontSize: 11.5 }}>{v.multidia && v.fecha_fin ? (fd(v.fecha) + ' → ' + fd(v.fecha_fin)) : new Date(v.fecha).toLocaleDateString('es-UY')}{v.tecnico ? ' · ' + v.tecnico : ''}</div>
                    {v.multidia && (v.jornadas || []).length > 0 && <div className="tkd-dias">{(v.jornadas || []).map(j => <span key={j.orden} className={'tkd-dia j-' + j.estado} title={new Date(j.fecha).toLocaleDateString('es-UY') + ' · ' + j.estado}>D{j.orden}</span>)}<span className="tkd-dias-n">{jdone}/{js.length}</span></div>}
                  </div>
                  <span className={'badge ' + tone}><span className="dot" />{lbl}</span>
                </Link>
              ); })}
            </div>
          </div>}

          <button className="btn sec" style={{ width: '100%', marginTop: 10 }} onClick={convertir}><Icon name="calendar" size={16} />Convertir a visita correctiva</button>
          {dirty && <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={guardar} disabled={saving}><Icon name="save" size={16} />{saving ? 'Guardando...' : 'Guardar cambios'}</button>}
        </aside>
      </div>
      {confBorrar && <ConfirmModal titulo={'Eliminar TK-' + t.id} mensaje={'Se eliminara el ticket "' + (t.titulo || '') + '" con todos sus comentarios y adjuntos. Esta accion no se puede deshacer.'} onConfirm={borrar} onClose={() => setConfBorrar(false)} />}
    </div>
  );
}
