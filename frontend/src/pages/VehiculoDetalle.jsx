import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { Loading, Field, Modal } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import { calcService, SRV_LABEL } from '../flota.js';
import { compressToFile } from '../img.js';

const TIPO_REG = { service: ['info', 'Service', 'wrench'], nafta: ['warn', 'Combustible', 'truck'], reparacion: ['falla', 'Reparacion', 'alert'], otro: ['gris', 'Otro', 'file'] };
const money = (n) => n == null || n === '' ? '-' : '$ ' + Number(n).toLocaleString('es-UY');
const km = (n) => n != null ? Number(n).toLocaleString('es-UY') + ' km' : '-';
const fdate = (d) => d ? new Date(d).toLocaleDateString('es-UY') : '-';

export default function VehiculoDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const [v, setV] = useState(null);
  const [regs, setRegs] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [nuevo, setNuevo] = useState(null);
  const [edit, setEdit] = useState(false);
  const fotoInp = useRef();

  const load = () => api.get('/api/vehiculos/' + id).then(setV);
  const loadRegs = () => api.get('/api/vehiculos/' + id + '/registros').then(setRegs);
  const loadFotos = () => api.get('/api/vehiculos/' + id + '/fotos').then(setFotos).catch(() => {});
  useEffect(() => { load(); loadRegs(); loadFotos(); }, [id]);

  const guardar = async (data) => {
    try { await api.put('/api/vehiculos/' + id, data); toast.ok('Vehiculo guardado'); setEdit(false); load(); } catch (e) { toast.err(e.message); }
  };
  const borrar = async () => { if (!confirm('Eliminar vehiculo?')) return; try { await api.del('/api/vehiculos/' + id); toast.ok('Eliminado'); nav('/flota'); } catch (e) { toast.err(e.message); } };
  const subirFotos = async (e) => {
    const files = [...(e.target.files || [])]; if (!files.length) return; e.target.value = '';
    const fd = new FormData();
    for (const f of files) fd.append('files', await compressToFile(f));
    try { await api.upload('/api/vehiculos/' + id + '/fotos', fd); toast.ok('Fotos subidas'); loadFotos(); load(); } catch (err) { toast.err(err.message); }
  };
  const delFoto = async (f) => { if (!confirm('Eliminar foto?')) return; try { await api.del('/api/vehiculo_fotos/' + f.id); loadFotos(); load(); } catch (e) { toast.err(e.message); } };
  const delReg = async (r) => { if (!confirm('Eliminar registro?')) return; try { await api.del('/api/vehiculo_registros/' + r.id); load(); loadRegs(); } catch (e) { toast.err(e.message); } };

  if (!v) return <Loading />;
  const total = (regs || []).reduce((a, r) => a + Number(r.costo || 0), 0);
  const srv = calcService(v);
  const [srvTone, srvLbl] = SRV_LABEL[srv.estado] || SRV_LABEL.sin_datos;
  const portada = v.foto_path;

  return (
    <div>
      <Link to="/flota" className="backlink"><Icon name="chevronLeft" size={16} />Flota</Link>

      {/* HERO de la camioneta */}
      <div className="veh-hero">
        <div className="veh-hero-img" onClick={() => fotoInp.current?.click()} role="button" data-tip="Cambiar / agregar fotos">
          {portada ? <img src={api.base + portada} alt={v.nombre} /> : <div className="veh-hero-empty"><Icon name="truck" size={54} /><span>Agregar foto</span></div>}
          <span className="veh-hero-cam"><Icon name="camera" size={16} /></span>
        </div>
        <input ref={fotoInp} type="file" accept="image/*" multiple hidden onChange={subirFotos} />
        <div className="veh-hero-info">
          <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
            <h2 style={{ fontSize: 25 }}>{v.nombre}</h2>
            {v.patente && <span className="veh-plate">{v.patente}</span>}
          </div>
          <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>{[v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || v.tipo}</div>
          <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
            <span className="badge info"><Icon name="truck" size={12} />{v.tipo}</span>
            <span className="badge gris"><Icon name="truck" size={12} />{km(v.odometro)}</span>
            <span className={'badge ' + srvTone}><Icon name={srv.estado === 'vencido' ? 'alert' : srv.estado === 'pronto' ? 'clock' : 'check'} size={12} />{srvLbl}</span>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <button className="btn sec sm" onClick={() => setEdit(true)}><Icon name="edit" size={15} />Editar</button>
            <button className="btn ghost icon sm" data-tip="Eliminar" onClick={borrar}><Icon name="trash" size={16} color="var(--falla)" /></button>
          </div>
        </div>
      </div>

      {/* Galeria de fotos */}
      {fotos.length > 0 && <div className="veh-gal">
        {fotos.map(f => (
          <div key={f.id} className="veh-gal-it">
            <a href={api.base + f.path} target="_blank" rel="noreferrer"><img src={api.base + f.path} alt="" /></a>
            <button className="pic-del" onClick={() => delFoto(f)} aria-label="Eliminar"><Icon name="x" size={12} /></button>
          </div>
        ))}
      </div>}

      {/* Proximo service: tarjeta destacada */}
      <div className={'veh-srv ' + srvTone}>
        <div className="vs-ic"><Icon name="wrench" size={22} /></div>
        <div className="grow">
          <div className="vs-title">Proximo service{srv.estado === 'vencido' ? ' · vencido' : srv.estado === 'pronto' ? ' · pronto' : ''}</div>
          {srv.estado === 'sin_config'
            ? <div className="muted" style={{ fontSize: 13 }}>Define el intervalo de service (km o meses) en Editar para activar las alertas.</div>
            : <div className="vs-detail">
                {srv.proxKm != null && <span><b>{km(srv.proxKm)}</b>{srv.kmRestante != null && <small className={srv.kmRestante <= 0 ? 'neg' : ''}> ({srv.kmRestante <= 0 ? 'excedido ' + km(-srv.kmRestante) : 'faltan ' + km(srv.kmRestante)})</small>}</span>}
                {srv.proxFecha && <span><b>{fdate(srv.proxFecha)}</b>{srv.diasRestante != null && <small className={srv.diasRestante <= 0 ? 'neg' : ''}> ({srv.diasRestante <= 0 ? 'vencido hace ' + (-srv.diasRestante) + 'd' : 'en ' + srv.diasRestante + 'd'})</small>}</span>}
              </div>}
          {v.ult_service_fecha && <div className="subtle" style={{ fontSize: 11.5, marginTop: 3 }}>Ultimo service: {fdate(v.ult_service_fecha)}{v.ult_service_km != null ? ' · ' + km(v.ult_service_km) : ''}</div>}
        </div>
        <button className="btn sm" onClick={() => setNuevo({ tipo: 'service', fecha: new Date().toISOString().slice(0, 10), costo: '', odometro: v.odometro || '', detalle: '', files: [] })}><Icon name="plus" size={15} />Registrar service</button>
      </div>

      {/* Stats rapidas */}
      <div className="stats" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="k"><span className="ic"><Icon name="truck" size={16} /></span>Odometro</div><div className="v">{km(v.odometro)}</div></div>
        <div className="stat"><div className="k"><span className="ic"><Icon name="file" size={16} /></span>Gasto total</div><div className="v">{money(v.gasto_total ?? total)}</div></div>
        <div className="stat"><div className="k"><span className="ic"><Icon name="clock" size={16} /></span>Ultimo registro</div><div className="v">{fdate(v.ultimo_registro)}</div></div>
      </div>

      {/* Historial */}
      <div className="card">
        <div className="sec-head"><span className="fc-ic"><Icon name="clipboard" size={17} /></span><b>Historial de mantenimiento</b>
          <div className="row" style={{ marginLeft: 'auto', gap: 6 }}>
            <button className="btn sec sm" onClick={() => setNuevo({ tipo: 'reparacion', fecha: new Date().toISOString().slice(0, 10), costo: '', odometro: v.odometro || '', detalle: '', files: [] })}><Icon name="alert" size={14} />Ruptura</button>
            <button className="btn sm" onClick={() => setNuevo({ tipo: 'service', fecha: new Date().toISOString().slice(0, 10), costo: '', odometro: v.odometro || '', detalle: '', files: [] })}><Icon name="plus" size={15} />Registro</button>
          </div>
        </div>
        {regs === null ? <Loading rows={2} header={false} /> :
          regs.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Sin registros. Carga services, combustible o reparaciones.</div> :
            <div className="veh-tl">
              {regs.map(r => {
                const [c, l, ic] = TIPO_REG[r.tipo] || TIPO_REG.otro;
                return (
                  <div key={r.id} className="veh-reg">
                    <span className={'vr-ic ' + c}><Icon name={ic} size={15} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row between" style={{ gap: 8 }}>
                        <span className="row" style={{ gap: 8 }}><span className={'badge ' + c}>{l}</span><b style={{ fontSize: 13.5 }}>{money(r.costo)}</b></span>
                        <button className="btn ghost icon sm" onClick={() => delReg(r)} aria-label="Eliminar"><Icon name="trash" size={14} /></button>
                      </div>
                      <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>{fdate(r.fecha)}{r.odometro ? ' · ' + km(r.odometro) : ''}{r.detalle ? ' · ' + r.detalle : ''}</div>
                      {Array.isArray(r.fotos) && r.fotos.length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 7 }}>
                        {r.fotos.map(f => <a key={f.id} href={api.base + f.path} target="_blank" rel="noreferrer"><img className="vr-foto" src={api.base + f.path} alt="" /></a>)}
                      </div>}
                    </div>
                  </div>
                );
              })}
              <div className="row between" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}><span className="muted" style={{ fontSize: 13 }}>Total registrado</span><b>{money(total)}</b></div>
            </div>}
      </div>

      {nuevo && <RegistroModal vehiculoId={id} reg={nuevo} onClose={() => setNuevo(null)} onSaved={() => { setNuevo(null); load(); loadRegs(); }} />}
      {edit && <VehiculoEditModal vehiculo={v} onClose={() => setEdit(false)} onSave={guardar} />}
    </div>
  );
}

function RegistroModal({ vehiculoId, reg, onClose, onSaved }) {
  const [f, setF] = useState(reg);
  const [pics, setPics] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const addPics = (e) => { const fs = [...(e.target.files || [])]; if (fs.length) setPics(p => [...p, ...fs]); e.target.value = ''; };

  const guardar = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/vehiculos/' + vehiculoId + '/registros', f);
      if (pics.length && r?.id) {
        const fd = new FormData();
        for (const p of pics) fd.append('files', await compressToFile(p));
        await api.upload('/api/vehiculo_registros/' + r.id + '/fotos', fd).catch(() => {});
      }
      toast.ok('Registro agregado'); onSaved();
    } catch (e) { toast.err(e.message); }
    setBusy(false);
  };

  return (
    <Modal title={f.tipo === 'reparacion' ? 'Registrar ruptura / reparacion' : 'Nuevo registro'} subtitle="Service, combustible, reparacion u otro" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar} disabled={busy}><Icon name="check" size={16} />{busy ? 'Guardando...' : 'Guardar'}</button></>}>
      <div className="grid2">
        <Field label="Tipo"><select value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="service">Service</option><option value="nafta">Combustible</option><option value="reparacion">Reparacion / ruptura</option><option value="otro">Otro</option></select></Field>
        <Field label="Fecha"><input type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} /></Field>
        <Field label="Costo $"><input value={f.costo} onChange={e => set('costo', e.target.value)} /></Field>
        <Field label="Odometro (km)"><input value={f.odometro} onChange={e => set('odometro', e.target.value)} /></Field>
      </div>
      <Field label="Detalle"><textarea value={f.detalle} placeholder={f.tipo === 'reparacion' ? 'Que se rompio, que se reparo...' : 'Detalle del registro'} onChange={e => set('detalle', e.target.value)} /></Field>
      <Field label="Fotos (rupturas, factura, repuesto...)">
        <label className="btn sec sm" style={{ cursor: 'pointer' }}><Icon name="camera" size={14} />Agregar fotos<input type="file" accept="image/*" multiple hidden onChange={addPics} /></label>
        {pics.length > 0 && <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          {pics.map((p, i) => (
            <div key={i} className="pic-prev"><img src={URL.createObjectURL(p)} alt="" /><button type="button" className="pic-del" onClick={() => setPics(x => x.filter((_, j) => j !== i))} aria-label="Quitar"><Icon name="x" size={12} /></button></div>
          ))}
        </div>}
      </Field>
    </Modal>
  );
}

function VehiculoEditModal({ vehiculo, onClose, onSave }) {
  const [f, setF] = useState(vehiculo); const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title="Editar vehiculo" subtitle="Datos y plan de service" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSave(f)} disabled={!f.nombre}><Icon name="check" size={16} />Guardar</button></>}>
      <div className="grid2">
        <Field label={<span className="flabel"><Icon name="truck" size={13} />Nombre</span>}><input value={f.nombre || ''} onChange={e => set('nombre', e.target.value)} /></Field>
        <Field label="Patente"><input value={f.patente || ''} onChange={e => set('patente', e.target.value)} /></Field>
        <Field label="Tipo"><select value={f.tipo || 'camioneta'} onChange={e => set('tipo', e.target.value)}><option value="camioneta">Camioneta</option><option value="auto">Auto</option><option value="moto">Moto</option><option value="otro">Otro</option></select></Field>
        <Field label="Año"><input value={f.anio || ''} onChange={e => set('anio', e.target.value)} /></Field>
        <Field label="Marca"><input value={f.marca || ''} onChange={e => set('marca', e.target.value)} /></Field>
        <Field label="Modelo"><input value={f.modelo || ''} onChange={e => set('modelo', e.target.value)} /></Field>
        <Field label="Odometro actual (km)"><input value={f.odometro || ''} onChange={e => set('odometro', e.target.value)} /></Field>
      </div>
      <div className="brd-sec" style={{ marginTop: 4 }}>
        <div className="brd-sec-h"><Icon name="wrench" size={15} />Plan de service (para alertas)</div>
        <div className="grid2">
          <Field label="Cada cuantos km"><input type="number" value={f.service_cada_km || ''} placeholder="Ej: 10000" onChange={e => set('service_cada_km', e.target.value)} /></Field>
          <Field label="Cada cuantos meses"><input type="number" value={f.service_cada_meses || ''} placeholder="Ej: 12" onChange={e => set('service_cada_meses', e.target.value)} /></Field>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>El proximo service se calcula desde el ultimo service cargado (o el odometro/fecha actual).</div>
      </div>
      <Field label="Notas"><textarea value={f.notas || ''} onChange={e => set('notas', e.target.value)} /></Field>
    </Modal>
  );
}
