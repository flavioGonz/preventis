import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, Field, Loading, Empty, Stat, estadoBadge } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import { PRIO, EST, PrioIcon, TkAvatar, TicketModal } from './Tickets.jsx';
import MapView from '../components/MapView.jsx';
import { getGPS } from '../geo.js';

const FRECUENCIAS = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual', 'sin'];
const FREC_LABEL = { mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', sin: 'Sin frecuencia' };

export default function ClienteDetalle({ user }) {
  const { id } = useParams();
  const navTop = useNavigate();
  const [cliente, setCliente] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [sp] = useSearchParams();
  const _t0 = ['visitas', 'equipos', 'contactos', 'ficha', 'fotos', 'planos', 'rupturas', 'tickets'].includes(sp.get('tab')) ? sp.get('tab') : 'info';
  const [tab, setTab] = useState(_t0);
  const [edit, setEdit] = useState(false);
  const [editContract, setEditContract] = useState(false);
  const [editDir, setEditDir] = useState(false);
  const [mapaOpen, setMapaOpen] = useState(false);
  const [histVis, setHistVis] = useState(null);
  const [contratos, setContratos] = useState([]);
  const [verContrato, setVerContrato] = useState(null);

  useEffect(() => {
    api.get('/api/clientes/' + id).then(setCliente);
    api.get('/api/clientes/' + id + '/resumen').then(setResumen);
    api.get('/api/visitas?cliente_id=' + id).then(setHistVis).catch(() => setHistVis([]));
    api.get('/api/clientes/' + id + '/contratos').then(setContratos).catch(() => setContratos([]));
  }, [id]);

  const marcarUbicacion = async () => {
    toast('Obteniendo ubicacion...');
    const g = await getGPS();
    if (!g) { toast.err('No se pudo obtener el GPS'); return; }
    try { await api.put('/api/clientes/' + id + '/ubicacion', { lat: g.lat, lon: g.lon }); toast.ok('Ubicacion guardada'); api.get('/api/clientes/' + id).then(setCliente); }
    catch (e) { toast.err(e.message); }
  };
  const geocodificar = async () => {
    toast('Geocodificando direccion...');
    try { await api.post('/api/clientes/' + id + '/geocodificar', {}); toast.ok('Ubicacion obtenida de la direccion'); api.get('/api/clientes/' + id).then(setCliente); }
    catch (e) { toast.err(e.message); }
  };
  const guardarCliente = async (f) => {
    try { await api.put('/api/clientes/' + id, f); toast.ok('Cliente actualizado'); setEdit(false); api.get('/api/clientes/' + id).then(setCliente); }
    catch (e) { toast.err(e.message); }
  };
  if (!cliente) return <Loading />;
  const proxIso = resumen?.proxima;
  const diasProx = proxIso ? Math.round((new Date(proxIso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
  const proxBadge = diasProx == null ? null : (diasProx < 0 ? ['falla', 'vencida ' + Math.abs(diasProx) + 'd'] : diasProx === 0 ? ['warn', 'hoy'] : ['gris', 'en ' + diasProx + 'd']);

  return (
    <div>
      <Link to="/clientes" className="backlink"><Icon name="chevronLeft" size={16} />Clientes</Link>

      <div className="cli-toptitle">
        <label className="cli-hero-av" data-tip="Cambiar avatar del cliente">
          {cliente.avatar_path ? <img src={api.base + cliente.avatar_path} alt="" /> : <Icon name="building" size={22} />}
          <input type="file" accept="image/*" hidden onChange={async ev => { const f = ev.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); try { await api.upload('/api/clientes/' + id + '/avatar', fd); toast.ok('Avatar actualizado'); api.get('/api/clientes/' + id).then(setCliente); } catch (err) { toast.err(err.message); } ev.target.value = ''; }} />
        </label>
        <div style={{ minWidth: 0 }}>
          <div className="cli-name">{cliente.nombre}{cliente.vip && <span className="badge vip" style={{ marginLeft: 8 }}><Icon name="star" size={11} />VIP</span>}</div>
          <div className="subtle" style={{ fontSize: 12.5 }}>{cliente.direccion || 'Sin direccion registrada'}</div>
        </div>
      </div>

      <div className="tabs scroll">
        {[['info', 'Informacion', 'clipboard'], ['visitas', 'Visitas', 'calendar'], ['equipos', 'Equipos', 'box'], ['contactos', 'Contactos', 'users'], ['ficha', 'Ficha tecnica', 'settings'], ['tickets', 'Tickets', 'ticket'], ['rupturas', 'Rupturas', 'alert'], ['fotos', 'Fotos', 'camera']].map(([k, l, ic]) =>
          <div key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}><Icon name={ic} size={14} />{l}</div>)}
        <div className="tab tab-planos" onClick={() => navTop('/clientes/' + id + '/planos')}><Icon name="pin" size={14} />Planos<Icon name="arrowRight" size={13} /></div>
      </div>

      <div className="tab-anim" key={tab}>

      {tab === 'info' && (<>
        <div className="ficha-cols">
          <div className="fc-card">
            <div className="fc-head"><span className="fc-ic"><Icon name="building" size={17} /></span><b>Datos del cliente</b>
              <button className="btn ghost icon fc-edit" data-tip="Editar datos" aria-label="Editar datos" onClick={() => setEdit(true)}><Icon name="edit" size={16} /></button></div>
            <div className="fc-body">
              <div className="stack" style={{ gap: 12 }}>
                <div className="info-row"><span className="info-ic"><Icon name="pin" size={14} /></span><div><div className="info-l">Direccion</div><div className="info-v">{cliente.direccion || '-'}</div></div></div>
                <div className="info-row"><span className="info-ic"><Icon name="phone" size={14} /></span><div><div className="info-l">Telefono</div><div className="info-v">{cliente.telefono || '-'}</div></div></div>
                {cliente.rut && <div className="info-row"><span className="info-ic"><Icon name="file" size={14} /></span><div><div className="info-l">RUT</div><div className="info-v mono">{cliente.rut}</div></div></div>}
                {cliente.empresa_monitoreo && <div className="info-row"><span className="info-ic"><Icon name="bell" size={14} /></span><div><div className="info-l">Empresa de monitoreo</div><div className="info-v">{cliente.empresa_monitoreo}</div></div></div>}
                {cliente.nro_abonado && <div className="info-row"><span className="info-ic"><Icon name="qr" size={14} /></span><div><div className="info-l">Nro de abonado</div><div className="info-v mono">{cliente.nro_abonado}</div></div></div>}
                <div className="info-row"><span className="info-ic"><Icon name="calendar" size={14} /></span><div><div className="info-l">Frecuencia</div><div className="info-v">{FREC_LABEL[cliente.frecuencia] || cliente.frecuencia}</div></div></div>
                {cliente.notas && <div className="info-row"><span className="info-ic"><Icon name="file" size={14} /></span><div><div className="info-l">Notas</div><div className="info-v">{cliente.notas}</div></div></div>}
              </div>
            </div>
          </div>

          <div className="fc-card">
            <div className="fc-head"><span className="fc-ic"><Icon name="clipboard" size={17} /></span><b>Contractual</b>
              <button className="btn ghost icon fc-edit" data-tip="Editar contractual" aria-label="Editar contractual" onClick={() => setEditContract(true)}><Icon name="edit" size={16} /></button></div>
            <div className="fc-body">
              <dl className="kv">
                <div><dt><Icon name="calendar" size={13} />Frecuencia</dt><dd><span className="pill-freq">{FREC_LABEL[cliente.frecuencia] || cliente.frecuencia}</span></dd></div>
                <div><dt><Icon name="clock" size={13} />Ultima visita</dt><dd>{resumen?.ultima ? new Date(resumen.ultima).toLocaleDateString('es-UY') : 'sin visitas'}</dd></div>
                <div><dt><Icon name="calendar" size={13} />Proxima visita</dt><dd>{proxIso ? <span className="row" style={{ gap: 7, justifyContent: 'flex-end' }}><span className="mono">{new Date(proxIso).toLocaleDateString('es-UY')}</span>{proxBadge && <span className={'badge ' + proxBadge[0]}>{proxBadge[1]}</span>}</span> : '-'}</dd></div>
                <div><dt><Icon name="checkCircle" size={13} />Visitas realizadas</dt><dd>{resumen?.visitas ?? 0}</dd></div>
                <div><dt><Icon name="box" size={13} />Equipos</dt><dd>{resumen?.equipos ?? 0}{resumen?.en_falla ? <span className="badge falla" style={{ marginLeft: 8 }}>{resumen.en_falla} en falla</span> : null}</dd></div>
              </dl>
            </div>
          </div>

          <div className="fc-card mapcard">
            {cliente.lat != null
              ? <MapView fill markers={[{ lat: cliente.lat, lon: cliente.lon, popup: cliente.nombre }]} center={[cliente.lat, cliente.lon]} zoom={16} />
              : <div className="map-empty"><Icon name="pin" size={26} /><span style={{ fontSize: 13 }}>Sin ubicacion registrada</span></div>}
            <div className="mapcard-actions">
              <button className="btn icon" data-tip="Ampliar mapa y editar ubicacion" aria-label="Ampliar mapa" onClick={() => setMapaOpen(true)}><Icon name="search" size={16} /></button>
            </div>
          </div>
        </div>
        <ClienteHistorial visitas={histVis} clienteId={id} contratos={contratos} onVerContrato={setVerContrato} onVerRupturas={() => setTab('rupturas')} />
      </>)}

      {tab === 'visitas' && <Visitas clienteId={id} />}
      {tab === 'equipos' && <Equipos clienteId={id} user={user} />}
      {tab === 'tickets' && <ClienteTickets clienteId={id} clienteNombre={cliente.nombre} />}
      {tab === 'contactos' && <Contactos clienteId={id} />}
      {tab === 'fotos' && <FotosCliente clienteId={id} />}
      {tab === 'rupturas' && <RupturasCliente clienteId={id} />}
      {tab === 'ficha' && <FichaTecnica clienteId={id} user={user} />}
      </div>

      {edit && <ClienteEditModal cliente={cliente} onClose={() => setEdit(false)} onSave={guardarCliente} />}
      {editContract && <ContractualModal cliente={cliente} onClose={() => setEditContract(false)} onSave={guardarCliente} />}
      {verContrato && <ContratoVerModal contrato={verContrato} esAdmin={user?.rol === 'admin'} onClose={() => setVerContrato(null)} />}
      {mapaOpen && <UbicacionModal cliente={cliente} onClose={() => setMapaOpen(false)} onSaved={() => { api.get('/api/clientes/' + id).then(setCliente); }} />}
      {editDir && <DireccionModal cliente={cliente} onClose={() => setEditDir(false)} onSave={async (dir) => { setEditDir(false); await guardarCliente({ ...cliente, direccion: dir }); try { await api.post('/api/clientes/' + id + '/geocodificar', {}); api.get('/api/clientes/' + id).then(setCliente); } catch {} }} />}
    </div>
  );
}

function ClienteEditModal({ cliente, onClose, onSave }) {
  const [f, setF] = useState({ nombre: cliente.nombre, direccion: cliente.direccion || '', telefono: cliente.telefono || '', frecuencia: cliente.frecuencia, notas: cliente.notas || '', vip: !!cliente.vip, contrato_inicio: cliente.contrato_inicio || null, contrato_fin: cliente.contrato_fin || null, contrato_monto: cliente.contrato_monto || null, contrato_notas: cliente.contrato_notas || null, rut: cliente.rut || '', empresa_monitoreo: cliente.empresa_monitoreo || '', nro_abonado: cliente.nro_abonado || '' });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title="Editar cliente" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSave(f)} disabled={!f.nombre}><Icon name="check" size={16} />Guardar</button></>}>
      <Field label={<span className="flabel"><Icon name="building" size={13} />Nombre</span>}><input value={f.nombre} onChange={e => set('nombre', e.target.value)} /></Field>
      <Field label={<span className="flabel"><Icon name="pin" size={13} />Direccion</span>}><input value={f.direccion} onChange={e => set('direccion', e.target.value)} /></Field>
      <div className="grid2">
        <Field label={<span className="flabel"><Icon name="phone" size={13} />Telefono</span>}><input value={f.telefono} onChange={e => set('telefono', e.target.value)} /></Field>
        <Field label={<span className="flabel"><Icon name="calendar" size={13} />Frecuencia</span>}><select value={f.frecuencia} onChange={e => set('frecuencia', e.target.value)}>{FRECUENCIAS.map(x => <option key={x} value={x}>{FREC_LABEL[x] || x}</option>)}</select></Field>
      </div>
      <Field label={<span className="flabel"><Icon name="file" size={13} />RUT</span>}><input value={f.rut} placeholder="RUT de la empresa" onChange={e => set('rut', e.target.value)} /></Field>
      <div className="grid2">
        <Field label={<span className="flabel"><Icon name="bell" size={13} />Empresa de monitoreo</span>}><input value={f.empresa_monitoreo} onChange={e => set('empresa_monitoreo', e.target.value)} /></Field>
        <Field label={<span className="flabel"><Icon name="qr" size={13} />Nro de abonado</span>}><input value={f.nro_abonado} onChange={e => set('nro_abonado', e.target.value)} /></Field>
      </div>
      <Field label={<span className="flabel"><Icon name="file" size={13} />Notas</span>}><textarea value={f.notas} onChange={e => set('notas', e.target.value)} /></Field>
      <label className="row" style={{ gap: 8, fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!f.vip} onChange={e => set('vip', e.target.checked)} />
        <span className="row" style={{ gap: 5 }}><Icon name="star" size={15} color="#d97706" />Cliente VIP</span>
      </label>
    </Modal>
  );
}

const VEST_FICHA = { programada: ['info', 'Programada'], en_curso: ['warn', 'En curso'], cerrada: ['ok', 'Cerrada'], cancelada: ['gris', 'Cancelada'] };
const durFicha = (m) => { if (m == null) return '-'; const h = Math.floor(m / 60), mm = m % 60; return h ? h + 'h ' + mm + 'm' : mm + 'm'; };
function Visitas({ clienteId }) {
  const [visitas, setVisitas] = useState(null);
  const [tecnicos, setTecnicos] = useState([]);
  const [modal, setModal] = useState(false);
  const nav = useNavigate();

  const load = () => api.get('/api/clientes/' + clienteId + '/visitas').then(setVisitas);
  useEffect(() => { load(); api.get('/api/tecnicos').then(setTecnicos); }, [clienteId]);

  const crear = async (f) => {
    try { const v = await api.post('/api/clientes/' + clienteId + '/visitas', f); setModal(false); nav('/visitas/' + v.id); }
    catch (e) { toast.err(e.message); }
  };

  const hoy = new Date().toISOString().slice(0, 10);
  const esVenc = (v) => v.estado === 'programada' && v.fecha && String(v.fecha).slice(0, 10) < hoy;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="muted">Historial de visitas de mantenimiento</span>
        <button className="btn" onClick={() => setModal(true)}><Icon name="plus" size={17} />Nueva visita</button>
      </div>
      {visitas === null ? <Loading /> :
        visitas.length === 0 ?
          <Empty icon="calendar" title="Sin visitas registradas"
            action={<button className="btn" onClick={() => setModal(true)}><Icon name="plus" size={17} />Nueva visita</button>}>
            Registra la primera visita de mantenimiento.
          </Empty> :
          <div className="tkl card pad-sm" style={{ padding: 6 }}>
            <div className="tkl-headrow">
              <span style={{ width: 28 }} />
              <span style={{ flex: 1, minWidth: 90 }}>Fecha / Tecnico</span>
              <span style={{ width: 100 }}>Tipo</span>
              <span style={{ width: 76, textAlign: 'center' }}>Pruebas</span>
              <span style={{ width: 56, textAlign: 'center' }}>Fallas</span>
              <span style={{ width: 74, textAlign: 'right' }}>Duracion</span>
              <span style={{ width: 110 }}>Estado</span>
              <span style={{ width: 20 }} />
            </div>
            {visitas.map(v => {
              const corr = v.tipo === 'correctiva';
              const venc = esVenc(v);
              const est = venc ? ['falla', 'Vencida'] : (VEST_FICHA[v.estado] || (v.cerrada ? VEST_FICHA.cerrada : VEST_FICHA.programada));
              const tot = Number(v.total_equipos || 0), pr = Number(v.pruebas || 0);
              return (
                <div key={v.id} className="tkl-row" onClick={() => nav('/visitas/' + v.id)}>
                  <span className="tkl-type" style={{ background: corr ? 'color-mix(in srgb, var(--warn) 15%, transparent)' : 'color-mix(in srgb, var(--brand-600) 13%, transparent)' }}>
                    <Icon name={corr ? 'alert' : 'checkCircle'} size={15} color={corr ? 'var(--warn)' : 'var(--brand-600)'} />
                  </span>
                  <div className="tkl-main" style={{ display: 'block', minWidth: 0, flex: 1 }}>
                    <b className="tkl-tit">{new Date(v.fecha).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })}</b>
                    <span className="tkl-cli" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="users" size={11} />{v.tecnico || 'Sin tecnico'}</span>
                  </div>
                  <span style={{ width: 100, flex: 'none' }}>{corr ? <span className="badge warn">Correctivo</span> : <span className="badge info">Preventivo</span>}</span>
                  <span className="mono" style={{ width: 76, textAlign: 'center', flex: 'none', fontSize: 12.5, color: 'var(--muted)' }}>{pr}{tot ? ' / ' + tot : ''}</span>
                  <span style={{ width: 56, textAlign: 'center', flex: 'none' }}>{Number(v.fallas) > 0 ? <span className="badge falla">{v.fallas}</span> : <span className="subtle">0</span>}</span>
                  <span className="mono" style={{ width: 74, textAlign: 'right', flex: 'none', fontSize: 12.5, color: 'var(--muted)' }}>{durFicha(v.duracion_min)}</span>
                  <span style={{ width: 110, flex: 'none' }}><span className={'badge ' + est[0]}><span className="dot" />{est[1]}</span></span>
                  <span style={{ width: 20, flex: 'none', textAlign: 'right' }}><Icon name="chevronRight" size={16} color="var(--subtle)" /></span>
                </div>
              );
            })}
          </div>}
      {modal && <VisitaModal tecnicos={tecnicos} onClose={() => setModal(false)} onSave={crear} />}
    </div>
  );
}

function VisitaModal({ tecnicos, onClose, onSave }) {
  const [f, setF] = useState({ fecha: new Date().toISOString().slice(0, 10), tecnico_id: '', situacion_inicial: '', tipo: 'preventiva' });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title="Nueva visita" subtitle="Datos generales de la visita" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn" onClick={() => onSave(f)}><Icon name="arrowRight" size={16} />Crear y abrir</button>
      </>}>
      <div className="grid2">
        <Field label="Fecha de la visita"><input type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} /></Field>
        <Field label="Tecnico">
          <select value={f.tecnico_id} onChange={e => set('tecnico_id', e.target.value)}>
            <option value="">- Seleccionar -</option>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Field>
      </div>
      <Field label={<span className="flabel"><Icon name="wrench" size={13} />Tipo de visita</span>}>
        <div className="tipo-seg">
          <button type="button" className={'tipo-opt' + (f.tipo !== 'correctiva' ? ' on' : '')} onClick={() => set('tipo', 'preventiva')}><Icon name="checkCircle" size={15} />Preventiva (contrato)</button>
          <button type="button" className={'tipo-opt corr' + (f.tipo === 'correctiva' ? ' on' : '')} onClick={() => set('tipo', 'correctiva')}><Icon name="alert" size={15} />Correctiva</button>
        </div>
      </Field>
      <Field label="Situacion inicial del sistema">
        <textarea value={f.situacion_inicial} placeholder="Estado general al llegar..." onChange={e => set('situacion_inicial', e.target.value)} />
      </Field>
    </Modal>
  );
}

const blankEq = { sistema_id: '', direccion: '', grupo: '', subgrupo: '', etiqueta: '', tipo_elemento_id: '', modelo: '' };

function CopyBtn({ text, get, tip = 'Copiar' }) {
  const [done, setDone] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    let v = text;
    if (get) { try { v = await get(); } catch { v = ''; } }
    if (!v) { toast.err('Nada para copiar'); return; }
    try { await navigator.clipboard.writeText(v); setDone(true); toast.ok('Copiado'); setTimeout(() => setDone(false), 1200); }
    catch { toast.err('No se pudo copiar'); }
  };
  return <button className="copy-btn" data-tip={tip} aria-label={tip} onClick={copy}><Icon name={done ? 'check' : 'clipboard'} size={13} /></button>;
}

function Equipos({ clienteId, user }) {
  const isAdmin = user?.rol === 'admin';
  const [equipos, setEquipos] = useState(null);
  const [sistemas, setSistemas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [estandar, setEstandar] = useState([]);
  const [modal, setModal] = useState(null);
  const nav = useNavigate();

  const load = () => api.get('/api/clientes/' + clienteId + '/equipos').then(setEquipos);
  useEffect(() => {
    load();
    api.get('/api/sistemas').then(setSistemas);
    api.get('/api/tipos_elemento').then(setTipos);
    api.get('/api/equipos_estandar').then(setEstandar).catch(() => {});
  }, [clienteId]);

  const save = async (f) => {
    try {
      let eqId = f.id;
      if (f.id) await api.put('/api/equipos/' + f.id, f);
      else { const r = await api.post('/api/clientes/' + clienteId + '/equipos', f); eqId = r.id; }
      if (eqId && (f.cred_usuario || f.cred_password || f.cred_url)) {
        await api.put('/api/equipos/' + eqId + '/credencial', { usuario: f.cred_usuario || '', password: f.cred_password || '', url: f.cred_url || '' });
      }
      setModal(null); toast.ok('Equipo guardado'); load();
    } catch (e) { toast.err(e.message); }
  };
  const importExcel = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await api.upload('/api/clientes/' + clienteId + '/pruebas/import', fd);
      toast.ok('Importadas ' + r.creadas + ' pruebas - sin equipo: ' + r.sin_equipo);
      load();
    } catch (err) { toast.err(err.message); }
    e.target.value = '';
  };

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{equipos ? equipos.length : 0} equipos a controlar</span>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link className="btn sec sm" to={'/clientes/' + clienteId + '/etiquetas'}><Icon name="qr" size={15} />QRs</Link>
          <a className="btn sec sm" href={api.fileUrl('/api/clientes/' + clienteId + '/pruebas/export.xlsx')}><Icon name="download" size={15} />Exportar</a>
          <label className="btn sec sm" style={{ cursor: 'pointer' }}>
            <Icon name="upload" size={15} />Importar
            <input type="file" accept=".xlsx" hidden onChange={importExcel} />
          </label>
          <button className="btn sm" onClick={() => setModal({ ...blankEq })}><Icon name="plus" size={16} />Equipo</button>
        </div>
      </div>
      {equipos === null ? <Loading /> :
        equipos.length === 0 ?
          <Empty icon="box" title="Sin equipos cargados"
            action={<button className="btn" onClick={() => setModal({ ...blankEq })}><Icon name="plus" size={17} />Agregar equipo</button>}>
            Agrega equipos manualmente o importa pruebas desde Excel.
          </Empty> :
          <div className="card pad-sm">
            <div className="tablewrap">
              <table className="table">
                <thead><tr>
                  <th>Etiqueta</th><th>Sistema</th><th>URL / acceso</th><th>Usuario</th><th>Password</th>
                  <th>Ultima prueba</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  {equipos.map(e => (
                    <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => nav('/equipos/' + e.id)}>
                      <td><div className="row" style={{ gap: 9 }}>
                        <label onClick={ev => ev.stopPropagation()} style={{ cursor: 'pointer' }} data-tip="Subir foto del equipo">
                          {e.foto_path ? <img className="eq-thumb" src={api.base + e.foto_path} alt="" /> : <div className="ico" style={{ width: 34, height: 34, background: 'var(--brand-soft)', color: 'var(--brand-600)' }}><Icon name="camera" size={15} /></div>}
                          <input type="file" accept="image/*" hidden onChange={async ev => { const f2 = ev.target.files?.[0]; if (!f2) return; const fd = new FormData(); fd.append('file', f2); try { await api.upload('/api/equipos/' + e.id + '/foto', fd); toast.ok('Foto subida'); load(); } catch (err) { toast.err(err.message); } ev.target.value = ''; }} />
                        </label>
                        <div style={{ minWidth: 0 }}><b style={{ color: 'var(--brand-700)' }}>{e.etiqueta || '-'}</b><div className="subtle mono" style={{ fontSize: 11 }}>{e.codigo_qr}</div></div></div></td>
                      <td>{e.sistema || '-'}</td>
                      <td onClick={ev => ev.stopPropagation()}>{e.cred_url ? <span className="cred-cell mono"><a href={/^https?:\/\//.test(e.cred_url) ? e.cred_url : 'http://' + e.cred_url} target="_blank" rel="noreferrer" className="cred-url">{e.cred_url}</a><CopyBtn text={e.cred_url} tip="Copiar URL / acceso" /></span> : <span className="subtle">-</span>}</td>
                      <td onClick={ev => ev.stopPropagation()}>{e.cred_usuario ? <span className="cred-cell">{e.cred_usuario}<CopyBtn text={e.cred_usuario} tip="Copiar usuario" /></span> : <span className="subtle">-</span>}</td>
                      <td onClick={ev => ev.stopPropagation()}>{e.cred_has_pass ? (isAdmin ? <span className="cred-cell">••••••<CopyBtn tip="Copiar contrasena" get={() => api.get('/api/equipos/' + e.id + '/credencial').then(r => r.password)} /></span> : <span className="subtle">••••••</span>) : <span className="subtle">-</span>}</td>
                      <td className="mono">{e.ultima_fecha ? new Date(e.ultima_fecha).toLocaleDateString('es-UY') : <span className="subtle">nunca</span>}</td>
                      <td>{estadoBadge(e.ultimo_estado, e.ultima_falla)}</td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button className="btn ghost icon" data-tip="Editar" aria-label="Editar" onClick={ev => { ev.stopPropagation(); setModal({ ...e }); }}><Icon name="edit" size={16} /></button>
                        <Icon name="chevronRight" size={16} color="var(--subtle)" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>}

      {modal && <EquipoModal equipo={modal} sistemas={sistemas} tipos={tipos} estandar={estandar} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function EquipoModal({ equipo, sistemas, tipos, estandar = [], onClose, onSave }) {
  const [f, setF] = useState(equipo);
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={f.id ? 'Editar equipo' : 'Nuevo equipo'} subtitle="Ningun campo es unico; podes repetir valores" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn" onClick={() => onSave(f)}><Icon name="check" size={16} />Guardar</button>
      </>}>
      {estandar.length > 0 && <Field label="Buscar modelo estandar (de Configuracion)">
        <input list="est-models" placeholder="Escribi para buscar y autocompletar..." onChange={e => {
          const m = estandar.find(x => x.nombre === e.target.value);
          if (m) { const tm = tipos.find(t => (t.nombre || '').toLowerCase() === (m.tipo || '').toLowerCase());
            setF(prev => ({ ...prev, modelo: [m.marca, m.modelo].filter(Boolean).join(' ') || prev.modelo, tipo_elemento_id: tm ? tm.id : prev.tipo_elemento_id })); }
        }} />
        <datalist id="est-models">{estandar.map(m => <option key={m.id} value={m.nombre}>{[m.marca, m.modelo].filter(Boolean).join(' ')}</option>)}</datalist>
      </Field>}
      <div className="grid2">
        <Field label="Sistema">
          <select value={f.sistema_id || ''} onChange={e => set('sistema_id', e.target.value)}>
            <option value="">-</option>{sistemas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Field>
        <Field label="Tipo de elemento">
          <select value={f.tipo_elemento_id || ''} onChange={e => set('tipo_elemento_id', e.target.value)}>
            <option value="">-</option>{tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Field>
        <Field label="Etiqueta"><input value={f.etiqueta || ''} onChange={e => set('etiqueta', e.target.value)} /></Field>
        <Field label="Direccion"><input value={f.direccion || ''} onChange={e => set('direccion', e.target.value)} /></Field>
        <Field label="Grupo"><input value={f.grupo || ''} onChange={e => set('grupo', e.target.value)} /></Field>
        <Field label="Subgrupo"><input value={f.subgrupo || ''} onChange={e => set('subgrupo', e.target.value)} /></Field>
        <Field label="Modelo"><input value={f.modelo || ''} onChange={e => set('modelo', e.target.value)} /></Field>
      </div>
      <div className="brd-sec" style={{ marginTop: 6 }}>
        <div className="brd-sec-h"><Icon name="settings" size={15} />Credenciales de acceso</div>
        <div className="grid2">
          <Field label="Usuario"><input value={f.cred_usuario || ''} onChange={e => set('cred_usuario', e.target.value)} /></Field>
          <Field label="Contrasena"><input type="password" value={f.cred_password || ''} placeholder={f.cred_has_pass ? 'Dejar vacio para no cambiar' : ''} onChange={e => set('cred_password', e.target.value)} /></Field>
        </div>
        <Field label={<span className="flabel"><Icon name="line" size={13} />URL / acceso de conexion</span>}><input value={f.cred_url || ''} placeholder="192.168.1.50 o http://..." onChange={e => set('cred_url', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}


/* ---------------- Ficha tecnica ---------------- */
function FichaTecnica({ clienteId, user }) {
  const isAdmin = user?.rol === 'admin';
  return (<div><Credenciales clienteId={clienteId} isAdmin={isAdmin} /><Archivos clienteId={clienteId} isAdmin={isAdmin} /></div>);
}

function Credenciales({ clienteId, isAdmin }) {
  const [items, setItems] = useState(null);
  const [modal, setModal] = useState(null);
  const [show, setShow] = useState({});
  const load = () => api.get('/api/clientes/' + clienteId + '/credenciales').then(setItems);
  useEffect(() => { if (isAdmin) load(); }, [clienteId, isAdmin]);
  const save = async (f) => {
    try { if (f.id) await api.put('/api/credenciales/' + f.id, f); else await api.post('/api/clientes/' + clienteId + '/credenciales', f); setModal(null); toast.ok('Credencial guardada'); load(); }
    catch (e) { toast.err(e.message); }
  };
  const del = async (c) => { if (!confirm('Eliminar credencial?')) return; try { await api.del('/api/credenciales/' + c.id); toast.ok('Eliminada'); load(); } catch (e) { toast.err(e.message); } };
  const copy = (t) => { try { navigator.clipboard.writeText(t || ''); toast.ok('Copiado'); } catch { toast.err('No se pudo copiar'); } };
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}><Icon name="settings" size={18} color="var(--brand-600)" /><b>Credenciales</b></div>
        {isAdmin && <button className="btn sm" onClick={() => setModal({ nombre: '', usuario: '', password: '', url: '', notas: '' })}><Icon name="plus" size={15} />Nueva</button>}
      </div>
      {!isAdmin ? <div className="muted" style={{ fontSize: 13 }}>Solo los administradores pueden ver las credenciales.</div> :
        items === null ? <Loading rows={2} /> :
        items.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Sin credenciales cargadas.</div> :
        <div className="tablewrap"><table className="table">
          <thead><tr><th>Nombre / sistema</th><th>Usuario</th><th>Password</th><th>URL</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {items.map(c => (
              <tr key={c.id}>
                <td><b>{c.nombre || '-'}</b>{c.notas && <div className="subtle" style={{ fontSize: 11.5 }}>{c.notas}</div>}</td>
                <td>{c.usuario || '-'}</td>
                <td><div className="row" style={{ gap: 6 }}>
                  <span className="mono">{show[c.id] ? (c.password || '-') : '********'}</span>
                  <button className="btn ghost icon" onClick={() => setShow(s => ({ ...s, [c.id]: !s[c.id] }))} data-tip="Ver" aria-label="Ver"><Icon name={show[c.id] ? 'x' : 'search'} size={14} /></button>
                  <button className="btn ghost icon" onClick={() => copy(c.password)} data-tip="Copiar" aria-label="Copiar"><Icon name="clipboard" size={14} /></button>
                </div></td>
                <td>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.url}</a> : '-'}</td>
                {isAdmin && <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn ghost icon" data-tip="Editar" aria-label="Editar" onClick={() => setModal({ ...c })}><Icon name="edit" size={16} /></button>
                  <button className="btn ghost icon" data-tip="Eliminar" aria-label="Eliminar" onClick={() => del(c)}><Icon name="trash" size={16} /></button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table></div>}
      {modal && <CredModal cred={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function CredModal({ cred, onClose, onSave }) {
  const [f, setF] = useState(cred); const set = (k, v) => setF({ ...f, [k]: v }); const editing = !!f.id;
  return (
    <Modal title={editing ? 'Editar credencial' : 'Nueva credencial'} subtitle="Se guarda cifrada en el servidor" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSave(f)} disabled={!f.nombre}><Icon name="check" size={16} />Guardar</button></>}>
      <div className="grid2">
        <Field label="Nombre / sistema"><input value={f.nombre || ''} onChange={e => set('nombre', e.target.value)} /></Field>
        <Field label="Usuario"><input value={f.usuario || ''} onChange={e => set('usuario', e.target.value)} /></Field>
        <Field label={editing ? 'Contrasena (vacio = no cambiar)' : 'Contrasena'}><input value={f.password || ''} onChange={e => set('password', e.target.value)} /></Field>
        <Field label="URL / acceso"><input value={f.url || ''} onChange={e => set('url', e.target.value)} /></Field>
      </div>
      <Field label="Notas"><textarea value={f.notas || ''} onChange={e => set('notas', e.target.value)} /></Field>
    </Modal>
  );
}

function Archivos({ clienteId, isAdmin }) {
  const [items, setItems] = useState(null);
  const load = () => api.get('/api/clientes/' + clienteId + '/archivos').then(setItems);
  useEffect(() => { load(); }, [clienteId]);
  const subir = async (e, tipo) => {
    const files = e.target.files; if (!files.length) return;
    const fd = new FormData(); [...files].forEach(f => fd.append('files', f)); fd.append('tipo', tipo);
    try { await api.upload('/api/clientes/' + clienteId + '/archivos', fd); toast.ok('Subido'); load(); } catch (err) { toast.err(err.message); }
    e.target.value = '';
  };
  const del = async (a) => { if (!confirm('Eliminar archivo?')) return; try { await api.del('/api/cliente_archivos/' + a.id); toast.ok('Eliminado'); load(); } catch (e) { toast.err(e.message); } };
  if (items === null) return <Loading rows={1} />;
  const fotos = items.filter(a => a.tipo === 'foto'); const otros = items.filter(a => a.tipo !== 'foto');
  return (
    <div className="card">
      <div className="row between wrap" style={{ marginBottom: 12, gap: 8 }}>
        <div className="row" style={{ gap: 8 }}><Icon name="file" size={18} color="var(--brand-600)" /><b>Respaldos y fotos de equipos</b></div>
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="btn sec sm" style={{ cursor: 'pointer' }}><Icon name="camera" size={15} />Foto<input type="file" accept="image/*" multiple hidden onChange={e => subir(e, 'foto')} /></label>
          <label className="btn sec sm" style={{ cursor: 'pointer' }}><Icon name="box" size={15} />Respaldo<input type="file" multiple hidden onChange={e => subir(e, 'respaldo')} /></label>
          <label className="btn sec sm" style={{ cursor: 'pointer' }}><Icon name="file" size={15} />Documento<input type="file" multiple hidden onChange={e => subir(e, 'doc')} /></label>
        </div>
      </div>
      {fotos.length > 0 && <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        {fotos.map(a => (
          <div key={a.id} style={{ position: 'relative' }}>
            <a href={api.base + a.path} target="_blank" rel="noreferrer"><img className="thumb" src={api.base + a.path} /></a>
            {isAdmin && <button className="btn danger icon" style={{ position: 'absolute', top: -6, right: -6, padding: 4, borderRadius: '50%' }} onClick={() => del(a)}><Icon name="x" size={12} /></button>}
          </div>
        ))}
      </div>}
      {otros.length === 0 && fotos.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Sin archivos.</div> :
        otros.map(a => (
          <div key={a.id} className="row between" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <a className="row" style={{ gap: 8, fontSize: 14 }} href={api.base + a.path} target="_blank" rel="noreferrer">
              <Icon name={a.tipo === 'respaldo' ? 'box' : 'file'} size={15} />{a.filename}{a.descripcion ? ' - ' + a.descripcion : ''}
              <span className="badge gris">{a.tipo}</span>
            </a>
            {isAdmin && <button className="btn ghost icon" onClick={() => del(a)}><Icon name="trash" size={16} /></button>}
          </div>
        ))}
    </div>
  );
}


function FotosCliente({ clienteId }) {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get('/api/clientes/' + clienteId + '/fotos').then(setItems); }, [clienteId]);
  if (items === null) return <Loading rows={2} />;
  if (items.length === 0) return <Empty icon="camera" title="Sin fotos">No hay fotos cargadas para este cliente todavia.</Empty>;
  return (
    <div>
      <div className="muted" style={{ margin: '2px 2px 12px', fontSize: 13 }}>{items.length} foto(s) - de visitas, equipos y archivos</div>
      <div className="mosaic">
        {items.map((f, i) => (
          <a key={i} href={api.base + f.path} target="_blank" rel="noreferrer" className="mosaic-item">
            <img src={api.base + f.path} loading="lazy" alt="" />
            <span className="mosaic-cap">{f.origen}{f.fecha ? ' - ' + new Date(f.fecha).toLocaleDateString('es-UY') : ''}</span>
          </a>
        ))}
      </div>
    </div>
  );
}


function ContractualModal({ cliente, onClose, onSave }) {
  const [f, setF] = useState({
    ...cliente,
    frecuencia: cliente.frecuencia,
    contrato_inicio: cliente.contrato_inicio ? String(cliente.contrato_inicio).slice(0, 10) : '',
    contrato_fin: cliente.contrato_fin ? String(cliente.contrato_fin).slice(0, 10) : '',
    contrato_monto: cliente.contrato_monto || '',
    contrato_notas: cliente.contrato_notas || '',
  });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title="Datos contractuales" subtitle="Frecuencia y contrato del cliente" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSave(f)}><Icon name="check" size={16} />Guardar</button></>}>
      <Field label="Frecuencia de visita"><select value={f.frecuencia} onChange={e => set('frecuencia', e.target.value)}>{FRECUENCIAS.map(x => <option key={x} value={x}>{FREC_LABEL[x] || x}</option>)}</select></Field>
      <div className="grid2">
        <Field label="Inicio de contrato"><input type="date" value={f.contrato_inicio} onChange={e => set('contrato_inicio', e.target.value)} /></Field>
        <Field label="Fin de contrato"><input type="date" value={f.contrato_fin} onChange={e => set('contrato_fin', e.target.value)} /></Field>
      </div>
      <Field label="Monto / plan"><input value={f.contrato_monto} placeholder="Ej: UYU 12.000 / mes" onChange={e => set('contrato_monto', e.target.value)} /></Field>
      <Field label="Notas contractuales"><textarea value={f.contrato_notas} onChange={e => set('contrato_notas', e.target.value)} /></Field>
      <label className="row" style={{ gap: 8, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!f.vip} onChange={e => set('vip', e.target.checked)} />
        <span className="row" style={{ gap: 5 }}><Icon name="star" size={15} color="#d97706" />Cliente VIP</span>
      </label>
    </Modal>
  );
}

function DireccionModal({ cliente, onClose, onSave }) {
  const [dir, setDir] = useState(cliente.direccion || '');
  return (
    <Modal title="Cambiar direccion" subtitle="Se intentara ubicar en el mapa automaticamente" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSave(dir)} disabled={!dir.trim()}><Icon name="check" size={16} />Guardar y ubicar</button></>}>
      <Field label="Direccion"><input autoFocus value={dir} placeholder="Calle, numero, ciudad" onChange={e => setDir(e.target.value)} /></Field>
    </Modal>
  );
}

function smoothPath(pts) {
  if (pts.length < 2) return '';
  if (pts.length === 2) return 'M' + pts[0].x + ' ' + pts[0].y + ' L' + pts[1].x + ' ' + pts[1].y;
  let d = 'M' + pts[0].x + ' ' + pts[0].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ' C' + c1x + ' ' + c1y + ' ' + c2x + ' ' + c2y + ' ' + p2.x + ' ' + p2.y;
  }
  return d;
}

function Planos({ clienteId }) {
  const nav = useNavigate();
  const [planos, setPlanos] = useState(null);
  const [sel, setSel] = useState(null);
  const [shapes, setShapes] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState('vista');      // 'vista' | 'edicion'
  const [tool, setTool] = useState('mano');        // 'mano' | 'linea' | 'curva' | 'equipo'
  const [color, setColor] = useState('#dc2626');
  const [draft, setDraft] = useState(null);        // { curved, color, points:[] }
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [box, setBox] = useState({ w: 1, h: 1 });
  const [aspect, setAspect] = useState(1.5);
  const [equipos, setEquipos] = useState([]);
  const [busq, setBusq] = useState('');
  const [placing, setPlacing] = useState(null);    // equipo a posicionar
  const stageRef = useRef(null);
  const pan = useRef(null);

  const baseW = box.w, baseH = box.w / aspect;

  const selectPlano = (p) => { setSel(p); setShapes(Array.isArray(p.shapes) ? p.shapes : []); setDirty(false); setDraft(null); setView({ scale: 1, tx: 0, ty: 0 }); };
  useEffect(() => {
    api.get('/api/clientes/' + clienteId + '/dsn').then(ps => { setPlanos(ps); if (ps.length) selectPlano(ps[0]); });
    api.get('/api/clientes/' + clienteId + '/equipos').then(setEquipos).catch(() => setEquipos([]));
  }, [clienteId]);
  useEffect(() => {
    if (!stageRef.current) return;
    const ro = new ResizeObserver(() => { const r = stageRef.current.getBoundingClientRect(); setBox({ w: r.width, h: r.height }); });
    ro.observe(stageRef.current); return () => ro.disconnect();
  }, [sel]);

  const subir = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file); fd.append('nombre', file.name.replace(/\.[^.]+$/, ''));
    try { const p = await api.upload('/api/clientes/' + clienteId + '/dsn', fd); toast.ok('Plano subido'); const ps = await api.get('/api/clientes/' + clienteId + '/dsn'); setPlanos(ps); selectPlano(p); setMode('edicion'); }
    catch (err) { toast.err(err.message); }
    e.target.value = '';
  };

  const toNorm = (clientX, clientY) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: (clientX - r.left - view.tx) / (view.scale * baseW), y: (clientY - r.top - view.ty) / (view.scale * baseH) };
  };
  const zoomAt = (factor, cx, cy) => {
    const el = stageRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = cx == null ? r.width / 2 : cx, py = cy == null ? r.height / 2 : cy;
    setView(v => { const ns = Math.min(6, Math.max(0.4, v.scale * factor)); const k = ns / v.scale; return { scale: ns, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k }; });
  };
  // wheel-zoom con listener no pasivo (evita warning de preventDefault)
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const h = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [sel, box.w, aspect]);

  const down = (e) => {
    const ev = e.touches ? e.touches[0] : e;
    pan.current = { x: ev.clientX, y: ev.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const move = (e) => {
    const p = pan.current; if (!p) return;
    const ev = e.touches ? e.touches[0] : e;
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true;
    const panning = mode === 'vista' || tool === 'mano';
    if (panning && p.moved) setView(v => ({ ...v, tx: p.tx + dx, ty: p.ty + dy }));
  };
  const up = (e) => {
    const p = pan.current; pan.current = null;
    if (!p || p.moved) return;
    const ev = e.changedTouches ? e.changedTouches[0] : e;
    const n = toNorm(ev.clientX, ev.clientY);
    if (n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) return;
    if (mode !== 'edicion') return;
    if (tool === 'equipo' && placing) {
      setShapes(s => [...s, { type: 'marker', x: n.x, y: n.y, color, equipo_id: placing.id, label: placing.etiqueta || placing.codigo_qr || ('Eq ' + placing.id) }]);
      setDirty(true); setPlacing(null); setTool('mano');
    } else if (tool === 'linea' || tool === 'curva') {
      setDraft(d => {
        const base = d || { curved: tool === 'curva', color, points: [] };
        return { ...base, color, curved: tool === 'curva', points: [...base.points, n] };
      });
    }
  };
  const finalizar = () => { if (draft && draft.points.length >= 2) { setShapes(s => [...s, draft]); setDirty(true); } setDraft(null); };
  const undo = () => { if (draft) { setDraft(d => d.points.length > 1 ? { ...d, points: d.points.slice(0, -1) } : null); return; } setShapes(s => s.slice(0, -1)); setDirty(true); };
  const limpiar = () => { if (confirm('Borrar todo lo dibujado en este plano?')) { setShapes([]); setDraft(null); setDirty(true); } };
  const guardar = async () => { try { await api.put('/api/dsn/' + sel.id, { shapes }); toast.ok('Plano guardado'); setDirty(false); } catch (e) { toast.err(e.message); } };
  const borrarPlano = async () => { if (!confirm('Eliminar este plano?')) return; try { await api.del('/api/dsn/' + sel.id); const ps = await api.get('/api/clientes/' + clienteId + '/dsn'); setPlanos(ps); ps.length ? selectPlano(ps[0]) : setSel(null); } catch (e) { toast.err(e.message); } };
  const elegirEquipo = (eq) => { setPlacing(eq); setTool('equipo'); setBusq(''); };

  if (planos === null) return <Loading rows={2} />;

  const scr = (n) => ({ left: view.tx + n.x * baseW * view.scale, top: view.ty + n.y * baseH * view.scale });
  const eqFiltrados = busq ? equipos.filter(e => (e.etiqueta || '').toLowerCase().includes(busq.toLowerCase()) || (e.codigo_qr || '').toLowerCase().includes(busq.toLowerCase()) || (e.sistema || '').toLowerCase().includes(busq.toLowerCase())).slice(0, 8) : [];
  const lines = shapes.filter(s => s.type === 'line').concat(draft ? [draft] : []);
  const markers = shapes.filter(s => s.type === 'marker');

  return (
    <div>
      <div className="row between wrap" style={{ gap: 10, marginBottom: 12 }}>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {planos.map(p => <span key={p.id} className={'chip' + (sel?.id === p.id ? ' active' : '')} onClick={() => selectPlano(p)}>{p.nombre}</span>)}
        </div>
        <label className="btn sec sm" style={{ cursor: 'pointer' }}><Icon name="upload" size={15} />Subir plano<input type="file" accept="image/*" hidden onChange={subir} /></label>
      </div>

      {!sel ? <Empty icon="file" title="Sin planos">Subi un plano (imagen) y posiciona equipos, lineas y recorridos encima.</Empty> : (
        <div className={'plano2' + (mode === 'edicion' ? ' editing' : '')}>
          <div className="plano2-stage" ref={stageRef}
            onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={() => { pan.current = null; }}
            onTouchStart={down} onTouchMove={move} onTouchEnd={up}
            onDoubleClick={() => mode === 'edicion' && finalizar()}
            style={{ cursor: mode === 'edicion' && tool !== 'mano' ? 'crosshair' : 'grab' }}>
            <div className="plano2-inner" style={{ width: baseW, height: baseH, transformOrigin: '0 0', transform: 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.scale + ')' }}>
              <img src={api.base + sel.path} alt={sel.nombre} draggable={false} onLoad={e => setAspect((e.target.naturalWidth || 3) / (e.target.naturalHeight || 2))} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
              <svg className="plano2-svg" viewBox="0 0 1 1" preserveAspectRatio="none">
                {lines.map((ln, i) => ln.curved
                  ? <path key={i} d={smoothPath(ln.points)} fill="none" stroke={ln.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                  : <polyline key={i} points={ln.points.map(p => p.x + ',' + p.y).join(' ')} fill="none" stroke={ln.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />)}
              </svg>
            </div>
            {/* Marcadores de equipos (tamaño constante) */}
            {markers.map((m, i) => (
              <div key={i} className="plano2-mk" style={{ ...scr(m), background: m.color }}
                onClick={(e) => { e.stopPropagation(); if (mode === 'vista' && m.equipo_id) nav('/equipos/' + m.equipo_id); }}
                title={m.label}>
                <Icon name="box" size={11} color="#fff" />
                <span className="plano2-mklbl">{m.label}</span>
              </div>
            ))}
            {draft && draft.points.map((p, i) => <div key={'dp' + i} className="plano2-vtx" style={{ ...scr(p), borderColor: draft.color }} />)}
          </div>

          {/* Barra superior: modo + plano */}
          <div className="plano2-top">
            <button className={'p2btn' + (mode === 'vista' ? ' on' : '')} onClick={() => { setMode('vista'); setTool('mano'); setDraft(null); }} data-tip="Modo vista"><Icon name="eye" size={16} />Vista</button>
            <button className={'p2btn' + (mode === 'edicion' ? ' on' : '')} onClick={() => setMode('edicion')} data-tip="Modo edicion"><Icon name="edit" size={16} />Editar</button>
            <span className="grow" />
            {dirty && <span className="p2dirty">sin guardar</span>}
            <button className="p2btn" onClick={borrarPlano} data-tip="Eliminar plano"><Icon name="trash" size={16} color="var(--falla)" /></button>
          </div>

          {/* Zoom (overlay) */}
          <div className="plano2-zoom">
            <button className="p2icon" onClick={() => zoomAt(1.25)} aria-label="Acercar"><Icon name="plus" size={16} /></button>
            <button className="p2icon" onClick={() => zoomAt(1 / 1.25)} aria-label="Alejar"><Icon name="minus" size={16} /></button>
            <button className="p2icon" onClick={() => setView({ scale: 1, tx: 0, ty: 0 })} aria-label="Restablecer"><Icon name="move" size={15} /></button>
          </div>

          {/* Herramientas (overlay, solo edicion) */}
          {mode === 'edicion' && <>
            <div className="plano2-tools">
              <button className={'p2icon' + (tool === 'mano' ? ' on' : '')} onClick={() => setTool('mano')} data-tip="Mover"><Icon name="move" size={16} /></button>
              <button className={'p2icon' + (tool === 'linea' ? ' on' : '')} onClick={() => { setTool('linea'); setDraft(null); }} data-tip="Linea recta"><Icon name="line" size={16} /></button>
              <button className={'p2icon' + (tool === 'curva' ? ' on' : '')} onClick={() => { setTool('curva'); setDraft(null); }} data-tip="Linea curva"><Icon name="curve" size={16} /></button>
              <button className={'p2icon' + (tool === 'equipo' ? ' on' : '')} onClick={() => setTool('equipo')} data-tip="Posicionar equipo"><Icon name="box" size={16} /></button>
              <div className="p2colors">
                {['#dc2626', '#1d4ed8', '#15803d', '#b45309', '#0f172a'].map(c => <button key={c} className={'p2color' + (color === c ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} />)}
              </div>
            </div>

            {/* Buscar equipo para posicionar */}
            {tool === 'equipo' && <div className="plano2-eqsearch">
              {placing ? <div className="p2placing"><Icon name="pin" size={14} />Toca el plano para ubicar: <b>{placing.etiqueta || placing.codigo_qr}</b><button className="btn ghost icon" onClick={() => setPlacing(null)}><Icon name="x" size={14} /></button></div> : <>
                <div className="wa-search" style={{ marginBottom: eqFiltrados.length ? 8 : 0 }}><Icon name="search" size={16} /><input placeholder="Buscar equipo del cliente..." value={busq} onChange={e => setBusq(e.target.value)} /></div>
                {eqFiltrados.map(eq => <div key={eq.id} className="p2eqrow" onClick={() => elegirEquipo(eq)}><Icon name="box" size={14} /><b>{eq.etiqueta || eq.codigo_qr}</b><span className="subtle" style={{ fontSize: 12 }}>{eq.sistema || ''}</span></div>)}
              </>}
            </div>}

            {/* Acciones de dibujo (overlay inferior) */}
            <div className="plano2-actions">
              {draft && draft.points.length >= 2 && <button className="btn sm" onClick={finalizar}><Icon name="check" size={15} />Finalizar linea</button>}
              <button className="btn sec sm" onClick={undo}><Icon name="history" size={15} />Deshacer</button>
              <button className="btn sec sm" onClick={limpiar}><Icon name="trash" size={15} />Limpiar</button>
              <button className="btn sm" onClick={guardar} disabled={!dirty}><Icon name="save" size={15} />Guardar</button>
            </div>
          </>}
        </div>
      )}
    </div>
  );
}

function ClienteHistorial({ visitas, clienteId, contratos = [], onVerContrato, onVerRupturas }) {
  const [rup, setRup] = useState(null);
  useEffect(() => { api.get('/api/clientes/' + clienteId + '/rupturas').then(setRup).catch(() => setRup([])); }, [clienteId]);
  const EST = { programada: ['gris', 'Programada'], en_curso: ['info', 'En curso'], cerrada: ['ok', 'Cerrada'] };
  const [tecAv, setTecAv] = useState({});
  useEffect(() => { api.get('/api/tecnicos').then(ts => { const m = {}; (ts || []).forEach(t => { if (t.avatar_path) m[t.nombre] = t.avatar_path; }); setTecAv(m); }).catch(() => {}); }, []);
  if (visitas === null) return <div className="card" style={{ marginTop: 4 }}><Loading rows={2} header={false} /></div>;
  const ultimas = visitas.slice(0, 6);
  const tecnicos = [];
  for (const v of visitas) { if (v.tecnico && !tecnicos.find(t => t.nombre === v.tecnico)) tecnicos.push({ nombre: v.tecnico, fecha: v.fecha }); if (tecnicos.length >= 6) break; }
  return (
    <div className="card" style={{ marginTop: 4 }}>
      <div className="sec-head"><span className="fc-ic"><Icon name="history" size={17} /></span><b>Historial del cliente</b></div>
      <div className="hist-cols">
        <div>
          <div className="hist-sub">Ultimas visitas</div>
          {ultimas.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Sin visitas registradas.</div> :
            <div className="hist-list">
              {ultimas.map(v => {
                const [c, l] = EST[v.estado] || EST.programada;
                return (
                  <Link key={v.id} to={'/visitas/' + v.id} className="hist-row">
                    <span className="ico" style={{ width: 30, height: 30, background: 'var(--brand-soft)', color: 'var(--brand-600)' }}><Icon name="calendar" size={15} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{new Date(v.fecha).toLocaleDateString('es-UY')}</div>
                      <div className="subtle" style={{ fontSize: 12 }}>{v.tecnico || 'Sin tecnico'} · {v.pruebas} equipos</div>
                    </div>
                    <span className={'badge ' + c}><span className="dot" />{l}</span>
                  </Link>
                );
              })}
            </div>}
        </div>
        <div>
          <div className="hist-sub">Ultimos tecnicos</div>
          {tecnicos.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Sin tecnicos asignados.</div> :
            <div className="stack" style={{ gap: 8 }}>
              {tecnicos.map((t, i) => (
                <div key={i} className="hist-row" style={{ cursor: 'default' }}>
                  {tecAv[t.nombre]
                    ? <img className="hist-av" src={api.base + tecAv[t.nombre]} alt="" />
                    : <span className="ico" style={{ width: 32, height: 32, background: 'var(--brand-soft)', color: 'var(--brand-600)' }}>{(t.nombre || '?').slice(0, 1).toUpperCase()}</span>}
                  <div className="grow"><div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.nombre}</div><div className="subtle" style={{ fontSize: 12 }}>ult. {new Date(t.fecha).toLocaleDateString('es-UY')}</div></div>
                </div>
              ))}
            </div>}
        </div>
        <div>
          <div className="hist-sub">Contratos</div>
          {contratos.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Sin contratos.</div> :
            <div className="stack" style={{ gap: 0 }}>
              {contratos.map(k => { const [tone, lbl] = CONTR_EST[k.estado] || ['gris', k.estado]; return (
                <div key={k.id} className="hist-row" style={{ cursor: 'pointer' }} onClick={() => onVerContrato && onVerContrato(k)}>
                  <span className="ico" style={{ width: 32, height: 32, background: 'var(--brand-soft)', color: 'var(--brand-600)' }}><Icon name="pen" size={15} /></span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.titulo}</div>
                    <div className="subtle" style={{ fontSize: 12 }}>{k.fecha_fin ? 'vence ' + new Date(k.fecha_fin).toLocaleDateString('es-UY') : 'sin vencimiento'}</div>
                  </div>
                  <span className={'badge ' + tone}><span className="dot" />{lbl}</span>
                </div>
              ); })}
            </div>}
        </div>
        <div>
          <div className="hist-sub">Rupturas recientes</div>
          {rup === null ? <Loading rows={1} header={false} /> : rup.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Sin rupturas registradas.</div> :
            <div className="stack" style={{ gap: 0 }}>
              {rup.slice(0, 5).map(r => (
                <div key={r.id} className="hist-row" style={{ cursor: 'pointer' }} onClick={onVerRupturas}>
                  <span className="ico" style={{ width: 32, height: 32, background: 'var(--falla-bg)', color: 'var(--falla)' }}><Icon name="alert" size={15} /></span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.etiqueta || r.codigo_qr}</div>
                    <div className="subtle" style={{ fontSize: 12 }}>{r.estado} · {new Date(r.fecha).toLocaleDateString('es-UY')}</div>
                  </div>
                </div>
              ))}
              <button className="btn ghost sm" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={onVerRupturas}>Ver todas<Icon name="arrowRight" size={13} /></button>
            </div>}
        </div>
      </div>
    </div>
  );
}

const CONTR_EST = { activo: ['ok', 'Activo'], vencido: ['falla', 'Vencido'], suspendido: ['warn', 'Suspendido'], finalizado: ['gris', 'Finalizado'] };
const FREC_PREV_N = { mensual: 12, bimestral: 6, trimestral: 4, semestral: 2, anual: 1 };
const FREC_PREV_LBL = { mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
const _money = (m, mon) => m == null || m === '' ? '-' : (mon || 'UYU') + ' ' + Number(m).toLocaleString('es-UY');
const _fdate = (d) => d ? new Date(d).toLocaleDateString('es-UY') : '-';

function CumplBar({ label, hecho, total }) {
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

function ContratoActivo({ contratos, esAdmin, onVer }) {
  if (!contratos || contratos.length === 0) return <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Este cliente no tiene contratos cargados.</div>;
  const act = contratos.find(c => c.estado === 'activo') || contratos[0];
  const [tone, lbl] = CONTR_EST[act.estado] || ['gris', act.estado];
  const prevN = act.prev_contratados || FREC_PREV_N[act.frecuencia_preventivo] || 0;
  return (
    <div className="contr-active" onClick={() => onVer && onVer(act)}>
      <div className="ca-head">
        <span className="ca-tit"><Icon name="pen" size={14} />{act.titulo}</span>
        <span className={'badge ' + tone}><span className="dot" />{lbl}</span>
      </div>
      <div className="ca-rows">
        <div><span>Vigencia</span><b>{_fdate(act.fecha_inicio)} &rarr; {_fdate(act.fecha_fin)}</b></div>
        {act.frecuencia_preventivo && <div><span>Preventivo</span><b>{FREC_PREV_LBL[act.frecuencia_preventivo]}{prevN ? ' (' + prevN + '/ano)' : ''}</b></div>}
        {act.recurrencia_preventivo && <div><span>Recurrencia</span><b>{act.recurrencia_preventivo}</b></div>}
        {act.correctivos_anuales != null && <div><span>Correctivos/ano</span><b>{act.correctivos_anuales}</b></div>}
        {esAdmin && <div><span>Monto</span><b>{_money(act.monto, act.moneda)}</b></div>}
      </div>
      {(prevN > 0 || act.corr_contratados > 0) && <div className="ca-cumpl">
        {prevN > 0 && <CumplBar label="Preventivos (ult. ano)" hecho={act.prev_realizados} total={prevN} />}
        {act.corr_contratados > 0 && <CumplBar label="Correctivos (ult. ano)" hecho={act.corr_realizados} total={act.corr_contratados} />}
      </div>}
      {contratos.length > 1 && <div className="subtle" style={{ fontSize: 11.5, marginTop: 6 }}>+{contratos.length - 1} contrato(s) mas &middot; ver en Historial</div>}
    </div>
  );
}

function ContratoVerModal({ contrato: c, esAdmin, onClose }) {
  const [tone, lbl] = CONTR_EST[c.estado] || ['gris', c.estado];
  const prevN = c.prev_contratados || FREC_PREV_N[c.frecuencia_preventivo] || 0;
  return (
    <Modal title={<span className="row" style={{ gap: 8 }}><span className="fc-ic" style={{ width: 30, height: 30 }}><Icon name="pen" size={16} /></span>{c.titulo}</span>} subtitle={'Contrato del cliente'} onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Cerrar</button>}>
      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className={'badge ' + tone}><span className="dot" />{lbl}</span>
        <span className="badge gris"><Icon name="calendar" size={12} /> {_fdate(c.fecha_inicio)} &rarr; {_fdate(c.fecha_fin)}</span>
      </div>
      <div className="contr-view">
        <div className="cv-col">
          {c.descripcion && <Field label="Descripcion"><p className="contr-text">{c.descripcion}</p></Field>}
          <Field label="Deberes del servicio"><p className="contr-text">{c.deberes || 'Sin especificar.'}</p></Field>
          <Field label="Responsabilidades del cliente"><p className="contr-text">{c.responsabilidades || 'Sin especificar.'}</p></Field>
          {esAdmin && <div className="contr-money-box">
            <b><Icon name="star" size={14} /> Datos economicos</b>
            <div className="grid2" style={{ marginTop: 8 }}>
              <div><small className="muted">Monto</small><div>{_money(c.monto, c.moneda)}</div></div>
              <div><small className="muted">Forma de pago</small><div>{c.forma_pago || '-'}</div></div>
            </div>
          </div>}
        </div>
        <div className="cv-col cv-right">
          <div className="contr-money-box" style={{ margin: 0 }}>
            <b><Icon name="calendar" size={14} /> Plan de mantenimiento</b>
            <div className="cv-plan">
              <div><small className="muted">Frecuencia preventivo</small><div>{FREC_PREV_LBL[c.frecuencia_preventivo] || '-'}{prevN ? ' (' + prevN + '/ano)' : ''}</div></div>
              <div><small className="muted">Recurrencia</small><div>{c.recurrencia_preventivo || '-'}</div></div>
              <div><small className="muted">Correctivos anuales</small><div>{c.correctivos_anuales || '-'}</div></div>
            </div>
            {(prevN > 0 || c.corr_contratados > 0) && <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {prevN > 0 && <CumplBar label="Preventivos realizados (ultimo ano)" hecho={c.prev_realizados} total={prevN} />}
              {c.corr_contratados > 0 && <CumplBar label="Correctivos realizados (ultimo ano)" hecho={c.corr_realizados} total={c.corr_contratados} />}
            </div>}
            {!(c.frecuencia_preventivo || c.recurrencia_preventivo || c.correctivos_anuales) && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Sin plan de mantenimiento definido.</div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}


function RupturasCliente({ clienteId }) {
  const [items, setItems] = useState(null);
  const nav = useNavigate();
  useEffect(() => { api.get('/api/clientes/' + clienteId + '/rupturas').then(setItems).catch(() => setItems([])); }, [clienteId]);
  if (items === null) return <Loading rows={3} />;
  if (items.length === 0) return <Empty icon="checkCircle" title="Sin rupturas">Este cliente no tiene fallas registradas.</Empty>;
  return (
    <div className="card pad-sm"><div className="tablewrap"><table className="table">
      <thead><tr><th>Equipo</th><th>Sistema</th><th>Estado</th><th>Fecha</th><th>Comentarios</th><th></th></tr></thead>
      <tbody>{items.map(r => (
        <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => nav('/equipos/' + r.equipo_id)}>
          <td><div className="row" style={{ gap: 8 }}><span className="ico" style={{ width: 30, height: 30, background: 'var(--falla-bg)', color: 'var(--falla)' }}><Icon name="alert" size={14} /></span><b>{r.etiqueta || r.codigo_qr}</b></div></td>
          <td>{r.sistema || '-'}</td>
          <td><span className="badge falla"><span className="dot" />{r.estado}</span></td>
          <td className="mono">{new Date(r.fecha).toLocaleDateString('es-UY')}</td>
          <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.comentarios || '-'}</td>
          <td style={{ textAlign: 'right' }}>{r.visita_id && <button className="btn ghost sm" onClick={e => { e.stopPropagation(); nav('/visitas/' + r.visita_id); }}>Visita<Icon name="arrowRight" size={13} /></button>}</td>
        </tr>
      ))}</tbody>
    </table></div></div>
  );
}


function ClienteTickets({ clienteId, clienteNombre }) {
  const [items, setItems] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [avs, setAvs] = useState({});
  const [modal, setModal] = useState(null);
  const nav = useNavigate();

  const load = () => api.get('/api/tickets?cliente_id=' + clienteId).then(setItems).catch(() => setItems([]));
  useEffect(() => {
    load();
    api.get('/api/usuarios/lista').then(us => {
      setUsuarios(us || []);
      const m = {}; (us || []).forEach(u => { if (u.avatar_path) { m[u.nombre] = u.avatar_path; m[u.username] = u.avatar_path; } });
      setAvs(m);
    }).catch(() => {});
  }, [clienteId]);

  const save = async (f) => {
    try { await api.post('/api/tickets', { ...f, cliente_id: clienteId }); setModal(null); toast.ok('Ticket creado'); load(); }
    catch (e) { toast.err(e.message); }
  };
  if (items === null) return <Loading />;
  const abiertos = items.filter(t => !['resuelto', 'cerrado'].includes(t.estado)).length;

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{items.length} tickets{abiertos ? ' \u00b7 ' + abiertos + ' abiertos' : ''}</span>
        <button className="btn sm" onClick={() => setModal({ titulo: '', prioridad: 'media', estado: 'abierto', asignado: '', descripcion: '' })}><Icon name="plus" size={16} />Nuevo ticket</button>
      </div>
      {items.length === 0 ? <Empty icon="ticket" title="Sin tickets">Este cliente no tiene tickets registrados.</Empty> :
        <div className="tkl card pad-sm" style={{ padding: 6 }}>
          {items.map(t => {
            const [ec, el, eic] = EST[t.estado] || EST.abierto;
            return (
              <div key={t.id} className={'tkl-row' + (['resuelto', 'cerrado'].includes(t.estado) ? ' done' : '')} onClick={() => nav('/tickets/' + t.id)}>
                <span className="tkl-type"><Icon name="ticket" size={15} /></span>
                <span className="tkl-key mono">TK-{t.id}</span>
                <div className="tkl-main"><b className="tkl-tit">{t.titulo}</b></div>
                <span className="tkl-prio"><PrioIcon p={t.prioridad} /></span>
                <span className={'badge ' + ec}><Icon name={eic} size={12} />{el}</span>
                <span className="tkl-asig" data-tip={t.asignado || 'Sin asignar'}><TkAvatar nombre={t.asignado} src={avs[t.asignado]} /></span>
                <span className="tkl-upd mono">{new Date(t.updated_at).toLocaleDateString('es-UY')}</span>
              </div>
            );
          })}
        </div>}
      {modal && <TicketModal ticket={modal} clientes={[]} usuarios={usuarios} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function waNumero(tel) {
  let d = (tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('598')) return d;
  d = d.replace(/^0+/, '');
  return '598' + d;
}

function UbicacionModal({ cliente, onClose, onSaved }) {
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pt, setPt] = useState(cliente.lat != null ? { lat: Number(cliente.lat), lon: Number(cliente.lon) } : null);

  useEffect(() => {
    let cancel = false, tries = 0;
    const init = () => {
      if (cancel) return;
      const L = window.L; const el = document.getElementById('umap');
      if (!L || !el) { if (tries++ < 40) setTimeout(init, 120); return; }
      const c = pt || { lat: -34.9011, lon: -56.1645 };
      const map = L.map(el, { zoomControl: true }).setView([c.lat, c.lon], pt ? 16 : 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      const icon = L.divIcon({ className: '', html: '<div class="mk-dot" style="background:#1d4ed8"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
      const setMarker = (la, lo) => {
        if (markerRef.current) markerRef.current.setLatLng([la, lo]);
        else { markerRef.current = L.marker([la, lo], { icon, draggable: true }).addTo(map); markerRef.current.on('dragend', (e) => { const p = e.target.getLatLng(); setPt({ lat: p.lat, lon: p.lng }); }); }
        setPt({ lat: la, lon: lo });
      };
      if (pt) setMarker(pt.lat, pt.lon);
      map.on('click', (e) => setMarker(e.latlng.lat, e.latlng.lng));
      mapRef.current = map; mapRef.current._setMarker = setMarker;
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 80);
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 300);
    };
    init();
    return () => { cancel = true; if (mapRef.current) { try { mapRef.current.remove(); } catch {} } markerRef.current = null; };
  }, []);

  useEffect(() => {
    if (!q || q.length < 3) { setRes([]); return; }
    const t = setTimeout(() => {
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=uy&q=' + encodeURIComponent(q))
        .then(r => r.json()).then(rs => setRes(Array.isArray(rs) ? rs : [])).catch(() => setRes([]));
    }, 500);
    return () => clearTimeout(t);
  }, [q]);

  const irA = (g) => {
    const la = Number(g.lat), lo = Number(g.lon);
    setQ(''); setRes([]);
    if (mapRef.current) { mapRef.current.flyTo([la, lo], 17); mapRef.current._setMarker(la, lo); }
  };
  const usarGPS = async () => {
    toast('Obteniendo tu ubicacion...');
    const g = await getGPS();
    if (!g) { toast.err('No se pudo obtener el GPS'); return; }
    if (mapRef.current) { mapRef.current.flyTo([g.lat, g.lon], 17); mapRef.current._setMarker(g.lat, g.lon); }
  };
  const buscarDireccion = async () => {
    if (!cliente.direccion) { toast.err('El cliente no tiene direccion cargada'); return; }
    setBusy(true);
    try {
      const rs = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=uy&q=' + encodeURIComponent(cliente.direccion)).then(r => r.json());
      if (rs && rs[0]) irA(rs[0]); else toast.err('No se encontro la direccion');
    } catch { toast.err('Error al buscar la direccion'); }
    setBusy(false);
  };
  const guardar = async () => {
    if (!pt) { toast.err('Marca un punto en el mapa'); return; }
    setBusy(true);
    try { await api.put('/api/clientes/' + cliente.id + '/ubicacion', { lat: pt.lat, lon: pt.lon }); toast.ok('Ubicacion guardada'); onSaved && onSaved(); onClose(); }
    catch (e) { toast.err(e.message); }
    setBusy(false);
  };
  const compartirWa = () => {
    if (!pt) { toast.err('No hay ubicacion para compartir'); return; }
    const link = 'https://maps.google.com/?q=' + pt.lat + ',' + pt.lon;
    const txt = encodeURIComponent('Ubicacion de ' + cliente.nombre + ': ' + link);
    const tel = waNumero(cliente.telefono);
    window.open((tel ? 'https://wa.me/' + tel : 'https://wa.me/') + '?text=' + txt, '_blank', 'noopener');
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="umodal" onClick={e => e.stopPropagation()}>
        <div className="umodal-head">
          <b><Icon name="pin" size={16} /> Ubicacion de {cliente.nombre}</b>
          <button className="btn ghost icon" aria-label="Cerrar" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="umodal-search">
          <div className="wa-search" style={{ marginBottom: 0, flex: 1 }}>
            <Icon name="search" size={17} />
            <input placeholder="Buscar direccion para colocar el punto..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <button className="btn sec sm" data-tip="Usar la direccion del cliente" onClick={buscarDireccion} disabled={busy}><Icon name="building" size={15} />Direccion</button>
          <button className="btn sec sm" data-tip="Usar mi ubicacion GPS" onClick={usarGPS}><Icon name="pin" size={15} />GPS</button>
          {res.length > 0 && <div className="umodal-results">
            {res.map(g => <div key={g.place_id} className="map-result" onClick={() => irA(g)}><Icon name="pin" size={14} /><span>{g.display_name}</span></div>)}
          </div>}
        </div>
        <div id="umap" className="umodal-map" />
        <div className="umodal-foot">
          <span className="muted" style={{ fontSize: 12.5 }}>{pt ? 'Lat ' + pt.lat.toFixed(5) + ', Lon ' + pt.lon.toFixed(5) : 'Toca el mapa o busca una direccion'}</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sec" onClick={compartirWa} disabled={!pt}><Icon name="whatsapp" size={16} />WhatsApp</button>
            <button className="btn" onClick={guardar} disabled={busy || !pt}><Icon name="save" size={16} />Guardar ubicacion</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Contactos({ clienteId }) {
  const [items, setItems] = useState(null);
  const [modal, setModal] = useState(null);
  const load = () => api.get('/api/clientes/' + clienteId + '/contactos').then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, [clienteId]);
  const save = async (f) => {
    try { if (f.id) await api.put('/api/contactos/' + f.id, f); else await api.post('/api/clientes/' + clienteId + '/contactos', f); setModal(null); toast.ok('Contacto guardado'); load(); }
    catch (e) { toast.err(e.message); }
  };
  const del = async (c) => { if (!confirm('Eliminar contacto?')) return; try { await api.del('/api/contactos/' + c.id); load(); } catch (e) { toast.err(e.message); } };
  if (items === null) return <Loading />;

  const waNum = (t) => { let d = (t || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('598')) return d; return '598' + d.replace(/^0+/, ''); };

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{items.length} contacto{items.length === 1 ? '' : 's'}</span>
        <button className="btn sm" onClick={() => setModal({ nombre: '', email: '', telefono: '', cargo: '' })}><Icon name="plus" size={16} />Nuevo contacto</button>
      </div>
      {items.length === 0 ? <Empty icon="users" title="Sin contactos">Agrega las personas de contacto del cliente.</Empty> :
        <div className="contact-grid">
          {items.map(c => (
            <div key={c.id} className="card contact-card">
              <div className="row" style={{ gap: 11, alignItems: 'flex-start' }}>
                <span className="contact-av">{(c.nombre || '?').trim().slice(0, 1).toUpperCase()}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 14.5 }}>{c.nombre || 'Sin nombre'}</b>
                  {c.cargo && <div className="subtle" style={{ fontSize: 12.5 }}>{c.cargo}</div>}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn ghost icon sm" data-tip="Editar" onClick={() => setModal({ ...c })}><Icon name="edit" size={15} /></button>
                  <button className="btn ghost icon sm" data-tip="Eliminar" onClick={() => del(c)}><Icon name="trash" size={15} color="var(--falla)" /></button>
                </div>
              </div>
              <div className="contact-rows">
                {c.telefono && <a className="contact-row" href={'tel:' + c.telefono}><Icon name="phone" size={14} />{c.telefono}
                  <button className="contact-wa" data-tip="WhatsApp" onClick={e => { e.preventDefault(); window.open('https://wa.me/' + waNum(c.telefono), '_blank', 'noopener'); }}><Icon name="whatsapp" size={14} /></button></a>}
                {c.email && <a className="contact-row" href={'mailto:' + c.email}><Icon name="mail" size={14} />{c.email}</a>}
              </div>
            </div>
          ))}
        </div>}
      {modal && <Modal title={<span className="row" style={{ gap: 8 }}><span className="fc-ic" style={{ width: 30, height: 30 }}><Icon name="users" size={16} /></span>{modal.id ? 'Editar contacto' : 'Nuevo contacto'}</span>} subtitle="Persona de contacto del cliente" onClose={() => setModal(null)}
        footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn" disabled={!modal.nombre} onClick={() => save(modal)}><Icon name="check" size={16} />Guardar</button></>}>
        <Field label={<span className="flabel"><Icon name="users" size={13} />Nombre</span>}><input value={modal.nombre || ''} placeholder="Nombre y apellido" onChange={e => setModal({ ...modal, nombre: e.target.value })} /></Field>
        <Field label={<span className="flabel"><Icon name="star" size={13} />Cargo</span>}><input value={modal.cargo || ''} placeholder="Ej: Encargado de mantenimiento" onChange={e => setModal({ ...modal, cargo: e.target.value })} /></Field>
        <div className="grid2">
          <Field label={<span className="flabel"><Icon name="mail" size={13} />Email</span>}><input type="email" value={modal.email || ''} onChange={e => setModal({ ...modal, email: e.target.value })} /></Field>
          <Field label={<span className="flabel"><Icon name="phone" size={13} />Telefono</span>}><input value={modal.telefono || ''} onChange={e => setModal({ ...modal, telefono: e.target.value })} /></Field>
        </div>
      </Modal>}
    </div>
  );
}
