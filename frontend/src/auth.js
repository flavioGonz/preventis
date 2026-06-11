const TKEY = 'preventis_token';
const UKEY = 'preventis_user';

export function getToken() { return localStorage.getItem(TKEY); }
export function getUser() {
  try { return JSON.parse(localStorage.getItem(UKEY) || 'null'); } catch { return null; }
}
export function setSession(token, user) {
  localStorage.setItem(TKEY, token);
  localStorage.setItem(UKEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent('app-login'));
}
export function clearSession() {
  localStorage.removeItem(TKEY);
  localStorage.removeItem(UKEY);
}
export function logout() {
  clearSession();
  window.dispatchEvent(new CustomEvent('app-logout'));
}
