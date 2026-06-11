import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Loading, Empty, Modal, Field } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import { calcService, SRV_LABEL } from '../flota.js';

const TIPO_REG = { service: ['info', 'Service'], nafta: ['warn', 'Combustible'], reparacion: ['falla', 'Reparacion'], otro: ['gris', 'Otro'] };
const money = (n) => n == null ? '-' : '$ ' + Number(n).toLocaleString('es-UY');

export default function Flota() {
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  const [modal, setModal] = useState(null);

  const load = () => api.get('/api/vehiculos').then(setItems);
  useEffect(() => { load(); }, []);
  const save = async (f) => { try { if (f.id) await api.put('/api/vehiculos/' + f.id, f); else await api.post('/api/vehiculos', f); setModal(null); toast.ok('Vehiculo guardado'); load(); } catch (e) { toast.err(e.message); } };
  const del = async (vh) => { if (!confirm('Eliminar vehiculo?')) return; try { await api.del('/api/vehiculos/' + vh.id); toast.ok('Eliminado'); load(); } catch (e) { toast.err(e.message); } };

  if (items === null) return <Loading />;
  return (
    <div>
      <PageHeader icon="truck" title="Flota" desc="Vehiculos de la empresa: services, combustible y reparaciones"
        actions={<button className="btn sm" onClick={() => setModal({ nombre: '', patente: '', tipo: 'camioneta', marca: '', modelo: '', anio: '', odometro: '', notas: '' })}><Icon name="plus" size={16} />Nuevo vehiculo</button>} />

      {items.length === 0 ? <Empty icon="truck" title="Sin vehiculos">Agrega las camionetas y autos de la empresa.</Empty> :
        <div className="fleet-grid">
          {items.map(vh => (
            <div key={vh.id} className="card click veh-card" onClick={() => nav('/flota/' + vh.id)}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <div className="row" style={{ gap: 11 }}>
                  <div className="ico" style={{ width: 44, height: 44, background: 'var(--brand-soft)', color: 'var(--brand-600)', overflow: 'hidden', padding: 0 }}>{vh.foto_path ? <img src={api.base + vh.foto_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="truck" size={22} />}</div>
                  <div>
                    <div className="title">{vh.nombre}</div>
                    <div className="subtle" style={{ fontSize: 12.5 }}>{[vh.marca, vh.modelo].filter(Boolean).join(' ') || vh.tipo}</div>
                  </div>
                </div>
                {vh.patente && <span className="badge gris" style={{ fontFamily: 'monospace' }}>{vh.patente}</span>}
              </div>
              {(() => { const sv = calcService(vh); if (!['ok','pronto','vencido'].includes(sv.estado)) return null; const [t,l]=SRV_LABEL[sv.estado]; return <div className={'veh-srvbadge ' + t}><Icon name={sv.estado==='vencido'?'alert':sv.estado==='pronto'?'clock':'check'} size={12} />{l}</div>; })()}
              <div className="veh-stats">
                <div><div className="vs-k">Odometro</div><div className="vs-v">{vh.odometro != null ? Number(vh.odometro).toLocaleString('es-UY') + ' km' : '-'}</div></div>
                <div><div className="vs-k">Gasto total</div><div className="vs-v">{money(vh.gasto_total)}</div></div>
                <div><div className="vs-k">Ult. registro</div><div className="vs-v">{vh.ultimo_registro ? new Date(vh.ultimo_registro).toLocaleDateString('es-UY') : '-'}</div></div>
              </div>
              <div className="row" style={{ gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn ghost icon" data-tip="Editar" onClick={e => { e.stopPropagation(); setModal({ ...vh }); }}><Icon name="edit" size={16} /></button>
                <button className="btn ghost icon" data-tip="Eliminar" onClick={e => { e.stopPropagation(); del(vh); }}><Icon name="trash" size={16} /></button>
              </div>
            </div>
          ))}
        </div>}

      {modal && <VehiculoModal vehiculo={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function VehiculoModal({ vehiculo, onClose, onSave }) {
  const [f, setF] = useState(vehiculo); const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={f.id ? 'Editar vehiculo' : 'Nuevo vehiculo'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSave(f)} disabled={!f.nombre}><Icon name="check" size={16} />Guardar</button></>}>
      <div className="grid2">
        <Field label={<span className="flabel"><Icon name="truck" size={13} />Nombre / identificador</span>}><input value={f.nombre || ''} placeholder="Ej: Camioneta 1" onChange={e => set('nombre', e.target.value)} /></Field>
        <Field label="Patente"><input value={f.patente || ''} onChange={e => set('patente', e.target.value)} /></Field>
        <Field label="Tipo"><select value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="camioneta">Camioneta</option><option value="auto">Auto</option><option value="moto">Moto</option><option value="otro">Otro</option></select></Field>
        <Field label="Año"><input value={f.anio || ''} onChange={e => set('anio', e.target.value)} /></Field>
        <Field label="Marca"><input value={f.marca || ''} onChange={e => set('marca', e.target.value)} /></Field>
        <Field label="Modelo"><input value={f.modelo || ''} onChange={e => set('modelo', e.target.value)} /></Field>
        <Field label="Odometro (km)"><input value={f.odometro || ''} onChange={e => set('odometro', e.target.value)} /></Field>
      </div>
      <Field label="Notas"><textarea value={f.notas || ''} onChange={e => set('notas', e.target.value)} /></Field>
    </Modal>
  );
}

