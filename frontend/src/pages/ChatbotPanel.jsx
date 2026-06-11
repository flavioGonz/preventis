import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Loading, Field, Empty } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';

export default function ChatbotPanel() {
  const [sec, setSec] = useState('conexion'); // conexion | numeros | comandos
  return (
    <div>
      <div className="tabs scroll" style={{ marginBottom: 16 }}>
        {[['conexion', 'Conexión', 'settings'], ['numeros', 'Números', 'phone'], ['comandos', 'Comandos y log', 'whatsapp']].map(([k, l, ic]) => (
          <div key={k} className={'tab' + (sec === k ? ' active' : '')} onClick={() => setSec(k)}><Icon name={ic} size={14} />{l}</div>
        ))}
      </div>
      {sec === 'conexion' && <Conexion />}
      {sec === 'numeros' && <Numeros />}
      {sec === 'comandos' && <Comandos />}
    </div>
  );
}

function Conexion() {
  const [cfg, setCfg] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { api.get('/api/chatbot/config').then(setCfg).catch(() => setCfg({ url: '', api_key: '', session: '', numero_prueba: '', notificar: false })); }, []);
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }));
  const guardar = async () => { setSaving(true); try { await api.put('/api/chatbot/config', cfg); toast.ok('Configuración guardada'); } catch (e) { toast.err(e.message); } setSaving(false); };
  const probar = async () => {
    setTesting(true); setResult(null);
    try { await api.put('/api/chatbot/config', cfg); const r = await api.post('/api/chatbot/test', {}); toast.ok('Mensaje enviado (' + (r.tipo || 'ok') + ')'); setResult({ ok: true, tipo: r.tipo }); }
    catch (e) { toast.err(e.message); setResult({ ok: false, msg: e.message }); }
    setTesting(false);
  };
  if (cfg === null) return <Loading rows={2} />;
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Conecta Preventis con tu instancia de <b>openwa</b> (WhatsApp). Se usa para enviar notificaciones, códigos de 2FA y responder comandos.</div>
      <Field label={<span className="flabel"><Icon name="settings" size={13} />URL de openwa</span>}><input value={cfg.url || ''} placeholder="http://192.168.99.x:8002" onChange={e => set('url', e.target.value)} /></Field>
      <Field label={<span className="flabel"><Icon name="list" size={13} />Tipo de API</span>}>
        <select value={cfg.api_tipo || 'auto'} onChange={e => set('api_tipo', e.target.value)}>
          <option value="auto">Auto-detectar</option>
          <option value="openwa">OpenWA (panel con API Keys, X-API-Key)</option>
          <option value="wa-automate">wa-automate (EASY API: /sendText)</option>
          <option value="wppconnect">WPPConnect (/api/:session/send-message)</option>
          <option value="evolution">Evolution API (/message/sendText/:session)</option>
        </select>
      </Field>
      <div className="grid2">
        <Field label={<span className="flabel"><Icon name="qr" size={13} />API key</span>}><input value={cfg.api_key || ''} placeholder="api key (opcional)" onChange={e => set('api_key', e.target.value)} /></Field>
        <Field label={<span className="flabel"><Icon name="users" size={13} />Sesión</span>}><input value={cfg.session || ''} placeholder="omniaccess o el Session ID" onChange={e => set('session', e.target.value)} /></Field>
      </div>
      <div className="grid2">
        <Field label={<span className="flabel"><Icon name="phone" size={13} />Número de prueba</span>}><input value={cfg.numero_prueba || ''} placeholder="598..." onChange={e => set('numero_prueba', e.target.value)} /></Field>
        <Field label={<span className="flabel"><Icon name="bell" size={13} />Número para alertas</span>}><input value={cfg.numero_alertas || ''} placeholder="598... o grupo@g.us" onChange={e => set('numero_alertas', e.target.value)} /></Field>
      </div>
      <label className="row" style={{ gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 14 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!cfg.notificar} onChange={e => set('notificar', e.target.checked)} />
        Notificar eventos (visitas, fallas, tickets) por WhatsApp
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={guardar} disabled={saving}><Icon name="check" size={16} />{saving ? 'Guardando...' : 'Guardar'}</button>
        <button className="btn sec" onClick={probar} disabled={testing || !cfg.url}><Icon name="mail" size={15} />{testing ? 'Enviando...' : 'Enviar mensaje de prueba'}</button>
      </div>
      {result && <div className={'badge ' + (result.ok ? 'ok' : 'falla')} style={{ marginTop: 12 }}><span className="dot" />{result.ok ? 'Conectado vía ' + result.tipo : result.msg}</div>}
      <div className="cred-box" style={{ marginTop: 16 }}>
        <div className="row" style={{ gap: 7, marginBottom: 6 }}><Icon name="whatsapp" size={15} color="var(--ok)" /><b style={{ fontSize: 13.5 }}>Webhook de recepción</b></div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Configura este webhook en el panel OpenWA (Webhooks → evento <b>message.received</b>):</div>
        <code className="mono" style={{ fontSize: 12, display: 'block', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' }}>{location.origin}/api/chatbot/webhook</code>
      </div>
    </div>
  );
}

const ROLES = [['tecnico', 'Técnico'], ['admin', 'Admin'], ['cliente', 'Cliente'], ['grupo', 'Grupo']];
function Numeros() {
  const [rows, setRows] = useState(null);
  const [tecnicos, setTecnicos] = useState([]);
  const [nuevo, setNuevo] = useState({ telefono: '', nombre: '', rol: 'tecnico', tecnico_id: '' });
  const [grupos, setGrupos] = useState(null);
  const [cargandoG, setCargandoG] = useState(false);
  const cargar = () => api.get('/api/chatbot/numeros').then(setRows).catch(() => setRows([]));
  useEffect(() => { cargar(); api.get('/api/tecnicos').then(setTecnicos).catch(() => {}); }, []);
  const cargarGrupos = async () => {
    setCargandoG(true);
    try { const g = await api.get('/api/chatbot/grupos'); setGrupos(g); if (!g.length) toast('No se encontraron grupos (o el gateway no lo soporta). Podés agregar el grupo a mano con su ID.'); }
    catch (e) { toast.err(e.message); }
    setCargandoG(false);
  };
  const autorizarGrupo = async (g) => {
    try { await api.post('/api/chatbot/numeros', { telefono: g.id, nombre: g.nombre, rol: 'grupo', autorizado: true }); toast.ok('Grupo autorizado'); cargar(); }
    catch (e) { toast.err(e.message); }
  };

  const agregar = async () => {
    if (!nuevo.telefono) return;
    try { await api.post('/api/chatbot/numeros', { ...nuevo, autorizado: true, tecnico_id: nuevo.tecnico_id || null }); toast.ok('Número agregado'); setNuevo({ telefono: '', nombre: '', rol: 'tecnico', tecnico_id: '' }); cargar(); }
    catch (e) { toast.err(e.message); }
  };
  const upd = async (id, patch) => { try { await api.put('/api/chatbot/numeros/' + id, patch); cargar(); } catch (e) { toast.err(e.message); } };
  const del = async (id) => { if (!confirm('¿Eliminar este número?')) return; try { await api.del('/api/chatbot/numeros/' + id); cargar(); } catch (e) { toast.err(e.message); } };
  const importar = async () => { try { const r = await api.post('/api/chatbot/numeros/importar-tecnicos', {}); toast.ok(r.importados + ' técnicos importados'); cargar(); } catch (e) { toast.err(e.message); } };

  if (rows === null) return <Loading rows={3} />;
  const pend = rows.filter(r => !r.autorizado);
  const auth = rows.filter(r => r.autorizado);

  const Fila = (r) => (
    <div key={r.id} className="wa-row" style={{ cursor: 'default' }}>
      <div className={'wa-av ' + (r.autorizado ? 'ring-ok' : 'ring-warn')}><Icon name="phone" size={20} /></div>
      <div className="wa-main">
        <div className="wa-top">
          <span className="wa-title">{r.nombre || r.tecnico_nombre || r.telefono}</span>
          <span className="wa-time">{r.ultimo_at ? new Date(r.ultimo_at).toLocaleDateString('es-UY') : ''}</span>
        </div>
        <div className="wa-bot"><span className="wa-sub mono">{r.telefono}{r.ultimo_msg ? ' · “' + r.ultimo_msg.slice(0, 40) + '”' : ''}</span></div>
      </div>
      <div className="row" style={{ gap: 6, flex: 'none' }}>
        <span className="badge gris mini" style={{ textTransform: 'capitalize' }}>{r.rol}</span>
        {r.autorizado
          ? <button className="btn ghost icon" data-tip="Quitar acceso" onClick={() => upd(r.id, { autorizado: false })}><Icon name="x" size={15} /></button>
          : <button className="btn sm" data-tip="Autorizar" onClick={() => upd(r.id, { autorizado: true })}><Icon name="check" size={14} />Autorizar</button>}
        <button className="btn ghost icon" data-tip="Eliminar" onClick={() => del(r.id)}><Icon name="trash" size={15} /></button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="card pad-sm" style={{ marginBottom: 14 }}>
        <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 140 }}><Field label="Teléfono"><input value={nuevo.telefono} onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })} placeholder="59899123456" /></Field></div>
          <div style={{ flex: 1, minWidth: 120 }}><Field label="Nombre"><input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre" /></Field></div>
          <div style={{ minWidth: 110 }}><Field label="Rol"><select value={nuevo.rol} onChange={e => setNuevo({ ...nuevo, rol: e.target.value })}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
          <button className="btn" onClick={agregar} disabled={!nuevo.telefono}><Icon name="plus" size={15} />Agregar</button>
        </div>
        <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={importar}><Icon name="download" size={14} />Importar números de técnicos</button>
      </div>

      <div className="card pad-sm" style={{ marginBottom: 14 }}>
        <div className="row between" style={{ marginBottom: grupos ? 10 : 0 }}>
          <div className="row" style={{ gap: 8 }}><Icon name="users" size={16} color="var(--brand-600)" /><b style={{ fontSize: 14 }}>Grupos de WhatsApp</b></div>
          <button className="btn sec sm" onClick={cargarGrupos} disabled={cargandoG}><Icon name="whatsapp" size={14} />{cargandoG ? 'Cargando…' : 'Cargar grupos'}</button>
        </div>
        {grupos && (grupos.length === 0
          ? <div className="muted" style={{ fontSize: 12.5 }}>No se listaron grupos. Si tu gateway no lo soporta, agregá el grupo a mano: pegá su ID (termina en <span className="mono">@g.us</span>) en el campo Teléfono de arriba y elegí rol <b>Grupo</b>.</div>
          : <div className="stack" style={{ gap: 6 }}>
            {grupos.map(g => (
              <div key={g.id} className="row between" style={{ padding: '6px 4px', borderTop: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{g.nombre}</div><div className="mono muted" style={{ fontSize: 11 }}>{g.id}</div></div>
                <button className="btn sm" onClick={() => autorizarGrupo(g)}><Icon name="check" size={14} />Autorizar</button>
              </div>
            ))}
          </div>)}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>En un grupo el bot solo responde a comandos (estado, tickets, nuevo ticket, etc.), no a cada mensaje.</div>
      </div>

      {pend.length > 0 && <>
        <div className="row between" style={{ margin: '4px 2px 8px' }}>
          <span className="hist-sub" style={{ margin: 0 }}>Escribieron y no están autorizados ({pend.length})</span>
        </div>
        <div className="wa-wrap" style={{ marginBottom: 16 }}><div className="wa-list">{pend.map(Fila)}</div></div>
      </>}

      <div className="hist-sub">Números autorizados ({auth.length})</div>
      {auth.length === 0 ? <Empty icon="phone" title="Sin números autorizados">Agregá un número o importá los de tus técnicos.</Empty>
        : <div className="wa-wrap"><div className="wa-list">{auth.map(Fila)}</div></div>}
    </div>
  );
}

function Comandos() {
  const [texto, setTexto] = useState('estado');
  const [resp, setResp] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState(null);
  const cargarLog = () => api.get('/api/chatbot/log').then(setLog).catch(() => setLog([]));
  useEffect(() => { cargarLog(); const t = setInterval(cargarLog, 20000); return () => clearInterval(t); }, []);
  const probar = async () => {
    setBusy(true);
    try { const r = await api.post('/api/chatbot/comando', { texto }); setResp(r.resp || ''); } catch (e) { toast.err(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ maxWidth: 720 }}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 7, marginBottom: 10 }}><Icon name="whatsapp" size={16} color="var(--ok)" /><b>Probar un comando</b></div>
        <div className="row wrap" style={{ gap: 8 }}>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="estado, visitas, ticket 5, cliente demo…" style={{ flex: 1, minWidth: 200 }} onKeyDown={e => e.key === 'Enter' && probar()} />
          <button className="btn" onClick={probar} disabled={busy || !texto}><Icon name="arrowRight" size={15} />Probar</button>
        </div>
        {resp && <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginTop: 12, fontSize: 13.5, fontFamily: 'inherit' }}>{resp}</pre>}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Consultas: <b>estado</b>, <b>visitas</b>, <b>agenda</b> / <b>mi agenda</b>, <b>fallas</b>, <b>tickets</b>, <b>ticket NN</b>, <b>cliente X</b>, <b>ayuda</b>.<br />Crear (con preguntas, solo por WhatsApp): <b>nuevo ticket</b>, <b>nueva visita</b>, <b>cancelar</b>. Esta vista solo previsualiza consultas, no envía WhatsApp ni crea registros.</div>
      </div>

      <div className="hist-sub">Últimos mensajes ({log?.length || 0})</div>
      {log === null ? <Loading rows={3} header={false} />
        : log.length === 0 ? <Empty icon="mail" title="Sin actividad">Todavía no hay mensajes registrados.</Empty>
          : <div className="wa-wrap"><div className="wa-list">{log.map((l, i) => (
            <div key={i} className="wa-row" style={{ cursor: 'default' }}>
              <div className={'wa-av ' + (l.metodo === 'IN' ? 'ring-info' : 'ring-ok')}><Icon name={l.metodo === 'IN' ? 'download' : 'upload'} size={18} /></div>
              <div className="wa-main">
                <div className="wa-top"><span className="wa-title">{l.metodo === 'IN' ? 'Recibido' : 'Enviado'}</span><span className="wa-time">{new Date(l.ts).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
                <div className="wa-bot"><span className="wa-sub">{l.detalle}</span></div>
              </div>
            </div>
          ))}</div></div>}
    </div>
  );
}
