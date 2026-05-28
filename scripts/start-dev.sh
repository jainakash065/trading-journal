#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="http://127.0.0.1:4174/api/dashboard"
API_PORT="4174"
UI_URL="http://127.0.0.1:5173/"
UI_PORT="5173"

has_command() {
  command -v "$1" >/dev/null 2>&1
}

http_status() {
  if ! has_command curl; then
    printf "000"
    return
  fi
  curl --max-time 1 -s -o /dev/null -w "%{http_code}" "$1" || printf "000"
}

port_in_use() {
  if ! has_command lsof; then
    return 1
  fi
  lsof -ti "tcp:$1" >/dev/null 2>&1
}

wait_for_http() {
  url="$1"
  attempts="$2"
  count=1
  while [ "$count" -le "$attempts" ]; do
    if [ "$(http_status "$url")" = "200" ]; then
      return 0
    fi
    sleep 1
    count=$((count + 1))
  done
  return 1
}

printf "Trading Journal dev startup\n"
printf "Project: %s\n" "$ROOT_DIR"

cd "$ROOT_DIR"

if [ ! -f package.json ]; then
  printf "Error: package.json not found. Run this script from the trading-journal repo.\n" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  printf "Error: node_modules is missing. Run npm install first.\n" >&2
  exit 1
fi

api_status="$(http_status "$API_URL")"
ui_status="$(http_status "$UI_URL")"

if [ "$api_status" = "200" ] && [ "$ui_status" = "200" ]; then
  printf "Servers already look healthy.\n"
  printf "UI:  %s\n" "$UI_URL"
  printf "API: http://127.0.0.1:%s/\n" "$API_PORT"
  exit 0
fi

if port_in_use "$API_PORT" && [ "$api_status" != "200" ]; then
  printf "API port %s is in use but not ready yet. Waiting briefly...\n" "$API_PORT"
  if wait_for_http "$API_URL" 10; then
    api_status="200"
  fi
fi

if port_in_use "$UI_PORT" && [ "$ui_status" != "200" ]; then
  printf "UI port %s is in use but not ready yet. Waiting briefly...\n" "$UI_PORT"
  if wait_for_http "$UI_URL" 10; then
    ui_status="200"
  else
    printf "Warning: UI port %s is already in use. Vite may choose the next free port.\n" "$UI_PORT"
  fi
fi

if port_in_use "$API_PORT" && port_in_use "$UI_PORT"; then
  printf "The expected dev ports are already listening.\n"
  printf "UI:  %s\n" "$UI_URL"
  printf "API: http://127.0.0.1:%s/\n" "$API_PORT"
  printf "If the app does not load, stop those processes and rerun this script.\n"
  exit 0
fi

if port_in_use "$API_PORT" && [ "$api_status" != "200" ]; then
  printf "Error: API port %s is already in use, but the journal API did not respond.\n" "$API_PORT" >&2
  printf "Stop that process first, then rerun this script.\n" >&2
  exit 1
fi

if [ "$api_status" = "200" ] && [ "$ui_status" = "200" ]; then
  printf "Servers already look healthy.\n"
  printf "UI:  %s\n" "$UI_URL"
  printf "API: http://127.0.0.1:%s/\n" "$API_PORT"
  exit 0
fi

if ! has_command npm; then
  printf "Error: npm is not available on PATH. Try running with your login shell:\n" >&2
  printf "  /bin/zsh -lic 'cd %s && bash scripts/start-dev.sh'\n" "$ROOT_DIR" >&2
  exit 1
fi

printf "Starting dev servers...\n"
printf "Expected API: http://127.0.0.1:%s/\n" "$API_PORT"
printf "Expected UI:  %s\n" "$UI_URL"
printf "\n"
npm run dev
