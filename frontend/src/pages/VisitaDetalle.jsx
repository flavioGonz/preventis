import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, Field, Loading, Empty, Stat, estadoBadge } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import SignaturePad from '../components/SignaturePad.jsx';
import QRScanner from '../components/QRScanner.jsx';
import Drawer from '../components/Drawer.jsx';
import RichText from '../components/RichText.jsx';
import { getGPS, mapsLink } from '../geo.js';
import { trySave } from '../outbox.js';
import { compressToDataURL, compressToFile } from '../img.js';
import PhotoAnnotator from '../components/PhotoAnnotator.jsx';
import { dataURLtoBlob } from '../img.js';
import { getToken } from '../auth.js';

export default function VisitaDetalle({ user }) {
  const { id } = useParams();
  const [visita, setVisita] = useState(null);
  const [tecnicos, setTecnicos] = useState([]);
  const [estados, setEstados] = useState([]);
  const [sug, setSug] = useState(null);
  const [elem, setElem] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [firmaOpen, setFirmaOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [enviandoMail, setEnviandoMail] = useState(false);
  const [eqFilterOpen, setEqFilterOpen] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState('todos');
  const [busqEq, setBusqEq] = useState('');
  const [fSistema, setFSistema] = useState('');
  const [fGrupo, setFGrupo] = useState('');
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const esAdmin = user?.rol === 'admin';
  const [okOpen, setOkOpen] = useState(false);
  const [campo] = useState(() => { try { return window.matchMedia('(pointer:coarse)').matches; } catch { return false; } });

  const loadVisita = () => api.get('/api/visitas/' + id).then(setVisita);
  const loadSug = () => api.get('/api/visitas/' + id + '/sugerencias').then(setSug);
  useEffect(() => {
    loadVisita(); loadSug();
    api.get('/api/tecnicos').then(setTecnicos);
    api.get('/api/usuarios/lista').then(setUsuarios).catch(() => {});
    api.get('/api/estados_equipo').then(setEstados);
  }, [id]);
  useEffect(() => {
    const onSync = () => { loadVisita(); loadSug(); };
    window.addEventListener('app-synced', onSync);
    return () => window.removeEventListener('app-synced', onSync);
  }, [id]);

  const set = (k, v) => setVisita({ ...visita, [k]: v });

  // Modo campo automatico en tablets/pantallas tactiles
  useEffect(() => {
    document.body.classList.toggle('field-mode', campo);
    return () => document.body.classList.remove('field-mode');
  }, [campo]);

  // Wake lock: la tablet no se duerme durante la visita en curso
  useEffect(() => {
    if (!visita || visita.estado !== 'en_curso' || !('wakeLock' in navigator)) return;
    let lock = null, alive = true;
    const acquire = async () => { try { lock = await navigator.wakeLock.request('screen'); } catch {} };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible' && alive) acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); try { lock && lock.release(); } catch {} };
  }, [visita?.estado]);

  // Autoguardado local de textos (borrador) por si se cae la app
  const [offReady, setOffReady] = useState(false);
  useEffect(() => {
    if (!sug) return;
    let alive = true;
    const hdr = { headers: { Authorization: 'Bearer ' + (getToken() || '') } };
    (async () => {
      // precachear las fotos de los equipos (van con token en la query)
      const urls = sug.map(e => e.foto_path).filter(Boolean).map(p => api.fileUrl(p));
      await Promise.all(urls.map(u => fetch(u).catch(() => {})));
      // y los datos clave de la visita (quedan en cache del SW) - con token
      await Promise.all([
        fetch(api.base + '/api/visitas/' + id, hdr).catch(() => {}),
        fetch(api.base + '/api/visitas/' + id + '/sugerencias', hdr).catch(() => {}),
        fetch(api.base + '/api/estados_equipo', hdr).catch(() => {}),
      ]);
      if (alive) setOffReady(true);
    })();
    return () => { alive = false; };
  }, [sug ? sug.length : 0, id]);

  const draftKey = 'preventis_draft_v' + id;
  useEffect(() => {
    if (!visita) return;
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (d && visita.estado !== 'cerrada') {
        const vacio = !visita.situacion_inicial && !visita.acciones && !visita.situacion_final;
        if (vacio && (d.situacion_inicial || d.acciones || d.situacion_final)) setVisita(v => ({ ...v, ...d }));
      }
    } catch {}
  }, [visita?.id]);
  useEffect(() => {
    if (!visita || visita.estado === 'cerrada') return;
    const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify({ situacion_inicial: visita.situacion_inicial, acciones: visita.acciones, situacion_final: visita.situacion_final })); } catch {} }, 600);
    return () => clearTimeout(t);
  }, [visita?.situacion_inicial, visita?.acciones, visita?.situacion_final]);
  const guardar = async () => {
    setSaving(true);
    try { await api.put('/api/visitas/' + id, visita); try { localStorage.removeItem(draftKey); } catch {} toast.ok('Visita guardada'); }
    catch (e) { toast.err(e.message); }
    setSaving(false);
  };
  const subirArchivos = async (e, tipo) => {
    const files = [...(e.target.files || [])]; if (!files.length) return;
    e.target.value = '';
    try {
      if (tipo === 'foto') {
        const datos = []; const nombres = [];
        for (const f of files) { const d = await compressToDataURL(f); if (d) { datos.push(d); nombres.push((f.name || 'foto').replace(/\.\w+$/, '') + '.jpg'); } }
        const r = await trySave({ type: 'archivo', visitaId: id, tipo, files: datos, nombres });
        toast.ok(r.queued ? 'Fotos guardadas offline, se sincronizaran' : 'Fotos subidas');
      } else {
        const fd = new FormData();
        files.forEach(f => fd.append('files', f)); fd.append('tipo', tipo);
        await api.upload('/api/visitas/' + id + '/archivos', fd);
        toast.ok('Adjuntos subidos');
      }
      loadVisita();
    } catch (err) { toast.err(err.message); }
  };
  // Guarda/actualiza el comentario (caption) de una foto al salir del campo.
  const guardarComentarioFoto = async (fid, texto) => {
    const prev = (visita.archivos || []).find(a => a.id === fid);
    if (!prev || (prev.comentario || '') === (texto || '')) return;
    try {
      await api.put('/api/visita_archivos/' + fid, { comentario: texto });
      setVisita(v => ({ ...v, archivos: (v.archivos || []).map(a => a.id === fid ? { ...a, comentario: texto } : a) }));
    } catch (err) { toast.err(err.message); }
  };
  const guardarFirma = async (dataUrl, firmante_nombre, firmante_doc) => {
    const g = await getGPS();
    try {
      const r = await trySave({ type: 'firma', visitaId: id, dataUrl, firmante_nombre, firmante_doc, lat: g?.lat, lon: g?.lon });
      toast.ok(r.queued ? 'Firma guardada offline, se sincronizara' : (g ? 'Firma y ubicacion guardadas' : 'Firma guardada'));
      setFirmaOpen(false); loadVisita();
    } catch (e) { toast.err(e.message); }
  };
  const marcarOk = async (estado_id) => {
    try { const r = await api.post('/api/visitas/' + id + '/pruebas/marcar-ok', { estado_id }); toast.ok(r.creadas + ' equipos marcados'); setOkOpen(false); loadSug(); }
    catch (e) { toast.err(e.message); }
  };
  const cancelarVisita = async (motivo) => {
    try { await api.post('/api/visitas/' + id + '/cancelar', { motivo }); toast.ok('Visita cancelada'); setCancelarOpen(false); loadVisita(); }
    catch (e) { toast.err(e.message); }
  };
  const cambiarEstado = async (accion) => {
    const g = accion === 'reabrir' ? null : await getGPS();
    try {
      const r = await trySave({ type: 'estado', visitaId: id, accion, lat: g?.lat, lon: g?.lon });
      toast.ok(r.queued ? 'Guardado offline, se sincronizara' : (accion === 'iniciar' ? 'Visita iniciada' : 'Visita reabierta'));
      loadVisita();
    } catch (e) { toast.err(e.message); }
  };
  const onScanEquipo = (code) => {
    setScanOpen(false);
    const eq = (sug || []).find(x => (x.codigo_qr || '').toLowerCase() === String(code).trim().toLowerCase());
    if (eq) setElem(eq); else toast.err('Equipo no encontrado en este cliente: ' + code);
  };

  if (!visita) return <Loading />;
  const jorn = visita.jornadas || [];
  const jornVis = jorn.filter(j => j.estado !== 'cancelada');
  const jEnCurso = jornVis.find(j => j.estado === 'en_curso');
  const jPend = jornVis.filter(j => j.estado === 'planificada').length;
  const jDone = jornVis.filter(j => j.estado === 'completada').length;
  const jIdxEnCurso = jEnCurso ? jornVis.indexOf(jEnCurso) + 1 : 0;
  const multiInfo = visita.multidia ? (jEnCurso ? 'Dia ' + jIdxEnCurso + '/' + jornVis.length : (visita.estado === 'en_curso' && jPend ? 'En pausa' : null)) : null;
  const JEST = { planificada: 'Planificada', en_curso: 'En curso', completada: 'Completada', cancelada: 'Cancelada' };
  const iniciarJornada = async (jid) => { try { const g = await getGPS(); await api.post('/api/visitas/' + id + '/jornadas/' + jid + '/iniciar', { lat: g?.lat, lon: g?.lon }); toast.ok('Jornada iniciada'); loadVisita(); } catch (e) { toast.err(e.message); } };
  const pausarJornada = async (jid) => { const nota = (prompt('Nota de la jornada (opcional):', '') || '').trim(); try { await api.post('/api/visitas/' + id + '/jornadas/' + jid + '/pausar', { nota: nota || null }); toast.ok('Jornada pausada (continua otro dia)'); loadVisita(); } catch (e) { toast.err(e.message); } };
  const reassignJornada = async (jid, tecnico_id) => { try { await api.put('/api/visitas/' + id + '/jornadas/' + jid, { tecnico_id: tecnico_id ? Number(tecnico_id) : 0 }); loadVisita(); } catch (e) { toast.err(e.message); } };
  const cancelarJornada = async (jid, dia) => { const m = (prompt('Motivo de cancelar el dia ' + dia + ':', '') || '').trim(); try { await api.post('/api/visitas/' + id + '/jornadas/' + jid + '/cancelar', { motivo: m }); toast.ok('Dia cancelado'); loadVisita(); } catch (e) { toast.err(e.message); } };
  const reactivarJornada = async (jid) => { try { await api.put('/api/visitas/' + id + '/jornadas/' + jid, { estado: 'planificada' }); toast.ok('Dia reactivado'); loadVisita(); } catch (e) { toast.err(e.message); } };
  const fotos = (visita.archivos || []).filter(a => a.tipo === 'foto');
  const adjuntos = (visita.archivos || []).filter(a => a.tipo === 'adjunto');
  const total = sug?.length || 0;
  const cargados = (sug || []).filter(s => s.estado_actual_id).length;
  const enFalla = (sug || []).filter(s => s.prioridad === 1).length;
  const pendientes = (sug || []).filter(s => !s.estado_actual_id).length;
  const fallaAnterior = (sug || []).filter(s => s.ultima_falla).length;
  const pct = total ? Math.round((cargados / total) * 100) : 0;
  const sistemasOpts = [...new Set((sug || []).map(s => s.sistema).filter(Boolean))].sort();
  const gruposOpts = [...new Set((sug || []).map(s => s.grupo).filter(Boolean))].sort();
  const qEq = busqEq.trim().toLowerCase();
  const matchTexto = (s) => !qEq || [s.etiqueta, s.codigo_qr, s.sistema, s.tipo_elemento, s.direccion, s.grupo, s.subgrupo, s.modelo]
    .filter(Boolean).some(v => String(v).toLowerCase().includes(qEq));
  const filtrados = (sug || []).filter(s =>
    (filtro === 'pendientes' ? !s.estado_actual_id :
      filtro === 'cargados' ? !!s.estado_actual_id :
        filtro === 'falla' ? s.prioridad === 1 : true)
    && (!fSistema || s.sistema === fSistema)
    && (!fGrupo || s.grupo === fGrupo)
    && matchTexto(s));
  const filtrosExtra = (fSistema ? 1 : 0) + (fGrupo ? 1 : 0);

  const FILTLBL = { todos: 'Todos', pendientes: 'Pendientes', cargados: 'Cargados', falla: 'En falla' };
  const filtCount = filtro === 'todos' ? total : filtro === 'pendientes' ? pendientes : filtro === 'cargados' ? cargados : enFalla;
  const cancelada = visita.estado === 'cancelada';
  const acts = [];
  if (cancelada) {
    if (esAdmin) acts.push({ key: 'reactivar', label: 'Reactivar visita', icon: 'edit', cls: 'btn sec', onClick: () => cambiarEstado('reabrir') });
  } else {
    if (visita.estado !== 'en_curso' && visita.estado !== 'cerrada' && !visita.multidia) acts.push({ key: 'iniciar', label: 'Iniciar', icon: 'arrowRight', cls: 'btn', onClick: () => cambiarEstado('iniciar') });
    if (visita.estado === 'en_curso') acts.push({ key: 'cerrar', label: 'Cerrar visita', icon: 'checkCircle', cls: 'btn ok-cta', onClick: () => setCerrarOpen(true) });
    if (visita.estado === 'cerrada') acts.push({ key: 'reabrir', label: 'Reabrir', icon: 'edit', cls: 'btn sec', onClick: () => cambiarEstado('reabrir') });
    acts.push({ key: 'guardar', label: saving ? 'Guardando...' : 'Guardar', icon: 'save', cls: 'btn sec', onClick: guardar, disabled: saving || visita.estado === 'cerrada' });
  }

  const shareFile = async (kind) => {
    const url = api.fileUrl(kind === 'pdf' ? '/api/visitas/' + id + '/informe.pdf' : '/api/visitas/' + id + '/pruebas/export.xlsx');
    const fname = kind === 'pdf' ? 'informe_visita_' + id + '.pdf' : 'pruebas_visita_' + id + '.xlsx';
    try {
      const r = await fetch(url); const blob = await r.blob();
      const file = new File([blob], fname, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Informe de visita', text: 'Informe de mantenimiento - ' + (visita.cliente || '') });
        setExportOpen(false); return;
      }
    } catch (e) {}
    const link = location.origin + (kind === 'pdf' ? '/api/visitas/' + id + '/informe.pdf' : '/api/visitas/' + id + '/pruebas/export.xlsx');
    window.open('https://wa.me/?text=' + encodeURIComponent('Informe de mantenimiento ' + (visita.cliente || '') + ': ' + link), '_blank');
    setExportOpen(false);
  };

  const enviarEmail = async () => {
    const to = prompt('Email del destinatario (dejá vacío para usar el del cliente):', '');
    if (to === null) return;
    setEnviandoMail(true);
    try { const r = await api.post('/api/visitas/' + id + '/enviar-email', { to: (to || '').trim() || undefined }); toast.ok('Informe enviado a ' + r.to); setExportOpen(false); }
    catch (e) { toast.err(e.message); }
    setEnviandoMail(false);
  };

  return (
    <div>
      <Link to={'/clientes/' + visita.cliente_id} className="backlink"><Icon name="chevronLeft" size={16} />{visita.cliente}</Link>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
            <div className="ttl">{visita.titulo || ('Visita - ' + fechaUY(visita.fecha))}</div>
            <span className="row wrap" style={{ gap: 6 }}>
              {estadoVisita(visita.estado)}
              {multiInfo && <span className={'badge mini ' + (multiInfo === 'En pausa' ? 'warn' : 'info')}><Icon name={multiInfo === 'En pausa' ? 'clock' : 'repeat'} size={11} />{multiInfo}</span>}
              {visita.tipo && <span className={'badge mini ' + (visita.tipo === 'correctiva' ? 'warn' : 'info')}>{visita.tipo === 'correctiva' ? 'Correctiva' : 'Preventiva'}</span>}
              {visita.facturar === true && <span className="badge mini ok">Facturar</span>}
              {visita.facturar === false && <span className="badge mini gris">No facturar</span>}
            </span>
          </div>
          <div className="desc">{visita.titulo ? fechaUY(visita.fecha) + ' · ' : ''}{visita.cliente} - {visita.tecnico || 'Sin tecnico asignado'}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sec sm" onClick={() => setImportOpen(true)} data-tip="Importar pruebas desde un Excel a esta visita"><Icon name="upload" size={15} />Importar pruebas</button>
          <button className="btn sec sm" onClick={() => setExportOpen(true)}><Icon name="download" size={15} />Exportar</button>
        </div>
      </div>

      {cancelada && <div className="cancel-banner">
        <span className="ico"><Icon name="x" size={17} /></span>
        <div><b>Visita cancelada</b> &middot; {visita.cancelada_motivo || 'sin motivo'}<div className="subtle" style={{ fontSize: 12 }}>Por {visita.cancelada_por || '-'}{visita.cancelada_at ? ' el ' + new Date(visita.cancelada_at).toLocaleString('es-UY') : ''}</div></div>
      </div>}
      {user && !cancelada && <div className="mod-banner">
        <span className="ico" style={{ display: 'grid', placeItems: 'center' }}><Icon name="wrench" size={17} /></span>
        <div>Moderando como <b>{user.nombre || user.username}</b>{user.rol ? <> &middot; rol <b>{user.rol}</b></> : null}.</div>
      </div>}

      <div className="vtop">
        <div className="card vprogress" style={{ margin: 0 }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <div>
              <div className="vp-title">Progreso de la visita</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                {cargados} de {total} equipos cargados{enFalla ? <> &middot; <span style={{ color: 'var(--falla)', fontWeight: 600 }}>{enFalla} en falla</span></> : null}
              </div>
            </div>
            <div className="vp-pct">{pct}%</div>
          </div>
          <div className="progress big"><div style={{ width: pct + '%' }} /></div>
          {(visita.hora_entrada || visita.hora_salida) && <div className="vp-times">
            {visita.hora_entrada && <span className="vp-time"><Icon name="arrowRight" size={13} color="var(--ok)" />Entrada {hhmm(visita.hora_entrada)}{visita.entrada_lat != null && <> &middot; <a href={mapsLink(visita.entrada_lat, visita.entrada_lon)} target="_blank" rel="noreferrer">mapa</a></>}</span>}
            {visita.hora_salida && <span className="vp-time"><Icon name="check" size={13} color="var(--subtle)" />Salida {hhmm(visita.hora_salida)}{visita.salida_lat != null && <> &middot; <a href={mapsLink(visita.salida_lat, visita.salida_lon)} target="_blank" rel="noreferrer">mapa</a></>}</span>}
          </div>}
          {visita.estado === 'en_curso' && <LiveTimer start={visita.hora_entrada} />}
          {offReady && <div className="off-ready"><Icon name="check" size={13} />Lista para usar sin conexion</div>}
        </div>
        <div className="vactions va-desktop">
          {acts.map(a => <button key={a.key} className={a.cls || 'btn sec'} disabled={a.disabled} onClick={a.onClick}><Icon name={a.icon} size={16} />{a.label}</button>)}
        </div>
      </div>

      {visita.multidia && jorn.length > 0 && <div className="card jor-card">
        <div className="sec-head"><span className="fc-ic"><Icon name="calendar" size={17} /></span><b>Jornadas de la visita</b>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>{jDone} de {jornVis.length} dias trabajados</span>
        </div>
        <div className="jor-list">
          {jorn.map(j => {
            const fd = new Date((j.fecha || '').slice(0, 10) + 'T00:00:00');
            const est = j.estado;
            return (
              <div key={j.id} className={'jor-item ' + est}>
                <div className="jor-ic"><Icon name={est === 'completada' ? 'check' : est === 'en_curso' ? 'clock' : est === 'cancelada' ? 'x' : 'calendar'} size={15} /></div>
                <div className="jor-body">
                  <div className="jor-top"><b>Dia {j.orden}</b> · {fd.toLocaleDateString('es-UY', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    <span className={'badge mini ' + (est === 'completada' ? 'ok' : est === 'en_curso' ? 'info' : est === 'cancelada' ? 'falla' : 'gris')}>{JEST[est] || est}</span>
                  </div>
                  <div className="jor-sub">
                    {(j.hora_inicio || j.hora_fin) && <span><Icon name="clock" size={12} /> {j.hora_inicio ? hhmm(j.hora_inicio) : '--:--'} → {j.hora_fin ? hhmm(j.hora_fin) : '...'}</span>}
                    {j.nota && <span className="muted"> · {j.nota}</span>}
                  </div>
                </div>
                {visita.estado !== 'cerrada' && <div className="jor-act">
                  {est !== 'cancelada' && <select className="jor-tec" value={j.tecnico_id || ''} onChange={e => reassignJornada(j.id, e.target.value)} title="Tecnico del dia">
                    <option value="">Sin tecnico</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>}
                  {est === 'planificada' && <button className="btn sm" onClick={() => iniciarJornada(j.id)}><Icon name="arrowRight" size={14} />Iniciar</button>}
                  {est === 'en_curso' && <button className="btn sec sm" onClick={() => pausarJornada(j.id)}><Icon name="clock" size={14} />Pausar</button>}
                  {esAdmin && (est === 'planificada' || est === 'en_curso') && <button className="btn ghost sm" style={{ color: 'var(--falla)' }} onClick={() => cancelarJornada(j.id, j.orden)} title="Cancelar este dia"><Icon name="x" size={14} /></button>}
                  {esAdmin && est === 'cancelada' && <button className="btn ghost sm" onClick={() => reactivarJornada(j.id)}><Icon name="history" size={14} />Reactivar</button>}
                </div>}
              </div>
            );
          })}
        </div>
      </div>}

      <div className="card">
        <div className="sec-head"><span className="fc-ic"><Icon name="clipboard" size={17} /></span><b>Datos de la visita</b></div>
        <div className="datos-split">
          <div className="datos-main">
            <Field label={<span className="flabel"><Icon name="pen" size={13} />Título de la visita</span>}><input value={visita.titulo || ''} placeholder="Opcional — ej. el título del ticket" onChange={e => set('titulo', e.target.value)} /></Field>
            <div className="grid2">
              <Field label={<span className="flabel"><Icon name="calendar" size={13} />Fecha de la visita</span>}><DateField value={visita.fecha} onChange={v => set('fecha', v)} /></Field>
              <Field label={<span className="flabel"><Icon name="users" size={13} />Tecnicos {(visita.tecnico_ids || []).length > 0 && <span className="muted" style={{ fontWeight: 500 }}>({(visita.tecnico_ids || []).length})</span>}</span>}>
                <TecnicosSelect tecnicos={tecnicos} value={visita.tecnico_ids || []} onChange={ids =>
                  setVisita({ ...visita, tecnico_ids: ids, tecnico_id: ids[0] || null, tecnico: tecnicos.filter(t => ids.includes(t.id)).map(t => t.nombre).join(', ') })} />
              </Field>
              <Field label={<span className="flabel"><Icon name="clock" size={13} />Fecha maxima de resolucion</span>}><DateField value={visita.fecha_max_resolucion} onChange={v => set('fecha_max_resolucion', v)} /></Field>
            </div>
            <div className="grid2">
            <Field label={<span className="flabel"><Icon name="wrench" size={13} />Tipo de visita</span>}>
              <select value={visita.tipo || 'preventiva'} onChange={e => set('tipo', e.target.value)}>
                <option value="preventiva">Preventiva (contrato)</option>
                <option value="correctiva">Correctiva</option>
              </select>
            </Field>
            <Field label={<span className="flabel"><Icon name="users" size={13} />Asignada por</span>}>
              <input list="dl-usuarios" value={visita.asignada_por || ''} placeholder="Buscar usuario..." onChange={e => set('asignada_por', e.target.value)} />
              <datalist id="dl-usuarios">{usuarios.map(u => <option key={u.id} value={u.nombre || u.username} />)}</datalist>
            </Field>
            </div>
            <Field label={<span className="flabel"><Icon name="pen" size={13} />Situacion inicial del sistema<VoiceBtn onText={t => set('situacion_inicial', (visita.situacion_inicial ? visita.situacion_inicial + ' ' : '') + t)} /></span>}><RichText value={visita.situacion_inicial || ''} onChange={html => set('situacion_inicial', html)} placeholder="Describí el estado del sistema al llegar..." /></Field>
            <Field label={<span className="flabel"><Icon name="wrench" size={13} />Acciones tomadas<VoiceBtn onText={t => set('acciones', (visita.acciones ? visita.acciones + ' ' : '') + t)} /></span>}><RichText value={visita.acciones || ''} onChange={html => set('acciones', html)} placeholder="Detallá las tareas realizadas..." /></Field>
            <Field label={<span className="flabel"><Icon name="checkCircle" size={13} />Situacion final del sistema<VoiceBtn onText={t => set('situacion_final', (visita.situacion_final ? visita.situacion_final + ' ' : '') + t)} /></span>}><RichText value={visita.situacion_final || ''} onChange={html => set('situacion_final', html)} placeholder="Estado del sistema al finalizar..." /></Field>
          </div>
          <div className="datos-firma">
            <div className="side-box">
              <div className="firma-head"><Icon name="camera" size={16} color="var(--brand-600)" /><b>Fotos y adjuntos</b></div>
              <div className="row wrap" style={{ gap: 8 }}>
                <label className="btn sec sm" style={{ cursor: 'pointer' }}><Icon name="camera" size={15} />Fotos<input type="file" accept="image/*" multiple hidden onChange={e => subirArchivos(e, 'foto')} /></label>
                <label className="btn sec sm" style={{ cursor: 'pointer' }}><Icon name="paperclip" size={15} />Adjuntos<input type="file" multiple hidden onChange={e => subirArchivos(e, 'adjunto')} /></label>
              </div>
              {fotos.length > 0 && <div className="foto-grid" style={{ marginTop: 6 }}>
                {fotos.map(f => (
                  <div key={f.id} className="foto-card">
                    <a href={api.base + f.path} target="_blank" rel="noreferrer"><img src={api.base + f.path} alt="" /></a>
                    <input className="foto-cap" defaultValue={f.comentario || ''} placeholder="Comentario de la foto…"
                      onBlur={e => guardarComentarioFoto(f.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
                  </div>
                ))}
              </div>}
              {adjuntos.length > 0 && <div className="stack" style={{ gap: 6, marginTop: 4 }}>
                {adjuntos.map(a => <a key={a.id} className="row" style={{ gap: 7, fontSize: 13.5 }} href={api.base + a.path} target="_blank" rel="noreferrer"><Icon name="file" size={15} />{a.filename}</a>)}
              </div>}
            </div>
            <div className="firma-box">
              <div className="firma-head"><Icon name="signature" size={16} color="var(--brand-600)" /><b>Firma del cliente</b></div>
              {visita.firma_path ? <>
                <img className="firma-img" src={api.base + visita.firma_path} />
                {visita.firmante_nombre && <div className="firma-by"><b>{visita.firmante_nombre}</b>{visita.firmante_doc ? <span className="muted"> · Doc. {visita.firmante_doc}</span> : null}</div>}
                {visita.firma_lat != null && <a className="firma-loc" href={mapsLink(visita.firma_lat, visita.firma_lon)} target="_blank" rel="noreferrer"><Icon name="pin" size={12} />Ubicacion donde se firmo</a>}
                <button className="btn sec sm" onClick={() => setFirmaOpen(true)}><Icon name="edit" size={14} />Volver a firmar</button>
              </> : <>
                <div className="firma-empty"><Icon name="signature" size={32} /><span>Sin firma registrada</span></div>
                <button className="btn sec sm" onClick={() => setFirmaOpen(true)}><Icon name="signature" size={15} />Capturar firma</button>
              </>}
            </div>
          </div>
        </div>
      </div>

      <TareasVisita visitaId={id} />

      <div className="row between wrap" style={{ margin: '22px 0 12px', gap: 10 }}>
        <div>
          <b style={{ fontSize: 15 }}>Equipos a probar</b>
          <div className="muted" style={{ fontSize: 12.5 }}>Orden sugerido automaticamente</div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setScanOpen(true)}><Icon name="qr" size={17} />Escanear QR</button>
          {pendientes > 0 && visita.estado === 'en_curso' && <button className="btn sec sm" onClick={() => setOkOpen(true)}><Icon name="check" size={15} />Marcar OK pendientes ({pendientes})</button>}
          {total > 0 && <button className={'btn sec sm' + (filtrosExtra ? ' on' : '')} onClick={() => setEqFilterOpen(true)}><Icon name="filter" size={15} />{FILTLBL[filtro]} ({filtCount}){filtrosExtra ? <span className="fc">{filtrosExtra}</span> : null}</button>}
        </div>
      </div>
      {total > 0 && <div className="wa-search" style={{ margin: '0 0 12px' }}>
        <Icon name="search" size={17} />
        <input placeholder="Buscar por etiqueta, sistema, grupo, dirección, modelo..." value={busqEq} onChange={e => setBusqEq(e.target.value)} />
        {busqEq && <button className="btn ghost icon sm" onClick={() => setBusqEq('')}><Icon name="x" size={15} /></button>}
      </div>}
      {fallaAnterior > 0 && <div className="prev-falla" onClick={() => setFiltro('falla')}>
        <Icon name="alert" size={15} />
        <span><b>{fallaAnterior}</b> {fallaAnterior === 1 ? 'equipo quedo' : 'equipos quedaron'} en falla la visita anterior. Tocá para verlos.</span>
        <Icon name="chevronRight" size={15} />
      </div>}

      {sug === null ? <Loading /> : sug.length === 0 ?
        <Empty icon="box" title="Sin equipos">Este cliente no tiene equipos cargados.</Empty> :
        filtrados.length === 0 ?
        <Empty icon="checkCircle" title="Nada para mostrar">No hay equipos con ese filtro.</Empty> :
        <div className="list">
          {filtrados.map(s => (
            <div key={s.id} className={'card click f' + s.prioridad} style={{ padding: 0 }} onClick={() => setElem(s)}>
              <div className={'sug f' + s.prioridad}>
                <div className={'prio p' + s.prioridad} />
                <div className={'ico' + (s.foto_path ? ' photo' : '')}>{s.foto_path ? <img src={api.base + s.foto_path} alt="" /> : <Icon name={s.prioridad === 1 ? 'alert' : s.prioridad === 2 ? 'clock' : 'box'} size={19} />}</div>
                <div className="grow">
                  <div className="title">{s.etiqueta || s.codigo_qr || ('Equipo ' + s.id)}
                    {s.estado_actual_id && <span className="badge ok" style={{ marginLeft: 8 }}><Icon name="check" size={12} />Cargado</span>}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 1 }}>
                    {[s.sistema, s.tipo_elemento, s.direccion].filter(Boolean).join(' - ') || '-'}
                  </div>
                  <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                    {s.motivo} - ult: {s.ultima_fecha ? new Date(s.ultima_fecha).toLocaleDateString('es-UY') : 'nunca'}
                    {s.ultimo_estado ? ' (' + s.ultimo_estado + ')' : ''}
                  </div>
                </div>
                <div>{s.estado_actual ? estadoBadge(s.estado_actual, false) :
                  <span className="row subtle" style={{ gap: 3, fontSize: 13 }}>cargar<Icon name="chevronRight" size={15} /></span>}</div>
              </div>
            </div>
          ))}
        </div>}

      <div className="v-fabspace" />
      <div className="v-fabbar">
        {acts.map(a => <button key={a.key} className={(a.cls || 'btn sec') + ' sm'} disabled={a.disabled} onClick={a.onClick}><Icon name={a.icon} size={16} />{a.label}</button>)}
      </div>

      <Drawer open={exportOpen} onClose={() => setExportOpen(false)} title="Exportar y compartir" side="bottom">
        <div className="stack" style={{ gap: 8 }}>
          <a className="exp-opt" target="_blank" rel="noreferrer" href={api.fileUrl('/api/visitas/' + id + '/informe.pdf')} onClick={() => setExportOpen(false)}><span className="ico" style={{ background: 'var(--falla-bg)', color: 'var(--falla)' }}><Icon name="printer" size={17} /></span><div className="grow"><b>Informe PDF</b><div className="muted" style={{ fontSize: 12.5 }}>Ver o descargar</div></div><Icon name="chevronRight" size={16} color="var(--subtle)" /></a>
          <button className="exp-opt" onClick={enviarEmail} disabled={enviandoMail}><span className="ico" style={{ background: 'var(--brand-soft)', color: 'var(--brand-600)' }}><Icon name="mail" size={17} /></span><div className="grow"><b>{enviandoMail ? 'Enviando...' : 'Enviar por email'}</b><div className="muted" style={{ fontSize: 12.5 }}>Manda el informe PDF al cliente</div></div><Icon name="chevronRight" size={16} color="var(--subtle)" /></button>
          <button className="exp-opt" onClick={() => shareFile('pdf')}><span className="ico" style={{ background: '#dcfce7', color: '#15803d' }}><Icon name="share" size={17} /></span><div className="grow"><b>Compartir PDF</b><div className="muted" style={{ fontSize: 12.5 }}>WhatsApp, mail, etc.</div></div><Icon name="chevronRight" size={16} color="var(--subtle)" /></button>
          <a className="exp-opt" href={api.fileUrl('/api/visitas/' + id + '/pruebas/export.xlsx')} onClick={() => setExportOpen(false)}><span className="ico" style={{ background: '#dcfce7', color: '#166534' }}><Icon name="download" size={17} /></span><div className="grow"><b>Excel de pruebas</b><div className="muted" style={{ fontSize: 12.5 }}>Descargar planilla</div></div><Icon name="chevronRight" size={16} color="var(--subtle)" /></a>
          <button className="exp-opt" onClick={() => shareFile('xlsx')}><span className="ico" style={{ background: '#dcfce7', color: '#15803d' }}><Icon name="share" size={17} /></span><div className="grow"><b>Compartir Excel</b><div className="muted" style={{ fontSize: 12.5 }}>WhatsApp, mail, etc.</div></div><Icon name="chevronRight" size={16} color="var(--subtle)" /></button>
        </div>
      </Drawer>

      <Drawer open={eqFilterOpen} onClose={() => setEqFilterOpen(false)} title="Filtrar equipos" side="bottom">
        <div className="filter-sheet">
          <div className="field">
            <label>Mostrar</label>
            <div className="chips">
              <span className={'chip' + (filtro === 'todos' ? ' active' : '')} onClick={() => { setFiltro('todos'); setEqFilterOpen(false); }}>Todos ({total})</span>
              <span className={'chip' + (filtro === 'pendientes' ? ' active' : '')} onClick={() => { setFiltro('pendientes'); setEqFilterOpen(false); }}>Pendientes ({pendientes})</span>
              <span className={'chip' + (filtro === 'cargados' ? ' active' : '')} onClick={() => { setFiltro('cargados'); setEqFilterOpen(false); }}>Cargados ({cargados})</span>
              <span className={'chip' + (filtro === 'falla' ? ' active' : '')} onClick={() => { setFiltro('falla'); setEqFilterOpen(false); }}>En falla ({enFalla})</span>
            </div>
          </div>
          {sistemasOpts.length > 0 && <div className="field">
            <label>Sistema</label>
            <div className="chips">
              <span className={'chip' + (!fSistema ? ' active' : '')} onClick={() => setFSistema('')}>Todos</span>
              {sistemasOpts.map(x => <span key={x} className={'chip' + (fSistema === x ? ' active' : '')} onClick={() => setFSistema(fSistema === x ? '' : x)}>{x}</span>)}
            </div>
          </div>}
          {gruposOpts.length > 0 && <div className="field">
            <label>Grupo</label>
            <div className="chips">
              <span className={'chip' + (!fGrupo ? ' active' : '')} onClick={() => setFGrupo('')}>Todos</span>
              {gruposOpts.map(x => <span key={x} className={'chip' + (fGrupo === x ? ' active' : '')} onClick={() => setFGrupo(fGrupo === x ? '' : x)}>{x}</span>)}
            </div>
          </div>}
          {(fSistema || fGrupo) && <button className="btn ghost sm" onClick={() => { setFSistema(''); setFGrupo(''); }}><Icon name="x" size={14} />Limpiar sistema y grupo</button>}
          <div className="field">
            <label>Orden de prioridad sugerido</label>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="badge falla"><span className="dot" />1- En falla</span>
              <span className="badge warn"><span className="dot" />2- Mas antiguos</span>
              <span className="badge gris"><span className="dot" />3- Resto</span>
            </div>
          </div>
        </div>
      </Drawer>

      {elem && <ElementoModal visitaId={id} equipo={elem} estados={estados} cola={sug || []}
        onClose={() => setElem(null)} onSaved={() => loadSug()} onNext={(next) => { loadSug(); setElem(next); }} />}
      {firmaOpen && <FirmaModal visita={visita} onClose={() => setFirmaOpen(false)} onSave={guardarFirma} />}
      {okOpen && <MarcarOkModal estados={estados} pendientes={pendientes} onClose={() => setOkOpen(false)} onConfirm={marcarOk} />}
      {cerrarOpen && <CerrarVisitaModal visitaId={id} visita={visita} onClose={() => setCerrarOpen(false)} onClosed={() => { setCerrarOpen(false); loadVisita(); }} />}
      {cancelarOpen && <CancelarVisitaModal onClose={() => setCancelarOpen(false)} onConfirm={cancelarVisita} />}
      {scanOpen && <Modal title="Escanear equipo" subtitle="Apunta la camara al QR del equipo" onClose={() => setScanOpen(false)}>
        <QRScanner onScan={onScanEquipo} />
      </Modal>}
      {importOpen && <ImportPruebasModal visitaId={id} onClose={() => setImportOpen(false)} onDone={() => { loadVisita(); loadSug(); }} />}
    </div>
  );
}

function ImportPruebasModal({ visitaId, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const subir = async () => {
    if (!file) return;
    setBusy(true); setRes(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.upload('/api/visitas/' + visitaId + '/pruebas/import', fd);
      setRes(r);
      if (r.creadas > 0) { toast.ok('Importadas ' + r.creadas + ' pruebas'); onDone && onDone(); }
      else toast.err('No se importó ninguna prueba (verificá el archivo)');
    } catch (e) { toast.err(e.message || 'Error al importar'); }
    setBusy(false);
  };
  return (
    <Modal title="Importar pruebas" subtitle="Cargá un Excel con las pruebas de esta visita" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cerrar</button>
        <button className="btn" onClick={subir} disabled={!file || busy}><Icon name="upload" size={16} />{busy ? 'Importando…' : 'Importar'}</button>
      </>}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
        Sirve la planilla exportada desde la app (<b>Exportar → Excel de pruebas</b>) o una plantilla propia.
        Columnas reconocidas: <b>Etiqueta</b> o <b>Código QR</b>, <b>Estado</b>, <b>Fecha</b> y <b>Comentarios</b>.
        Cada fila se cruza con un equipo del cliente y registra su prueba en esta visita.
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px dashed var(--border)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}>
        <Icon name="upload" size={20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{file ? file.name : 'Elegí un archivo .xlsx'}</div>
          <div className="muted" style={{ fontSize: 12 }}>{file ? 'Listo para importar' : 'Hacé clic para seleccionar'}</div>
        </div>
        <input type="file" accept=".xlsx" hidden onChange={e => { setFile(e.target.files?.[0] || null); setRes(null); }} />
      </label>
      {res && <div style={{ marginTop: 14 }}>
        <div className="row wrap" style={{ gap: 8, marginBottom: res.errores?.length ? 10 : 0 }}>
          <span className="badge ok"><Icon name="check" size={13} />{res.creadas || 0} importadas</span>
          {res.sin_equipo > 0 && <span className="badge warn"><Icon name="alert" size={13} />{res.sin_equipo} sin equipo</span>}
        </div>
        {res.errores?.length > 0 && <div className="card" style={{ maxHeight: 160, overflow: 'auto', fontSize: 12.5, padding: 10 }}>
          {res.errores.map((er, i) => <div key={i} className="muted" style={{ padding: '2px 0' }}>{er}</div>)}
        </div>}
      </div>}
    </Modal>
  );
}

function ElementoModal({ visitaId, equipo, estados, cola = [], onClose, onSaved, onNext }) {
  const [estadoId, setEstadoId] = useState(equipo.estado_actual_id || '');
  const [coment, setComent] = useState(equipo.comentarios_actual || '');
  const [busy, setBusy] = useState(false);
  const [pics, setPics] = useState([]);
  const [anot, setAnot] = useState(null); // {idx, file}
  const [verif, setVerif] = useState(false);
  const [verificado, setVerificado] = useState(false);
  const camRef = useRef();
  const galRef = useRef();
  // reset al cambiar de equipo (guardar y siguiente)
  useEffect(() => { setEstadoId(equipo.estado_actual_id || ''); setComent(equipo.comentarios_actual || ''); setPics([]); setVerificado(false); }, [equipo.id]);
  const onVerif = (code) => { setVerif(false); const c = String(code).trim().toLowerCase(); if (equipo.codigo_qr && c === String(equipo.codigo_qr).toLowerCase()) { setVerificado(true); toast.ok('Equipo verificado por QR'); } else { toast.err('El QR no coincide con este equipo'); } };
  const addPics = (e) => { const fs = [...(e.target.files || [])]; if (fs.length) setPics(p => [...p, ...fs.map(f => ({ file: f, url: URL.createObjectURL(f) }))]); e.target.value = ''; };
  const removePic = (i) => setPics(p => p.filter((_, j) => j !== i));
  const marcar = (i) => { const it = pics[i]; if (it.file) setAnot({ idx: i, file: it.file }); else if (it.dataURL) setAnot({ idx: i, file: dataURLtoBlob(it.dataURL) }); };
  const onAnotado = (dataURL) => { setPics(p => p.map((it, j) => j === anot.idx ? { dataURL, url: dataURL } : it)); setAnot(null); };

  // proximo equipo pendiente (para "guardar y siguiente")
  const idx = cola.findIndex(x => x.id === equipo.id);
  const siguiente = cola.slice(idx + 1).find(x => !x.estado_actual_id) || cola.find(x => !x.estado_actual_id && x.id !== equipo.id) || null;

  const persistir = async () => {
    const g = await getGPS();
    const fotos = [];
    for (const it of pics) { const d = it.dataURL || await compressToDataURL(it.file); if (d) fotos.push(d); }
    const r = await trySave({ type: 'prueba', visitaId, equipo_id: equipo.id, estado_id: estadoId || null, comentarios: coment, lat: g?.lat, lon: g?.lon, fotos });
    return r;
  };
  const guardar = async () => {
    setBusy(true);
    try { const r = await persistir(); toast.ok(r.queued ? 'Guardado offline, se sincronizara' : 'Estado guardado'); onSaved(); onClose(); }
    catch (e) { toast.err(e.message); }
    setBusy(false);
  };
  const guardarYSiguiente = async () => {
    setBusy(true);
    try { const r = await persistir(); toast.ok(r.queued ? 'Guardado offline' : 'Guardado'); if (siguiente && onNext) onNext(siguiente); else { onSaved(); onClose(); } }
    catch (e) { toast.err(e.message); }
    setBusy(false);
  };

  const esFalla = estados.find(e => String(e.id) === String(estadoId))?.es_falla;

  return (
    <Modal title={equipo.etiqueta || equipo.codigo_qr || 'Equipo'}
      subtitle={[equipo.sistema, equipo.tipo_elemento, equipo.modelo].filter(Boolean).join(' - ')}
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cerrar</button>
        {siguiente && <button className="btn sec" onClick={guardarYSiguiente} disabled={busy}><Icon name="arrowRight" size={16} />Guardar y siguiente</button>}
        <button className="btn" onClick={guardar} disabled={busy}><Icon name="check" size={16} />{busy ? 'Guardando...' : 'Guardar'}</button>
      </>}>
      {(equipo.direccion || equipo.grupo) && <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        {[equipo.direccion, equipo.grupo, equipo.subgrupo].filter(Boolean).join(' - ')}
      </div>}
      {equipo.codigo_qr && <button type="button" className={'btn sm ' + (verificado ? 'ok-cta' : 'sec')} style={{ marginBottom: 12 }} onClick={() => setVerif(true)}>
        <Icon name={verificado ? 'check' : 'qr'} size={15} />{verificado ? 'Equipo verificado' : 'Verificar QR con la camara'}
      </button>}
      <Field label="Estado del equipo">
        <div className="estado-grid">
          {estados.map(es => (
            <button key={es.id} type="button"
              className={'estado-btn' + (String(estadoId) === String(es.id) ? (es.es_falla ? ' on falla' : ' on ok') : '')}
              onClick={() => setEstadoId(String(estadoId) === String(es.id) ? '' : es.id)}>
              <Icon name={es.icono || (es.es_falla ? 'alert' : 'check')} size={18} />
              <span>{es.nombre}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label={<span className="flabel"><Icon name="pen" size={13} />Comentarios{esFalla ? <span className="badge falla mini" style={{ marginLeft: 6 }}>en falla</span> : null}<VoiceBtn onText={t => setComent(c => (c ? c + ' ' : '') + t)} /></span>}>
        <textarea value={coment} placeholder="Observaciones del equipo..." onChange={e => setComent(e.target.value)} />
      </Field>
      <Field label="Foto del elemento">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn sec sm" onClick={() => camRef.current?.click()}><Icon name="camera" size={15} />Tomar foto</button>
          <button type="button" className="btn sec sm" onClick={() => galRef.current?.click()}><Icon name="upload" size={15} />Subir foto</button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={addPics} />
        <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={addPics} />
        {pics.length > 0 && <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          {pics.map((it, i) => (
            <div key={i} className="pic-prev">
              <img src={it.url} alt="" />
              <button type="button" className="pic-mark" onClick={() => marcar(i)} aria-label="Marcar falla" data-tip="Marcar la falla"><Icon name="pen" size={12} /></button>
              <button type="button" className="pic-del" onClick={() => removePic(i)} aria-label="Quitar foto"><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>}
      </Field>
      <CredencialEquipo equipoId={equipo.id} />
      {verif && <Modal title="Verificar equipo" subtitle="Apunta la camara al QR de este equipo" onClose={() => setVerif(false)}>
        <QRScanner onScan={onVerif} />
      </Modal>}
      {anot && <Modal title="Marcar la falla" subtitle="Dibuja flechas o circulos sobre la foto" onClose={() => setAnot(null)}>
        <PhotoAnnotator file={anot.file} onSave={onAnotado} onCancel={() => setAnot(null)} />
      </Modal>}
    </Modal>
  );
}


function FirmaModal({ visita, onClose, onSave }) {
  const [nombre, setNombre] = useState(visita.firmante_nombre || '');
  const [doc, setDoc] = useState(visita.firmante_doc || '');
  return (
    <Modal title="Firma del cliente" subtitle="Quien recibe la conformidad" onClose={onClose}>
      <div className="grid2" style={{ marginBottom: 12 }}>
        <Field label={<span className="flabel"><Icon name="users" size={13} />Nombre de quien firma</span>}><input value={nombre} placeholder="Nombre y apellido" onChange={e => setNombre(e.target.value)} /></Field>
        <Field label={<span className="flabel"><Icon name="file" size={13} />Documento</span>}><input value={doc} placeholder="C.I. / cargo" onChange={e => setDoc(e.target.value)} /></Field>
      </div>
      <div className="flabel" style={{ marginBottom: 6 }}><Icon name="signature" size={13} />Firma (dibuja con el dedo o el mouse)</div>
      <SignaturePad onSave={(dataUrl) => onSave(dataUrl, nombre.trim() || null, doc.trim() || null)} onCancel={onClose} />
    </Modal>
  );
}

function MarcarOkModal({ estados, pendientes, onClose, onConfirm }) {
  const noFalla = estados.filter(e => !e.es_falla);
  const [estadoId, setEstadoId] = useState(noFalla[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await onConfirm(estadoId); setBusy(false); };
  return (
    <Modal title="Marcar OK los pendientes" subtitle={pendientes + ' equipos sin probar'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={!estadoId || busy} onClick={go}><Icon name="check" size={16} />{busy ? 'Aplicando...' : 'Aplicar a ' + pendientes}</button></>}>
      <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>Se aplicara este estado a los {pendientes} equipos que todavia no cargaste en esta visita. Los que ya cargaste no se tocan.</p>
      <Field label="Estado a aplicar">
        <div className="estado-grid">
          {noFalla.map(es => (
            <button key={es.id} type="button" className={'estado-btn' + (String(estadoId) === String(es.id) ? ' on ok' : '')} onClick={() => setEstadoId(es.id)}>
              <Icon name={es.icono || 'check'} size={18} /><span>{es.nombre}</span>
            </button>
          ))}
        </div>
      </Field>
    </Modal>
  );
}

function VoiceBtn({ onText }) {
  const [rec, setRec] = useState(false);
  const ref = useRef(null);
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) return null;
  const toggle = () => {
    if (rec) { try { ref.current?.stop(); } catch {} return; }
    const r = new SR(); r.lang = 'es-UY'; r.continuous = false; r.interimResults = false;
    r.onresult = (e) => { const t = [...e.results].map(x => x[0].transcript).join(' ').trim(); if (t) onText(t); };
    r.onend = () => setRec(false); r.onerror = () => setRec(false);
    ref.current = r; try { r.start(); setRec(true); } catch { setRec(false); }
  };
  return <button type="button" className={'voice-btn' + (rec ? ' rec' : '')} data-tip={rec ? 'Detener dictado' : 'Dictar por voz'} aria-label="Dictar" onClick={toggle}><Icon name="mic" size={14} />{rec ? 'Escuchando...' : ''}</button>;
}

function hhmm(ts) { try { return new Date(ts).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }

// Formatea una fecha ISO (YYYY-MM-DD) a DD/MM/AAAA sin convertir zona horaria.
function fechaUY(iso) { const s = (iso || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const [a, m, d] = s.split('-'); return `${d}/${m}/${a}`; }

// Selector de varios tecnicos (chips). value/onChange usan ids numericos.
function TecnicosSelect({ tecnicos = [], value = [], onChange }) {
  const sel = (value || []).map(Number);
  const toggle = (id) => { id = Number(id); onChange(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]); };
  if (!tecnicos.length) return <div className="muted" style={{ fontSize: 13 }}>No hay tecnicos cargados.</div>;
  return (
    <div className="chips" style={{ paddingTop: 2 }}>
      {tecnicos.map(t => (
        <button type="button" key={t.id} className={'chip' + (sel.includes(Number(t.id)) ? ' active' : '')} onClick={() => toggle(t.id)}>
          {sel.includes(Number(t.id)) && <Icon name="check" size={13} />}{t.nombre}
        </button>
      ))}
    </div>
  );
}

// Campo de fecha que SIEMPRE muestra DD/MM/AAAA (el <input type="date"> nativo
// usa el formato del sistema operativo y puede verse al reves). Se puede escribir
// a mano o elegir con el selector nativo (boton de calendario). Devuelve ISO.
function DateField({ value, onChange }) {
  const iso = (value || '').slice(0, 10);
  const [txt, setTxt] = useState(fechaUY(iso));
  const ref = useRef(null);
  useEffect(() => { setTxt(fechaUY(iso)); }, [iso]);
  const onText = (e) => {
    const v = e.target.value.replace(/[^\d/]/g, '');
    setTxt(v);
    if (!v) { onChange(''); return; }
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) onChange(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  };
  const abrir = () => { const el = ref.current; if (!el) return; if (el.showPicker) { try { return el.showPicker(); } catch {} } el.click(); };
  return (
    <div style={{ position: 'relative' }}>
      <input type="text" inputMode="numeric" placeholder="DD/MM/AAAA" value={txt} onChange={onText} style={{ paddingRight: 38 }} />
      <button type="button" onClick={abrir} aria-label="Elegir fecha" style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, border: 0, background: 'transparent', color: 'var(--subtle)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <Icon name="calendar" size={16} />
      </button>
      <input ref={ref} type="date" value={iso} tabIndex={-1} aria-hidden="true" onChange={e => onChange(e.target.value)} style={{ position: 'absolute', right: 8, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
    </div>
  );
}

function CancelarVisitaModal({ onClose, onConfirm }) {
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { if (!motivo.trim()) return; setBusy(true); await onConfirm(motivo.trim()); setBusy(false); };
  return (
    <Modal title={<span className="row" style={{ gap: 8 }}><span className="modal-ico falla"><Icon name="x" size={16} /></span>Cancelar visita</span>} subtitle="Queda registrada para auditoria, no se elimina" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Volver</button><button className="btn danger" disabled={!motivo.trim() || busy} onClick={go}><Icon name="x" size={16} />{busy ? 'Cancelando...' : 'Cancelar visita'}</button></>}>
      <Field label={<span className="flabel"><Icon name="pen" size={13} />Motivo de la cancelacion</span>}><textarea value={motivo} placeholder="Por que se cancela esta visita..." onChange={e => setMotivo(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

function estadoVisita(e) {
  const map = { programada: ['gris', 'Programada'], en_curso: ['info', 'En curso'], cerrada: ['ok', 'Cerrada'], cancelada: ['falla', 'Cancelada'] };
  const [c, l] = map[e] || map.programada;
  return <span className={'badge ' + c}><span className="dot" />{l}</span>;
}

function CerrarVisitaModal({ visitaId, visita, onClose, onClosed }) {
  const [chk, setChk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [facturar, setFacturar] = useState(true);
  const [cerrada, setCerrada] = useState(false);
  const [tel, setTel] = useState('');
  useEffect(() => { api.get('/api/visitas/' + visitaId + '/checklist').then(setChk); }, [visitaId]);
  useEffect(() => { if (visita?.cliente_id) api.get('/api/clientes/' + visita.cliente_id).then(c => setTel(c.telefono || '')).catch(() => {}); }, [visita?.cliente_id]);
  const ok = chk && chk.tecnico && chk.situacion_final && chk.firma && chk.fotos;
  const cerrar = async () => {
    setBusy(true);
    try { const g = await getGPS(); await api.post('/api/visitas/' + visitaId + '/cerrar', { lat: g?.lat, lon: g?.lon, facturar }); toast.ok('Visita cerrada'); setCerrada(true); }
    catch (e) { toast.err(e.message); }
    setBusy(false);
  };
  const waNum = (t) => { let d = (t || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('598')) return d; return '598' + d.replace(/^0+/, ''); };
  const enviarWa = () => {
    const link = location.origin + api.fileUrl('/api/visitas/' + visitaId + '/informe.pdf');
    const txt = encodeURIComponent('Informe de mantenimiento ' + (visita?.cliente || '') + ': ' + link);
    const n = waNum(tel);
    window.open((n ? 'https://wa.me/' + n : 'https://wa.me/') + '?text=' + txt, '_blank', 'noopener');
  };
  const Item = ({ done, label, warn }) => (
    <div className="row" style={{ gap: 9, padding: '7px 0' }}>
      <div className="ico" style={{ width: 26, height: 26, background: done ? 'var(--ok-bg)' : warn ? 'var(--warn-bg)' : 'var(--falla-bg)', color: done ? 'var(--ok)' : warn ? 'var(--warn)' : 'var(--falla)' }}>
        <Icon name={done ? 'check' : warn ? 'alert' : 'x'} size={15} />
      </div>
      <span style={{ fontSize: 14 }}>{label}</span>
    </div>
  );
  if (cerrada) return (
    <Modal title="Visita cerrada" subtitle="El informe esta listo" onClose={() => onClosed()}
      footer={<button className="btn" onClick={() => onClosed()}>Listo</button>}>
      <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        <div className="ico" style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px', background: 'var(--ok-bg)', color: 'var(--ok)', display: 'grid', placeItems: 'center' }}><Icon name="checkCircle" size={28} /></div>
        <b style={{ fontSize: 16 }}>Visita cerrada correctamente</b>
        <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>Pdes enviar el informe PDF al cliente{tel ? ' (' + tel + ')' : ''} o descargarlo.</p>
        <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn ok-cta" onClick={enviarWa}><Icon name="whatsapp" size={16} />Enviar por WhatsApp</button>
          <a className="btn sec" href={api.fileUrl('/api/visitas/' + visitaId + '/informe.pdf')} target="_blank" rel="noreferrer"><Icon name="printer" size={16} />Ver PDF</a>
        </div>
      </div>
    </Modal>
  );
  return (
    <Modal title="Cerrar visita" subtitle="Checklist obligatorio" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn ok-cta" onClick={cerrar} disabled={!ok || busy}><Icon name="checkCircle" size={16} />{busy ? 'Cerrando...' : 'Cerrar visita'}</button>
      </>}>
      {!chk ? <Loading rows={2} /> : <>
        <Item done={chk.tecnico} label="Tecnico asignado" />
        <Item done={chk.situacion_final} label="Situacion final completada" />
        <Item done={chk.firma} label="Firma del cliente" />
        <Item done={chk.fotos} label="Al menos una foto adjunta" />
        <Item done={!chk.pendientes} warn={!!chk.pendientes}
          label={chk.pendientes ? (chk.pendientes + ' de ' + chk.total + ' equipos sin probar (opcional)') : 'Todos los equipos probados'} />
        {!ok && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Completa los items en rojo para poder cerrar.</div>}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Se debe facturar esta visita?</div>
          <div className="chips">
            <span className={'chip' + (facturar ? ' active' : '')} onClick={() => setFacturar(true)}>Si, facturar</span>
            <span className={'chip' + (!facturar ? ' active' : '')} onClick={() => setFacturar(false)}>No facturar</span>
          </div>
        </div>
      </>}
    </Modal>
  );
}


function fileToDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}


function TareasVisita({ visitaId }) {
  const [items, setItems] = useState(null);
  const [desc, setDesc] = useState('');
  const [prio, setPrio] = useState('media');
  const load = () => api.get('/api/visitas/' + visitaId + '/tareas').then(setItems);
  useEffect(() => { load(); }, [visitaId]);
  const add = async () => { if (!desc.trim()) return; try { await api.post('/api/visitas/' + visitaId + '/tareas', { descripcion: desc, prioridad: prio }); setDesc(''); setPrio('media'); load(); } catch (e) { toast.err(e.message); } };
  const toggle = async (t) => { try { await api.put('/api/tareas/' + t.id, { resuelta: !t.resuelta }); load(); } catch (e) { toast.err(e.message); } };
  const del = async (t) => { try { await api.del('/api/tareas/' + t.id); load(); } catch (e) { toast.err(e.message); } };
  const pc = p => p === 'alta' ? 'falla' : p === 'baja' ? 'gris' : 'warn';
  if (items === null) return null;
  return (
    <div className="card">
      <div className="sec-head"><span className="fc-ic"><Icon name="alert" size={17} /></span><b>Tareas adicionales detectadas</b></div>
      <div className="row wrap" style={{ gap: 8, marginBottom: items.length ? 12 : 0 }}>
        <input style={{ flex: 1, minWidth: 200 }} placeholder="Describir tarea o novedad detectada en la visita..." value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <select style={{ width: 120 }} value={prio} onChange={e => setPrio(e.target.value)}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select>
        <button className="btn" onClick={add}><Icon name="plus" size={16} />Agregar</button>
      </div>
      <div className="list">
        {items.map(t => (
          <div key={t.id} className="row between" style={{ padding: '9px 0', borderTop: '1px solid var(--border)' }}>
            <label className="row" style={{ gap: 10, cursor: 'pointer', flex: 1, minWidth: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={t.resuelta} onChange={() => toggle(t)} />
              <span style={{ textDecoration: t.resuelta ? 'line-through' : 'none', color: t.resuelta ? 'var(--subtle)' : 'inherit' }}>{t.descripcion}</span>
              <span className={'badge ' + pc(t.prioridad)}>{t.prioridad}</span>
            </label>
            <button className="btn ghost icon" data-tip="Eliminar" aria-label="Eliminar" onClick={() => del(t)}><Icon name="trash" size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}


function LiveTimer({ start }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!start) return null;
  const ms = Math.max(0, now - new Date(start).getTime());
  const total = Math.floor(ms / 1000);
  const pad = n => String(n).padStart(2, '0');
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  return (
    <div className="live-timer" role="timer" aria-live="off">
      <span className="pulse" />{pad(h)}:{pad(m)}:{pad(sec)}<small>en curso</small>
    </div>
  );
}


function CredencialEquipo({ equipoId }) {
  const [c, setC] = useState(null);
  const [edit, setEdit] = useState(false);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ usuario: '', password: '', url: '', notas: '' });
  const load = () => api.get('/api/equipos/' + equipoId + '/credencial').then(d => { setC(d); setF({ usuario: d.usuario || '', password: '', url: d.url || '', notas: d.notas || '' }); });
  useEffect(() => { load(); }, [equipoId]);
  const copy = (t) => { try { navigator.clipboard.writeText(t || ''); toast.ok('Copiado'); } catch {} };
  const save = async () => { try { await api.put('/api/equipos/' + equipoId + '/credencial', f); toast.ok('Credenciales guardadas'); setEdit(false); load(); } catch (e) { toast.err(e.message); } };
  if (c === null) return null;
  return (
    <div className="cred-box">
      <div className="row between" style={{ marginBottom: (c.tiene || edit) ? 8 : 0 }}>
        <div className="row" style={{ gap: 7 }}><Icon name="settings" size={15} color="var(--brand-600)" /><b style={{ fontSize: 13.5 }}>Credenciales del dispositivo</b></div>
        {!edit && <button className="btn ghost icon" onClick={() => setEdit(true)} data-tip={c.tiene ? 'Editar' : 'Agregar'} aria-label="Editar credenciales"><Icon name={c.tiene ? 'edit' : 'plus'} size={15} /></button>}
      </div>
      {!edit ? (c.tiene ?
        <div className="stack" style={{ gap: 6, fontSize: 13 }}>
          {c.usuario && <div className="row" style={{ gap: 6 }}>Usuario: <b>{c.usuario}</b><button className="btn ghost icon" onClick={() => copy(c.usuario)} data-tip="Copiar" aria-label="Copiar"><Icon name="clipboard" size={13} /></button></div>}
          <div className="row" style={{ gap: 6 }}>Pass: <span className="mono">{show ? (c.password || '-') : '********'}</span><button className="btn ghost icon" onClick={() => setShow(s => !s)} data-tip="Ver" aria-label="Ver"><Icon name={show ? 'x' : 'search'} size={13} /></button><button className="btn ghost icon" onClick={() => copy(c.password)} data-tip="Copiar" aria-label="Copiar"><Icon name="clipboard" size={13} /></button></div>
          {c.url && <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>{c.url}</a>}
          {c.notas && <div className="subtle" style={{ fontSize: 12 }}>{c.notas}</div>}
        </div>
        : <div className="muted" style={{ fontSize: 12.5 }}>Sin credenciales cargadas.</div>)
      : <div className="stack" style={{ gap: 8 }}>
          <input placeholder="Usuario" value={f.usuario} onChange={e => setF({ ...f, usuario: e.target.value })} />
          <input type="password" placeholder="Contraseña" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
          <input placeholder="URL / IP" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} />
          <textarea placeholder="Notas" value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} />
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn ghost sm" onClick={() => { setEdit(false); load(); }}>Cancelar</button>
            <button className="btn sm" onClick={save}><Icon name="save" size={14} />Guardar</button>
          </div>
        </div>}
    </div>
  );
}
