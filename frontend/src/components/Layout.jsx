import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom';
import { Icon } from './icons.jsx';
import { logout, getUser } from '../auth.js';
import { getBranding, onBranding } from '../branding.js';
import { api } from '../api.js';

import Drawer from './Drawer.jsx';
import { io } from 'socket.io-client';
import { toast } from './toast.jsx';
import OfflineBadge from './OfflineBadge.jsx';

const NAV = [
  { to: '/', label: 'Inicio', icon: 'clipboard', end: true },
  { to: '/clientes', label: 'Clientes', icon: 'users' },
  { to: '/tickets', label: 'Tickets', icon: 'ticket' },
  { to: '/visitas', label: 'Visitas', icon: 'calendar' },
  { to: '/inventario', label: 'Inventario', icon: 'box' },
  { to: '/contratos', label: 'Contratos', icon: 'pen' },
  { to: '/contable', label: 'Contable', icon: 'file' },
  { to: '/flota', label: 'Flota', icon: 'truck' },
  { to: '/reportes', label: 'Reportes', icon: 'file' },
  { to: '/mapa', label: 'Mapa', icon: 'pin' },
  { to: '/buscar', label: 'Buscar QR', icon: 'qr' },
  { to: '/configuracion', label: 'Configuracion', icon: 'settings' },
];
// Items principales de la barra inferior (movil); el resto va en el drawer
const BOTTOM = [NAV[0], NAV[1], NAV[2], NAV[5]];
// En movil la barra inferior cubre Inicio/Clientes/Visitas/Inventario/Buscar; el resto va al sheet "Mas"
const NAV_EXTRA = [
  { to: '/tickets', label: 'Tickets', icon: 'ticket' },
  { to: '/contratos', label: 'Contratos', icon: 'pen' },
  { to: '/contable', label: 'Contable', icon: 'file' },
  { to: '/flota', label: 'Flota', icon: 'truck' },
  { to: '/reportes', label: 'Reportes', icon: 'file' },
  { to: '/mapa', label: 'Mapa', icon: 'pin' },
  { to: '/configuracion', label: 'Configuracion', icon: 'settings' },
];

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  const toggle = () => { const d = !dark; setDark(d); document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light'); try { localStorage.setItem('preventis_theme', d ? 'dark' : 'light'); } catch {} };
  return <button className={'theme-tog' + (dark ? ' on' : '')} onClick={toggle} data-tip="Cambiar tema" aria-label="Cambiar tema"><span className="tt-knob"><Icon name={dark ? 'moon' : 'sun'} size={13} /></span></button>;
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  const fecha = now.toLocaleDateString('es-UY', { weekday: 'short', day: '2-digit', month: 'short' });
  const hora = now.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
  return <div className="appclock"><Icon name="clock" size={15} /><span><b>{hora}</b><small>{fecha}</small></span></div>;
}

function Brand() {
  const [b, setB] = useState(getBranding());
  const [ver, setVer] = useState(null);
  useEffect(() => onBranding(setB), []);
  useEffect(() => { api.get('/api/app/version').then(setVer).catch(() => { }); }, []);
  const logo = b?.logo_path ? api.base + b.logo_path : '/logo_es.png';
  return (
    <div className="brand">
      <img src={logo} alt={b?.app_nombre || 'Preventis'} style={{ height: 30 }} onError={e => { e.target.src = '/logo_es.png'; }} />
      <div className="brand-txt">
        <span className="brand-name">{b?.app_nombre || 'Preventis'}</span>
        {ver && <span className="brand-ver">v{ver.version}{ver.commit ? ' · ' + ver.commit : ''}</span>}
      </div>
    </div>
  );
}

function UserChip({ user, avatar }) {
  return (
    <div className="userchip">
      <div className="avatar">{avatar ? <img src={api.base + avatar} alt="" /> : (user.nombre || user.username || '?').slice(0, 1).toUpperCase()}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="un">{user.nombre || user.username}</div>
        <div className="ur">{user.rol}</div>
      </div>
      <button className="btn ghost icon" data-tip="Cerrar sesion" aria-label="Cerrar sesion" onClick={logout}><Icon name="arrowRight" size={16} /></button>
    </div>
  );
}

function diasA(fechaIso) {
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const d = new Date(fechaIso); d.setHours(0, 0, 0, 0);
  return Math.round((d - h) / 86400000);
}

function Notificaciones({ onNav, rt = [] }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/api/dashboard').then(setData).catch(() => setData({ proximas: [], en_falla: [] })); }, []);
  if (!data) return <div className="muted" style={{ padding: 16, fontSize: 13 }}>Cargando...</div>;
  const vencidas = (data.proximas || []).filter(c => diasA(c.proxima) <= 0);
  const proximas = (data.proximas || []).filter(c => { const d = diasA(c.proxima); return d > 0 && d <= 7; });
  const falla = data.en_falla || [];
  const vacio = !vencidas.length && !proximas.length && !falla.length;
  const vacioTotal = vacio && rt.length === 0;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {vacioTotal && <div className="empty" style={{ padding: 24 }}><div className="eico"><Icon name="checkCircle" size={24} /></div><div className="et">Todo al dia</div></div>}
      {rt.length > 0 && <div className="nav-section" style={{ padding: '2px 4px 4px' }}>En vivo</div>}
      {rt.map(e => (
        <div key={e.id} className="notif" onClick={() => e.url && onNav(e.url)}>
          <div className="ico" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}><Icon name={e.icon || 'bell'} size={16} /></div>
          <div className="grow"><b>{e.text}</b><div className="muted" style={{ fontSize: 12 }}>{new Date(e.ts).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}</div></div>
          <Icon name="chevronRight" size={16} color="var(--subtle)" />
        </div>
      ))}
      {(vencidas.length || proximas.length || falla.length) ? <div className="nav-section" style={{ padding: '8px 4px 4px' }}>Pendientes</div> : null}
      {vencidas.map(c => (
        <div key={'v' + c.id} className="notif" onClick={() => onNav('/clientes/' + c.id)}>
          <div className="ico" style={{ background: 'var(--falla-bg)', color: 'var(--falla)' }}><Icon name="calendar" size={16} /></div>
          <div className="grow"><b>{c.nombre}</b><div className="muted" style={{ fontSize: 12 }}>Visita vencida ({Math.abs(diasA(c.proxima))}d)</div></div>
          <Icon name="chevronRight" size={16} color="var(--subtle)" />
        </div>
      ))}
      {proximas.map(c => (
        <div key={'p' + c.id} className="notif" onClick={() => onNav('/clientes/' + c.id)}>
          <div className="ico" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}><Icon name="calendar" size={16} /></div>
          <div className="grow"><b>{c.nombre}</b><div className="muted" style={{ fontSize: 12 }}>Proxima visita en {diasA(c.proxima)}d</div></div>
          <Icon name="chevronRight" size={16} color="var(--subtle)" />
        </div>
      ))}
      {falla.map(e => (
        <div key={'f' + e.id} className="notif" onClick={() => onNav('/equipos/' + e.id)}>
          <div className="ico" style={{ background: 'var(--falla-bg)', color: 'var(--falla)' }}><Icon name="alert" size={16} /></div>
          <div className="grow"><b>{e.etiqueta || e.codigo_qr}</b><div className="muted" style={{ fontSize: 12 }}>{e.cliente} - {e.ultimo_estado}</div></div>
          <Icon name="chevronRight" size={16} color="var(--subtle)" />
        </div>
      ))}
    </div>
  );
}

export default function Layout({ children, user }) {
  const loc = useLocation();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [notif, setNotif] = useState(false);
  const [rt, setRt] = useState([]);
  const [unread, setUnread] = useState(0);
  const [perfil, setPerfil] = useState(null);
  const [badges, setBadges] = useState({});
  const loadBadges = () => api.get('/api/badges').then(setBadges).catch(() => {});
  const badgeFor = (to) => to === '/visitas' ? (badges.visitas_pendientes || 0) : to === '/tickets' ? (badges.tickets_abiertos || 0) : to === '/inventario' ? (badges.fallas || 0) : to === '/mapa' ? (badges.tecnicos_calle || 0) : 0;
  const full = loc.pathname.startsWith('/mapa') || loc.pathname.endsWith('/planos');

  // Notificaciones en tiempo real (socket.io)
  useEffect(() => {
    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.on('notif', (evt) => {
      if (evt.para && evt.para !== (getUser()?.username)) return;
      setRt(prev => [evt, ...prev].slice(0, 30));
      setUnread(u => u + 1);
      toast(evt.text || 'Nueva notificacion', 'ok');
      loadBadges();
    });
    return () => { try { socket.close(); } catch {} };
  }, []);

  useEffect(() => { if (user) api.get('/api/perfil').then(setPerfil).catch(() => {}); }, []);
  useEffect(() => { if (!user) return; loadBadges(); const t = setInterval(loadBadges, 60000); return () => clearInterval(t); }, []);

  // Tracking GPS del usuario (ping de posicion)
  useEffect(() => {
    if (!user || !('geolocation' in navigator)) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - last < 15000) return;
        last = now;
        api.post('/api/posiciones', { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => { try { navigator.geolocation.clearWatch(id); } catch {} };
  }, [user]);
  const goNav = (p) => { setNotif(false); setMenu(false); nav(p); };

  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        <nav className="nav">
          <div className="nav-section">Principal</div>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <Icon name={n.icon} size={18} /> {n.label}{badgeFor(n.to) > 0 && <span className={'nav-badge' + (n.to === '/inventario' ? ' red' : '')}>{badgeFor(n.to)}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot"><div className="row between" style={{ marginBottom: 10 }}><OfflineBadge /><div className="row" style={{ gap: 8 }}><Clock /><ThemeToggle /></div></div>{user && <UserChip user={user} avatar={perfil?.avatar_path} />}</div>
      </aside>

      <div className="main">
        <div className="topbar-m">
          <img className="tb-logo" src={(getBranding()?.logo_path ? api.base + getBranding().logo_path : "/logo_es.png")} alt="" onError={e => { e.target.src = "/logo_es.png"; }} />
          <span className="grow" />
          <OfflineBadge />
          <span className="tb-theme"><ThemeToggle /></span>
          <button className="tb-btn bell-btn" aria-label="Notificaciones" onClick={() => { setNotif(true); setUnread(0); }}><Icon name="bell" size={20} />{unread > 0 && <span className="bell-dot" />}</button>
          <button className="tb-btn" aria-label="Mas opciones" onClick={() => setMenu(true)}><Icon name="more" size={22} /></button>
        </div>
        <div className={'content' + (full ? ' full' : '')}>
          <div className="page-anim" key={loc.pathname} style={full ? { flex: 1, display: 'flex' } : undefined}>{children}</div>
        </div>
      </div>

      <nav className="bottomnav">
        <NavLink to="/" end className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}><span className="bn-ico"><Icon name="clipboard" size={21} /></span>Inicio</NavLink>
        <NavLink to="/clientes" className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}><span className="bn-ico"><Icon name="users" size={21} /></span>Clientes</NavLink>
        <NavLink to="/visitas" className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}><span className="bn-ico"><Icon name="calendar" size={21} />{badgeFor('/visitas') > 0 && <span className="bn-badge brand">{badgeFor('/visitas')}</span>}</span>Visitas</NavLink>
        <NavLink to="/inventario" className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}><span className="bn-ico"><Icon name="box" size={21} />{badgeFor('/inventario') > 0 && <span className="bn-badge">{badgeFor('/inventario')}</span>}</span>Inventario</NavLink>
        <NavLink to="/buscar" className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}><span className="bn-ico"><Icon name="qr" size={21} /></span>Buscar</NavLink>
      </nav>

      <Drawer open={menu} onClose={() => setMenu(false)} title="Mas opciones" side="bottom">
        <nav className="nav">
          {NAV_EXTRA.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenu(false)} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <Icon name={n.icon} size={18} /> {n.label}{badgeFor(n.to) > 0 && <span className={'nav-badge' + (n.to === '/inventario' ? ' red' : '')}>{badgeFor(n.to)}</span>}
            </NavLink>
          ))}
        </nav>
        {user && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}><UserChip user={user} avatar={perfil?.avatar_path} /></div>}
      </Drawer>

      <Drawer open={notif} onClose={() => setNotif(false)} title="Notificaciones" side="bottom">
        <Notificaciones onNav={goNav} rt={rt} />
      </Drawer>
    </div>
  );
}
