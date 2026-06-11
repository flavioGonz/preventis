import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { PageHeader, Stat, Loading, Empty } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

function diasRestantes(fechaIso) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = new Date(fechaIso); d.setHours(0, 0, 0, 0);
  return Math.round((d - hoy) / 86400000);
}

export default function Inicio() {
  const [data, setData] = useState(null);
  const nav = useNavigate();
  useEffect(() => { api.get('/api/dashboard').then(setData); }, []);
  if (!data) return <Loading />;
  const { kpis, proximas, en_falla } = data;

  return (
    <div>
      <PageHeader icon="clipboard" title="Inicio" desc="Resumen general del servicio de mantenimiento" />

      <div className="stats">
        <Stat icon="users" label="Clientes" value={kpis.clientes} />
        <Stat icon="box" label="Equipos" value={kpis.equipos} />
        <Stat icon="calendar" label="Visitas este mes" value={kpis.visitas_mes} />
        <Stat icon="alert" label="Equipos en falla" value={kpis.en_falla} tone={kpis.en_falla ? 'danger' : 'ok'} />
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div>
          <div className="row" style={{ gap: 8, margin: '6px 0 12px' }}><Icon name="calendar" size={18} color="var(--brand-600)" /><h3>Proximas visitas</h3></div>
          {proximas.length === 0 ? <Empty icon="calendar" title="Sin clientes">No hay clientes cargados.</Empty> :
            <div className="list">
              {proximas.map(c => {
                const dias = diasRestantes(c.proxima);
                const vencida = dias < 0;
                const hoy = dias === 0;
                return (
                  <div key={c.id} className="card click pad-sm" onClick={() => nav('/clientes/' + c.id)}>
                    <div className="row between">
                      <div>
                        <div className="title">{c.nombre}</div>
                        <div className="muted" style={{ fontSize: 12.5 }}>
                          <span className="pill-freq" style={{ marginRight: 6 }}>{c.frecuencia}</span>
                          {c.ultima ? 'ult: ' + new Date(c.ultima).toLocaleDateString('es-UY') : 'sin visitas'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{new Date(c.proxima).toLocaleDateString('es-UY')}</div>
                        <span className={'badge ' + (vencida ? 'falla' : hoy ? 'warn' : 'gris')}>
                          {vencida ? 'vencida ' + Math.abs(dias) + 'd' : hoy ? 'hoy' : 'en ' + dias + 'd'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>}
        </div>

        <div>
          <div className="row" style={{ gap: 8, margin: '6px 0 12px' }}><Icon name="alert" size={18} color="var(--falla)" /><h3>Equipos en falla</h3></div>
          {en_falla.length === 0 ?
            <Empty icon="checkCircle" title="Todo en orden">No hay equipos en falla.</Empty> :
            <div className="list">
              {en_falla.map(e => (
                <div key={e.id} className="card click pad-sm" onClick={() => nav('/clientes/' + e.cliente_id)}>
                  <div className="row between">
                    <div className="row" style={{ gap: 10 }}>
                      <div className="ico" style={{ width: 36, height: 36, background: 'var(--falla-bg)', color: 'var(--falla)' }}><Icon name="alert" size={17} /></div>
                      <div>
                        <div className="title">{e.etiqueta || e.codigo_qr}</div>
                        <div className="muted" style={{ fontSize: 12.5 }}>{e.cliente}{e.sistema ? ' - ' + e.sistema : ''}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="badge falla"><span className="dot" />{e.ultimo_estado}</span>
                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{e.ultima_fecha ? new Date(e.ultima_fecha).toLocaleDateString('es-UY') : ''}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>}
        </div>
      </div>
    </div>
  );
}
