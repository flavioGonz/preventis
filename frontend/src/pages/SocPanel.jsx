import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.jsx';

// Bandera emoji desde código ISO-3166 alfa-2 (funciona con cualquier código de 2 letras).
const flag = (cc) => (cc && /^[A-Za-z]{2}$/.test(cc))
  ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0))) : '🏴‍☠️';

// Países frecuentes (código ISO2 + nombre en español). El flag() igual resuelve códigos fuera de esta lista.
const PAISES = [
  ['UY', 'Uruguay'], ['AR', 'Argentina'], ['BR', 'Brasil'], ['CL', 'Chile'], ['PY', 'Paraguay'], ['BO', 'Bolivia'], ['PE', 'Perú'],
  ['CO', 'Colombia'], ['EC', 'Ecuador'], ['VE', 'Venezuela'], ['MX', 'México'], ['US', 'Estados Unidos'], ['CA', 'Canadá'],
  ['CR', 'Costa Rica'], ['PA', 'Panamá'], ['GT', 'Guatemala'], ['HN', 'Honduras'], ['SV', 'El Salvador'], ['NI', 'Nicaragua'],
  ['DO', 'Rep. Dominicana'], ['CU', 'Cuba'], ['PR', 'Puerto Rico'], ['ES', 'España'], ['PT', 'Portugal'], ['FR', 'Francia'],
  ['IT', 'Italia'], ['DE', 'Alemania'], ['GB', 'Reino Unido'], ['IE', 'Irlanda'], ['NL', 'Países Bajos'], ['BE', 'Bélgica'],
  ['CH', 'Suiza'], ['AT', 'Austria'], ['SE', 'Suecia'], ['NO', 'Noruega'], ['DK', 'Dinamarca'], ['FI', 'Finlandia'],
  ['PL', 'Polonia'], ['CZ', 'Chequia'], ['RO', 'Rumania'], ['GR', 'Grecia'], ['RU', 'Rusia'], ['UA', 'Ucrania'], ['TR', 'Turquía'],
  ['CN', 'China'], ['JP', 'Japón'], ['KR', 'Corea del Sur'], ['IN', 'India'], ['ID', 'Indonesia'], ['VN', 'Vietnam'],
  ['SG', 'Singapur'], ['AU', 'Australia'], ['NZ', 'Nueva Zelanda'], ['ZA', 'Sudáfrica'], ['NG', 'Nigeria'], ['EG', 'Egipto'],
  ['MA', 'Marruecos'], ['IL', 'Israel'], ['AE', 'Emiratos Árabes'], ['SA', 'Arabia Saudita'], ['IR', 'Irán'],
];
const paisNom = (cc) => (PAISES.find(p => p[0] === cc) || [cc, cc])[1];

const EVT = {
  intento_fallido: ['Intento fallido', '#f59e0b', 'alert'],
  ban: ['Baneo automático', '#ef4444', 'ban'],
  ban_manual: ['Baneo manual', '#ef4444', 'ban'],
  bloqueo_ban: ['Bloqueo (IP baneada)', '#dc2626', 'shield'],
  bloqueo_pais: ['Bloqueo por país', '#a855f7', 'globe'],
  login_ok: ['Ingreso correcto', '#22c55e', 'checkCircle'],
  unban: ['Deslistada', '#38bdf8', 'checkCircle'],
};

const C = { bg: '#0b1220', card: '#111a2e', card2: '#0f1729', line: '#1e293b', txt: '#e2e8f0', dim: '#94a3b8', accent: '#38bdf8' };
const fdt = (d) => d ? new Date(d).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const rel = (d) => { const s = (Date.now() - new Date(d).getTime()) / 1000; if (s < 60) return 'hace ' + Math.floor(s) + 's'; if (s < 3600) return 'hace ' + Math.floor(s / 60) + 'm'; if (s < 86400) return 'hace ' + Math.floor(s / 3600) + 'h'; return 'hace ' + Math.floor(s / 86400) + 'd'; };

export default function SocPanel() {
  const [cfg, setCfg] = useState(null);
  const [stats, setStats] = useState(null);
  const [bans, setBans] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [miIp, setMiIp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [paisQ, setPaisQ] = useState('');
  const [manIp, setManIp] = useState(''); const [manMotivo, setManMotivo] = useState(''); const [manMin, setManMin] = useState('');

  const cargar = () => {
    api.get('/api/seguridad/config').then(setCfg).catch(() => { });
    api.get('/api/seguridad/stats').then(setStats).catch(() => { });
    api.get('/api/seguridad/bans').then(setBans).catch(() => { });
    api.get('/api/seguridad/eventos?limit=120').then(setEventos).catch(() => { });
    api.get('/api/seguridad/mi-ip').then(setMiIp).catch(() => { });
  };
  useEffect(() => { cargar(); const t = setInterval(() => { api.get('/api/seguridad/stats').then(setStats).catch(() => { }); api.get('/api/seguridad/eventos?limit=120').then(setEventos).catch(() => { }); }, 20000); return () => clearInterval(t); }, []);

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }));
  const togglePais = (cc) => setCfg(c => ({ ...c, paises: (c.paises || []).includes(cc) ? c.paises.filter(x => x !== cc) : [...(c.paises || []), cc] }));
  const guardar = async () => { setSaving(true); try { const r = await api.put('/api/seguridad/config', cfg); setCfg(r); toast.ok('Configuración de seguridad guardada'); } catch (e) { toast.err(e.message); } setSaving(false); };
  const banear = async () => { if (!manIp.trim()) return; try { await api.post('/api/seguridad/bans', { ip: manIp.trim(), motivo: manMotivo || 'Baneo manual', min: Number(manMin) || 0 }); toast.ok('IP baneada'); setManIp(''); setManMotivo(''); setManMin(''); cargar(); } catch (e) { toast.err(e.message); } };
  const deslistar = async (ip) => { if (!confirm('¿Deslistar la IP ' + ip + '?')) return; try { await api.del('/api/seguridad/bans/' + encodeURIComponent(ip)); toast.ok('IP deslistada'); cargar(); } catch (e) { toast.err(e.message); } };

  if (!cfg) return <div style={{ padding: 20, color: C.dim }}>Cargando panel de seguridad…</div>;

  const KPI = ({ ic, label, value, color }) => (
    <div style={{ flex: 1, minWidth: 150, background: C.card, border: '1px solid ' + C.line, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.dim, fontSize: 12.5, marginBottom: 6 }}><span style={{ color }}><Icon name={ic} size={15} /></span>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: C.txt, lineHeight: 1 }}>{value ?? 0}</div>
    </div>
  );
  const paisesFiltrados = PAISES.filter(([cc, nm]) => !paisQ || (nm.toLowerCase().includes(paisQ.toLowerCase()) || cc.toLowerCase().includes(paisQ.toLowerCase())));

  return (
    <div style={{ background: C.bg, color: C.txt, borderRadius: 16, padding: 18, border: '1px solid ' + C.line }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icon name="shield" size={24} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: .3 }}>Centro de Seguridad · SOC</div>
          <div style={{ color: C.dim, fontSize: 12.5 }}>Firewall de accesos, auto-baneo por fuerza bruta y control geográfico</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: cfg.enabled ? '#22c55e' : '#ef4444', background: (cfg.enabled ? '#052e1a' : '#3b0d0d'), border: '1px solid ' + (cfg.enabled ? '#14532d' : '#7f1d1d'), padding: '5px 10px', borderRadius: 999 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 8px currentColor' }} />{cfg.enabled ? 'Protección activa' : 'Protección desactivada'}
        </span>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KPI ic="alert" label="Intentos fallidos (24h)" value={stats?.intentos_24h} color="#f59e0b" />
        <KPI ic="globe" label="IPs atacantes (24h)" value={stats?.ips_24h} color="#38bdf8" />
        <KPI ic="ban" label="Baneos automáticos (24h)" value={stats?.bans_24h} color="#ef4444" />
        <KPI ic="shield" label="Bloqueos por país (24h)" value={stats?.pais_24h} color="#a855f7" />
        <KPI ic="ban" label="IPs baneadas ahora" value={stats?.bans_activos} color="#22c55e" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14 }}>
        {/* Configuración */}
        <div style={{ background: C.card, border: '1px solid ' + C.line, borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="settings" size={16} />Configuración del firewall</div>
          <label style={row}><input type="checkbox" checked={!!cfg.enabled} onChange={e => set('enabled', e.target.checked)} /><span>Protección activada</span></label>
          <label style={row}><input type="checkbox" checked={!!cfg.auto_ban} onChange={e => set('auto_ban', e.target.checked)} /><span>Auto-banear por fuerza bruta</span></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, margin: '10px 0' }}>
            <Num label="Intentos máx." value={cfg.max_intentos} onChange={v => set('max_intentos', v)} />
            <Num label="Ventana (min)" value={cfg.ventana_min} onChange={v => set('ventana_min', v)} />
            <Num label="Ban (min, 0=∞)" value={cfg.ban_min} onChange={v => set('ban_min', v)} />
          </div>
          <div style={{ height: 1, background: C.line, margin: '12px 0' }} />
          <label style={row}><input type="checkbox" checked={!!cfg.geo_enabled} onChange={e => set('geo_enabled', e.target.checked)} /><span>Restringir acceso por país (lista blanca)</span></label>
          <div style={{ color: C.dim, fontSize: 12, margin: '2px 0 8px 26px' }}>Solo se permitirá iniciar sesión desde los países seleccionados.</div>
          {cfg.geo_enabled && <>
            {(cfg.paises || []).length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(cfg.paises || []).map(cc => <span key={cc} style={chip}>{flag(cc)} {paisNom(cc)}<button onClick={() => togglePais(cc)} style={chipX}><Icon name="x" size={11} /></button></span>)}
            </div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card2, border: '1px solid ' + C.line, borderRadius: 10, padding: '6px 10px' }}>
              <Icon name="search" size={15} /><input value={paisQ} onChange={e => setPaisQ(e.target.value)} placeholder="Buscar país para permitir…" style={inp} />
            </div>
            {paisQ.trim() && <div style={{ maxHeight: 190, overflow: 'auto', border: '1px solid ' + C.line, borderRadius: 10, marginTop: 6 }}>
              {paisesFiltrados.length === 0 ? <div style={{ padding: 10, color: C.dim, fontSize: 13 }}>Sin resultados</div> :
                paisesFiltrados.map(([cc, nm]) => <div key={cc} onClick={() => togglePais(cc)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 14, background: (cfg.paises || []).includes(cc) ? '#0e2033' : 'transparent' }}>
                  <span style={{ fontSize: 18 }}>{flag(cc)}</span>{nm}<span style={{ marginLeft: 'auto', color: C.dim, fontSize: 11 }}>{cc}</span>
                  {(cfg.paises || []).includes(cc) && <Icon name="check" size={14} color="#22c55e" />}
                </div>)}
            </div>}
          </>}
          <button onClick={guardar} disabled={saving} style={{ ...btn, marginTop: 14, background: C.accent, color: '#07121f', width: '100%', justifyContent: 'center' }}><Icon name="check" size={16} />{saving ? 'Guardando…' : 'Guardar configuración'}</button>
          {miIp && <div style={{ marginTop: 12, fontSize: 12.5, color: C.dim, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Icon name="globe" size={13} />Tu IP: <b style={{ color: C.txt, fontFamily: 'monospace' }}>{miIp.ip || '—'}</b>
            {miIp.pais && <span>{flag(miIp.pais)} {paisNom(miIp.pais)}</span>}
            {miIp.privada && <span style={{ color: '#22c55e' }}>(red interna)</span>}
            {miIp.pais && cfg.geo_enabled && !(cfg.paises || []).includes(miIp.pais) && <button onClick={() => togglePais(miIp.pais)} style={{ ...btn, padding: '3px 8px', fontSize: 12, background: '#052e1a', color: '#4ade80', border: '1px solid #14532d' }}>Permitir mi país</button>}
          </div>}
        </div>

        {/* Feed de eventos */}
        <div style={{ background: C.card, border: '1px solid ' + C.line, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', minHeight: 360 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="history" size={16} />Actividad reciente<span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} /></div>
          <div style={{ overflow: 'auto', flex: 1, maxHeight: 420 }}>
            {eventos.length === 0 ? <div style={{ color: C.dim, fontSize: 13, padding: 10 }}>Sin actividad registrada.</div> :
              eventos.map(ev => { const [lbl, col] = EVT[ev.tipo] || [ev.tipo, C.dim, 'alert']; return (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid ' + C.line, fontSize: 12.5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <span style={{ color: col, minWidth: 128, fontWeight: 600 }}>{lbl}</span>
                  <span style={{ fontFamily: 'monospace', color: C.txt }}>{ev.pais ? flag(ev.pais) + ' ' : ''}{ev.ip || '—'}</span>
                  <span style={{ color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.username ? '· ' + ev.username : ''}{ev.detalle ? ' · ' + ev.detalle : ''}</span>
                  <span style={{ marginLeft: 'auto', color: C.dim, flexShrink: 0 }} title={fdt(ev.ts)}>{rel(ev.ts)}</span>
                </div>
              ); })}
          </div>
        </div>
      </div>

      {/* IPs baneadas */}
      <div style={{ background: C.card, border: '1px solid ' + C.line, borderRadius: 14, padding: 16, marginTop: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="ban" size={16} color="#ef4444" />IPs baneadas <span style={{ color: C.dim, fontWeight: 400 }}>({bans.length})</span></div>
        {/* Baneo manual */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input value={manIp} onChange={e => setManIp(e.target.value)} placeholder="IP a banear (ej. 203.0.113.5)" style={{ ...inpBox, flex: 1, minWidth: 160, fontFamily: 'monospace' }} />
          <input value={manMotivo} onChange={e => setManMotivo(e.target.value)} placeholder="Motivo (opcional)" style={{ ...inpBox, flex: 1, minWidth: 140 }} />
          <input value={manMin} onChange={e => setManMin(e.target.value)} placeholder="Min (0=∞)" style={{ ...inpBox, width: 100 }} inputMode="numeric" />
          <button onClick={banear} disabled={!manIp.trim()} style={{ ...btn, background: '#ef4444', color: '#fff' }}><Icon name="ban" size={15} />Banear</button>
        </div>
        {bans.length === 0 ? <div style={{ color: C.dim, fontSize: 13, padding: 6 }}>No hay IPs baneadas.</div> :
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ color: C.dim, textAlign: 'left', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .5 }}>
                <th style={th}>IP</th><th style={th}>País</th><th style={th}>Motivo</th><th style={th}>Intentos</th><th style={th}>Desde</th><th style={th}>Expira</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {bans.map(b => (
                  <tr key={b.ip} style={{ borderTop: '1px solid ' + C.line }}>
                    <td style={{ ...td, fontFamily: 'monospace', color: C.txt }}>{b.ip}</td>
                    <td style={td}>{b.pais ? <span>{flag(b.pais)} {paisNom(b.pais)}</span> : <span style={{ color: C.dim }}>—</span>}</td>
                    <td style={td}>{b.motivo || '—'}</td>
                    <td style={td}>{b.intentos ?? '—'}</td>
                    <td style={{ ...td, color: C.dim }}>{fdt(b.created_at)}</td>
                    <td style={{ ...td, color: C.dim }}>{b.expira ? fdt(b.expira) : <span style={{ color: '#f59e0b' }}>Permanente</span>}</td>
                    <td style={{ ...td, textAlign: 'right' }}><button onClick={() => deslistar(b.ip)} style={{ ...btn, padding: '4px 10px', fontSize: 12, background: '#052e1a', color: '#4ade80', border: '1px solid #14532d' }}><Icon name="check" size={13} />Deslistar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </div>

      {/* Países top */}
      {stats?.paises?.length > 0 && <div style={{ background: C.card, border: '1px solid ' + C.line, borderRadius: 14, padding: 16, marginTop: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="globe" size={16} />Origen de los ataques (7 días)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {stats.paises.map(p => <div key={p.pais} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card2, border: '1px solid ' + C.line, borderRadius: 10, padding: '8px 12px' }}>
            <span style={{ fontSize: 22 }}>{flag(p.pais)}</span>
            <div><div style={{ fontSize: 13 }}>{paisNom(p.pais)}</div><div style={{ fontSize: 18, fontWeight: 800 }}>{p.c}</div></div>
          </div>)}
        </div>
      </div>}
    </div>
  );
}

const row = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14, cursor: 'pointer' };
const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13.5 };
const chip = { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#0e2033', border: '1px solid #1e3a5f', color: '#cbd5e1', borderRadius: 999, padding: '3px 9px', fontSize: 12.5 };
const chipX = { display: 'inline-flex', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, opacity: .7 };
const inp = { border: 'none', outline: 'none', background: 'transparent', color: '#e2e8f0', flex: 1, fontSize: 14 };
const inpBox = { border: '1px solid #1e293b', outline: 'none', background: '#0f1729', color: '#e2e8f0', borderRadius: 10, padding: '8px 12px', fontSize: 14 };
const th = { padding: '4px 8px', fontWeight: 600 };
const td = { padding: '8px 8px', color: '#cbd5e1', verticalAlign: 'middle' };

function Num({ label, value, onChange }) {
  return <label style={{ fontSize: 12, color: '#94a3b8' }}>{label}
    <input value={value ?? ''} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" style={{ ...inpBox, width: '100%', marginTop: 4, padding: '7px 10px' }} />
  </label>;
}
