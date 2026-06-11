import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { PageHeader, Loading, Empty, estadoBadge, Field } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';

export default function EquipoDetalle() {
  const { id } = useParams();
  const [equipo, setEquipo] = useState(null);
  const [hist, setHist] = useState(null);

  useEffect(() => {
    api.get('/api/equipos/' + id).then(setEquipo);
    api.get('/api/equipos/' + id + '/historial').then(setHist);
  }, [id]);

  if (!equipo) return <Loading />;
  const datos = [
    ['Sistema', equipo.sistema], ['Tipo de elemento', equipo.tipo_elemento],
    ['Direccion', equipo.direccion], ['Grupo', equipo.grupo], ['Subgrupo', equipo.subgrupo],
    ['Modelo', equipo.modelo],
  ];

  return (
    <div>
      <Link to={'/clientes/' + equipo.cliente_id} className="backlink"><Icon name="chevronLeft" size={16} />{equipo.cliente}</Link>
      <div className="card eq-hero">
        <div className="eq-hero-ph">
          {(equipo.foto_estandar || equipo.foto_path)
            ? <img src={api.base + (equipo.foto_estandar || equipo.foto_path)} alt="" />
            : <Icon name="box" size={34} />}
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ttl" style={{ fontSize: 23 }}>{equipo.etiqueta || equipo.codigo_qr}</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{equipo.cliente}{equipo.sistema ? ' · ' + equipo.sistema : ''}{equipo.tipo_elemento ? ' · ' + equipo.tipo_elemento : ''}</div>
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            {equipo.ultimo_estado ? estadoBadge(equipo.ultimo_estado, equipo.ultima_falla) : <span className="badge gris"><span className="dot" />Sin pruebas</span>}
            {equipo.modelo && <span className="badge gris">{equipo.modelo}</span>}
            <span className="badge info"><Icon name="clock" size={11} />{equipo.ultima_fecha ? 'Ult. prueba ' + new Date(equipo.ultima_fecha).toLocaleDateString('es-UY') : 'Nunca probado'}</span>
          </div>
        </div>
        <div className="eq-hero-qr">
          <img src={api.fileUrl('/api/equipos/' + equipo.id + '/qr.png')} alt="QR" />
          <div className="mono subtle" style={{ fontSize: 11, textAlign: 'center', marginTop: 4 }}>{equipo.codigo_qr}</div>
        </div>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="sec-head"><span className="fc-ic"><Icon name="box" size={17} /></span><b>Datos del equipo</b></div>
          <div className="tablewrap"><table className="table"><tbody>
            {datos.map(([k, v]) => <tr key={k}><th style={{ width: 150 }}>{k}</th><td>{v || '-'}</td></tr>)}
            <tr><th>Ultima prueba</th><td>{equipo.ultima_fecha ? new Date(equipo.ultima_fecha).toLocaleDateString('es-UY') : 'nunca'}</td></tr>
          </tbody></table></div>
        </div>

        <div className="card">
          <CredencialEquipo equipoId={equipo.id} />
        </div>
      </div>

      <div className="sec-head" style={{ margin: '22px 0 14px' }}><span className="fc-ic"><Icon name="history" size={17} /></span><b>Historial de revisiones</b></div>
      {hist === null ? <Loading rows={2} /> :
        hist.length === 0 ? <Empty icon="clipboard" title="Sin pruebas">Este equipo todavia no fue probado.</Empty> :
          <div className="eq-tl">
            {hist.map(h => (
              <div key={h.id} className={'eq-tl-item' + (h.es_falla ? ' falla' : '')}>
              <div className="card pad-sm" style={{ margin: 0, flex: 1 }}>
                <div className="row between wrap" style={{ gap: 8 }}>
                  <div className="row" style={{ gap: 12 }}>
                    <div className="ico" style={{ width: 38, height: 38, background: h.es_falla ? 'var(--falla-bg)' : 'var(--ok-bg)', color: h.es_falla ? 'var(--falla)' : 'var(--ok)' }}>
                      <Icon name={h.es_falla ? 'alert' : 'check'} size={17} />
                    </div>
                    <div>
                      <div className="row" style={{ gap: 8 }}>{estadoBadge(h.estado, h.es_falla)}
                        <span className="mono muted" style={{ fontSize: 13 }}>{new Date(h.fecha).toLocaleDateString('es-UY')}</span></div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                        {h.tecnico ? 'Tecnico: ' + h.tecnico + ' - ' : ''}{h.origen === 'excel' ? 'carga Excel' : 'manual'}
                      </div>
                      {h.comentarios && <div style={{ fontSize: 13.5, marginTop: 4 }}>{h.comentarios}</div>}
                      {h.fotos && h.fotos.length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                        {h.fotos.map((p, i) => <a key={i} href={api.base + p} target="_blank" rel="noreferrer"><img className="thumb" style={{ width: 52, height: 52 }} src={api.base + p} /></a>)}
                      </div>}
                    </div>
                  </div>
                  {h.visita_id && <Link className="btn ghost sm" to={'/visitas/' + h.visita_id}>Ver visita<Icon name="arrowRight" size={14} /></Link>}
                </div>
              </div>
              </div>
            ))}
          </div>}
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
  return (
    <div>
      <div className="row between" style={{ marginBottom: (c && (c.tiene || edit)) ? 12 : 0 }}>
        <div className="row" style={{ gap: 8 }}><Icon name="settings" size={18} color="var(--brand-600)" /><b>Credenciales del dispositivo</b></div>
        {c && !edit && <button className="btn sec sm" onClick={() => setEdit(true)}><Icon name={c.tiene ? 'edit' : 'plus'} size={15} />{c.tiene ? 'Editar' : 'Agregar'}</button>}
      </div>
      {c === null ? <Loading rows={1} header={false} /> :
        !edit ? (c.tiene ?
          <div className="tablewrap"><table className="table"><tbody>
            <tr><th style={{ width: 150 }}>Usuario</th><td>{c.usuario || '-'}{c.usuario && <button className="btn ghost icon" onClick={() => copy(c.usuario)} data-tip="Copiar" aria-label="Copiar"><Icon name="clipboard" size={14} /></button>}</td></tr>
            <tr><th>Contrasena</th><td><span className="mono">{show ? (c.password || '-') : '********'}</span><button className="btn ghost icon" onClick={() => setShow(s => !s)} data-tip="Ver" aria-label="Ver"><Icon name={show ? 'x' : 'search'} size={14} /></button><button className="btn ghost icon" onClick={() => copy(c.password)} data-tip="Copiar" aria-label="Copiar"><Icon name="clipboard" size={14} /></button></td></tr>
            {c.url && <tr><th>URL / acceso</th><td><a href={c.url} target="_blank" rel="noreferrer">{c.url}</a></td></tr>}
            {c.notas && <tr><th>Notas</th><td>{c.notas}</td></tr>}
          </tbody></table></div>
          : <div className="muted" style={{ fontSize: 13 }}>Sin credenciales registradas para este dispositivo.</div>)
        : <div className="stack" style={{ gap: 10 }}>
          <div className="grid2">
            <Field label="Usuario"><input value={f.usuario} onChange={e => setF({ ...f, usuario: e.target.value })} /></Field>
            <Field label="Contrasena (vacio = no cambiar)"><input value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
          </div>
          <Field label="URL / acceso"><input value={f.url} placeholder="http://..." onChange={e => setF({ ...f, url: e.target.value })} /></Field>
          <Field label="Notas"><textarea value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} /></Field>
          <div className="row" style={{ gap: 8 }}><button className="btn sec" onClick={() => { setEdit(false); load(); }}>Cancelar</button><button className="btn" onClick={save}><Icon name="check" size={16} />Guardar</button></div>
        </div>}
    </div>
  );
}
