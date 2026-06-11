import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.jsx';

export default function Drawer({ open, onClose, title, side = 'bottom', children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const node = (
    <div className="drawer-bg" onClick={onClose}>
      <div className={'drawer ' + side} onClick={e => e.stopPropagation()}>
        <div className="drawer-head">
          <b>{title}</b>
          <button className="btn ghost icon" aria-label="Cerrar" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}
