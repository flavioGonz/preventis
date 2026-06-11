// Notificaciones en tiempo real via socket.io + buffer de eventos recientes
let ioRef = null;
let waSender = null;
const recent = [];

export function setIO(io) { ioRef = io; }
export function setWaSender(fn) { waSender = fn; }

export function notify(payload) {
  const evt = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), ts: new Date().toISOString(), ...payload };
  recent.unshift(evt);
  if (recent.length > 60) recent.pop();
  try { if (ioRef) ioRef.emit('notif', evt); } catch {}
  try { if (waSender) waSender(evt); } catch {}
  return evt;
}

export function recentEvents() { return recent; }
