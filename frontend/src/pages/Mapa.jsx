import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Loading } from '../components/ui.jsx';
import MapView from '../components/MapView.jsx';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';
import { getUser } from '../auth.js';
import { AgendarModal } from './Visitas.jsx';

export default function Mapa() {
  const [tick, setTick] = useState(0);
  const [capas, setCapas] = useState({ clientes: true, tecnicos: true, proveedores: true, rutas: true, soloFallas: false });
  const [capasOpen, setCapasOpen] = useState(false);
  const [usuariosPos, setUsuariosPos] = useState([]);
  const [recorrido, setRecorrido] = useState('');
  const [recPts, setRecPts] = useState([]);
  const [base, setBase] = useState(() => { try { return localStorage.getItem('preventis_mapbase') || 'calles'; } catch { return 'calles'; } });
  const [rutasReales, setRutasReales] = useState({});
  const [tecnicos, setTecnicos] = useState([]);
  const [agendaNuevo, setAgendaNuevo] = useState(null);
  const [navTo, setNavTo] = useState(null);
  const [navRuta, setNavRuta] = useState(null);
  const [geo, setGeo] = useState([]);
  const [pin, setPin] = useState(null);
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [ctx, setCtx] = useState(null);
  const mapRef = useRef(null);
  const nav = useNavigate();

  const load = () => api.get('/api/mapa').then(setData);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { api.get('/api/posiciones/usuarios').then(setUsuariosPos).catch(() => {}); api.get('/api/tecnicos').then(setTecnicos).catch(() => {}); }, []);
  useEffect(() => {
    if (!q || q.length < 3 || /^\s*-?\d+[.,]?\d*\s*[,;]/.test(q)) { setGeo([]); return; }
    const t = setTimeout(() => {
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=uy&q=' + encodeURIComponent(q))
        .then(r => r.json()).then(rs => setGeo(Array.isArray(rs) ? rs : [])).catch(() => setGeo([]));
    }, 550);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { if (!recorrido) { setRecPts([]); return; } api.get('/api/posiciones/historial?usuario=' + encodeURIComponent(recorrido)).then(r => setRecPts(r || [])).catch(() => setRecPts([])); }, [recorrido]);
  useEffect(() => { try { localStorage.setItem('preventis_mapbase', base); } catch {} }, [base]);
  // ruteo real por calle (OSRM) para cada tecnico con >=2 visitas del dia
  useEffect(() => {
    if (!data || !capas.rutas) return;
    const grp = {};
    (data.rutas || []).forEach(r => { (grp[r.tecnico] = grp[r.tecnico] || []).push([Number(r.lon), Number(r.lat)]); });
    let alive = true;
    Object.entries(grp).filter(([, pts]) => pts.length > 1).forEach(([tec, pts]) => {
      const coords = pts.map(p => p[0] + ',' + p[1]).join(';');
      fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson')
        .then(r => r.json())
        .then(j => {
          if (!alive || !j.routes || !j.routes[0]) return;
          const rt = j.routes[0];
          setRutasReales(prev => ({ ...prev, [tec]: { geometry: rt.geometry.coordinates.map(c => [c[1], c[0]]), km: (rt.distance / 1000).toFixed(1), min: Math.round(rt.duration / 60) } }));
        }).catch(() => {});
    });
    return () => { alive = false; };
  }, [JSON.stringify((data?.rutas || []).map(r => [r.tecnico, r.lat, r.lon])), capas.rutas]);
  if (!data) return <Loading />;

  const clientes = (data.clientes || []).filter(c => c.lat != null && (!capas.soloFallas || Number(c.fallas) > 0));
  const proveedores = (data.proveedores || []).filter(p => p.lat != null);
  const cliColor = (c) => Number(c.fallas) > 0 ? '#dc2626' : c.vencida ? '#d97706' : '#1d4ed8';
  const markers = [
    ...(capas.tecnicos ? (data.tecnicos || []).filter(t => t.lat != null).map(t => ({ kind: 'tec', lat: t.lat, lon: t.lon, color: '#ea580c', label: t.tecnico, usuario: t.usuario, live: true, avatarUrl: t.avatar_path ? api.base + t.avatar_path : null })) : []),
    ...(capas.clientes ? clientes.map(c => ({ kind: 'cli', id: c.id, lat: c.lat, lon: c.lon, color: cliColor(c), label: c.nombre, direccion: c.direccion })) : []),
    ...(capas.proveedores ? proveedores.map(p => ({ kind: 'prov', id: p.id, lat: p.lat, lon: p.lon, color: '#7c3aed', label: p.nombre, popup: p.nombre + (p.rubro ? ' - ' + p.rubro : '') })) : []),
    ...(pin ? [{ kind: 'pin', lat: pin.lat, lon: pin.lon, color: '#0ea5e9', label: pin.label }] : []),
  ];
  // rutas del dia por tecnico (puntos crudos)
  const RUTACOL = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#be123c'];
  const porTec = {};
  (data.rutas || []).forEach(r => { (porTec[r.tecnico] = porTec[r.tecnico] || []).push([Number(r.lat), Number(r.lon)]); });
  const tecRutas = Object.entries(porTec).filter(([, pts]) => pts.length > 1);
  const lines = [
    ...(capas.rutas ? tecRutas.map(([tec, pts], i) => {
      const real = rutasReales[tec];
      const color = RUTACOL[i % RUTACOL.length];
      return real
        ? { points: real.geometry, color, weight: 4.5, label: tec + ' · ' + real.km + ' km · ' + real.min + ' min' }
        : { points: pts, color, weight: 3, dashed: true, label: tec };
    }) : []),
    ...(recPts.length > 1 ? [{ points: recPts.map(p => [Number(p.lat), Number(p.lon)]), color: '#0ea5e9', weight: 4, className: 'rec-flow', label: 'Recorrido GPS' }] : []),
    ...(navRuta ? [{ points: navRuta.points, color: '#16a34a', weight: 5, className: 'nav-flow', label: 'Ruta: ' + navRuta.tec + ' -> ' + navRuta.cli + ' · ' + navRuta.km + ' km · ' + navRuta.min + ' min' }] : []),
  ];
  const onMarker = (m, pos) => { if (m.kind === 'cli') setCtx({ x: pos.x, y: pos.y, client: m }); else if (m.kind === 'tec') setCtx({ x: pos.x, y: pos.y, tec: m }); };

  const qq = q.toLowerCase();
  const coordMatch = q.match(/^\s*(-?\d+[.,]\d+)\s*[,;\s]\s*(-?\d+[.,]\d+)\s*$/);
  const buscados = q ? [
    ...clientes.filter(c => (c.nombre + ' ' + (c.direccion || '')).toLowerCase().includes(qq)).map(c => ({ ...c, _k: 'cli' })),
    ...(data.tecnicos || []).filter(t => t.lat != null && (t.tecnico || '').toLowerCase().includes(qq)).map(t => ({ id: 't' + t.usuario, nombre: t.tecnico, lat: t.lat, lon: t.lon, _k: 'tec' })),
    ...proveedores.filter(p => ((p.nombre || '') + ' ' + (p.rubro || '')).toLowerCase().includes(qq)).map(p => ({ ...p, _k: 'prov' })),
  ] : [];
  const irA = (c) => { setQ(''); setGeo([]); if (mapRef.current) mapRef.current.flyTo([Number(c.lat), Number(c.lon)], 17); };
  const irGeo = (g) => { const la = Number(g.lat), lo = Number(g.lon); setPin({ lat: la, lon: lo, label: (g.display_name || '').split(',')[0] }); setQ(''); setGeo([]); if (mapRef.current) mapRef.current.flyTo([la, lo], 17); };
  const irCoord = () => { const la = Number(coordMatch[1].replace(',', '.')), lo = Number(coordMatch[2].replace(',', '.')); setPin({ lat: la, lon: lo, label: la.toFixed(5) + ', ' + lo.toFixed(5) }); setQ(''); if (mapRef.current) mapRef.current.flyTo([la, lo], 17); };
  const msgTecnico = async (t) => {
    setCtx(null);
    const texto = prompt('Mensaje para ' + t.label + ':');
    if (!texto) return;
    try { await api.post('/api/tecnicos/mensaje', { usuario: t.usuario, texto }); toast.ok('Mensaje enviado a ' + t.label); }
    catch (e) { toast.err(e.message); }
  };

  const agendar = (c) => {
    setCtx(null);
    setAgendaNuevo({ cliente_id: String(c.id), fecha: new Date().toISOString().slice(0, 10), tecnico_id: '', tipo: 'preventiva', asignada_por: getUser()?.nombre || getUser()?.username || '' });
  };
  const guardarAgenda = async (f) => {
    if (!f.cliente_id) return;
    try {
      const v = await api.post('/api/clientes/' + f.cliente_id + '/visitas', { fecha: f.fecha || null, tecnico_id: f.tecnico_id || null, asignada_por: f.asignada_por || null, tipo: f.tipo || 'preventiva', contrato_id: f.contrato_id || null });
      toast.ok('Visita agendada'); setAgendaNuevo(null); nav('/visitas/' + v.id);
    } catch (e) { toast.err(e.message); }
  };
  // Navegar: elegir tecnico del mapa y dibujar la ruta real
  const tecnicosEnMapa = (data.tecnicos || []).filter(t => t.lat != null);
  const trazarRuta = async (tec, cli) => {
    setNavTo(null); setCtx(null);
    toast('Calculando ruta...');
    try {
      const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + tec.lon + ',' + tec.lat + ';' + cli.lon + ',' + cli.lat + '?overview=full&geometries=geojson').then(x => x.json());
      if (!r.routes || !r.routes[0]) { toast.err('No se pudo calcular la ruta'); return; }
      const rt = r.routes[0];
      setNavRuta({ points: rt.geometry.coordinates.map(c => [c[1], c[0]]), km: (rt.distance / 1000).toFixed(1), min: Math.round(rt.duration / 60), tec: tec.tecnico, cli: cli.label });
      if (mapRef.current) { try { mapRef.current.fitBounds(rt.geometry.coordinates.map(c => [c[1], c[0]]), { padding: [60, 60] }); } catch {} }
      toast.ok('Ruta: ' + (rt.distance / 1000).toFixed(1) + ' km · ' + Math.round(rt.duration / 60) + ' min');
    } catch { toast.err('No se pudo calcular la ruta'); }
  };
  const go = (path) => { setCtx(null); nav(path); };

  return (
    <div className="mapfull" onClick={() => setCtx(null)}>
      <MapView fill baseLayer={base} markers={markers} lines={lines} onMarker={onMarker} onReady={(m) => { mapRef.current = m; }} />

      <img className="map-logo" src="/logo.png" alt="Preventis" onClick={e => e.stopPropagation()} />

      {(data.visitas_activas || []).length > 0 && <div className="map-live" onClick={e => e.stopPropagation()}>
        <div className="ml-title"><span className="ml-dot" />Visitas en curso</div>
        {(data.visitas_activas || []).map(v => {
          const ms = v.hora_entrada ? Date.now() - new Date(v.hora_entrada).getTime() : 0;
          const t = Math.max(0, Math.floor(ms / 1000)); const pad = n => String(n).padStart(2, '0');
          return (
            <div key={v.id} className="ml-row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ml-cli">{v.cliente}</div>
                <div className="subtle" style={{ fontSize: 11.5 }}>{v.tecnico || 'Sin tecnico'}</div>
                <span className="ml-timer">{pad(Math.floor(t / 3600))}:{pad(Math.floor((t % 3600) / 60))}:{pad(t % 60)}</span>
              </div>
              <div className="ml-acts">
                <button className="ml-btn" data-tip="Localizar en el mapa" aria-label="Localizar" onClick={() => { if (v.lat != null && mapRef.current) mapRef.current.flyTo([Number(v.lat), Number(v.lon)], 17); else toast.err('Sin ubicacion'); }}><Icon name="pin" size={15} /></button>
                <button className="ml-btn" data-tip="Abrir la visita" aria-label="Abrir" onClick={() => nav('/visitas/' + v.id)}><Icon name="arrowRight" size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>}

      <button className="map-capas-btn" onClick={e => { e.stopPropagation(); setCapasOpen(o => !o); }} data-tip="Capas y filtros del mapa" aria-label="Capas"><Icon name="filter" size={17} /></button>
      <div className="map-base" onClick={e => e.stopPropagation()}>
        {[['calles', 'Calles', 'pin'], ['satelite', 'Satelite', 'camera'], ['oscuro', 'Oscuro', 'moon']].map(([k, l, ic]) => (
          <button key={k} className={'mb-opt' + (base === k ? ' on' : '')} data-tip={l} onClick={() => setBase(k)}><Icon name={ic} size={15} /></button>
        ))}
      </div>
      {capasOpen && <div className="map-capas" onClick={e => e.stopPropagation()}>
        <b style={{ fontSize: 12.5 }}>Capas</b>
        {[['clientes', 'Clientes'], ['tecnicos', 'Tecnicos'], ['proveedores', 'Proveedores'], ['rutas', 'Rutas del dia'], ['soloFallas', 'Solo con fallas']].map(([k, l]) => (
          <label key={k} className="row" style={{ gap: 7, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!capas[k]} onChange={e => setCapas({ ...capas, [k]: e.target.checked })} />{l}
          </label>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
          <b style={{ fontSize: 12.5 }}>Recorrido GPS (hoy)</b>
          <select style={{ marginTop: 6 }} value={recorrido} onChange={e => setRecorrido(e.target.value)}>
            <option value="">- Sin recorrido -</option>
            {usuariosPos.map(u => <option key={u.usuario} value={u.usuario}>{u.nombre}</option>)}
          </select>
        </div>
      </div>}

      <div className="map-search" onClick={e => e.stopPropagation()}>
        <div className="search" style={{ background: 'var(--surface)', borderRadius: 10, boxShadow: 'var(--sh-md)' }}>
          <Icon name="search" size={16} />
          <input placeholder="Buscar cliente, direccion, tecnico o coordenadas..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {(buscados.length > 0 || geo.length > 0 || coordMatch) && <div className="map-results">
          {coordMatch && <div className="map-result" onClick={irCoord}><Icon name="pin" size={14} /> <span>Ir a coordenadas {coordMatch[1]}, {coordMatch[2]}</span></div>}
          {buscados.slice(0, 6).map(c => (
            <div key={c._k + c.id} className="map-result" onClick={() => irA(c)}>
              <Icon name={c._k === 'tec' ? 'users' : c._k === 'prov' ? 'truck' : 'building'} size={14} /> <span>{c.nombre}</span>
              <small className="muted" style={{ marginLeft: 'auto' }}>{c._k === 'tec' ? 'Tecnico' : c._k === 'prov' ? 'Proveedor' : 'Cliente'}</small>
            </div>
          ))}
          {geo.slice(0, 5).map(g => (
            <div key={g.place_id} className="map-result" onClick={() => irGeo(g)}>
              <Icon name="pin" size={14} /> <span style={{ whiteSpace: 'normal' }}>{g.display_name}</span>
            </div>
          ))}
        </div>}
        {q && q.length >= 3 && buscados.length === 0 && geo.length === 0 && !coordMatch && <div className="map-results"><div className="map-result muted">Sin coincidencias</div></div>}
      </div>

      <div className="map-legend">
        <span className="row" style={{ gap: 6 }}><span className="mk-dot" style={{ background: '#1d4ed8' }} />Clientes</span>
        <span className="row" style={{ gap: 6 }}><span className="mk-dot" style={{ background: '#ea580c' }} />Tecnicos</span>
        <span className="row" style={{ gap: 6 }}><span className="mk-dot" style={{ background: '#7c3aed' }} />Proveedores</span>
        <span className="row" style={{ gap: 6 }}><span className="mk-dot" style={{ background: '#dc2626' }} />Con fallas</span>
        <span className="row" style={{ gap: 6 }}><span className="mk-dot" style={{ background: '#d97706' }} />Visita vencida</span>
      </div>

      {ctx && ctx.client && <div className="ctxmenu" style={{ left: Math.min(ctx.x, window.innerWidth - 230), top: Math.min(ctx.y, window.innerHeight - 200) }} onClick={e => e.stopPropagation()}>
        <div className="ctx-title">{ctx.client.label}</div>
        <button onClick={() => { const c = ctx.client; setCtx(null); if (tecnicosEnMapa.length === 1) trazarRuta(tecnicosEnMapa[0], c); else if (tecnicosEnMapa.length === 0) toast.err('No hay tecnicos en el mapa'); else setNavTo(c); }}><Icon name="pin" size={15} />Trazar ruta de un tecnico</button>
        <button onClick={() => agendar(ctx.client)}><Icon name="calendar" size={15} />Agendar visita</button>
        <button onClick={() => go('/clientes/' + ctx.client.id + '?tab=visitas')}><Icon name="clock" size={15} />Historial de visitas</button>
        <button onClick={() => go('/clientes/' + ctx.client.id + '?tab=equipos')}><Icon name="box" size={15} />Inventario de equipos</button>
        <button onClick={() => go('/clientes/' + ctx.client.id)}><Icon name="building" size={15} />Ver ficha del cliente</button>
      </div>}

      {agendaNuevo && <AgendarModal nuevo={agendaNuevo} clientes={(data.clientes || []).map(c => ({ id: c.id, nombre: c.nombre }))} tecnicos={tecnicos} onClose={() => setAgendaNuevo(null)} onSave={guardarAgenda} />}
      {navTo && <div className="modal-bg" onClick={() => setNavTo(null)}>
        <div className="navpick" onClick={e => e.stopPropagation()}>
          <div className="navpick-h"><b><Icon name="pin" size={15} /> Trazar ruta hasta {navTo.label}</b><button className="btn ghost icon" onClick={() => setNavTo(null)}><Icon name="x" size={16} /></button></div>
          <div className="muted" style={{ fontSize: 12.5, padding: '0 2px 8px' }}>Elegi el tecnico desde el que dibujar la ruta:</div>
          <div className="navpick-list">
            {tecnicosEnMapa.map(t => (
              <button key={t.usuario} className="navpick-it" onClick={() => trazarRuta(t, navTo)}>
                <span className="np-av">{t.avatar_path ? <img src={api.base + t.avatar_path} alt="" /> : <Icon name="users" size={15} />}</span>
                <span className="grow">{t.tecnico}</span><Icon name="chevronRight" size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>}
      {navRuta && <div className="nav-chip" onClick={e => e.stopPropagation()}>
        <Icon name="pin" size={14} />
        <span><b>{navRuta.km} km · {navRuta.min} min</b><small>{navRuta.tec} &rarr; {navRuta.cli}</small></span>
        <button onClick={() => setNavRuta(null)} aria-label="Quitar ruta"><Icon name="x" size={14} /></button>
      </div>}
      {ctx && ctx.tec && <div className="ctxmenu" style={{ left: Math.min(ctx.x, window.innerWidth - 230), top: Math.min(ctx.y, window.innerHeight - 160) }} onClick={e => e.stopPropagation()}>
        <div className="ctx-title">{ctx.tec.label}</div>
        <button onClick={() => msgTecnico(ctx.tec)}><Icon name="mail" size={15} />Enviar mensaje</button>
        {ctx.tec.usuario && <button onClick={() => { setRecorrido(ctx.tec.usuario); setCapasOpen(true); setCtx(null); }}><Icon name="history" size={15} />Ver recorrido de hoy</button>}
        <button onClick={() => { window.open('https://www.google.com/maps/dir/?api=1&destination=' + ctx.tec.lat + ',' + ctx.tec.lon, '_blank'); setCtx(null); }}><Icon name="pin" size={15} />Navegar hasta aqui</button>
      </div>}
    </div>
  );
}
