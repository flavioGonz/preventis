#!/usr/bin/env bash
# Preventis OTA updater — corre como root, disparado por systemd .path
set -uo pipefail
APP=/opt/preventis
DIR=/var/lib/preventis/ota
ST="$DIR/status.json"
TRG="$DIR/trigger"
LOG="$DIR/ota.log"
BR=main
mkdir -p "$DIR"
jstr(){ printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
log(){ printf '{"state":"%s","pct":%s,"step":"%s","version":"%s","ts":"%s"}\n' "$1" "$2" "$(jstr "$3")" "${4:-}" "$(date -Is)" > "$ST"; chmod 644 "$ST"; }
fail(){ log error "${1:-0}" "$2" ""; rm -f "$TRG"; exit 1; }

echo "=== OTA $(date -Is) ===" >> "$LOG"
log running 5 "Iniciando actualización" ""
cd "$APP" || fail 5 "No se encontró la aplicación"

log running 15 "Obteniendo cambios del repositorio"
git fetch --depth 1 origin "$BR" >>"$LOG" 2>&1 || fail 15 "No se pudo conectar al repositorio"

NEW=$(git rev-parse --short "origin/$BR" 2>/dev/null)
log running 30 "Aplicando versión ${NEW}"
git reset --hard "origin/$BR" >>"$LOG" 2>&1 || fail 30 "No se pudo aplicar la versión"

log running 45 "Instalando dependencias del backend"
( cd "$APP/backend" && { [ -f package-lock.json ] && npm ci --omit=dev || npm install --omit=dev; } ) >>"$LOG" 2>&1 || fail 45 "Falló la instalación del backend"

log running 65 "Compilando la interfaz"
( cd "$APP/frontend" && { [ -f package-lock.json ] && npm ci || npm install; } && npm run build ) >>"$LOG" 2>&1 || fail 65 "Falló la compilación de la interfaz"

log running 85 "Ajustando permisos"
chmod -R a+rX "$APP/backend" "$APP/frontend/dist" >>"$LOG" 2>&1
mkdir -p "$APP/backend/uploads"; chown -R preventis:preventis "$APP/backend/uploads" >>"$LOG" 2>&1

log running 92 "Reiniciando servicios"
systemctl restart preventis-api >>"$LOG" 2>&1
nginx -t >>"$LOG" 2>&1 && systemctl reload nginx >>"$LOG" 2>&1

sleep 3
if curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
  log done 100 "Actualización completada" "$NEW"
else
  fail 92 "La API no respondió tras reiniciar"
fi
rm -f "$TRG"
echo "=== OTA done $NEW ===" >> "$LOG"
