# Preventis — App de Mantenimientos Preventivos

Aplicación web (React + Node + PostgreSQL) para registrar mantenimientos **preventivos y
correctivos**: clientes, visitas, equipos, pruebas, fotos, firma, informe PDF,
importación/exportación Excel, tickets, contratos, reportes y un chatbot de WhatsApp.
Responsive y **PWA**: funciona en escritorio y en móvil/tablet, con soporte offline.

> Repo: <https://github.com/flavioGonz/preventis>

---

## Arquitectura

```
Navegador / PWA (PC · celular · tablet)
        │  HTTPS (dominio)
   ┌────▼──────── nginx (sirve React + reverse proxy + TLS) ─────┐
   │  /                → frontend/dist (SPA, PWA)               │
   │  /api /uploads /socket.io → http://127.0.0.1:3001 (Node)   │
   └────────────────────────────┬──────────────────────────────┘
                                 │
                  Node/Express API  (systemd: preventis-api, usuario sin privilegios)
                                 │
                          PostgreSQL  (local o remoto)
```

- **Frontend:** React + Vite + react-router (PWA con service worker, offline, firma en
  `<canvas>`, escaneo QR con `html5-qrcode`, mapas con Leaflet).
- **Backend:** Express, `pg`, `multer` (subidas), `pdfkit` (informes), `exceljs`
  (import/export), `qrcode`. 2FA propio (TOTP + WhatsApp + códigos de respaldo).
- **DB:** PostgreSQL. El esquema se crea/migra solo al arrancar la API.
- **WhatsApp:** gateway **WAHA/OpenWA** (chatbot + segundo factor por WhatsApp).

> Los valores concretos (dominio, IPs, contraseñas) son **propios de cada despliegue** y
> los pide el instalador; no se versionan en el repo.

---

## Instalación en un servidor nuevo (Debian/Ubuntu)

Todo el despliegue se apoya en **Git**. Como `root` en un servidor limpio:

```bash
git clone https://github.com/flavioGonz/preventis.git /opt/preventis
sudo bash /opt/preventis/deploy/install.sh
```

El instalador es **interactivo** y pregunta:

- **Dominio** (server_name) y **repo/rama** de Git (con token si es privado).
- **Base de datos: local o remota.**
  - *Local:* instala PostgreSQL, crea la base `preventis` y genera la contraseña.
  - *Remota:* pide host/puerto/usuario/contraseña/base y **prueba la conexión**.
- **WhatsApp (WAHA/OpenWA): local o remoto** (URL, API key, session) — o se omite.
- **HTTPS** con Let's Encrypt (certbot) — opcional.
- **Firewall** ufw (22/80/443) — opcional.

Y deja todo listo: genera los secretos en `/etc/preventis/preventis.env` (chmod 600), crea
un **usuario de servicio sin privilegios** y un `systemd` endurecido (la API escucha solo
en `127.0.0.1`), compila el frontend y configura `nginx` con cabeceras de seguridad y
rate-limit en `/api/auth`. Imprime al final la URL, la contraseña de la base (si es local)
y el secreto del webhook.

**Primer ingreso:** `admin` / `admin1234` — **cambiala enseguida**.

### Actualizar (deploy continuo por Git)

Tras hacer commit y push de tus cambios al repo, en el servidor:

```bash
sudo bash /opt/preventis/deploy/update.sh
```

Hace `git pull`, reinstala dependencias, recompila el frontend, ajusta permisos y reinicia
la API + recarga nginx verificando el `health`.

### Variables de entorno

Ver `deploy/.env.example`. Se cargan vía `EnvironmentFile=/etc/preventis/preventis.env`.
Claves: `HOST`/`PORT` (bind), `PGHOST…PGDATABASE` (DB), `JWT_SECRET` (sesiones),
`CRED_KEY` (cifra credenciales y secretos 2FA — distinto de `JWT_SECRET`),
`CHATBOT_WEBHOOK_SECRET` (lo envía el gateway WAHA por header `X-Webhook-Token` o `?key=`).

---

## Modelo de datos

- `clientes` — dirección, teléfono, frecuencia (mensual…anual), contrato.
- `equipos` — por cliente: sistema, dirección, grupo, subgrupo, etiqueta, tipo, modelo,
  `codigo_qr` (autogenerado `EQ-000001`). Ningún campo descriptivo es único.
- `visitas` — fecha, técnico(s), tipo (preventiva/correctiva), situación inicial/acciones/
  situación final, firma, archivos, horas de entrada/salida, ticket asociado.
- `visita_archivos` / `pruebas` / `prueba_fotos` — adjuntos de visita, estado de cada
  equipo en una visita, y fotos por prueba.
- `tickets`, `contratos`, `cliente_credenciales` (cifradas), `usuarios` (con 2FA).
- Catálogos editables sin programar: `tecnicos`, `sistemas`, `tipos_elemento`,
  `estados_equipo` (con flag `es_falla`). Vista `v_ultima_prueba` (última fecha + estado).

## Sugerencia de equipos a probar

`GET /api/visitas/:id/sugerencias` — orden del requerimiento:

1. **Equipos en falla** en pruebas anteriores (último estado con `es_falla`).
2. **Más tiempo sin probar** (los **nunca probados** primero).
3. **Resto** de los equipos.

Dentro de cada grupo: fecha de última prueba ascendente y luego etiqueta.

## Acciones sin programar (desde la UI)

- Alta/edición de **clientes**, **técnicos**, **equipos**, **catálogos**, **usuarios**.
- **Importar** pruebas masivas desde Excel (`etiqueta | codigo_qr | estado | fecha | comentarios`).
- **Exportar** pruebas/visitas/tickets a Excel y **PDF** (con membrete).
- **Informe PDF** por visita (datos, equipos probados, fotos, firma).
- **Buscar equipo por QR** (cámara o código).

## Páginas

Inicio (KPIs + próximas visitas + equipos en falla), Clientes y su ficha (Visitas, Equipos,
Contactos, Ficha técnica, Tickets, Rupturas, Fotos, Planos), Ficha de visita (progreso y
filtros), Ficha de equipo (historial), Visitas (lista/calendario), Inventario, Reportes
(Equipos/Visitas/Tickets con Excel y PDF), Mapa, Tickets, Contratos, Configuración.

---

## Autenticación y seguridad

- Login con **JWT** + **2FA** (TOTP, WhatsApp y códigos de respaldo; obligatorio para admin).
- Roles **admin** y **tecnico**. Lectura de credenciales de equipos: solo admin.
- Hardening aplicado: API solo en `127.0.0.1`, servicio sin root, secretos en
  EnvironmentFile, anti fuerza bruta en login/2FA, webhook del chatbot autenticado, filtro
  de subidas, cabeceras de seguridad en nginx.
- Detalle completo y guía de producción: **`AUDITORIA_SEGURIDAD.md`**.

**Recordatorios de producción:** cambiar `admin/admin1234`, contraseña fuerte de Postgres,
y mantener `JWT_SECRET`/`CRED_KEY` fuera de Git (ya están en `.gitignore`).

---

## Backups

- **Diario (datos):** `pg_dump` de la base + `tar` de `backend/uploads/` con rotación.
- **Semanal (infra):** snapshot del servidor/contenedor (p. ej. vzdump en Proxmox).

Restaurar:

```bash
pg_restore -c -d preventis db_AAAAMMDD_HHMMSS.dump          # base
tar xzf uploads_AAAAMMDD_HHMMSS.tgz -C /opt/preventis/backend   # archivos subidos
```

---

## Operación

```bash
systemctl status preventis-api          # estado de la API
journalctl -u preventis-api -f          # logs
sudo bash /opt/preventis/deploy/update.sh   # actualizar desde Git
```

## Desarrollo local

```bash
cd backend  && npm install && node src/index.js   # requiere Postgres + variables de entorno
cd frontend && npm install && npm run dev          # Vite dev server (proxy a la API :3001)
```
