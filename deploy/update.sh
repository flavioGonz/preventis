#!/usr/bin/env bash
# =====================================================================
# Preventis — actualización por Git (pull + build + restart)
#   sudo bash /opt/preventis/deploy/update.sh [APP_DIR] [BRANCH]
# =====================================================================
set -euo pipefail

APP_DIR="${1:-/opt/preventis}"
BRANCH="${2:-main}"
SVC_USER="preventis"

c_b="\033[1m"; c_g="\033[32m"; c_0="\033[0m"
say(){ echo -e "${c_b}==>${c_0} $*"; }

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root (sudo)."; exit 1; }
[ -d "$APP_DIR/.git" ] || { echo "No es un repo Git: $APP_DIR (¿corriste install.sh?)"; exit 1; }

say "Actualizando código desde origin/$BRANCH..."
git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"

say "Backend: dependencias"
( cd "$APP_DIR/backend"  && { [ -f package-lock.json ] && npm ci --omit=dev || npm install --omit=dev; } )

say "Frontend: build"
( cd "$APP_DIR/frontend" && { [ -f package-lock.json ] && npm ci || npm install; } && npm run build )

say "Permisos"
chmod -R a+rX "$APP_DIR/backend" "$APP_DIR/frontend/dist"
mkdir -p "$APP_DIR/backend/uploads"
chown -R "$SVC_USER:$SVC_USER" "$APP_DIR/backend/uploads"

say "Reiniciando servicios"
systemctl restart preventis-api
nginx -t && systemctl reload nginx

sleep 2
if curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
  echo -e "${c_g}Actualizado OK — API arriba (health 200).${c_0}"
else
  echo "API no respondió health; revisa: journalctl -u preventis-api -n 50"
  exit 1
fi
