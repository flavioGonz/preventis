import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, Field, Loading, Empty, PageHeader, Stat } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import Drawer from '../components/Drawer.jsx';
import ImportClientes from '../components/ImportClientes.jsx';

const FRECUENCIAS = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual', 'sin'];
const FREC_LABEL = { mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', sin: 'Sin frecuencia' };
const blank = { nombre: '', direccion: '', telefono: '', frecuencia: 'mensual' };

export default function Clientes() {
  const [clientes, setClientes] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [esDesk, setEsDesk] = useState(typeof window !== 'undefined' && window.innerWidth >= 900);
  useEffect(() => { const fn = () => setEsDesk(window.innerWidth >= 900); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn); }, []);
  const [verContrato, setVerContrato] = useState(null);
  const [importar, setImportar] = useState(false);
  const nav = useNavigate();

  const load = () => {
    const params = new URLSearchParams();
    if (filtro) params.set('frecuencia', filtro);
    if (search) params.set('search', search);
    api.get('/api/clientes?' + params).then(setClientes).catch(e => toast.err(e.message));
  };
  useEffect(load, [filtro, search]);

  const save = async (form) => {
    try {
      if (form.id) await api.put('/api/clientes/' + form.id, form);
      else await api.post('/api/clientes', form);
      setModal(null); toast.ok('Cliente guardado'); load();
    } catch (e) { toast.err(e.message); }
  };

  const total = clientes?.length || 0;
  const totalEquipos = (clientes || []).reduce((a, c) => a + Number(c.equipos || 0), 0);
  const mensuales = (clientes || []).filter(c => c.frecuencia === 'mensual').length;

  return (
    <div>
      <PageHeader icon="users" title="Clientes" desc="Empresas con servicio de mantenimiento preventivo"
        actions={<>
          <button className="btn sec" onClick={() => setImportar(true)}><Icon name="upload" size={16} />Importar</button>
          <button className="btn" onClick={() => setModal({ ...blank })}><Icon name="plus" size={17} />Nuevo cliente</button>
        </>} />

      <div className="searchbar">
        <div className="wa-search">
          <Icon name="search" size={17} />
          <input placeholder="Buscar cliente o direccion..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={'btn-filter' + (filtro ? ' on' : '')} onClick={() => setSheet(true)}>
          <Icon name="filter" size={16} />Filtros{filtro ? <span className="fc">1</span> : null}
        </button>
      </div>

      {clientes === null ? <Loading /> :
        clientes.length === 0 ?
          <Empty icon="users" title="Aun no hay clientes"
            action={<button className="btn" onClick={() => setModal({ ...blank })}><Icon name="plus" size={17} />Crear el primero</button>}>
            Crea tu primer cliente para empezar a registrar visitas.
          </Empty> :
          esDesk ?
          <div className="tkl card pad-sm" style={{ padding: 6 }}>
            <div className="tkl-headrow">
              <span style={{ width: 30 }} /><span style={{ flex: 1, minWidth: 150 }}>Cliente</span>
              <span style={{ width: 142 }}>Ult. tecnico</span>
              <span style={{ width: 104 }}>Frecuencia</span>
              <span style={{ width: 60, textAlign: 'center' }}>Equipos</span>
              <span style={{ width: 152 }}>Contrato</span>
              <span style={{ width: 90, textAlign: 'right' }}>Ult. visita</span>
              <span style={{ width: 90, textAlign: 'right' }}>Proxima</span>
              <span style={{ width: 34 }} />
            </div>
            {clientes.map(c => (
              <div key={c.id} className="tkl-row" onClick={() => nav('/clientes/' + c.id)}>
                <span className="tkl-type">{c.avatar_path ? <img src={api.base + c.avatar_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} /> : <Icon name="building" size={15} />}</span>
                <div className="tkl-main" style={{ display: 'block', minWidth: 0, flex: 1 }}>
                  <b className="tkl-tit" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                    {c.vip && <Icon name="star" size={12} color="var(--warn)" />}
                    {c.en_curso && <span className="badge ok mini"><span className="dot" />En visita</span>}
                  </b>
                  {c.direccion && <span className="tkl-cli" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="pin" size={11} />{c.direccion}</span>}
                </div>
                <span style={{ width: 142, flex: 'none', fontSize: 12.5, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.ultimo_tecnico ? <><Icon name="users" size={12} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ultimo_tecnico}</span></> : <span className="subtle">—</span>}</span>
                <span style={{ width: 104, flex: 'none' }}><span className="pill-freq">{FREC_LABEL[c.frecuencia] || c.frecuencia}</span></span>
                <span style={{ width: 60, textAlign: 'center', flex: 'none' }}>{Number(c.equipos) > 0 ? <span className="wa-count" style={{ background: Number(c.fallas) > 0 ? 'var(--falla)' : 'var(--brand-600)' }} data-tip={Number(c.fallas) > 0 ? (c.fallas + ' en falla') : null}>{c.equipos}</span> : <span className="subtle">0</span>}</span>
                <span style={{ width: 152, flex: 'none' }}>{c.contrato_id ? <button className="btn ghost sm" style={{ maxWidth: '100%', padding: '3px 8px', height: 'auto', gap: 5 }} data-tip="Ver contrato" onClick={e => { e.stopPropagation(); setVerContrato({ cliente_id: c.id, contrato_id: c.contrato_id }); }}><Icon name="file" size={13} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.contrato_titulo || 'Contrato'}</span></button> : <span className="subtle" style={{ fontSize: 12 }}>Sin contrato</span>}</span>
                <span className="tkl-date mono" style={{ width: 90 }}>{c.ultima_visita ? new Date(c.ultima_visita).toLocaleDateString('es-UY') : '—'}</span>
                <span className="tkl-date mono" style={{ width: 90, color: c.proxima_visita ? 'var(--brand-700)' : 'var(--subtle)', fontWeight: c.proxima_visita ? 600 : 400 }}>{c.proxima_visita ? new Date(c.proxima_visita).toLocaleDateString('es-UY') : '—'}</span>
                <span className="row tkl-acts" style={{ gap: 0, width: 34 }}>
                  <button className="btn ghost icon tkl-del" data-tip="Editar" aria-label="Editar" onClick={e => { e.stopPropagation(); setModal({ ...c }); }}><Icon name="edit" size={15} /></button>
                </span>
              </div>
            ))}
          </div>
          :
          <div className="wa-wrap"><div className="wa-list">
            {clientes.map(c => (
              <div key={c.id} className="wa-row" onClick={() => nav('/clientes/' + c.id)}>
                <label className={'wa-av cli-av' + (c.en_curso ? ' ring-ok' : '')} onClick={e => e.stopPropagation()} data-tip="Cambiar avatar del cliente">
                  {c.avatar_path ? <img src={api.base + c.avatar_path} alt="" /> : <Icon name="building" size={24} />}
                  <input type="file" accept="image/*" hidden onChange={async ev => { const f = ev.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); try { await api.upload('/api/clientes/' + c.id + '/avatar', fd); toast.ok('Avatar actualizado'); load(); } catch (err) { toast.err(err.message); } ev.target.value = ''; }} />
                  {c.en_curso && <span className="wa-dot" style={{ background: 'var(--ok)' }} />}
                </label>
                <div className="wa-main">
                  <div className="wa-top">
                    <span className="wa-title">{c.nombre}{c.vip && <Icon name="star" size={13} color="var(--warn)" />}</span>
                    <span className={'wa-time' + (c.en_curso ? ' ac-ok' : '')}>{c.en_curso ? 'En visita' : (c.ultima_visita ? new Date(c.ultima_visita).toLocaleDateString('es-UY') : '')}</span>
                  </div>
                  <div className="wa-bot">
                    <span className="wa-sub"><Icon name="pin" size={13} />{c.direccion || 'Sin direccion'}</span>
                    <span className="wa-meta">
                      <span className="pill-freq">{FREC_LABEL[c.frecuencia] || c.frecuencia}</span>
                      {Number(c.equipos) > 0 && <span className="wa-count" style={{ background: Number(c.fallas) > 0 ? 'var(--falla)' : 'var(--brand-600)' }}>{c.equipos}</span>}
                      <button className="btn ghost icon" data-tip="Editar" aria-label="Editar" onClick={e => { e.stopPropagation(); setModal({ ...c }); }}><Icon name="edit" size={15} /></button>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div></div>}

      <Drawer open={sheet} onClose={() => setSheet(false)} title="Filtros" side="bottom"
        footer={<><button className="btn ghost" onClick={() => setFiltro('')}>Limpiar</button><button className="btn" onClick={() => setSheet(false)}>Aplicar</button></>}>
        <div className="filter-sheet">
          <div className="field">
            <label>Frecuencia de visita</label>
            <div className="chips">
              <span className={'chip' + (filtro === '' ? ' active' : '')} onClick={() => setFiltro('')}>Todas</span>
              {FRECUENCIAS.map(f => <span key={f} className={'chip' + (filtro === f ? ' active' : '')} onClick={() => setFiltro(f)}>{FREC_LABEL[f] || f}</span>)}
            </div>
          </div>
        </div>
      </Drawer>

      {modal && <ClienteModal cliente={modal} onClose={() => setModal(null)} onSave={save} />}
      {verContrato && <ContratoModal {...verContrato} onClose={() => setVerContrato(null)} />}
      {importar && <ImportClientes onClose={() => setImportar(false)} onDone={load} />}
    </div>
  );
}

const ESTC = { activo: 'ok', vigente: 'ok', vencido: 'falla', borrador: 'gris', finalizado: 'gris', cancelado: 'gris' };
const fdate = (d) => d ? new Date(d).toLocaleDateString('es-UY') : '—';

function ContratoModal({ cliente_id, contrato_id, onClose }) {
  const [k, setK] = useState(undefined);
  useEffect(() => {
    api.get('/api/clientes/' + cliente_id + '/contratos')
      .then(list => setK((list || []).find(x => String(x.id) === String(contrato_id)) || null))
      .catch(e => { toast.err(e.message); setK(null); });
  }, [cliente_id, contrato_id]);
  return (
    <Modal title="Contrato" subtitle={k ? k.titulo : 'Plan de mantenimiento'} onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Cerrar</button>}>
      {k === undefined ? <Loading /> :
        !k ? <Empty icon="file" title="Sin datos">No se encontro el contrato.</Empty> :
        <div className="contr-view">
          <div className="cv-col">
            <div className="row" style={{ gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <span className={'badge ' + (ESTC[k.estado] || 'gris')}><span className="dot" />{k.estado || 'sin estado'}</span>
              <span className="subtle mono" style={{ fontSize: 12 }}><Icon name="calendar" size={12} /> {fdate(k.fecha_inicio)} — {fdate(k.fecha_fin)}</span>
            </div>
            {k.descripcion && <p className="contr-text">{k.descripcion}</p>}
            {k.deberes && <><div className="hist-sub" style={{ marginTop: 12 }}><Icon name="check" size={13} /> Deberes del prestador</div><p className="contr-text">{k.deberes}</p></>}
            {k.responsabilidades && <><div className="hist-sub" style={{ marginTop: 12 }}><Icon name="users" size={13} /> Responsabilidades del cliente</div><p className="contr-text">{k.responsabilidades}</p></>}
            {!k.descripcion && !k.deberes && !k.responsabilidades && <p className="subtle">Sin descripcion registrada.</p>}
          </div>
          <div className="cv-plan">
            <div className="cv-plan-h"><Icon name="repeat" size={14} /> Plan de mantenimiento</div>
            <div className="cv-stat"><span>Preventivos</span><b>{k.prev_realizados ?? 0} / {k.prev_contratados ?? 0}</b></div>
            <div className="cv-bar"><span style={{ width: barPct(k.prev_realizados, k.prev_contratados) }} /></div>
            <div className="cv-stat" style={{ marginTop: 10 }}><span>Correctivos</span><b>{k.corr_realizados ?? 0} / {k.corr_contratados ?? 0}</b></div>
            <div className="cv-bar"><span style={{ width: barPct(k.corr_realizados, k.corr_contratados) }} /></div>
            <div className="kv" style={{ marginTop: 14 }}>
              <div><dt>Frecuencia</dt><dd>{k.frecuencia_preventivo || '—'}</dd></div>
              {k.monto != null && <div><dt>Monto</dt><dd className="mono">{k.moneda || ''} {Number(k.monto).toLocaleString('es-UY')}</dd></div>}
              {k.forma_pago && <div><dt>Forma de pago</dt><dd>{k.forma_pago}</dd></div>}
            </div>
            <button className="btn ghost block sm" style={{ marginTop: 14 }} onClick={() => { onClose(); window.location.assign('/clientes/' + cliente_id + '?tab=contratos'); }}><Icon name="external" size={14} /> Abrir en ficha</button>
          </div>
        </div>}
    </Modal>
  );
}
function barPct(a, b) { const t = Number(b || 0); if (!t) return '0%'; return Math.min(100, Math.round((Number(a || 0) / t) * 100)) + '%'; }

function ClienteModal({ cliente, onClose, onSave }) {
  const [f, setF] = useState(cliente);
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={f.id ? 'Editar cliente' : 'Nuevo cliente'} subtitle="Datos de contacto y frecuencia de visita" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn" onClick={() => onSave(f)} disabled={!f.nombre}><Icon name="check" size={16} />Guardar</button>
      </>}>
      <Field label="Nombre"><input value={f.nombre} placeholder="Ej: Edificio Torre Norte" onChange={e => set('nombre', e.target.value)} /></Field>
      <Field label="Direccion"><input value={f.direccion || ''} placeholder="Calle, numero, ciudad" onChange={e => set('direccion', e.target.value)} /></Field>
      <div className="grid2">
        <Field label="Telefono de contacto"><input value={f.telefono || ''} onChange={e => set('telefono', e.target.value)} /></Field>
        <Field label="Frecuencia de visita">
          <select value={f.frecuencia} onChange={e => set('frecuencia', e.target.value)}>
            {FRECUENCIAS.map(x => <option key={x} value={x}>{FREC_LABEL[x] || x}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
