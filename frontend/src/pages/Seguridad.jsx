import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHeader } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import { TwoFASetup } from '../components/TwoFA.jsx';
import { registerPasskey, passkeySupported } from '../webauthn.js';

export default function Seguridad({ user, embedded }) {
  const [st, setSt] = useState(null);
  const [modo, setModo] = useState('ver'); // ver | activar | desactivar
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [tel, setTel] = useState('');
  const [telBusy, setTelBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const cargar = () => api.get('/api/2fa/status').then(s => { setSt(s); }).catch(() => setSt({ enabled: false }));
  useEffect(() => { cargar(); }, []);

  const desactivar = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post('/api/2fa/disable', { password: pass }); toast.ok('Verificación en dos pasos desactivada'); setPass(''); setModo('ver'); cargar(); }
    catch (err) { toast.err(err.message); }
    setBusy(false);
  };
  const guardarTel = async () => {
    setTelBusy(true);
    try { const r = await api.post('/api/2fa/phone', { telefono: tel }); toast.ok('Número guardado'); setTel(''); cargar(); }
    catch (err) { toast.err(err.message); }
    setTelBusy(false);
  };
  const probarWa = async () => {
    try { await api.post('/api/2fa/whatsapp/test', {}); toast.ok('Mensaje de prueba enviado por WhatsApp'); }
    catch (err) { toast.err(err.message); }
  };
  const guardarEmail = async () => {
    setEmailBusy(true);
    try { await api.post('/api/2fa/email', { email }); toast.ok('Email guardado'); setEmail(''); cargar(); }
    catch (err) { toast.err(err.message); }
    setEmailBusy(false);
  };
  const probarEmail = async () => {
    try { await api.post('/api/2fa/email/test', {}); toast.ok('Email de prueba enviado'); }
    catch (err) { toast.err(err.message); }
  };

  const esAdmin = user?.rol === 'admin';

  return (
    <div>
      {!embedded && <PageHeader title="Seguridad" desc="Verificación en dos pasos de tu cuenta" icon="checkCircle" />}

      {modo === 'activar' ? (
        <div style={{ maxWidth: 420 }}>
          <TwoFASetup onDone={() => { toast.ok('Verificación en dos pasos activada'); setModo('ver'); cargar(); }} onCancel={() => setModo('ver')} />
        </div>
      ) : (
        <div style={{ maxWidth: 560 }}>
          <div className="card">
            <div className="row between" style={{ marginBottom: 14 }}>
              <div className="row" style={{ gap: 12 }}>
                <span className="ph-ic" style={{ width: 44, height: 44, background: st?.enabled ? 'var(--ok-bg)' : 'var(--surface-2)', color: st?.enabled ? 'var(--ok)' : 'var(--muted)' }}>
                  <Icon name={st?.enabled ? 'checkCircle' : 'alert'} size={22} />
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Verificación en dos pasos</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {st == null ? 'Cargando…' : st.enabled ? 'Activa — se pide un código al iniciar sesión.' : 'Desactivada — protegé tu cuenta con un segundo factor.'}
                  </div>
                </div>
              </div>
              {st && (st.enabled
                ? <span className="badge ok"><span className="dot" />Activa</span>
                : <span className="badge gris"><span className="dot" />Inactiva</span>)}
            </div>

            {st && !st.enabled && (
              <button className="btn" onClick={() => setModo('activar')}><Icon name="checkCircle" size={16} />Activar verificación en dos pasos</button>
            )}
            {st && st.enabled && modo !== 'desactivar' && (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn sec" onClick={() => setModo('activar')}><Icon name="history" size={15} />Reconfigurar</button>
                <button className="btn danger" onClick={() => setModo('desactivar')}><Icon name="x" size={15} />Desactivar</button>
              </div>
            )}
            {modo === 'desactivar' && (
              <form onSubmit={desactivar} style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                {esAdmin && <div className="badge warn" style={{ marginBottom: 10 }}><Icon name="alert" size={14} />Tu cuenta es admin: se te pedirá configurarla otra vez en el próximo ingreso.</div>}
                <div className="field"><label>Confirmá tu contraseña para desactivar</label>
                  <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" autoFocus /></div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn danger" type="submit" disabled={busy || !pass}>{busy ? 'Desactivando…' : 'Desactivar 2FA'}</button>
                  <button className="btn ghost" type="button" onClick={() => { setModo('ver'); setPass(''); }}>Cancelar</button>
                </div>
              </form>
            )}
          </div>

          {/* WhatsApp como segundo factor (sirve junto con la app autenticadora) */}
          <div className="card">
            <div className="row" style={{ gap: 12, marginBottom: 12 }}>
              <span className="ph-ic" style={{ width: 44, height: 44, background: '#dcfce7', color: '#16a34a' }}><Icon name="whatsapp" size={22} /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>WhatsApp como respaldo</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {st?.has_phone ? <>Configurado: {st.phone_hint}. Podés pedir el código por WhatsApp al iniciar sesión.</> : 'Cargá tu número para recibir el código por WhatsApp como alternativa a la app.'}
                </div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <input value={tel} onChange={e => setTel(e.target.value)} placeholder={st?.has_phone ? 'Nuevo número (59899…)' : '59899123456'} inputMode="numeric" style={{ flex: 1, minWidth: 180 }} />
              <button className="btn sec" disabled={telBusy || !tel} onClick={guardarTel}><Icon name="save" size={15} />Guardar</button>
              {st?.has_phone && <button className="btn ghost" onClick={probarWa}><Icon name="whatsapp" size={15} />Probar envío</button>}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Usa la conexión de WhatsApp configurada en Configuración → Chatbot.</div>
          </div>

          {/* Email como segundo factor (sirve junto con la app autenticadora) */}
          <div className="card">
            <div className="row" style={{ gap: 12, marginBottom: 12 }}>
              <span className="ph-ic" style={{ width: 44, height: 44, background: '#dbeafe', color: '#2563eb' }}><Icon name="mail" size={22} /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Email como respaldo</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {st?.has_email ? <>Configurado: {st.email_hint}. Podés pedir el código por email al iniciar sesión.</> : 'Cargá tu email para recibir el código por correo como alternativa a la app.'}
                </div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder={st?.has_email ? 'Nuevo email' : 'tu@correo.com'} type="email" autoComplete="off" style={{ flex: 1, minWidth: 200 }} />
              <button className="btn sec" disabled={emailBusy || !email} onClick={guardarEmail}><Icon name="save" size={15} />Guardar</button>
              {st?.has_email && <button className="btn ghost" onClick={probarEmail}><Icon name="mail" size={15} />Probar envío</button>}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Usa el correo SMTP configurado en Configuración → Correo.</div>
          </div>

          <PasskeysCard />
        </div>
      )}
    </div>
  );
}

// Gestión de passkeys (WebAuthn): registrar y eliminar llaves del dispositivo.
function PasskeysCard() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/api/passkeys').then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const registrar = async () => {
    setBusy(true);
    try {
      const name = (navigator.userAgentData?.platform || navigator.platform || 'Este dispositivo').toString().slice(0, 40);
      await registerPasskey(name);
      toast.ok('Passkey registrada');
      load();
    } catch (e) { toast.err(e.name === 'NotAllowedError' ? 'Registro cancelado.' : (e.message || 'No se pudo registrar la passkey')); }
    setBusy(false);
  };
  const eliminar = async (p) => {
    if (!confirm('¿Eliminar esta passkey? No podrás usarla para entrar.')) return;
    try { await api.del('/api/passkeys/' + p.id); toast.ok('Passkey eliminada'); load(); } catch (e) { toast.err(e.message); }
  };
  if (!passkeySupported()) return null;
  return (
    <div className="card">
      <div className="row" style={{ gap: 12, marginBottom: 12 }}>
        <span className="ph-ic" style={{ width: 44, height: 44, background: '#ede9fe', color: '#7c3aed' }}><Icon name="fingerprint" size={22} /></span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Passkeys (Face ID / huella)</div>
          <div className="muted" style={{ fontSize: 13 }}>Entrá sin contraseña ni código usando el desbloqueo de tu dispositivo. También sirve como segundo factor.</div>
        </div>
      </div>
      {list === null ? <div className="muted" style={{ fontSize: 13 }}>Cargando…</div> :
        list.length === 0 ? <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>No tenés passkeys registradas.</div> :
          <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
            {list.map(p => (
              <div key={p.id} className="row between" style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div className="row" style={{ gap: 8, minWidth: 0 }}><Icon name="fingerprint" size={16} />
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 14 }}>{p.device_name || 'Passkey'}</div>
                    <div className="subtle" style={{ fontSize: 11.5 }}>Creada {new Date(p.created_at).toLocaleDateString('es-UY')}{p.last_used ? ' · usada ' + new Date(p.last_used).toLocaleDateString('es-UY') : ''}</div></div>
                </div>
                <button className="btn ghost icon" data-tip="Eliminar" aria-label="Eliminar" onClick={() => eliminar(p)}><Icon name="trash" size={16} /></button>
              </div>
            ))}
          </div>}
      <button className="btn sec" disabled={busy} onClick={registrar}><Icon name="plus" size={15} />{busy ? 'Registrando…' : 'Registrar una passkey en este dispositivo'}</button>
    </div>
  );
}
