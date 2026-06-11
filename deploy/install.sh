#!/usr/bin/env bash
# =====================================================================
# Preventis — Instalador interactivo (Debian / Ubuntu)
# Despliega la app desde Git: API (Node/Express) + frontend (React/Vite)
# detrás de nginx, con PostgreSQL local o remoto y WhatsApp (WAHA) opcional.
#
#   sudo bash deploy/install.sh
#   # o, en un server limpio:
#   git clone https://github.com/flavioGonz/preventis /opt/preventis && \
#     sudo bash /opt/preventis/deploy/install.sh
# =====================================================================
set -euo pipefail

REPO_DEFAULT="https://github.com/flavioGonz/preventis.git"
APP_DIR_DEFAULT="/opt/preventis"
SVC_USER="preventis"
ENV_DIR="/etc/preventis"
ENV_FILE="$ENV_DIR/preventis.env"

c_b="\033[1m"; c_g="\033[32m"; c_y="\033[33m"; c_r="\033[31m"; c_0="\033[0m"
say(){ echo -e "${c_b}==>${c_0} $*"; }
ok(){  echo -e "${c_g}OK${c_0} $*"; }
warn(){ echo -e "${c_y}!!${c_0} $*"; }
die(){ echo -e "${c_r}ERROR:${c_0} $*" >&2; exit 1; }
ask(){ local p="$1" d="${2:-}" v; read -rp "$(echo -e "$p${d:+ [$d]}: ")" v; echo "${v:-$d}"; }
asksec(){ local p="$1" v; read -rsp "$(echo -e "$p: ")" v; echo >&2; echo "$v"; }
yesno(){ local p="$1" d="${2:-s}" v; read -rp "$(echo -e "$p [s/n] ($d): ")" v; v="${v:-$d}"; [[ "$v" =~ ^[sSyY] ]]; }
gen(){ openssl rand -hex "${1:-32}"; }

[ "$(id -u)" -eq 0 ] || die "Ejecuta como root (sudo bash deploy/install.sh)."
command -v apt-get >/dev/null || die "Este instalador es para Debian/Ubuntu (apt)."

echo -e "${c_b}===== Preventis — instalador =====${c_0}"

# ---------------------------------------------------------------- 1) Datos
APP_DIR=$(ask "Directorio de instalación" "$APP_DIR_DEFAULT")
DOMAIN=$(ask "Dominio / server_name de nginx" "preventis.local")
REPO=$(ask "Repositorio Git" "$REPO_DEFAULT")
BRANCH=$(ask "Rama" "main")
GIT_TOKEN=$(ask "Token de acceso Git (vacío si el repo es público)" "")

# ---------------------------------------------------------------- 2) Base de datos
say "Base de datos PostgreSQL"
if yesno "¿La base es LOCAL (instalar Postgres en este server)?" "s"; then
  DB_MODE="local"; PGHOST="localhost"; PGPORT="5432"; PGUSER="preventis"; PGDATABASE="preventis"
  PGPASSWORD=$(gen 16)
  ok "Se creará la base local 'preventis' con una contraseña generada."
else
  DB_MODE="remote"
  PGHOST=$(ask "Host Postgres" ""); [ -n "$PGHOST" ] || die "Host requerido."
  PGPORT=$(ask "Puerto" "5432")
  PGUSER=$(ask "Usuario" "preventis")
  PGDATABASE=$(ask "Base de datos" "preventis")
  PGPASSWORD=$(asksec "Contraseña de '$PGUSER'")
fi

# ---------------------------------------------------------------- 3) WhatsApp (WAHA/OpenWA)
say "Integración WhatsApp (WAHA / OpenWA) — opcional"
WAHA_URL=""; WAHA_KEY=""; WAHA_SESSION=""
if yesno "¿Configurar WhatsApp ahora?" "n"; then
  if yesno "¿El gateway WAHA es LOCAL (este mismo server)?" "n"; then
    WAHA_URL=$(ask "URL local del gateway" "http://127.0.0.1:3000")
  else
    WAHA_URL=$(ask "URL del gateway remoto" "http://192.168.99.22:2785")
  fi
  WAHA_KEY=$(ask "X-API-Key del gateway" "")
  WAHA_SESSION=$(ask "Session (id o nombre)" "default")
fi

# ---------------------------------------------------------------- 4) Secretos
JWT_SECRET=$(gen 32); CRED_KEY=$(gen 32); WBK="wbk_$(gen 24)"

# ---------------------------------------------------------------- 5) TLS / firewall
DO_TLS=false; TLS_EMAIL=""
if yesno "¿Configurar HTTPS con Let's Encrypt (certbot) ahora?" "n"; then
  DO_TLS=true; TLS_EMAIL=$(ask "Email para Let's Encrypt" "")
fi
DO_UFW=false
if yesno "¿Configurar firewall ufw (22/80/443; cerrar el resto)?" "n"; then DO_UFW=true; fi

# ================================================================ Instalación
say "Instalando paquetes base..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates gnupg nginx openssl postgresql-client

# Node 20 LTS (si falta o es < 18)
NODE_OK=false
if command -v node >/dev/null 2>&1; then
  [ "$(node -v | sed 's/v//; s/\..*//')" -ge 18 ] && NODE_OK=true
fi
if ! $NODE_OK; then
  say "Instalando Node.js 20 LTS (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
ok "Node $(node -v), npm $(npm -v)"

[ "$DB_MODE" = local ] && apt-get install -y postgresql
$DO_TLS && apt-get install -y certbot python3-certbot-nginx

# Usuario de servicio (sin login)
id "$SVC_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
ok "Usuario de servicio: $SVC_USER"

# -------------------------------------------- Clonar / actualizar repo
CLONE_URL="$REPO"
if [ -n "$GIT_TOKEN" ]; then
  CLONE_URL="$(echo "$REPO" | sed -E "s#https://#https://oauth2:${GIT_TOKEN}@#")"
fi
if [ -d "$APP_DIR/.git" ]; then
  say "Actualizando repo existente en $APP_DIR"
  git -C "$APP_DIR" remote set-url origin "$CLONE_URL"
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  say "Clonando $REPO en $APP_DIR"
  mkdir -p "$APP_DIR"
  git clone --depth 1 -b "$BRANCH" "$CLONE_URL" "$APP_DIR"
fi
# Proteger el token (queda en .git/config): .git solo accesible por root
chmod -R go-rwx "$APP_DIR/.git" 2>/dev/null || true

# -------------------------------------------- PostgreSQL
if [ "$DB_MODE" = local ]; then
  say "Configurando PostgreSQL local..."
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$PGUSER'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE ROLE \"$PGUSER\" LOGIN PASSWORD '$PGPASSWORD'"
  sudo -u postgres psql -qc "ALTER ROLE \"$PGUSER\" PASSWORD '$PGPASSWORD'"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$PGDATABASE'" | grep -q 1 \
    || sudo -u postgres createdb -O "$PGUSER" "$PGDATABASE"
fi
say "Probando conexión a la base..."
PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT 1" >/dev/null \
  || die "No se pudo conectar a Postgres ($PGUSER@$PGHOST:$PGPORT/$PGDATABASE)."
ok "Conexión a la base OK"

# -------------------------------------------- Archivo de entorno (secretos)
mkdir -p "$ENV_DIR"; chmod 750 "$ENV_DIR"
cat > "$ENV_FILE" <<EOF
HOST=127.0.0.1
PORT=3001
NODE_ENV=production
PGHOST=$PGHOST
PGPORT=$PGPORT
PGUSER=$PGUSER
PGPASSWORD=$PGPASSWORD
PGDATABASE=$PGDATABASE
JWT_SECRET=$JWT_SECRET
CRED_KEY=$CRED_KEY
CHATBOT_WEBHOOK_SECRET=$WBK
EOF
chmod 600 "$ENV_FILE"
ok "Entorno en $ENV_FILE (chmod 600)"

# -------------------------------------------- Build
say "Instalando dependencias del backend..."
( cd "$APP_DIR/backend"  && { [ -f package-lock.json ] && npm ci --omit=dev || npm install --omit=dev; } )
say "Compilando frontend..."
( cd "$APP_DIR/frontend" && { [ -f package-lock.json ] && npm ci || npm install; } && npm run build )

# Permisos: código legible por el servicio, uploads escribibles por él
chmod -R a+rX "$APP_DIR/backend" "$APP_DIR/frontend/dist"
mkdir -p "$APP_DIR/backend/uploads"
chown -R "$SVC_USER:$SVC_USER" "$APP_DIR/backend/uploads"

# -------------------------------------------- systemd (endurecido)
cat > /etc/systemd/system/preventis-api.service <<EOF
[Unit]
Description=Preventis API
After=network.target postgresql.service

[Service]
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=3
User=$SVC_USER
Group=$SVC_USER
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR/backend/uploads
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now preventis-api
say "Esperando a que la API levante..."
for i in $(seq 1 20); do curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1 && ok "API arriba (health 200)" || warn "La API no respondió health; revisa: journalctl -u preventis-api -n 50"

# -------------------------------------------- Sembrar config del chatbot (opcional)
if [ -n "$WAHA_URL" ]; then
  say "Guardando configuración de WhatsApp en la base..."
  PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -qc \
    "INSERT INTO app_config (clave,valor) VALUES ('chatbot', jsonb_build_object('url','$WAHA_URL','api_key','$WAHA_KEY','session','$WAHA_SESSION')) ON CONFLICT (clave) DO UPDATE SET valor=EXCLUDED.valor" \
    && ok "Config de chatbot guardada" || warn "No se pudo sembrar el chatbot (config luego desde la app)."
fi

# -------------------------------------------- nginx
echo 'limit_req_zone $binary_remote_addr zone=preventis_auth:10m rate=10r/m;' > /etc/nginx/conf.d/preventis-ratelimit.conf
cat > /etc/nginx/sites-available/preventis <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    root $APP_DIR/frontend/dist;
    index index.html;
    client_max_body_size 30M;
    server_tokens off;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location = /manifest.webmanifest { types {} default_type application/manifest+json; }
    location = /sw.js { add_header Cache-Control "no-cache"; }
    location = /index.html { add_header Cache-Control "no-cache, no-store, must-revalidate"; }

    location /api/auth/ {
        limit_req zone=preventis_auth burst=5 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        add_header X-Content-Type-Options "nosniff" always;
    }
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host; proxy_read_timeout 86400;
    }
    location / { try_files \$uri \$uri/ /index.html; }
}
EOF
ln -sf /etc/nginx/sites-available/preventis /etc/nginx/sites-enabled/preventis
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "nginx configurado para $DOMAIN"

# -------------------------------------------- TLS (opcional)
if $DO_TLS; then
  say "Solicitando certificado Let's Encrypt para $DOMAIN..."
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "${TLS_EMAIL:-admin@$DOMAIN}" --redirect; then
    ok "HTTPS activo (certbot renovará automáticamente)."
  else
    warn "certbot falló (¿el dominio apunta a este server y el puerto 80 es accesible?). Podés reintentar luego: certbot --nginx -d $DOMAIN"
  fi
fi

# -------------------------------------------- Firewall (opcional)
if $DO_UFW; then
  apt-get install -y ufw
  ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp
  ufw --force enable
  ok "ufw activo (22/80/443). La API (3001) escucha solo en localhost."
fi

# ================================================================ Resumen
echo
echo -e "${c_g}========================================================${c_0}"
echo -e "${c_b} Preventis instalado${c_0}"
echo -e "${c_g}========================================================${c_0}"
echo " URL:            http${DO_TLS:+s}://$DOMAIN"
echo " App:            $APP_DIR    (servicio: preventis-api, usuario: $SVC_USER)"
echo " Entorno:        $ENV_FILE  (chmod 600)"
echo " Base:           $PGUSER@$PGHOST:$PGPORT/$PGDATABASE  ($DB_MODE)"
[ "$DB_MODE" = local ] && echo -e " ${c_y}Password DB (guárdala):${c_0} $PGPASSWORD"
echo -e " ${c_y}Webhook secret (para el panel WAHA):${c_0} $WBK"
echo
echo -e " ${c_y}Primer ingreso:${c_0} usuario 'admin' / contraseña 'admin1234' — CÁMBIALA enseguida."
echo " Actualizar a futuro:   sudo bash $APP_DIR/deploy/update.sh"
echo " Logs:                  journalctl -u preventis-api -f"
echo -e "${c_g}========================================================${c_0}"
