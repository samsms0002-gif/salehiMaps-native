#!/usr/bin/env sh
# Run salehiMaps on a local web server (useful for installing as a PWA).
cd "$(dirname "$0")" || exit 1
PORT="${1:-8765}"
if command -v python3 >/dev/null 2>&1; then
  echo "salehiMaps: http://localhost:$PORT/"
  exec python3 -m http.server "$PORT" --bind 0.0.0.0
elif command -v python >/dev/null 2>&1; then
  echo "salehiMaps: http://localhost:$PORT/"
  exec python -m SimpleHTTPServer "$PORT"
else
  echo "Python not found. Open index.html directly in your browser instead." >&2
  exit 1
fi
