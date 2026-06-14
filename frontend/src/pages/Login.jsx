import React, { useState } from 'react';
import { api } from '../api.js';
import { setSession } from '../auth.js';
import { Icon } from '../components/icons.jsx';
import { TwoFAChallenge, TwoFASetup } from '../components/TwoFA.jsx';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('login'); // login | 2fa | setup
  const [pending, setPending] = useState(null);
  const [methods, setMethods] = useState(['totp']);
  const [phoneHint, setPhoneHint] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [setupToken, setSetupToken] = useState(null);

  const entrar = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await api.post('/api/auth/login', { username, password });
      if (r.twofa_required) { setPending(r.pending); setMethods(r.methods || ['totp']); setPhoneHint(r.phone_hint || ''); setEmailHint(r.email_hint || ''); setStage('2fa'); }
      else if (r.twofa_setup_required) { setSetupToken(r.setup_token); setStage('setup'); }
      else setSession(r.token, r.user);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const volver = () => { setStage('login'); setPending(null); setSetupToken(null); setPassword(''); setError(''); };

  if (stage === '2fa') {
    return (
      <div className="login-wrap">
        <TwoFAChallenge pending={pending} methods={methods} phoneHint={phoneHint} emailHint={emailHint}
          onVerified={(token, user) => setSession(token, user)} onCancel={volver} />
        <div className="login-foot">IES - Ingenieria en Seguridad</div>
      </div>
    );
  }

  if (stage === 'setup') {
    return (
      <div className="login-wrap">
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div className="badge warn" style={{ width: '100%', justifyContent: 'center', padding: 8, marginBottom: 12 }}>
            <Icon name="alert" size={15} />Tu cuenta requiere verificación en dos pasos
          </div>
          <TwoFASetup token={setupToken} onDone={(token, user) => token ? setSession(token, user) : volver()} onCancel={volver} />
        </div>
        <div className="login-foot">IES - Ingenieria en Seguridad</div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={entrar}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <img src="/logo_es.png" alt="IES" style={{ height: 58 }} />
        </div>
        <h2 style={{ marginBottom: 4, textAlign: 'center' }}>Preventis</h2>
        <div className="muted" style={{ fontSize: 13, marginBottom: 20, textAlign: 'center' }}>Gestion de mantenimientos preventivos</div>

        <div className="field">
          <label>Usuario</label>
          <input value={username} autoFocus onChange={e => setUsername(e.target.value)} placeholder="usuario" />
        </div>
        <div className="field">
          <label>Contrasena</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="********" />
        </div>
        {error && <div className="badge falla" style={{ width: '100%', justifyContent: 'center', padding: '8px', marginBottom: 12 }}>
          <Icon name="alert" size={15} />{error}</div>}
        <button className="btn block" type="submit" disabled={busy || !username}>
          {busy ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
      <div className="login-foot">IES - Ingenieria en Seguridad</div>
    </div>
  );
}
