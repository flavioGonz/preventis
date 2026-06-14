import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './icons.jsx';
import { toast } from './toast.jsx';

// fetch directo con un token explicito (para el enrolamiento obligatorio,
// donde todavia no hay sesion guardada y se usa el setup_token).
async function call(url, body, token) {
  const r = await fetch(api.base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body || {}),
  });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : {};
  if (!r.ok) throw new Error(data.error || 'Error');
  return data;
}

// Paso 2 del login: ingresar el codigo (TOTP / WhatsApp / respaldo).
export function TwoFAChallenge({ pending, methods = ['totp'], phoneHint, emailHint, onVerified, onCancel }) {
  const [code, setCode] = useState('');
  const [tipo, setTipo] = useState('totp'); // totp | whatsapp | email | backup
  const [busy, setBusy] = useState(false);
  const [waSent, setWaSent] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [err, setErr] = useState('');

  const enviarWa = async () => {
    setErr(''); setBusy(true);
    try { const r = await call('/api/auth/2fa/whatsapp', { pending }); setTipo('whatsapp'); setWaSent(true); toast.ok('Código enviado por WhatsApp a ' + (r.phone_hint || '')); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const enviarEmail = async () => {
    setErr(''); setBusy(true);
    try { const r = await call('/api/auth/2fa/email', { pending }); setTipo('email'); setEmailSent(true); setCode(''); toast.ok('Código enviado por email a ' + (r.email_hint || '')); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const verificar = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await call('/api/auth/2fa/verify', { pending, code, type: tipo }); onVerified(r.token, r.user); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const titulo = tipo === 'backup' ? 'Código de respaldo' : tipo === 'whatsapp' ? 'Código por WhatsApp' : tipo === 'email' ? 'Código por email' : 'Código de la app';
  return (
    <form className="login-card" onSubmit={verificar}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div className="login-brand" style={{ justifyContent: 'center', marginBottom: 0 }}><span className="logo"><Icon name="settings" size={22} /></span></div>
      </div>
      <h2 style={{ textAlign: 'center', marginBottom: 4 }}>Verificación en dos pasos</h2>
      <div className="muted" style={{ fontSize: 13, marginBottom: 18, textAlign: 'center' }}>
        {tipo === 'backup' ? 'Ingresá uno de tus códigos de respaldo.'
          : tipo === 'whatsapp' ? 'Ingresá el código que te enviamos por WhatsApp' + (phoneHint ? ' a ' + phoneHint : '') + '.'
            : tipo === 'email' ? 'Ingresá el código que te enviamos por email' + (emailHint ? ' a ' + emailHint : '') + '.'
              : 'Ingresá el código de 6 dígitos de tu app autenticadora.'}
      </div>
      <div className="field">
        <label>{titulo}</label>
        <input value={code} autoFocus inputMode={tipo === 'backup' ? 'text' : 'numeric'} placeholder={tipo === 'backup' ? 'xxxxxxxx' : '000000'}
          onChange={e => setCode(e.target.value)} style={{ textAlign: 'center', fontSize: 22, letterSpacing: 4, fontVariantNumeric: 'tabular-nums' }} />
      </div>
      {err && <div className="badge falla" style={{ width: '100%', justifyContent: 'center', padding: 8, marginBottom: 12 }}><Icon name="alert" size={15} />{err}</div>}
      <button className="btn block" type="submit" disabled={busy || !code}>{busy ? 'Verificando…' : 'Verificar'}</button>

      <div className="stack" style={{ gap: 8, marginTop: 14 }}>
        {methods.includes('whatsapp') && tipo !== 'backup' && (
          <button type="button" className="btn sec sm block" disabled={busy} onClick={enviarWa}>
            <Icon name="whatsapp" size={15} />{waSent ? 'Reenviar código por WhatsApp' : 'Enviar código por WhatsApp'}
          </button>
        )}
        {methods.includes('email') && tipo !== 'backup' && (
          <button type="button" className="btn sec sm block" disabled={busy} onClick={enviarEmail}>
            <Icon name="mail" size={15} />{emailSent ? 'Reenviar código por email' : 'Enviar código por email'}
          </button>
        )}
        {tipo !== 'backup'
          ? <button type="button" className="btn ghost sm" onClick={() => { setTipo('backup'); setCode(''); setErr(''); }}>Usar un código de respaldo</button>
          : <button type="button" className="btn ghost sm" onClick={() => { setTipo('totp'); setCode(''); setErr(''); }}>Volver a la app autenticadora</button>}
        <button type="button" className="btn ghost sm" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

// Enrolamiento: muestra QR, valida el primer código y entrega los códigos de respaldo.
// Si se pasa `token` (setup_token), opera sin sesión (enrolamiento obligatorio del admin).
export function TwoFASetup({ token, requireWhatsApp = false, onDone, onCancel }) {
  const [data, setData] = useState(null);   // { secret, qr, otpauth }
  const [code, setCode] = useState('');
  const [tel, setTel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [backups, setBackups] = useState(null); // codes -> pantalla final

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const r = token ? await call('/api/2fa/setup', {}, token) : await api.post('/api/2fa/setup'); if (alive) setData(r); }
      catch (e) { if (alive) setErr(e.message); }
    })();
    return () => { alive = false; };
  }, [token]);

  const activar = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const body = { code, telefono: tel || null };
      const r = token ? await call('/api/2fa/enable', body, token) : await api.post('/api/2fa/enable', body);
      setBackups(r.backup_codes || []);
      window._twofaResult = { token: r.token, user: r.user };
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (backups) {
    return (
      <div className="login-card">
        <h2 style={{ textAlign: 'center', marginBottom: 6 }}>Códigos de respaldo</h2>
        <div className="muted" style={{ fontSize: 13, marginBottom: 14, textAlign: 'center' }}>Guardalos en un lugar seguro. Cada uno sirve una sola vez si perdés el acceso a tu app.</div>
        <div className="card pad-sm" style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontFamily: 'monospace', fontSize: 15, textAlign: 'center' }}>
            {backups.map(c => <div key={c} className="mono">{c}</div>)}
          </div>
        </div>
        <button className="btn block" onClick={() => { navigator.clipboard?.writeText(backups.join('\n')).then(() => toast.ok('Códigos copiados')).catch(() => {}); }}><Icon name="clipboard" size={15} />Copiar códigos</button>
        <button className="btn sec block" style={{ marginTop: 10 }} onClick={() => { const r = window._twofaResult || {}; onDone && onDone(r.token, r.user); }}>Ya los guardé, continuar</button>
      </div>
    );
  }

  return (
    <form className="login-card" onSubmit={activar}>
      <h2 style={{ textAlign: 'center', marginBottom: 6 }}>Activar verificación en dos pasos</h2>
      <div className="muted" style={{ fontSize: 13, marginBottom: 14, textAlign: 'center' }}>Escaneá el código QR con Google Authenticator, Microsoft Authenticator o similar.</div>
      {!data && !err && <div className="muted" style={{ textAlign: 'center', padding: 20 }}>Generando código…</div>}
      {data && <>
        <div style={{ textAlign: 'center', marginBottom: 10 }}><img src={data.qr} alt="QR 2FA" style={{ width: 200, height: 200, borderRadius: 12, border: '1px solid var(--border)' }} /></div>
        <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginBottom: 14 }}>¿No podés escanear? Cargá esta clave:<br /><span className="mono" style={{ fontSize: 13, color: 'var(--text)', wordBreak: 'break-all' }}>{data.secret}</span></div>
        <div className="field">
          <label>Teléfono para WhatsApp {requireWhatsApp ? '' : '(opcional, respaldo)'}</label>
          <input value={tel} onChange={e => setTel(e.target.value)} placeholder="59899123456" inputMode="numeric" />
        </div>
        <div className="field">
          <label>Código de 6 dígitos</label>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="000000" inputMode="numeric" style={{ textAlign: 'center', fontSize: 22, letterSpacing: 4 }} />
        </div>
      </>}
      {err && <div className="badge falla" style={{ width: '100%', justifyContent: 'center', padding: 8, marginBottom: 12 }}><Icon name="alert" size={15} />{err}</div>}
      <button className="btn block" type="submit" disabled={busy || !data || !code || (requireWhatsApp && !tel)}>{busy ? 'Activando…' : 'Activar'}</button>
      {onCancel && <button type="button" className="btn ghost sm block" style={{ marginTop: 10 }} onClick={onCancel}>Cancelar</button>}
    </form>
  );
}
