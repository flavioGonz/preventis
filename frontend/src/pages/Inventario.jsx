import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { PageHeader, Loading, Empty, estadoBadge } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import Drawer from '../components/Drawer.jsx';

const LIMIT = 50;

export default function Inventario() {
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [clientes, setClientes] = useState([]);
  const [sistemas, setSistemas] = useState([]);
  const [estados, setEstados] = useState([]);
  const [f, setF] = useState({ cliente_id: '', sistema_id: '', estado: '', search: '' });
  const [sheet, setSheet] = useState(false);
  const nav = useNavigate();

  const load = () => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    p.set('page', page); p.set('limit', LIMIT);
    api.get('/api/inventario?' + p).then(r => {
      if (Array.isArray(r)) { setItems(r); setMeta({ total: r.length, page: 1, pages: 1 }); }
      else { setItems(r.rows); setMeta({ total: r.total, page: r.page, pages: r.pages }); }
    });
  };
  useEffect(() => { api.get('/api/clientes').then(setClientes); api.get('/api/sistemas').then(setSistemas); api.get('/api/estados_equipo').then(setEstados).catch(() => {}); }, []);
  // Volver a la pagina 1 al cambiar filtros o busqueda.
  useEffect(() => { setPage(1); }, [f.cliente_id, f.sistema_id, f.estado, f.search]);
  // Cargar (con debounce, util al tipear en el buscador).
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [f.cliente_id, f.sistema_id, f.estado, f.search, page]);

  const set = (k, v) => setF({ ...f, [k]: v });
  const filtCount = (f.cliente_id ? 1 : 0) + (f.sistema_id ? 1 : 0) + (f.estado ? 1 : 0);
  const desde = meta.total === 0 ? 0 : (meta.page - 1) * LIMIT + 1;
  const hasta = Math.min(meta.page * LIMIT, meta.total);

  const Pager = () => meta.pages > 1 ? (
    <div className="row between wrap" style={{ marginTop: 12, alignItems: 'center', gap: 10 }}>
      <span className="muted" style={{ fontSize: 13 }}>{desde}–{hasta} de {meta.total} equipos · pág. {meta.page}/{meta.pages}</span>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn sec sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><Icon name="chevronLeft" size={15} />Anterior</button>
        <button className="btn sec sm" disabled={page >= meta.pages} onClick={() => setPage(p => Math.min(meta.pages, p + 1))}>Siguiente<Icon name="chevronRight" size={15} /></button>
      </div>
    </div>
  ) : null;

  return (
    <div>
      <PageHeader icon="box" title="Inventario" desc="Todos los equipos instalados, con su foto y QR" />
      <div className="searchbar">
        <div className="wa-search">
          <Icon name="search" size={17} />
          <input placeholder="Buscar etiqueta, codigo o modelo..." value={f.search} onChange={e => set('search', e.target.value)} />
        </div>
        <button className={'btn-filter' + (filtCount ? ' on' : '')} onClick={() => setSheet(true)}>
          <Icon name="filter" size={16} />Filtros{filtCount ? <span className="fc">{filtCount}</span> : null}
        </button>
        <a className="btn sec" href={api.fileUrl('/api/inventario/export.xlsx?' + new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))))} data-tip="Exportar a Excel con historial de eventos"><Icon name="download" size={16} />Exportar</a>
      </div>

      <Drawer open={sheet} onClose={() => setSheet(false)} title="Filtros" side="bottom"
        footer={<><button className="btn ghost" onClick={() => setF({ cliente_id: '', sistema_id: '', estado: '', search: f.search })}>Limpiar</button><button className="btn" onClick={() => setSheet(false)}>Aplicar</button></>}>
        <div className="filter-sheet">
          <div className="field"><label>Cliente</label>
            <select value={f.cliente_id} onChange={e => set('cliente_id', e.target.value)}>
              <option value="">Todos los clientes</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></div>
          <div className="field"><label>Sistema</label>
            <select value={f.sistema_id} onChange={e => set('sistema_id', e.target.value)}>
              <option value="">Todos los sistemas</option>{sistemas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select></div>
          <div className="field"><label>Estado del equipo</label>
            <select value={f.estado} onChange={e => set('estado', e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="falla">En falla</option>
              <option value="ok">OK (sin falla)</option>
              <option value="sin_probar">Sin probar</option>
              {estados.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
            </select></div>
        </div>
      </Drawer>
      {items === null ? <Loading /> :
        meta.total === 0 ? <Empty icon="box" title="Sin equipos">No hay equipos con esos filtros.</Empty> :
          <>
            <div className="muted" style={{ margin: '2px 2px 10px', fontSize: 13 }}>{meta.total} equipos</div>
            <div className="card pad-sm">
              <div className="tablewrap"><table className="table">
                <thead><tr><th>Foto</th><th>QR</th><th>Etiqueta</th><th>Cliente</th><th>Sistema</th><th>Tipo</th><th>Estado</th></tr></thead>
                <tbody>{items.map(e => (
                  <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => nav('/equipos/' + e.id)}>
                    <td>{e.foto_path ? <img className="inv-thumb" loading="lazy" src={api.base + e.foto_path} /> : <div className="inv-ph"><Icon name="box" size={18} /></div>}</td>
                    <td><img className="inv-thumb" loading="lazy" src={api.fileUrl('/api/equipos/' + e.id + '/qr.png')} /></td>
                    <td><b>{e.etiqueta || '-'}</b><div className="subtle mono" style={{ fontSize: 11 }}>{e.codigo_qr}</div></td>
                    <td>{e.cliente}</td>
                    <td>{e.sistema || '-'}</td>
                    <td>{e.tipo_elemento || '-'}</td>
                    <td>{estadoBadge(e.ultimo_estado, e.ultima_falla)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
            <Pager />
          </>}
    </div>
  );
}
