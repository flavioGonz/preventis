import React, { useRef, useEffect } from 'react';
import { Icon } from './icons.jsx';

// Editor de texto enriquecido liviano (sin dependencias): contentEditable + toolbar.
// Guarda HTML en `value` y lo emite por `onChange`. Si queda vacío, emite ''.
export default function RichText({ value, onChange, placeholder, disabled }) {
  const ref = useRef(null);

  // Sincroniza el HTML externo (carga inicial, dictado por voz, etc.) sin pisar el cursor mientras se escribe.
  useEffect(() => {
    const el = ref.current;
    if (el && (value || '') !== el.innerHTML) el.innerHTML = value || '';
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const txt = (el.textContent || '').replace(/ /g, ' ').trim();
    onChange(txt === '' ? '' : el.innerHTML);
  };

  const cmd = (e, command) => {
    e.preventDefault();
    if (disabled) return;
    ref.current?.focus();
    try { document.execCommand(command, false, null); } catch {}
    emit();
  };

  const Btn = ({ c, label, children }) => (
    <button type="button" className="rt-btn" title={label} aria-label={label} onMouseDown={e => cmd(e, c)} tabIndex={-1}>{children}</button>
  );

  return (
    <div className={'rt-wrap' + (disabled ? ' rt-disabled' : '')}>
      <div className="rt-bar">
        <Btn c="bold" label="Negrita"><b>B</b></Btn>
        <Btn c="italic" label="Cursiva"><i>I</i></Btn>
        <Btn c="underline" label="Subrayado"><u>U</u></Btn>
        <span className="rt-sep" />
        <Btn c="insertUnorderedList" label="Lista"><Icon name="list" size={14} /></Btn>
      </div>
      <div ref={ref} className="rt-edit" contentEditable={!disabled} suppressContentEditableWarning
        data-ph={placeholder || ''} onInput={emit} onBlur={emit} />
    </div>
  );
}
