import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { Loading, Empty } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

export default function EtiquetasQR() {
  const { id } = useParams();
  const [equipos, setEquipos] = useState(null);
  const [cliente, setCliente] = useState(null);
  useEffect(() => {
    api.get('/api/clientes/' + id).then(setCliente);
    api.get('/api/clientes/' + id + '/equipos').then(setEquipos);
  }, [id]);
  if (equipos === null) return <Loading />;
  return (
    <div>
      <div className="noprint">
        <Link to={'/clientes/' + id} className="backlink"><Icon name="chevronLeft" size={16} />Volver al cliente</Link>
        <div className="page-head">
          <div><div className="ttl">Etiquetas QR</div><div className="desc">{cliente?.nombre} - {equipos.length} equipos</div></div>
          <button className="btn" onClick={() => window.print()}><Icon name="printer" size={16} />Imprimir</button>
        </div>
      </div>
      {equipos.length === 0 ? <Empty icon="qr" title="Sin equipos">No hay equipos para imprimir.</Empty> :
        <div className="qrsheet">
          {equipos.map(e => (
            <div key={e.id} className="qrcard">
              <img src={api.fileUrl('/api/equipos/' + e.id + '/qr.png')} alt="QR" />
              <div className="et">{e.etiqueta || e.codigo_qr}</div>
              <div className="cd">{e.codigo_qr}</div>
              {e.sistema && <div className="cd">{e.sistema}</div>}
            </div>
          ))}
        </div>}
    </div>
  );
}
