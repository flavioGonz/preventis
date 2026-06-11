import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { ToastHost } from './components/toast.jsx';
import { getUser } from './auth.js';
import { loadBranding } from './branding.js';
import Login from './pages/Login.jsx';
import Inicio from './pages/Inicio.jsx';
import Clientes from './pages/Clientes.jsx';
import ClienteDetalle from './pages/ClienteDetalle.jsx';
import VisitaDetalle from './pages/VisitaDetalle.jsx';
import Reportes from './pages/Reportes.jsx';
import Catalogos from './pages/Catalogos.jsx';
import Tickets from './pages/Tickets.jsx';
import TicketDetalle from './pages/TicketDetalle.jsx';
import Flota from './pages/Flota.jsx';
import VehiculoDetalle from './pages/VehiculoDetalle.jsx';
import PlanoDesigner from './pages/PlanoDesigner.jsx';
import BuscarQR from './pages/BuscarQR.jsx';
import EquipoDetalle from './pages/EquipoDetalle.jsx';
import EtiquetasQR from './pages/EtiquetasQR.jsx';
import Mapa from './pages/Mapa.jsx';
import Visitas from './pages/Visitas.jsx';
import Inventario from './pages/Inventario.jsx';
import Contratos from './pages/Contratos.jsx';
import Contable from './pages/Contable.jsx';

export default function App() {
  const [user, setUser] = useState(getUser());
  useEffect(() => { loadBranding(); }, []);
  useEffect(() => {
    const onLogout = () => setUser(null);
    const onLogin = () => setUser(getUser());
    window.addEventListener('app-logout', onLogout);
    window.addEventListener('app-login', onLogin);
    return () => {
      window.removeEventListener('app-logout', onLogout);
      window.removeEventListener('app-login', onLogin);
    };
  }, []);

  if (!user) return (<><Login /><ToastHost /></>);

  return (
    <>
      <Layout user={user}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteDetalle user={user} />} />
          <Route path="/clientes/:id/etiquetas" element={<EtiquetasQR />} />
          <Route path="/clientes/:id/planos" element={<PlanoDesigner />} />
          <Route path="/visitas/:id" element={<VisitaDetalle user={user} />} />
          <Route path="/equipos/:id" element={<EquipoDetalle />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/mapa" element={<Mapa />} />
          <Route path="/visitas" element={<Visitas />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/contratos" element={<Contratos />} />
          <Route path="/contable" element={<Contable />} />
          <Route path="/configuracion" element={<Catalogos user={user} />} />
          <Route path="/catalogos" element={<Catalogos user={user} />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/tickets/:id" element={<TicketDetalle />} />
          <Route path="/flota" element={<Flota />} />
          <Route path="/flota/:id" element={<VehiculoDetalle />} />
          <Route path="/buscar" element={<BuscarQR />} />
        </Routes>
      </Layout>
      <ToastHost />
    </>
  );
}
