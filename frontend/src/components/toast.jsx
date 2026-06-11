import React, { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';

export function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type, id: Date.now() + Math.random() } }));
}
toast.ok = (m) => toast(m, 'ok');
toast.err = (m) => toast(m, 'err');

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const t = e.detail;
      setItems(prev => [...prev, t]);
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== t.id)), 3800);
    };
    window.addEventListener('app-toast', on);
    return () => window.removeEventListener('app-toast', on);
  }, []);
  return (
    <div className="toast-host">
      {items.map(t => (
        <div key={t.id} className={'toast ' + (t.type === 'ok' ? 'ok' : t.type === 'err' ? 'err' : '')}>
          <Icon name={t.type === 'err' ? 'alert' : t.type === 'ok' ? 'checkCircle' : 'clock'} size={18} />
          <div>{t.message}</div>
        </div>
      ))}
    </div>
  );
}
