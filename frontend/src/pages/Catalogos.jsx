import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';
import { Loading, PageHeader, Modal, Field, Empty } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import { applyBranding } from '../branding.js';
import Seguridad from './Seguridad.jsx';
import ChatbotPanel from './ChatbotPanel.jsx';

const CFG_DESC = {
  tecnicos: 'Personas que realizan las visitas de mantenimiento.',
  sistemas: 'Tipos de sistema de los equipos (CCTV, incendio, etc.).',
  tipos_elemento: 'Categorias de elementos a controlar.',
  estados_equipo: 'Estados posibles de un equipo y cuales cuentan como falla.',
  seguridad: 'Tu segundo factor de autenticacion (2FA).',
  usuarios: 'Cuentas con acceso a la aplicacion.',
  online: 'Usuarios conectados en este momento.',
  roles: 'Roles del sistema y su alcance.',
  permisos: 'Que puede hacer cada rol.',
  proveedores: 'Proveedores y terceros.',
  equipos_estandar: 'Modelos para autocompletar al cargar equipos.',
  branding: 'Logo, nombre y colores de la app y los informes.',
  chatbot: 'Bot de WhatsApp: conexion, numeros autorizados y comandos.',
  correo: 'Servidor SMTP para enviar correos desde la app.',
  alertas: 'Que eventos avisar y por que canal (email, WhatsApp, campana).',
  auditoria: 'Registro de cambios y acciones del sistema.',
  respaldos: 'Copias de seguridad de la base y los archivos.',
  actualizar: 'Version instalada y actualizacion del sistema.',
};

export default function Catalogos({ user }) {
  const isAdmin = user?.rol === 'admin';
  const [tab, setTab] = useState('tecnicos');
  const adm = (arr) => isAdmin ? arr : [];
  const GROUPS = [
    { label: 'General', items: [['tecnicos', 'Tecnicos', 'users'], ['sistemas', 'Sistemas', 'box'], ...adm([['proveedores', 'Proveedores', 'pin']])] },
    { label: 'Dispositivos', items: [['tipos_elemento', 'Tipos de elementos', 'list'], ['estados_equipo', 'Estado de equipos', 'alert'], ...adm([['equipos_estandar', 'Equipos estandar', 'camera']])] },
    { label: 'Mi cuenta', items: [['seguridad', 'Seguridad (2FA)', 'checkCircle']] },
    { label: 'Usuarios', items: adm([['usuarios', 'Usuarios', 'users'], ['online', 'En linea', 'pin'], ['roles', 'Roles', 'star'], ['permisos', 'Permisos', 'settings']]) },
    { label: 'Sistema', items: adm([['branding', 'Branding', 'star'], ['chatbot', 'Chatbot', 'whatsapp'], ['correo', 'Correo', 'mail'], ['alertas', 'Alertas', 'bell'], ['auditoria', 'Auditoria', 'history'], ['respaldos', 'Respaldos', 'box'], ['actualizar', 'Actualizaciones', 'download']]) },
  ].filter(g => g.items.length);

  return (
    <div>
      <PageHeader icon="settings" title="Configuracion" desc="Administra catalogos, usuarios, roles y permisos del sistema." />
      <div className="cfg">
        <nav className="cfg-nav">
          {GROUPS.map(g => (
            <div key={g.label}>
              <div className="cfg-group">{g.label}</div>
              {g.items.map(([k, l, ic]) => (
                <button key={k} className={'cfg-item' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}><Icon name={ic} size={16} />{l}</button>
              ))}
            </div>
          ))}
        </nav>
        <div className="cfg-body">
          {(() => { const a = GROUPS.flatMap(g => g.items).find(it => it[0] === tab); return a ? <div className="cfg-head"><span className="cfg-head-ic"><Icon name={a[2]} size={19} /></span><div><h2>{a[1]}</h2>{CFG_DESC[tab] ? <p>{CFG_DESC[tab]}</p> : null}</div></div> : null; })()}
          {tab === 'tecnicos' && <CrudList tabla="tecnicos" campos={[['nombre', 'Nombre'], ['telefono', 'Telefono']]} avatar />}
          {tab === 'sistemas' && <CrudList tabla="sistemas" campos={[['nombre', 'Nombre']]} icon="box" />}
          {tab === 'tipos_elemento' && <CrudList tabla="tipos_elemento" campos={[['nombre', 'Nombre'], ['icono', 'Icono', 'icon']]} icon="list" />}
          {tab === 'estados_equipo' && <CrudList tabla="estados_equipo" campos={[['nombre', 'Nombre'], ['es_falla', 'Cuenta como falla', 'bool'], ['icono', 'Icono', 'icon']]} icon="alert" />}
          {tab === 'seguridad' && <Seguridad user={user} embedded />}
          {tab === 'online' && isAdmin && <UsuariosOnline />}
          {tab === 'usuarios' && isAdmin && <Usuarios currentUser={user} />}
          {tab === 'equipos_estandar' && isAdmin && <EquiposEstandar />}
          {tab === 'proveedores' && isAdmin && <Proveedores />}
          {tab === 'roles' && isAdmin && <RolesView />}
          {tab === 'permisos' && isAdmin && <Permisos />}
          {tab === 'branding' && isAdmin && <Branding />}
          {tab === 'chatbot' && isAdmin && <ChatbotPanel />}
          {tab === 'correo' && isAdmin && <Correo />}
          {tab === 'alertas' && isAdmin && <Alertas />}
          {tab === 'auditoria' && isAdmin && <Auditoria />}
          {tab === 'respaldos' && isAdmin && <Respaldos />}
          {tab === 'actualizar' && isAdmin && <Actualizaciones />}
        </div>
      </div>
    </div>
  );
}

const ICONOS = ['box', 'camera', 'eye', 'pin', 'alert', 'wrench', 'clock', 'bell', 'qr', 'signature', 'file', 'list', 'star', 'phone', 'truck', 'ticket', 'history', 'check', 'checkCircle', 'x', 'paperclip', 'mail', 'line', 'curve', 'move', 'whatsapp'];

function CrudList({ tabla, campos, avatar, icon }) {
  const [items, setItems] = useState(null);
  const empty = Object.fromEntries(campos.map(c => [c[0], c[2] === 'bool' ? false : '']));
  const [nuevo, setNuevo] = useState(empty);

  const load = () => api.get('/api/' + tabla).then(setItems);
  useEffect(() => { load(); setNuevo(empty); }, [tabla]);

  const add = async () => {
    try { await api.post('/api/' + tabla, nuevo); setNuevo(empty); toast.ok('Agregado'); load(); }
    catch (e) { toast.err(e.message); }
  };
  const update = async (it, k, v) => {
    try { await api.put('/api/' + tabla + '/' + it.id, { ...it, [k]: v }); load(); }
    catch (e) { toast.err(e.message); }
  };
  const del = async (it) => {
    if (!confirm('Eliminar este registro?')) return;
    try { await api.del('/api/' + tabla + '/' + it.id); toast.ok('Eliminado'); load(); }
    catch (e) { toast.err('No se puede eliminar (en uso)'); }
  };
  const subirAvatar = async (it, e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    try { await api.upload('/api/' + tabla + '/' + it.id + '/avatar', fd); toast.ok('Avatar actualizado'); load(); } catch (err) { toast.err(err.message); }
    e.target.value = '';
  };

  if (items === null) return <Loading rows={2} />;
  return (
    <div className="card pad-sm">
      <div className="tablewrap">
        <table className="table">
          <thead><tr>{(avatar || icon) && <th style={{ width: 54 }}>{avatar ? 'Avatar' : ''}</th>}{campos.map(c => <th key={c[0]}>{c[1]}</th>)}<th></th></tr></thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id}>
                {avatar && <td><label className="cat-avatar" data-tip="Subir avatar" aria-label="Avatar">{it.avatar_path ? <img src={api.base + it.avatar_path} alt="" /> : <Icon name="users" size={16} />}<input type="file" accept="image/*" hidden onChange={e => subirAvatar(it, e)} /></label></td>}
                {!avatar && icon && <td><span className="ico" style={{ width: 38, height: 38, background: 'var(--brand-soft)', color: 'var(--brand-600)' }}><Icon name={it.icono || icon} size={17} /></span></td>}
                {campos.map(c => (
                  <td key={c[0]}>
                    {c[2] === 'bool'
                      ? <input type="checkbox" style={{ width: 'auto' }} checked={!!it[c[0]]} onChange={e => update(it, c[0], e.target.checked)} />
                      : c[2] === 'icon'
                        ? <div className="row" style={{ gap: 8 }}><span className="ico" style={{ width: 34, height: 34, background: 'var(--brand-soft)', color: 'var(--brand-600)' }}><Icon name={it[c[0]] || 'box'} size={16} /></span><select style={{ maxWidth: 150 }} value={it[c[0]] || ''} onChange={e => update(it, c[0], e.target.value)}><option value="">(sin icono)</option>{ICONOS.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                        : <input defaultValue={it[c[0]] || ''} onBlur={e => e.target.value !== (it[c[0]] || '') && update(it, c[0], e.target.value)} />}
                  </td>
                ))}
                <td style={{ textAlign: 'right' }}><button className="btn ghost icon" onClick={() => del(it)}><Icon name="trash" size={16} /></button></td>
              </tr>
            ))}
            <tr>
              {(avatar || icon) && <td>{!avatar && icon && <span className="ico" style={{ width: 38, height: 38, background: 'var(--surface-2)', color: 'var(--subtle)' }}><Icon name="plus" size={16} /></span>}</td>}
              {campos.map(c => (
                <td key={c[0]}>
                  {c[2] === 'bool'
                    ? <input type="checkbox" style={{ width: 'auto' }} checked={!!nuevo[c[0]]} onChange={e => setNuevo({ ...nuevo, [c[0]]: e.target.checked })} />
                    : c[2] === 'icon'
                      ? <select value={nuevo[c[0]] || ''} onChange={e => setNuevo({ ...nuevo, [c[0]]: e.target.value })}><option value="">(icono)</option>{ICONOS.map(i => <option key={i} value={i}>{i}</option>)}</select>
                      : <input placeholder={'Nuevo ' + c[1].toLowerCase()} value={nuevo[c[0]]} onChange={e => setNuevo({ ...nuevo, [c[0]]: e.target.value })} />}
                </td>
              ))}
              <td style={{ textAlign: 'right' }}><button className="btn sm" onClick={add}><Icon name="plus" size={15} />Agregar</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function hace(seg) { if (seg == null) return ''; if (seg < 60) return 'hace ' + seg + 's'; const m = Math.floor(seg / 60); return 'hace ' + m + ' min'; }
function UsuariosOnline() {
  const [rows, setRows] = useState(null);
  const cargar = () => api.get('/api/usuarios/online').then(setRows).catch(() => setRows([]));
  useEffect(() => { cargar(); const t = setInterval(cargar, 15000); return () => clearInterval(t); }, []);
  if (rows === null) return <Loading rows={3} />;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="muted">Usuarios activos en los últimos 2 minutos</span>
        <span className="badge ok"><span className="dot" />{rows.length} en línea</span>
      </div>
      {rows.length === 0 ? <Empty icon="users" title="Nadie conectado">No hay usuarios activos en este momento.</Empty> :
        <div className="wa-wrap"><div className="wa-list">
          {rows.map(u => (
            <div key={u.id} className="wa-row" style={{ cursor: 'default' }}>
              <div className="wa-av ring-ok">{u.avatar_path ? <img src={api.base + u.avatar_path} alt="" /> : (u.nombre || u.username || '?').slice(0, 1).toUpperCase()}<span className="wa-dot" style={{ background: 'var(--ok)' }} /></div>
              <div className="wa-main">
                <div className="wa-top"><span className="wa-title">{u.nombre || u.username}</span><span className="wa-time ac-ok">{hace(u.hace_seg)}</span></div>
                <div className="wa-bot"><span className="wa-sub"><Icon name="users" size={13} />@{u.username} · {u.rol}</span></div>
              </div>
            </div>
          ))}
        </div></div>}
    </div>
  );
}

function Usuarios({ currentUser }) {
  const [items, setItems] = useState(null);
  const [modal, setModal] = useState(null);
  const load = () => api.get('/api/usuarios').then(setItems);
  useEffect(() => { load(); }, []);

  const save = async (f) => {
    try {
      if (f.id) await api.put('/api/usuarios/' + f.id, f);
      else await api.post('/api/usuarios', f);
      setModal(null); toast.ok('Usuario guardado'); load();
    } catch (e) { toast.err(e.message); }
  };
  const del = async (u) => {
    if (!confirm('Eliminar el usuario ' + u.username + '?')) return;
    try { await api.del('/api/usuarios/' + u.id); toast.ok('Eliminado'); load(); }
    catch (e) { toast.err(e.message); }
  };
  const subirAvatarU = async (u, e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    try { await api.upload('/api/usuarios/' + u.id + '/avatar', fd); toast.ok('Avatar actualizado'); load(); } catch (err) { toast.err(err.message); }
    e.target.value = '';
  };
  const resetMFA = async (u) => {
    if (!confirm('¿Restablecer la verificación en dos pasos de ' + u.username + '?\nDeberá configurarla de nuevo en su próximo ingreso. No verás su código; solo se quita el segundo factor. Queda registrado en auditoría.')) return;
    try { await api.post('/api/usuarios/' + u.id + '/reset-2fa', {}); toast.ok('2FA restablecido para ' + u.username); }
    catch (e) { toast.err(e.message); }
  };

  if (items === null) return <Loading rows={2} />;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="muted">Usuarios con acceso a la aplicacion</span>
        <button className="btn sm" onClick={() => setModal({ username: '', nombre: '', rol: 'tecnico', password: '' })}><Icon name="plus" size={15} />Nuevo usuario</button>
      </div>
      <div className="card pad-sm">
        <div className="tablewrap">
          <table className="table">
            <thead><tr><th>Avatar</th><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Activo</th><th></th></tr></thead>
            <tbody>
              {items.map(u => (
                <tr key={u.id}>
                  <td><label className="cat-avatar" data-tip="Subir avatar" aria-label="Avatar">{u.avatar_path ? <img src={api.base + u.avatar_path} alt="" /> : <Icon name="users" size={16} />}<input type="file" accept="image/*" hidden onChange={e => subirAvatarU(u, e)} /></label></td>
                  <td><b>{u.username}</b></td>
                  <td>{u.nombre || '-'}</td>
                  <td><span className={'badge ' + (u.rol === 'admin' ? 'info' : 'gris')}>{u.rol}</span></td>
                  <td>{u.activo ? <span className="badge ok"><span className="dot" />si</span> : <span className="badge gris">no</span>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn ghost icon" data-tip="Editar" aria-label="Editar" onClick={() => setModal({ ...u, password: '' })}><Icon name="edit" size={16} /></button>
                    <button className="btn ghost icon" data-tip="Restablecer 2FA" aria-label="Restablecer 2FA" onClick={() => resetMFA(u)}><Icon name="history" size={16} /></button>
                    {u.id !== currentUser.id && <button className="btn ghost icon" data-tip="Eliminar" aria-label="Eliminar" onClick={() => del(u)}><Icon name="trash" size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <UsuarioModal usuario={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function UsuarioModal({ usuario, onClose, onSave }) {
  const [f, setF] = useState(usuario);
  const set = (k, v) => setF({ ...f, [k]: v });
  const editing = !!f.id;
  return (
    <Modal title={editing ? 'Editar usuario' : 'Nuevo usuario'} subtitle="Acceso a la aplicacion" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn" onClick={() => onSave(f)} disabled={!f.username || (!editing && !f.password)}><Icon name="check" size={16} />Guardar</button>
      </>}>
      <div className="grid2">
        <Field label="Usuario"><input value={f.username} disabled={editing} onChange={e => set('username', e.target.value)} /></Field>
        <Field label="Nombre"><input value={f.nombre || ''} onChange={e => set('nombre', e.target.value)} /></Field>
        <Field label="Rol">
          <select value={f.rol} onChange={e => set('rol', e.target.value)}>
            <option value="tecnico">tecnico</option>
            <option value="admin">admin</option>
          </select>
        </Field>
        <Field label={editing ? 'Nueva contrasena (opcional)' : 'Contrasena'}>
          <input type="password" value={f.password || ''} placeholder={editing ? 'dejar vacio para no cambiar' : ''} onChange={e => set('password', e.target.value)} />
        </Field>
      </div>
      {editing && <label className="row" style={{ gap: 7, fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={f.activo !== false} onChange={e => set('activo', e.target.checked)} />
        Usuario activo
      </label>}
    </Modal>
  );
}


function EquiposEstandar() {
  const [items, setItems] = useState(null);
  const [modal, setModal] = useState(null);
  const [sistemas, setSistemas] = useState([]);
  const load = () => api.get('/api/equipos_estandar').then(setItems);
  useEffect(() => { load(); api.get('/api/sistemas').then(setSistemas).catch(() => {}); }, []);
  const save = async (f) => { try { if (f.id) await api.put('/api/equipos_estandar/' + f.id, f); else await api.post('/api/equipos_estandar', f); setModal(null); toast.ok('Guardado'); load(); } catch (e) { toast.err(e.message); } };
  const del = async (it) => { if (!confirm('Eliminar?')) return; try { await api.del('/api/equipos_estandar/' + it.id); toast.ok('Eliminado'); load(); } catch (e) { toast.err(e.message); } };
  const foto = async (e, it) => { const f = e.target.files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); try { await api.upload('/api/equipos_estandar/' + it.id + '/foto', fd); toast.ok('Foto actualizada'); load(); } catch (err) { toast.err(err.message); } e.target.value = ''; };
  if (items === null) return <Loading rows={2} />;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="muted">Modelos estandar de dispositivos con foto de referencia</span>
        <button className="btn sm" onClick={() => setModal({ nombre: '', tipo: '', marca: '', modelo: '', sistema_id: '' })}><Icon name="plus" size={15} />Nuevo</button>
      </div>
      {items.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Sin equipos estandar. Agrega modelos de referencia.</div> :
        <div className="estandar-grid">
          {items.map(it => (
            <div key={it.id} className="card pad-sm" style={{ margin: 0 }}>
              <label style={{ cursor: 'pointer', display: 'block' }} title="Cambiar foto">
                {it.foto_path ? <img src={api.base + it.foto_path} className="est-foto" /> : <div className="est-foto placeholder"><Icon name="camera" size={22} /></div>}
                <input type="file" accept="image/*" hidden onChange={e => foto(e, it)} />
              </label>
              <div className="title" style={{ marginTop: 8 }}>{it.nombre}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{[it.tipo, it.marca, it.modelo].filter(Boolean).join(' - ') || '-'}</div>
              {it.sistema && <span className="badge info" style={{ marginTop: 6 }}><Icon name="box" size={11} />{it.sistema}</span>}
              <div className="row" style={{ gap: 4, marginTop: 6 }}>
                <button className="btn ghost sm" onClick={() => setModal({ ...it })}><Icon name="edit" size={14} />Editar</button>
                <button className="btn ghost sm" onClick={() => del(it)}><Icon name="trash" size={14} /></button>
              </div>
            </div>
          ))}
        </div>}
      {modal && <EstModal it={modal} sistemas={sistemas} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}
function EstModal({ it, sistemas = [], onClose, onSave }) {
  const [f, setF] = useState(it); const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={f.id ? 'Editar modelo' : 'Nuevo modelo'} subtitle="La foto se sube luego desde la tarjeta" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSave(f)} disabled={!f.nombre}><Icon name="check" size={16} />Guardar</button></>}>
      <div className="grid2">
        <Field label="Nombre"><input value={f.nombre || ''} onChange={e => set('nombre', e.target.value)} /></Field>
        <Field label="Sistema (grupo)"><select value={f.sistema_id || ''} onChange={e => set('sistema_id', e.target.value)}><option value="">- Sin sistema -</option>{sistemas.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label="Tipo"><input value={f.tipo || ''} onChange={e => set('tipo', e.target.value)} /></Field>
        <Field label="Marca"><input value={f.marca || ''} onChange={e => set('marca', e.target.value)} /></Field>
        <Field label="Modelo"><input value={f.modelo || ''} onChange={e => set('modelo', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function Auditoria() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get('/api/auditoria').then(setItems); }, []);
  if (items === null) return <Loading rows={3} />;
  return (
    <div className="card pad-sm">
      <div className="tablewrap"><table className="table">
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Accion</th><th>Ruta</th><th>Estado</th></tr></thead>
        <tbody>{items.map(a => (
          <tr key={a.id}>
            <td className="mono" style={{ whiteSpace: 'nowrap' }}>{new Date(a.ts).toLocaleString('es-UY')}</td>
            <td>{a.usuario || '-'}</td>
            <td><span className={'badge ' + (a.rol === 'admin' ? 'info' : 'gris')}>{a.rol || '-'}</span></td>
            <td><b>{a.metodo}</b></td>
            <td className="mono" style={{ fontSize: 12 }}>{a.ruta}</td>
            <td><span className={'badge ' + (a.status < 300 ? 'ok' : 'falla')}>{a.status}</span></td>
          </tr>
        ))}</tbody>
      </table></div>
      {items.length === 0 && <div className="muted" style={{ fontSize: 13, padding: 12 }}>Sin registros aun.</div>}
    </div>
  );
}

function Respaldos() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/api/respaldos').then(setItems);
  useEffect(() => { load(); }, []);
  const run = async () => { setBusy(true); try { await api.post('/api/respaldos/run', {}); toast.ok('Respaldo iniciado'); setTimeout(load, 2500); } catch (e) { toast.err(e.message); } setBusy(false); };
  const fmt = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(0) + ' KB';
  if (items === null) return <Loading rows={2} />;
  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 12, gap: 8 }}>
        <span className="muted">Respaldos automaticos diarios (02:30) en el servidor. Retencion 14 dias.</span>
        <button className="btn sm" onClick={run} disabled={busy}><Icon name="box" size={15} />{busy ? 'Ejecutando...' : 'Respaldar ahora'}</button>
      </div>
      <div className="card pad-sm">
        <div className="tablewrap"><table className="table">
          <thead><tr><th>Archivo</th><th>Tamano</th><th>Fecha</th><th></th></tr></thead>
          <tbody>{items.map(f => (<tr key={f.name}><td className="mono" style={{ fontSize: 12.5 }}>{f.name}</td><td>{fmt(f.size)}</td><td className="mono">{new Date(f.ts).toLocaleString('es-UY')}</td><td style={{ textAlign: 'right' }}><a className="btn ghost icon" data-tip="Descargar" aria-label="Descargar" href={api.fileUrl('/api/respaldos/download?name=' + encodeURIComponent(f.name))}><Icon name="download" size={16} /></a></td></tr>))}</tbody>
        </table></div>
        {items.length === 0 && <div className="muted" style={{ fontSize: 13, padding: 12 }}>Aun no hay respaldos.</div>}
      </div>
    </div>
  );
}


function Proveedores() {
  const [items, setItems] = useState(null);
  const [modal, setModal] = useState(null);
  const load = () => api.get('/api/proveedores').then(setItems);
  useEffect(() => { load(); }, []);
  const save = async (f) => { try { if (f.id) await api.put('/api/proveedores/' + f.id, f); else await api.post('/api/proveedores', f); setModal(null); toast.ok('Proveedor guardado'); load(); } catch (e) { toast.err(e.message); } };
  const del = async (p) => { if (!confirm('Eliminar proveedor?')) return; try { await api.del('/api/proveedores/' + p.id); toast.ok('Eliminado'); load(); } catch (e) { toast.err(e.message); } };
  if (items === null) return <Loading rows={2} />;
  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 12, gap: 10 }}>
        <div className="muted" style={{ fontSize: 13 }}>Proveedores que se muestran en el mapa. La direccion se geolocaliza automaticamente.</div>
        <button className="btn sm" onClick={() => setModal({ nombre: '', rubro: '', direccion: '', telefono: '' })}><Icon name="plus" size={15} />Nuevo</button>
      </div>
      {items.length === 0 ? <Empty icon="pin" title="Sin proveedores">Agrega proveedores para verlos en el mapa.</Empty> :
        <div className="card pad-sm"><div className="tablewrap"><table className="table">
          <thead><tr><th>Nombre</th><th>Rubro</th><th>Direccion</th><th>Telefono</th><th>Mapa</th><th></th></tr></thead>
          <tbody>{items.map(p => (
            <tr key={p.id}>
              <td><b>{p.nombre}</b></td><td>{p.rubro || '-'}</td><td>{p.direccion || '-'}</td><td>{p.telefono || '-'}</td>
              <td>{p.lat != null ? <span className="badge ok"><span className="dot" />ubicado</span> : <span className="badge gris">sin ubicar</span>}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn ghost icon" data-tip="Editar" aria-label="Editar" onClick={() => setModal({ ...p })}><Icon name="edit" size={16} /></button>
                <button className="btn ghost icon" data-tip="Eliminar" aria-label="Eliminar" onClick={() => del(p)}><Icon name="trash" size={16} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table></div></div>}
      {modal && <ProveedorModal prov={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function ProveedorModal({ prov, onClose, onSave }) {
  const [f, setF] = useState(prov);
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={f.id ? 'Editar proveedor' : 'Nuevo proveedor'} subtitle="La direccion se geolocaliza para el mapa" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={() => onSave(f)} disabled={!f.nombre}><Icon name="check" size={16} />Guardar</button></>}>
      <Field label="Nombre"><input value={f.nombre || ''} onChange={e => set('nombre', e.target.value)} /></Field>
      <div className="grid2">
        <Field label="Rubro"><input value={f.rubro || ''} placeholder="Ej: Extintores" onChange={e => set('rubro', e.target.value)} /></Field>
        <Field label="Telefono"><input value={f.telefono || ''} onChange={e => set('telefono', e.target.value)} /></Field>
      </div>
      <Field label="Direccion"><input value={f.direccion || ''} placeholder="Calle, numero, ciudad" onChange={e => set('direccion', e.target.value)} /></Field>
    </Modal>
  );
}


const PERMISOS = [
  ['editar_clientes', 'Crear y editar clientes'],
  ['editar_equipos', 'Crear y editar equipos'],
  ['moderar_visitas', 'Iniciar, cerrar y reabrir visitas'],
  ['ver_credenciales', 'Ver credenciales (clientes y equipos)'],
  ['ver_reportes', 'Acceder a reportes'],
  ['editar_config', 'Acceder a Configuracion'],
  ['gestionar_usuarios', 'Gestionar usuarios y roles'],
];

function Permisos() {
  const [roles, setRoles] = useState(null);
  const load = () => api.get('/api/roles').then(setRoles);
  useEffect(() => { load(); }, []);
  const toggle = (rol, key) => setRoles(rs => rs.map(r => r.rol === rol ? { ...r, permisos: { ...r.permisos, [key]: !r.permisos?.[key] } } : r));
  const guardar = async (r) => { try { await api.put('/api/roles/' + r.rol, { permisos: r.permisos || {} }); toast.ok('Permisos de ' + r.rol + ' guardados'); } catch (e) { toast.err(e.message); } };
  if (roles === null) return <Loading rows={2} />;
  return (
    <div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Define que puede hacer cada rol. Los administradores siempre tienen acceso total.</div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        {roles.map(r => (
          <div key={r.rol} className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="row" style={{ gap: 8 }}><span className="fc-ic"><Icon name={r.rol === 'admin' ? 'star' : 'users'} size={16} /></span><b style={{ textTransform: 'capitalize' }}>{r.rol}</b></div>
              <button className="btn sm" onClick={() => guardar(r)}><Icon name="check" size={15} />Guardar</button>
            </div>
            <div className="stack" style={{ gap: 9 }}>
              {PERMISOS.map(([k, l]) => (
                <label key={k} className="row" style={{ gap: 9, fontSize: 13.5, cursor: r.rol === 'admin' ? 'not-allowed' : 'pointer', opacity: r.rol === 'admin' ? .6 : 1 }}>
                  <input type="checkbox" style={{ width: 'auto' }} disabled={r.rol === 'admin'} checked={r.rol === 'admin' ? true : !!r.permisos?.[k]} onChange={() => toggle(r.rol, k)} />
                  {l}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function RolesView() {
  const [roles, setRoles] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  useEffect(() => { api.get('/api/roles').then(setRoles).catch(() => setRoles([])); api.get('/api/usuarios').then(setUsuarios).catch(() => {}); }, []);
  const desc = { admin: 'Acceso total al sistema y a la configuracion.', tecnico: 'Operativo: visitas, equipos y credenciales.' };
  if (roles === null) return <Loading rows={2} />;
  return (
    <div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Roles disponibles. Los permisos de cada rol se editan en la pestaña Permisos.</div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        {roles.map(r => {
          const n = usuarios.filter(u => u.rol === r.rol).length;
          const activos = Object.values(r.permisos || {}).filter(Boolean).length;
          return (
            <div key={r.rol} className="card">
              <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                <span className="fc-ic"><Icon name={r.rol === 'admin' ? 'star' : 'users'} size={17} /></span>
                <div><b style={{ textTransform: 'capitalize', fontSize: 16 }}>{r.rol}</b><div className="subtle" style={{ fontSize: 12.5 }}>{desc[r.rol] || ''}</div></div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="badge gris"><Icon name="users" size={12} />{n} usuario(s)</span>
                <span className="badge info"><Icon name="settings" size={12} />{r.rol === 'admin' ? 'todos' : activos} permiso(s)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function Chatbot() {
  const [cfg, setCfg] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/api/chatbot/config').then(setCfg).catch(() => setCfg({ url: '', api_key: '', session: '', numero_prueba: '', notificar: false })); }, []);
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }));
  const guardar = async () => { setSaving(true); try { await api.put('/api/chatbot/config', cfg); toast.ok('Configuracion guardada'); } catch (e) { toast.err(e.message); } setSaving(false); };
  const [result, setResult] = useState(null);
  const probar = async () => {
    setTesting(true); setResult(null);
    try { await api.put('/api/chatbot/config', cfg); const r = await api.post('/api/chatbot/test', {}); toast.ok('Mensaje enviado (' + (r.tipo || 'ok') + ')'); setResult({ ok: true, tipo: r.tipo }); }
    catch (e) { toast.err(e.message); setResult({ ok: false, msg: e.message }); }
    setTesting(false);
  };
  if (cfg === null) return <Loading rows={2} />;
  return (
    <div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Conecta Preventis con tu instancia de <b>openwa</b> (WhatsApp) ya desplegada. Se usa para enviar mensajes y notificaciones.</div>
      <div className="card" style={{ maxWidth: 640 }}>
        <Field label={<span className="flabel"><Icon name="settings" size={13} />URL de openwa</span>}><input value={cfg.url || ''} placeholder="http://192.168.99.x:8002" onChange={e => set('url', e.target.value)} /></Field>
        <Field label={<span className="flabel"><Icon name="list" size={13} />Tipo de API</span>}>
          <select value={cfg.api_tipo || 'auto'} onChange={e => set('api_tipo', e.target.value)}>
            <option value="auto">Auto-detectar</option>
            <option value="openwa">OpenWA (panel con API Keys, X-API-Key)</option>
            <option value="wa-automate">wa-automate (openwa EASY API: /sendText)</option>
            <option value="wppconnect">WPPConnect (/api/:session/send-message)</option>
            <option value="evolution">Evolution API (/message/sendText/:session)</option>
          </select>
        </Field>
        <div className="grid2">
          <Field label={<span className="flabel"><Icon name="qr" size={13} />API key</span>}><input value={cfg.api_key || ''} placeholder="api key (opcional)" onChange={e => set('api_key', e.target.value)} /></Field>
          <Field label={<span className="flabel"><Icon name="users" size={13} />Sesion</span>}><input value={cfg.session || ''} placeholder="omniaccess o el Session ID" onChange={e => set('session', e.target.value)} /></Field>
        </div>
        <div className="grid2">
          <Field label={<span className="flabel"><Icon name="phone" size={13} />Numero de prueba</span>}><input value={cfg.numero_prueba || ''} placeholder="598..." onChange={e => set('numero_prueba', e.target.value)} /></Field>
          <Field label={<span className="flabel"><Icon name="bell" size={13} />Numero para alertas</span>}><input value={cfg.numero_alertas || ''} placeholder="598... o grupo@g.us" onChange={e => set('numero_alertas', e.target.value)} /></Field>
        </div>
        <label className="row" style={{ gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={!!cfg.notificar} onChange={e => set('notificar', e.target.checked)} />
          Notificar eventos (visitas, fallas, tickets) por WhatsApp
        </label>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={guardar} disabled={saving}><Icon name="check" size={16} />{saving ? 'Guardando...' : 'Guardar'}</button>
          <button className="btn sec" onClick={probar} disabled={testing || !cfg.url}><Icon name="mail" size={15} />{testing ? 'Enviando...' : 'Enviar mensaje de prueba'}</button>
        </div>
        {result && <div className={'badge ' + (result.ok ? 'ok' : 'falla')} style={{ marginTop: 12 }}><span className="dot" />{result.ok ? 'Conectado via ' + result.tipo : result.msg}</div>}
        <div className="cred-box" style={{ marginTop: 16 }}>
          <div className="row" style={{ gap: 7, marginBottom: 6 }}><Icon name="whatsapp" size={15} color="var(--ok)" /><b style={{ fontSize: 13.5 }}>Comandos de recepcion</b></div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Configura este webhook en el panel OpenWA (Webhooks → evento <b>message.received</b>):</div>
          <code className="mono" style={{ fontSize: 12, display: 'block', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', marginBottom: 10 }}>{location.origin}/api/chatbot/webhook</code>
          <div style={{ fontSize: 12.5 }} className="muted">El bot responde a: <b>ayuda</b>, <b>estado</b>, <b>visitas</b>, <b>fallas</b>, <b>tickets</b>. Todo lo enviado y recibido queda registrado en Auditoria.</div>
        </div>
      </div>
    </div>
  );
}

function Branding() {
  const [b, setB] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/api/branding').then(setB); }, []);
  if (!b) return <Loading />;
  const set = (k, v) => setB({ ...b, [k]: v });

  const subir = async (campo, file) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file); fd.append('campo', campo);
    try { const next = await api.upload('/api/branding/logo', fd); setB(next); applyBranding(next); toast.ok('Imagen actualizada'); }
    catch (e) { toast.err(e.message); }
  };
  const guardar = async () => {
    setSaving(true);
    try { const next = await api.put('/api/branding', b); setB(next); applyBranding(next); toast.ok('Branding guardado'); }
    catch (e) { toast.err(e.message); }
    setSaving(false);
  };

  const ImgUp = ({ campo, label, hint, alto = 56 }) => (
    <div className="brd-img">
      <div className="brd-prev" style={{ height: alto + 16 }}>
        {b[campo] ? <img src={api.base + b[campo]} alt="" style={{ maxHeight: alto }} /> : <span className="muted" style={{ fontSize: 12 }}>Sin imagen</span>}
      </div>
      <div>
        <b style={{ fontSize: 13 }}>{label}</b>
        <p className="muted" style={{ fontSize: 11.5, margin: '2px 0 8px' }}>{hint}</p>
        <label className="btn sec sm" style={{ cursor: 'pointer' }}><Icon name="upload" size={14} />Subir<input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={e => subir(campo, e.target.files[0])} /></label>
      </div>
    </div>
  );

  return (
    <div className="brd">
      <div className="brd-head">
        <div><h3>Branding</h3><p className="muted" style={{ fontSize: 13 }}>Personaliza la identidad visual de la aplicacion, la PWA y los reportes.</p></div>
        <button className="btn" onClick={guardar} disabled={saving}><Icon name="save" size={16} />{saving ? 'Guardando...' : 'Guardar cambios'}</button>
      </div>

      <div className="brd-sec">
        <div className="brd-sec-h"><Icon name="camera" size={16} />Logos</div>
        <div className="brd-grid">
          <ImgUp campo="logo_path" label="Logo de la aplicacion" hint="Se muestra en la barra lateral y la cabecera. PNG/SVG con fondo transparente." />
          <ImgUp campo="pdf_logo_path" label="Logo para reportes (PDF)" hint="Aparece en la portada y sello del informe. Si esta vacio usa el logo de la app." />
        </div>
      </div>

      <div className="brd-sec">
        <div className="brd-sec-h"><Icon name="qr" size={16} />PWA (app instalable)</div>
        <div className="brd-grid">
          <Field label="Nombre de la aplicacion"><input value={b.app_nombre || ''} onChange={e => set('app_nombre', e.target.value)} /></Field>
          <Field label="Empresa"><input value={b.empresa || ''} onChange={e => set('empresa', e.target.value)} /></Field>
        </div>
        <div className="brd-grid">
          <ImgUp campo="icon_path" label="Icono de la PWA" hint="Cuadrado 512x512. Es el icono al instalar la app y el favicon." alto={64} />
          <div>
            <Field label={<span className="flabel"><Icon name="moon" size={13} />Color de la barra (theme)</span>}>
              <div className="row" style={{ gap: 8 }}><input type="color" className="brd-color" value={b.theme_color || '#1d4ed8'} onChange={e => set('theme_color', e.target.value)} /><input value={b.theme_color || ''} onChange={e => set('theme_color', e.target.value)} /></div>
            </Field>
          </div>
        </div>
      </div>

      <div className="brd-sec">
        <div className="brd-sec-h"><Icon name="star" size={16} />Colores</div>
        <div className="brd-grid">
          <Field label="Color primario"><div className="row" style={{ gap: 8 }}><input type="color" className="brd-color" value={b.color_primario || '#2563eb'} onChange={e => set('color_primario', e.target.value)} /><input value={b.color_primario || ''} onChange={e => set('color_primario', e.target.value)} /></div></Field>
          <Field label="Color secundario"><div className="row" style={{ gap: 8 }}><input type="color" className="brd-color" value={b.color_secundario || '#1e40af'} onChange={e => set('color_secundario', e.target.value)} /><input value={b.color_secundario || ''} onChange={e => set('color_secundario', e.target.value)} /></div></Field>
        </div>
        <div className="brd-pvw">
          <span className="muted" style={{ fontSize: 12 }}>Vista previa:</span>
          <button className="btn sm" style={{ background: b.color_secundario || b.color_primario }}>Boton primario</button>
          <span className="chip active" style={{ background: b.color_primario, borderColor: b.color_primario }}>Etiqueta</span>
          <button className="btn sec sm" onClick={() => applyBranding(b)}><Icon name="eye" size={14} />Probar en la app</button>
        </div>
      </div>

      <div className="brd-sec">
        <div className="brd-sec-h"><Icon name="file" size={16} />Reportes (PDF)</div>
        <div className="brd-grid">
          <Field label="Empresa en el informe"><input value={b.pdf_empresa || ''} onChange={e => set('pdf_empresa', e.target.value)} placeholder="IES" /></Field>
          <Field label="Pie de pagina del informe"><input value={b.pdf_pie || ''} onChange={e => set('pdf_pie', e.target.value)} placeholder="IES - Mantenimiento preventivo" /></Field>
        </div>
        <Field label="Marca al pie de cada documento"><input value={b.pdf_doc_pie || ''} onChange={e => set('pdf_doc_pie', e.target.value)} placeholder="Preventis" /></Field>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={guardar} disabled={saving}><Icon name="save" size={16} />{saving ? 'Guardando...' : 'Guardar cambios'}</button>
      </div>
    </div>
  );
}

// ===== OTA — Actualizaciones del sistema (Configuración › Sistema) =====
const OTA_STEPS = [
  { pct: 15, label: 'Conectando con el repositorio' },
  { pct: 30, label: 'Descargando la nueva versión' },
  { pct: 45, label: 'Instalando dependencias' },
  { pct: 65, label: 'Compilando la interfaz' },
  { pct: 92, label: 'Reiniciando servicios' },
  { pct: 100, label: 'Finalizado' },
];

function Actualizaciones() {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => { setInfo(null); api.get('/api/system/version').then(setInfo).catch(() => setInfo({ error: true })); };
  useEffect(() => { load(); }, []);
  return (
    <div className="ota-wrap">
      <div className="ota-card">
        <div className="ota-card-ic"><Icon name="download" size={26} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ota-k">Versión instalada</div>
          {!info ? <div className="muted" style={{ marginTop: 6 }}>Cargando…</div>
            : info.error ? <div className="muted" style={{ marginTop: 6 }}>No disponible</div>
              : (<>
                <div className="ota-ver">{info.version}</div>
                <div className="ota-sub" title={info.subject}>{info.subject}</div>
                <div className="ota-meta"><Icon name="clock" size={13} />&nbsp;{info.date ? new Date(info.date).toLocaleString('es-UY') : '-'} · rama {info.branch}</div>
              </>)}
        </div>
        {info?.updateAvailable === true && <span className="ota-badge"><span className="ota-badge-dot" />Actualización disponible</span>}
      </div>
      <div className="ota-actions">
        <button className="btn ghost" onClick={load}><Icon name="repeat" size={15} />&nbsp;Buscar</button>
        <button className="btn" onClick={() => setOpen(true)}><Icon name="download" size={15} />&nbsp;Actualizar ahora</button>
      </div>
      <div className="ota-note"><Icon name="lock" size={14} /><span>Proceso seguro: requiere tu código de verificación (2FA). La actualización se descarga del repositorio oficial y reinicia el servicio automáticamente.</span></div>
      {open && <OTAModal onClose={() => setOpen(false)} onDone={load} />}
    </div>
  );
}

function OTAModal({ onClose, onDone }) {
  const [phase, setPhase] = useState('confirm'); // confirm | running | done | error
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [st, setSt] = useState({ pct: 0, step: '' });
  const poll = useRef(null);

  const stop = () => { if (poll.current) { clearInterval(poll.current); poll.current = null; } };
  useEffect(() => () => stop(), []);

  const startPoll = () => {
    let tries = 0;
    const tick = async () => {
      try {
        const s = await api.get('/api/system/update/status');
        if (s && typeof s.pct === 'number') setSt(s);
        if (s.state === 'done') { setSt(s); setPhase('done'); stop(); onDone && onDone(); return; }
        if (s.state === 'error') { setErr(s.step || 'Falló la actualización'); setPhase('error'); stop(); return; }
      } catch { /* la API se está reiniciando: seguimos intentando */ }
      if (++tries > 200) { setErr('Tiempo de espera agotado. Revisá el estado del servidor.'); setPhase('error'); stop(); }
    };
    poll.current = setInterval(tick, 1500);
    tick();
  };

  const iniciar = async () => {
    if (code.trim().length < 6) { setErr('Ingresá tu código de verificación.'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/api/system/update', { code: code.trim() });
      setPhase('running'); setSt({ pct: 5, step: 'Iniciando…' });
      startPoll();
    } catch (e) { setErr(e.message || 'No se pudo iniciar la actualización.'); }
    setBusy(false);
  };

  const pct = phase === 'done' ? 100 : (st.pct || 0);
  const sub = phase === 'confirm' ? 'Verificá tu identidad para continuar'
    : phase === 'running' ? 'No cierres esta ventana…'
      : phase === 'done' ? 'Completada con éxito' : 'No se pudo completar';

  return (
    <div className="modal-bg">
      <div className="modal ota-modal">
        <div className="modal-head">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="download" size={18} /> Actualización del sistema</h3>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{sub}</div>
          </div>
          {phase !== 'running' && <button className="btn ghost icon" onClick={onClose}><Icon name="x" size={18} /></button>}
        </div>

        {phase === 'confirm' && (
          <div className="ota-confirm">
            <div className="ota-shield"><Icon name="lock" size={28} /></div>
            <p className="ota-confirm-txt">Se actualizará Preventis a la última versión publicada y se reiniciará el servicio. Ingresá tu <b>código de verificación (2FA)</b> para autorizar.</p>
            <input className="ota-code" inputMode="numeric" autoFocus maxLength={10} placeholder="••••••" value={code}
              onChange={e => setCode(e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && !busy && iniciar()} />
            {err && <div className="ota-err"><Icon name="alert" size={14} />&nbsp;{err}</div>}
            <button className="btn block" disabled={busy} onClick={iniciar} style={{ marginTop: 4 }}>{busy ? 'Verificando…' : 'Iniciar actualización'}</button>
          </div>
        )}

        {(phase === 'running' || phase === 'done') && (
          <div className="ota-progress">
            <div className={'ota-gauge' + (phase === 'done' ? ' ok' : '')} style={{ '--pct': pct }}>
              <div className="ota-gauge-num">{pct}<span>%</span></div>
            </div>
            <div className="ota-bar"><div className="ota-bar-fill" style={{ width: pct + '%' }} /></div>
            <div className="ota-steps">
              {OTA_STEPS.map((s, i) => {
                const done = pct >= s.pct;
                const active = !done && (i === 0 || pct >= OTA_STEPS[i - 1].pct);
                return (
                  <div key={i} className={'ota-step' + (done ? ' done' : active ? ' active' : '')}>
                    <span className="ota-step-ic">{done ? <Icon name="check" size={13} /> : active ? <span className="ota-spin" /> : <span className="ota-pdot" />}</span>
                    <span>{s.label}</span>
                  </div>
                );
              })}
            </div>
            {phase === 'done' && (
              <div className="ota-done">
                <div className="ota-done-ic"><Icon name="checkCircle" size={30} /></div>
                <b>¡Actualización completada!</b>
                <p className="muted" style={{ margin: '4px 0 0' }}>Recargá la aplicación para usar la nueva versión.</p>
                <button className="btn block" onClick={() => window.location.reload()} style={{ marginTop: 14 }}><Icon name="repeat" size={15} />&nbsp;Recargar app</button>
              </div>
            )}
          </div>
        )}

        {phase === 'error' && (
          <div className="ota-confirm">
            <div className="ota-shield err"><Icon name="alert" size={28} /></div>
            <p className="ota-confirm-txt">{err}</p>
            <button className="btn ghost block" onClick={onClose}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Correo() {
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pass, setPass] = useState('');
  const [to, setTo] = useState('');
  const [testing, setTesting] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const load = () => api.get('/api/email/config').then(setF);
  useEffect(() => { load(); }, []);
  const guardar = async () => { setSaving(true); try { await api.put('/api/email/config', { ...f, pass: pass || undefined }); setPass(''); toast.ok('Configuracion guardada'); load(); } catch (e) { toast.err(e.message); } setSaving(false); };
  const probar = async () => { if (!to.trim()) { toast.err('Indica un destinatario'); return; } setTesting(true); try { await api.post('/api/email/test', { to: to.trim() }); toast.ok('Correo de prueba enviado a ' + to); } catch (e) { toast.err(e.message); } setTesting(false); };
  if (!f) return <Loading rows={3} />;
  const L = (icon, txt) => <span className="flabel"><Icon name={icon} size={13} />{txt}</span>;
  return (
    <div style={{ maxWidth: 580 }}>
      <div className="brd-sec">
        <div className="brd-sec-h"><Icon name="mail" size={15} />Servidor de correo (SMTP)</div>
        <div className="grid2">
          <Field label={L('line', 'Servidor (host)')}><input value={f.host || ''} onChange={e => set('host', e.target.value)} placeholder="smtp.gmail.com" /></Field>
          <Field label={L('settings', 'Puerto')}><input type="number" value={f.port || 587} onChange={e => set('port', Number(e.target.value))} placeholder="587" /></Field>
          <Field label={L('users', 'Usuario')}><input name="smtp_user" autoComplete="off" value={f.user || ''} onChange={e => set('user', e.target.value)} placeholder="no-reply@dominio" /></Field>
          <Field label={L('lock', 'Clave / App Password')}><input type="password" name="smtp_pass" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} placeholder={f.has_pass ? '•••••• (sin cambios)' : 'pega la App Password'} /></Field>
          <Field label={L('mail', 'Remitente (from)')}><input value={f.from || ''} onChange={e => set('from', e.target.value)} placeholder="no-reply@dominio" /></Field>
          <Field label={L('star', 'Nombre remitente')}><input value={f.from_name || ''} onChange={e => set('from_name', e.target.value)} placeholder="Preventis" /></Field>
        </div>
        <label className="chk-row"><input type="checkbox" checked={!!f.secure} onChange={e => set('secure', e.target.checked)} />Conexion SSL directa (puerto 465). Para 587 dejalo destildado (STARTTLS).</label>
        <label className="chk-row"><input type="checkbox" checked={!!f.enabled} onChange={e => set('enabled', e.target.checked)} />Correo habilitado</label>
        <button className="btn" onClick={guardar} disabled={saving} style={{ marginTop: 4 }}><Icon name="save" size={15} />{saving ? 'Guardando...' : 'Guardar'}</button>
      </div>
      <div className="brd-sec">
        <div className="brd-sec-h"><Icon name="checkCircle" size={15} />Probar envio</div>
        <div className="row wrap" style={{ gap: 8 }}>
          <input style={{ flex: 1, minWidth: 200 }} value={to} onChange={e => setTo(e.target.value)} placeholder="destinatario@correo.com" onKeyDown={e => e.key === 'Enter' && probar()} />
          <button className="btn sec" onClick={probar} disabled={testing}><Icon name="mail" size={15} />{testing ? 'Enviando...' : 'Enviar prueba'}</button>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Con Gmail / Google Workspace necesitas una <b>App Password</b> (la clave normal no sirve para SMTP).</div>
      </div>
    </div>
  );
}

function Alertas() {
  const [eventos, setEventos] = useState(null);
  const [cfg, setCfg] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/api/alertas/eventos').then(setEventos); api.get('/api/alertas/config').then(c => setCfg(c || {})); }, []);
  const rule = (id) => cfg[id] || {};
  const setRule = (id, k, v) => setCfg(c => ({ ...c, [id]: { ...(c[id] || {}), [k]: v } }));
  const guardar = async () => { setSaving(true); try { await api.put('/api/alertas/config', cfg); toast.ok('Alertas guardadas'); } catch (e) { toast.err(e.message); } setSaving(false); };
  const probar = async (id) => { try { await api.post('/api/alertas/test', { evento: id }); toast.ok('Alerta de prueba enviada'); } catch (e) { toast.err(e.message); } };
  if (!eventos) return <Loading rows={3} />;
  const L = (icon, txt) => <span className="flabel"><Icon name={icon} size={13} />{txt}</span>;
  const Chan = ({ id, k, icon, label }) => { const on = rule(id)[k] ?? (k === 'inapp'); return <button type="button" className={'alr-chan' + (on ? ' on' : '')} onClick={() => setRule(id, k, !on)}><Icon name={icon} size={15} />{label}</button>; };
  return (
    <div style={{ maxWidth: 720 }}>
      <Field label={L('external', 'URL publica (para los enlaces de los avisos)')}>
        <input value={cfg._public_url || ''} onChange={e => setCfg(c => ({ ...c, _public_url: e.target.value }))} placeholder="https://preventis.tudominio.com" />
      </Field>
      <div className="alr-list">
        {eventos.map(ev => { const r = rule(ev.id); return (
          <div key={ev.id} className="alr-card">
            <div className="alr-head"><span className="alr-ic"><Icon name={ev.icon || 'bell'} size={16} /></span>
              <div style={{ minWidth: 0 }}><b>{ev.label}</b><div className="muted" style={{ fontSize: 12.5 }}>{ev.desc}</div></div>
              <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => probar(ev.id)}><Icon name="mail" size={14} />Probar</button>
            </div>
            <div className="alr-chans">
              <Chan id={ev.id} k="email" icon="mail" label="Email" />
              <Chan id={ev.id} k="whatsapp" icon="whatsapp" label="WhatsApp" />
              <Chan id={ev.id} k="inapp" icon="bell" label="Campana" />
            </div>
            <div className="alr-dest">
              <label className="chk-row"><input type="checkbox" checked={!!r.al_cliente} onChange={e => setRule(ev.id, 'al_cliente', e.target.checked)} />Al cliente (su email / telefono)</label>
              <label className="chk-row"><input type="checkbox" checked={!!r.al_tecnico} onChange={e => setRule(ev.id, 'al_tecnico', e.target.checked)} />Al tecnico asignado (WhatsApp)</label>
              <div className="grid2">
                <Field label={L('mail', 'Emails extra (coma)')}><input value={(r.destinatarios || []).join(', ')} onChange={e => setRule(ev.id, 'destinatarios', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="a@b.com, c@d.com" /></Field>
                <Field label={L('whatsapp', 'WhatsApp extra (coma)')}><input value={(r.telefonos || []).join(', ')} onChange={e => setRule(ev.id, 'telefonos', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="59899..., 59891..." /></Field>
              </div>
            </div>
          </div>
        ); })}
      </div>
      <button className="btn" onClick={guardar} disabled={saving} style={{ marginTop: 14 }}><Icon name="save" size={15} />{saving ? 'Guardando...' : 'Guardar alertas'}</button>
    </div>
  );
}

