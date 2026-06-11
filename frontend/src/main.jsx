import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
import { flush } from './outbox.js';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

// Quitar splash una vez montada la app
requestAnimationFrame(() => {
  const sp = document.getElementById('splash');
  if (sp) { sp.classList.add('hide'); setTimeout(() => sp.remove(), 450); }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
setTimeout(() => { try { flush(); } catch {} }, 1500);
