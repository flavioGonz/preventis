# Auditoría de seguridad y guía de producción — Preventis

**Fecha:** 11/06/2026 · **Alcance:** backend (Express + PostgreSQL), frontend (React + Vite), configuración del servidor (CT 107, 192.168.99.7) · **Tipo:** solo lectura, no se modificó código ni configuración.

---

## 1. Resumen ejecutivo

La aplicación tiene una base sólida en varios aspectos (contraseñas con bcrypt, secretos TOTP y credenciales cifrados con AES‑256‑GCM, 2FA obligatorio para admin, finanzas y contratos protegidos con `adminOnly`, un *guard* global que exige JWT en todo `/api/*` salvo una lista pública acotada, y SQL parametrizado en casi todo el código).

Sin embargo, **antes de publicar con dominio en producción** hay que resolver un conjunto de problemas. Los más importantes:

1. **La API escucha en `0.0.0.0:3001` y el servidor no tiene firewall** → cualquiera en la red puede saltarse nginx y pegarle directo a la API.
2. **El proceso Node corre como `root`.**
3. **Los secretos (`JWT_SECRET`, `CRED_KEY`, `PGPASSWORD`) tienen valores por defecto públicos en el código.** Hoy `JWT_SECRET` está seteado en producción, pero al migrar a otro server, si falta el env, se firman tokens admin con un secreto conocido.
4. **Lectura de credenciales cifradas (contraseñas de equipos) sin control de rol** → cualquier usuario logueado lee contraseñas en claro de cualquier cliente (IDOR).
5. **`/uploads` se sirve sin autenticación y sin filtro de tipo** → fuga de comprobantes financieros/firmas/fotos y posible XSS almacenado (SVG/HTML).
6. **Sin rate limiting** en login y 2FA, y **webhook del chatbot público sin validar origen**.
7. **nginx actual solo sirve HTTP (puerto 80), sin headers de seguridad ni rate limiting.**

Ninguno es un bloqueante insalvable; con el plan de la sección 6 quedan cubiertos.

---

## 2. Configuración actual del servidor (observada)

| Componente | Estado |
|---|---|
| OS / stack | Debian 13, nginx 1.26.3, Node v22.22.3, PostgreSQL 17.10 |
| nginx | Puerto **80 (HTTP solamente)**, `server_name preventis.infratec.com.uy _;` sirve `dist`, proxya `/api`, `/uploads`, `/socket.io` a `127.0.0.1:3001`. Sin headers de seguridad, sin rate limiting, sin gzip explícito. TLS lo termina un proxy externo (el dominio responde HTTPS). |
| API Node | `systemd` `preventis-api.service`, escucha **`0.0.0.0:3001`** (expuesta a la red, no solo localhost), corre como **root**, `Restart=always`. |
| Secretos | En el *unit* de systemd: `JWT_SECRET`, `PGPASSWORD` (OK que estén seteados, pero ver 6.4). `CRED_KEY` **no** está → deriva de `JWT_SECRET`. No hay `.env`. |
| PostgreSQL | Escucha **solo en `127.0.0.1:5432`** (correcto). |
| Firewall | **Ninguno** (ufw y iptables vacíos). |
| Puertos abiertos a la red | 22 (SSH), 80 (nginx), **3001 (API directa)**. |
| Permisos de archivos | Se detectó previamente `logo_es.png` con `0700` (corregido). Conviene revisar `umask`/permisos de `dist`. |

---

## 3. Hallazgos CRÍTICOS

**C1 — API accesible directamente saltando nginx, sin firewall.**
`index.js:440` hace `server.listen(PORT, '0.0.0.0')` y no hay firewall. Cualquier host de la red llega a `http://192.168.99.7:3001/api/...` sin pasar por nginx (sin los futuros headers/rate‑limit/TLS). → *Bind a `127.0.0.1` y/o firewall que solo permita 22/80/443.* (Ver 6.1, 6.2.)

**C2 — Proceso Node corriendo como root.**
El *unit* no define `User=`. Un RCE o path traversal se ejecuta con privilegios totales. → *Usuario dedicado sin privilegios + endurecimiento systemd (6.5).*

**C3 — Secretos con fallback público en el código.**
`auth.js:4` `JWT_SECRET || 'preventis-dev-secret-change-me'`; `extras.js:16` y `twofa.js:12` derivan la clave AES de `CRED_KEY || JWT_SECRET || 'preventis-cred-default'`; `db.js:4‑10` cae a `preventis/preventis/preventis`. Si en el nuevo server falta cualquier env, se firman **tokens admin con secreto conocido** y se descifran credenciales/secretos TOTP con clave conocida. → *Eliminar fallbacks y abortar el arranque si faltan; usar `CRED_KEY` independiente (6.4).*

**C4 — Lectura de credenciales cifradas sin control de rol (IDOR).**
`extras.js:256` `GET /api/equipos/:id/credencial` y `extras.js:827` `GET /api/clientes/:id/credenciales` devuelven contraseñas en **texto plano** (`decCred`) y solo están bajo el *guard* (cualquier usuario logueado), sin `adminOnly`. Un técnico puede leer credenciales de cualquier cliente por id. Los POST/PUT/DELETE sí son `adminOnly`; la lectura —lo más sensible— no. → *Exigir `adminOnly` (o permiso `ver_credenciales`) en ambos GET.*

**C5 — `/uploads` sin autenticación y multer sin `fileFilter`.**
`index.js:27` `app.use('/uploads', express.static(...))` antes del guard y sin auth → fotos de visitas, **firmas**, **comprobantes financieros**, planos accesibles por URL sin login (las rutas se devuelven en JSON). Además ningún `multer` (`index.js:36‑44`, `extras.js:15`) valida tipo/extensión → se puede subir SVG/HTML que, servidos desde el mismo origen, ejecutan **XSS almacenado** y roban el token de `localStorage` (ver A4). El nombre de archivo sí se regenera de forma segura (no hay path traversal). → *Servir `/uploads` detrás de auth (o `Content-Disposition: attachment`), y `fileFilter` por MIME en multer.*

---

## 4. Hallazgos ALTOS

**A1 — Sin rate limiting en login y 2FA.**
`auth.js:61` login, `twofa.js:176` `/2fa/verify`, `twofa.js:165` `/2fa/whatsapp`. Permite fuerza bruta de contraseñas y de códigos OTP de 6 dígitos (TOTP con ventana ±1 ≈ 90 s, y WhatsApp 5 min), y spam de envío de OTP. → *`express-rate-limit` por IP/usuario + bloqueo tras N intentos de OTP + límite de reenvío. Reforzar con `limit_req` en nginx (6.3).*

**A2 — Webhook del chatbot público sin validar origen.**
`extras.js:575` `POST /api/chatbot/webhook` (en `PUBLIC`). No valida firma/token/IP. Un atacante puede falsificar `from` y, si conoce un número autorizado, ejecutar comandos (crear tickets/visitas, leer datos del negocio), inflar `chatbot_numeros` y hacer DoS/amplificación de WhatsApp. (Las interpolaciones usan `Number()`, así que no hay SQLi.) → *Validar secreto compartido/HMAC del gateway o restringir por IP de origen (192.168.99.22) + rate limit.*

**A3 — Socket.io sin autenticación + CORS `*`.**
`index.js:437` `origin:'*'` y `io.on('connection', …)` no valida token. Cualquiera puede conectarse y recibir los eventos `notif` globales (`realtime.js:13`) con nombres de clientes, títulos de tickets y visitas. `app.use(cors())` (`index.js:25`) también está totalmente abierto. → *`io.use()` que verifique el JWT del handshake; restringir CORS y origin de Socket.io a la URL del frontend.*

**A4 — JWT en `localStorage` y en la query string.**
Frontend `auth.js:4,9` guarda el JWT en `localStorage` (exfiltrable por cualquier XSS, p. ej. vía C5). `api.js:27‑31` (`fileUrl`) lo manda como `?token=<jwt>` para PDFs/Excel/QR/fotos → queda en logs de nginx, en `Referer` hacia terceros (mapas: nominatim, osrm, arcgis), en historial y en la **caché del Service Worker**. → *Migrar a cookie `httpOnly; Secure; SameSite=Strict`; para descargas usar URLs firmadas de un solo uso, no el JWT de sesión.*

**A5 — Service Worker cachea respuestas autenticadas en disco.**
`sw.js:22‑34` hace `cache.put` de toda respuesta 200 de `/api/` y `/uploads/` (incluye credenciales, fichas técnicas, fotos y las URLs con `?token=`). No expira ni se purga en logout → en equipo compartido/robado queda accesible sin login. → *No cachear endpoints sensibles; vaciar cachés de datos en logout; excluir respuestas con token en la URL.*

**A6 — Permisos de rol definidos pero no aplicados en el backend.**
`rol_permisos` existe (`extras.js:160`) e informa al frontend, pero las mutaciones de `clientes`/`equipos` (`index.js:116,123,171`, etc.) no llaman `adminOnly` ni chequean permiso → cualquier técnico crea/edita/borra clientes y equipos. Borrar/cancelar visita sí es `adminOnly`. → *Aplicar los permisos reales en el backend (no confiar en el gating del frontend).*

**A7 — Scripts de terceros por CDN sin SRI.**
`index.html:14‑15` carga Leaflet JS/CSS desde `cdnjs.cloudflare.com` sin `integrity`. Un compromiso del CDN ejecuta código en la sesión autenticada (lee el `localStorage` de A4). → *Autoalojar Leaflet/fuentes (ya hay bundler) o añadir `integrity` + CSP estricta (6.3).*

**A8 — `multer@1.x` deprecado (CVEs).**
`backend/package.json`. La rama 1.x está deprecada con vulnerabilidades conocidas. → *Migrar a `multer@2.x`.* Correr `npm audit` en backend y frontend.

---

## 5. Hallazgos MEDIOS y BAJOS

**Medios**
- **M1 — Fuga de errores internos:** `wrap` en `index.js:47`, `extras.js:60`, `reportes.js:8`, y varios handlers de `auth.js`/`twofa.js` devuelven `res.status(500).json({ error: e.message })` → exponen detalles de Postgres (columnas/constraints) al cliente. *Mensaje genérico al cliente, detalle solo en log.*
- **M2 — Token ICS de 5 años y válido para toda la API:** `extras.js:556` firma con `expiresIn:'1825d'`, viaja en `?token=`, y `authMiddleware` no valida el flag `feed`. *Acotar `feed:true` solo a rutas de feed; reducir expiración.*
- **M3 — OTP con `Math.random()`** (`twofa.js:35`) y **códigos de respaldo de 32 bits** (`twofa.js:29`). *Usar `crypto.randomInt` y subir a 40‑48 bits.*
- **M4 — Algoritmo JWT no fijado:** `jwt.verify(token, SECRET)` sin `{algorithms:['HS256']}` (`auth.js:20`, `twofa.js:75,163`). *Fijar algoritmo.*
- **M5 — Credenciales admin por defecto** `admin/admin1234` impresas en consola (`auth.js:52‑56`). *Forzar cambio en primer login o generar aleatoria.*
- **M6 — Auditoría no enmascara secretos:** `extras.js:188‑199` guarda `req.body` enmascarando solo `password`/`dataUrl`, no `api_key` (chatbot) ni `cred_usuario`/`password_enc`. *Ampliar lista de campos enmascarados.*
- **M7 — GPS de técnicos** (`extras.js:758,764`) visible a cualquier usuario logueado. *Restringir si corresponde.*
- **M8 — `cond` de agenda/ICS concatenan `req.query.tecnico_id`** (`extras.js:495,563`), mitigado por `Number()`. *Parametrizar igual ($1).*

**Bajos**
- **B1 — Sin `.gitignore`** en el repo → riesgo de commitear un futuro `.env`/claves. *Agregar `.gitignore` (`.env`, `*.pem`, `*.key`, `node_modules/`, `dist/`, `backups/`).*
- **B2 — Estado en memoria** (sesiones de chatbot, OTP, presencia) → no apto para multi‑instancia; se pierde al reiniciar.
- **B3 — `:id` sin validar como entero** → 500 en vez de 400/404 ante ids no numéricos.
- **B4 — IPs internas y dominio en `README.md`** → divulgación de topología si el repo se hace público.
- **B5 — Sourcemaps:** Vite no los emite en prod por defecto (correcto); mantener así.

**Correcto (no requiere acción):** bcrypt cost 10; cifrado AES‑GCM de secretos; 2FA admin obligatorio con tokens `pending`/`setup` acotados; reset de 2FA sin exponer códigos y auditado; finanzas/contratos `adminOnly` con ocultamiento de montos a no‑admin; SQL parametrizado salvo M8; sin `dangerouslySetInnerHTML`/`eval`; Postgres solo en localhost; validación del nombre en descarga de respaldos.

---

## 6. Guía de despliegue a producción detrás de nginx + dominio (mejores prácticas)

Orientado al escenario: **nginx reverse proxy con TLS + dominio en un server, app en otro.**

### 6.1 Arquitectura de red
- App server: Node bind a **`127.0.0.1:3001`** (env `HOST=127.0.0.1`, o `server.listen(PORT, process.env.HOST || '127.0.0.1')`). nginx local (o el proxy) es el único que habla con la API.
- Proxy server (TLS + dominio) → upstream al app server por **red privada**. Idealmente TLS también entre proxy y app, o red aislada/VPN. No exponer `:3001` a Internet ni a la LAN general.

### 6.2 Firewall (en ambos servers)
```
ufw default deny incoming
ufw allow 22/tcp           # idealmente restringido a IPs de gestión
ufw allow 80,443/tcp       # solo en el proxy
ufw deny 3001/tcp          # API nunca pública
ufw enable
```
En el app server, permitir 3001 **solo** desde la IP del proxy.

### 6.3 nginx (proxy) — TLS y hardening
- **TLS con Let's Encrypt** (`certbot`), redirección 80→443, **HSTS**.
- **Headers de seguridad** (en el `server` HTTPS):
  ```nginx
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;            # o CSP frame-ancestors
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "geolocation=(self), camera=(self)" always;
  add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org https://server.arcgisonline.com; connect-src 'self' https://nominatim.openstreetmap.org https://router.project-osrm.org; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" always;
  server_tokens off;
  ```
  (Ajustar CSP si se autoaloja Leaflet/fuentes — recomendado, ver A7.)
- **Rate limiting** del login/2FA:
  ```nginx
  limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
  location /api/auth/ { limit_req zone=auth burst=5 nodelay; proxy_pass http://127.0.0.1:3001; }
  ```
- `client_max_body_size 30M;` (ya está). `gzip on;` para assets. `proxy_set_header X-Forwarded-Proto $scheme;` y en la app `app.set('trust proxy', 1)`.
- **`/uploads`**: servir detrás de auth (vía la app con `X-Accel-Redirect`) o, como mínimo, `add_header Content-Disposition "attachment";` y `X-Content-Type-Options nosniff` para neutralizar el XSS de C5.

### 6.4 Secretos y entorno
- Mover los secretos del *unit* a un **`EnvironmentFile=/etc/preventis/preventis.env`** con `chmod 600`, dueño del usuario del servicio:
  ```
  HOST=127.0.0.1
  JWT_SECRET=<64 hex aleatorios — openssl rand -hex 32>
  CRED_KEY=<otros 64 hex, distinto de JWT_SECRET>
  PGPASSWORD=<contraseña fuerte>
  NODE_ENV=production
  FRONTEND_URL=https://tu-dominio
  ```
- Generar `JWT_SECRET` y `CRED_KEY` nuevos para producción (rotar invalida tokens viejos). **Importante:** `CRED_KEY` cifra las credenciales y secretos TOTP existentes; si ya hay datos cifrados con la clave actual (derivada de `JWT_SECRET`), definir `CRED_KEY` por primera vez los volverá ilegibles → planificar re‑cifrado o fijar `CRED_KEY` = `JWT_SECRET` actual al migrar y rotar después con un script de re‑cifrado.
- Idealmente, en el código, **abortar el arranque** si faltan `JWT_SECRET`/`CRED_KEY` (elimina C3 de raíz).

### 6.5 systemd hardening (app server)
```ini
[Service]
User=preventis
Group=preventis
EnvironmentFile=/etc/preventis/preventis.env
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/preventis/backend/uploads
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
```
Crear el usuario `preventis`, dar ownership de `/opt/preventis` y de `uploads`, y dejar de correr como root (C2).

### 6.6 PostgreSQL
- Contraseña fuerte (no `preventis`), autenticación `scram-sha-256` en `pg_hba.conf`, solo localhost (ya está). Si la BD va en otro host, TLS obligatorio y `ssl: { rejectUnauthorized: true }` en `pg.Pool`.
- Backups: ya existe `backup.sh` diario + vzdump semanal; verificar que corren en el nuevo server (cron) y **probar una restauración**. Guardar backups cifrados fuera del server.

### 6.7 App / código (cambios recomendados, fuera de esta auditoría)
Prioridad para antes de publicar: C3, C4, C5, A1, A2, A3. Luego A4–A8 y los medios. La sección 7 los ordena.

### 6.8 Operación
- `git` con `.gitignore` (B1); build reproducible (`npm ci && npm run build`); healthcheck (`/api/health` ya existe) en el proxy/monitor.
- Logs: rotar (`logrotate`), no loguear secretos (M6). Considerar fail2ban para `/api/auth` y SSH.
- Plan de actualización de dependencias (`npm audit`, `multer@2`, parches de express/vite).

---

## 7. Plan de remediación priorizado (checklist)

**Antes de exponer a Internet (bloqueantes):**
- [ ] C1 — Bind API a `127.0.0.1` + firewall (ufw) en ambos servers.
- [ ] C2 — Correr Node como usuario dedicado + hardening systemd.
- [ ] C3 — `JWT_SECRET`/`CRED_KEY`/`PGPASSWORD` por env, sin fallback; abortar si faltan; rotar para prod.
- [ ] C4 — `adminOnly` en lectura de credenciales (`/api/equipos/:id/credencial`, `/api/clientes/:id/credenciales`).
- [ ] C5 — `/uploads` con auth o `Content-Disposition: attachment` + `fileFilter` en multer.
- [ ] A2 — Autenticar el webhook del chatbot (secreto/HMAC/IP) + rate limit.
- [ ] TLS + headers de seguridad + `limit_req` en nginx (6.3).

**Inmediatamente después:**
- [ ] A1 — Rate limiting en login/2FA (app + nginx).
- [ ] A3 — Auth en Socket.io + CORS restringido.
- [ ] A4/A5 — Token fuera de `localStorage`/query (cookie httpOnly + URLs firmadas); SW sin cachear datos sensibles y purgar en logout.
- [ ] A6 — Aplicar permisos de rol en el backend.
- [ ] A7 — Autoalojar Leaflet/fuentes o SRI + CSP.
- [ ] A8 — `multer@2`, `npm audit`.

**Endurecimiento progresivo:** M1–M8, B1–B5.

---

*Auditoría realizada sin modificar código ni configuración. Las referencias `archivo:línea` corresponden al estado del repositorio en la fecha indicada.*
