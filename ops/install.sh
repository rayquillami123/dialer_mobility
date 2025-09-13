#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRESETS="$ROOT/ops/presets"
FS_CONF="$ROOT/freeswitch/conf/autoload_configs/json_cdr.conf.xml"

bold(){ printf "\033[1m%s\033[0m\n" "$*"; }
info(){ printf "🔧 %s\n" "$*"; }
ok(){ printf "✅ %s\n" "$*"; }
err(){ printf "❌ %s\n" "$*" >&2; }

cd "$ROOT"

bold "🚀 Instalador Dialer Inteligente"
echo
echo "Elige modo de despliegue:"
echo "  1) Embedded: FreeSWITCH incluido (docker-compose.fs.yml)"
echo "  2) Externo: conectar a FusionPBX (sin FS local)"
echo "  3) Externo: conectar a Issabel/Asterisk (sin FS local) [+AMI opcional]"
echo "  4) Embedded + MagnusBilling como gateway de salida"
read -rp "Opción [1-4]: " MODE

case "$MODE" in
  1) PRESET="$PRESETS/mode_embedded.env"; COMPOSE="docker-compose.fs.yml" ;;
  2) PRESET="$PRESETS/mode_fusionpbx.env"; COMPOSE="docker-compose.ext.yml" ;;
  3) PRESET="$PRESETS/mode_issabel.env";   COMPOSE="docker-compose.ext.yml" ;;
  4) PRESET="$PRESETS/mode_magnus.env";    COMPOSE="docker-compose.fs.yml" ;;
  *) err "Opción inválida"; exit 1 ;;
esac

# Copiar preset a .env (sin sobreescribir valores existentes si ya hay .env)
if [[ -f .env ]]; then
  info ".env ya existe; se conservará. Puedes editar manualmente si deseas cambiar valores."
else
  cp -f "$PRESET" .env
  ok "Generado .env desde preset: $(basename "$PRESET")"
fi

# Generar token CDR y escribirlo en .env si no existe
if ! grep -q '^CDR_INGEST_TOKEN=' .env; then
  TOKEN="$(openssl rand -hex 24)"
  echo "CDR_INGEST_TOKEN=$TOKEN" >> .env
  ok "Generado CDR_INGEST_TOKEN"
else
  TOKEN="$(grep '^CDR_INGEST_TOKEN=' .env | cut -d= -f2-)"
fi

# Inyectar token en json_cdr.conf.xml (si existe FS local y conf disponible)
if [[ -f "$FS_CONF" ]]; then
  info "Inyectando token CDR en $FS_CONF"
  # Reemplaza cualquier ?token=... por el actual; si no existe, lo añade manteniendo la URL
  if grep -q 'param name="url"' "$FS_CONF"; then
    # extrae URL actual
    URL_LINE="$(grep 'param name="url"' "$FS_CONF")"
    URL="$(echo "$URL_LINE" | sed -E 's/.*value="([^"]+)".*/\1/')"
    BASE="${URL%%\?*}"
    NEW="${BASE}?token=${TOKEN}"
    # reemplaza línea completa
    sed -i.bak -E "s#(<param name=\"url\" value=\").*(\"/>)#\1$NEW\2#g" "$FS_CONF"
    ok "URL CDR -> $NEW"
  fi
fi

# Migraciones backend (si existen scripts)
if [[ -f backend/package.json ]]; then
  info "Instalando dependencias backend…"
  (cd backend && npm ci || npm install)
  if grep -q '"db:migrate"' backend/package.json; then
    info "Ejecutando migraciones…"
    (cd backend && npm run db:migrate)
  fi
fi

# Construir imágenes (frontend/back)
info "Construyendo imágenes…"
if [[ -f package.json ]]; then
  (npm ci || npm install)
fi
docker compose -f "$COMPOSE" build

# Levantar stack
info "Levantando servicios con $COMPOSE…"
docker compose -f "$COMPOSE" up -d

# Esperar backend
API="$(grep '^NEXT_PUBLIC_API=' .env | cut -d= -f2-)"
API="${API:-http://localhost:8080}"
info "Comprobando salud API en $API/api/health…"
for i in {1..30}; do
  if curl -fsS "$API/api/health" >/dev/null 2>&1; then ok "API OK"; break; fi
  sleep 2
  [[ $i -eq 30 ]] && { err "API no responde"; exit 1; }
done

# Smoke test corto (login opcional o endpoint público)
if command -v node >/dev/null && [[ -f ops/smoke/smoke.mjs ]]; then
  info "Ejecutando smoke test…"
  node ops/smoke/smoke.mjs || err "Smoke test falló (revisa logs)"
fi

ok "Instalación completa."
echo "👉 Frontend: $(grep '^NEXT_PUBLIC_API=' .env >/dev/null && grep '^NEXT_PUBLIC_API=' .env | sed 's#NEXT_PUBLIC_API#APP URL (ajusta a tu dominio app.tu.com)#')"
echo "👉 Backend:  $API"
echo
echo "Siguientes pasos:"
echo "- Ajusta DNS/TLS o usa el Nginx/Ingress de tu entorno."
echo "- Si elegiste Issabel y AMI: ejecuta el bridge en ops/bridges/asterisk-ami-bridge.js"
