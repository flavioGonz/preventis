// Passkeys (WebAuthn) en el cliente: registro y login con Face ID / huella / Windows Hello.
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { api } from './api.js';

export function passkeySupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

// Registra una passkey para el usuario autenticado.
export async function registerPasskey(deviceName) {
  const opts = await api.post('/api/webauthn/register/options', {});
  const att = await startRegistration(opts);
  return api.post('/api/webauthn/register/verify', { response: att, device_name: deviceName || '' });
}

// Login con passkey. body: { username?, pending? }
export async function loginPasskey(body = {}) {
  const opts = await api.post('/api/webauthn/login/options', body);
  const asr = await startAuthentication(opts);
  return api.post('/api/webauthn/login/verify', { challengeId: opts.challengeId, response: asr });
}
