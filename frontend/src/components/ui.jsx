import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.jsx';

export function Modal({ title, subtitle, children, onClose, footer }) {
  const node = (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="btn ghost icon" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}

export function Field({ label, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

export function PageHeader({ title, desc, actions, icon }) {
  return (
    <div className="page-head">
      <div className="ph-row">
        {icon && <span className="ph-ic"><Icon name={icon} size={20} /></span>}
        <div>
          <div className="ttl">{title}</div>
          {desc && <div className="desc">{desc}</div>}
        </div>
      </div>
      {actions && <div className="row wrap" style={{ gap: 8 }}>{actions}</div>}
    </div>
  );
}

export function Stat({ icon, label, value, tone }) {
  return (
    <div className={'stat ' + (tone || '')}>
      <div className="row between">
        <div className="k">{label}</div>
        {icon && <div className="ic"><Icon name={icon} size={16} /></div>}
      </div>
      <div className="v">{value}</div>
    </div>
  );
}

export function Loading({ rows = 4, header = true }) {
  return (
    <div>
      {header && <div className="skel" style={{ height: 26, width: '34%', marginBottom: 18, borderRadius: 9 }} />}
      <div className="list">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="skel" style={{ width: 44, height: 44, borderRadius: 12, flex: 'none' }} />
            <div style={{ flex: 1 }}>
              <div className="skel" style={{ height: 13, width: (58 - i * 6) + '%', marginBottom: 8, borderRadius: 6 }} />
              <div className="skel" style={{ height: 10, width: (42 + i * 5) + '%', borderRadius: 6 }} />
            </div>
            <div className="skel" style={{ width: 62, height: 22, borderRadius: 999, flex: 'none' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Empty({ icon = 'box', title, children, action }) {
  return (
    <div className="empty">
      <div className="eico"><Icon name={icon} size={26} /></div>
      {title && <div className="et">{title}</div>}
      <div style={{ marginTop: 4 }}>{children}</div>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function estadoBadge(estado, esFalla) {
  if (!estado) return <span className="badge gris"><span className="dot" />Sin estado</span>;
  return <span className={'badge ' + (esFalla ? 'falla' : 'ok')}><span className="dot" />{estado}</span>;
}
