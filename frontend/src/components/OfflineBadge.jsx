import React, { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
import { subscribe, flush, getPendientes } from '../outbox.js';

const ICO = { estado: 'arrowRight', firma: 'signature', prueba: 'box', archivo: 'camera' };

export default function OfflineBadge() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pend, setPend] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = () => getPendientes().then(setItems).catch(() => {});
  useEffect(() => {
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const onSync = () => refresh();
    window.addEventListener('app-synced', onSync);
    const unsub = subscribe((c) => { setPend(c); refresh(); });
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('app-synced', onSync); unsub(); };
  }, []);
  useEffect(() => { if (open) refresh(); }, [open]);

  const sincronizar = async () => { setSyncing(true); try { await flush(); } finally { setSyncing(false); refresh(); } };

  if (online && pend === 0) return null;
  return (
    <>
      <button className={'offbadge ' + (online ? 'sync' : 'off')} onClick={() => setOpen(o => !o)}>
        <Icon name={online ? 'clock' : 'alert'} size={14} />
        {online ? (pend + ' sin sincronizar') : ('Sin conexion' + (pend ? ' - ' + pend + ' en cola' : ''))}
        {pend > 0 && <Icon name={open ? 'minus' : 'plus'} size={13} />}
      </button>
      {open && pend > 0 && (
        <div className="offpanel" onClick={e => e.stopPropagation()}>
          <div className="offpanel-h">
            <b><Icon name="clock" size={14} /> Pendientes de sincronizar</b>
            <button className="offpanel-x" aria-label="Cerrar" onClick={() => setOpen(false)}><Icon name="x" size={15} /></button>
          </div>
          <div className="offpanel-list">
            {items.map(it => (
              <div key={it.id} className="offpanel-row">
                <span className="op-ico"><Icon name={ICO[it.tipo] || 'file'} size={14} /></span>
                <div className="grow">
                  <b>{it.label}</b>
                  {it.visitaId && <small className="muted"> · Visita V-{String(it.visitaId).padStart(5, '0')}</small>}
                </div>
                <small className="muted">{new Date(it.ts).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}</small>
              </div>
            ))}
          </div>
          <div className="offpanel-f">
            <span className="muted" style={{ fontSize: 12 }}>{online ? 'Con conexion' : 'Esperando conexion...'}</span>
            <button className="btn sm" disabled={!online || syncing} onClick={sincronizar}><Icon name="arrowRight" size={14} />{syncing ? 'Sincronizando...' : 'Sincronizar ahora'}</button>
          </div>
        </div>
      )}
    </>
  );
}
