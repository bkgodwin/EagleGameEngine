#!/usr/bin/env bash
# Eagle Game Engine – start both backend and frontend.
# Run from the repo root:  bash start.sh
# Press Ctrl+C to stop everything.

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

trap 'echo; echo "Stopping Eagle Game Engine..."; kill 0' SIGINT SIGTERM

# ── Free ports if already in use ─────────────────────────────────────────────
free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti tcp:"${port}" 2>/dev/null) || true
  if [ -n "$pids" ]; then
    echo "Port ${port} is already in use – stopping existing process(es)..."
    if ! echo "$pids" | xargs kill -TERM 2>/dev/null; then
      echo "  Warning: could not stop all process(es) on port ${port} (permission denied?)"
    fi
    # Wait up to 5 seconds for the port to be released
    local waited=0
    while lsof -ti tcp:"${port}" >/dev/null 2>&1; do
      if [ "$waited" -ge 5 ]; then
        echo "  Warning: port ${port} still in use after ${waited}s – proceeding anyway"
        break
      fi
      sleep 1
      waited=$((waited + 1))
    done
  fi
}
free_port 8000
free_port 5173

# ── Detect LAN IP ────────────────────────────────────────────────────────────
# Try to get the primary outbound interface IP; fall back to hostname -I
LAN_IP=$(ip route get 1 2>/dev/null | awk 'NR==1{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
if [ -z "$LAN_IP" ]; then
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
[ -z "$LAN_IP" ] && LAN_IP="localhost"

# ── Python / venv setup ──────────────────────────────────────────────────────
cd "$REPO_ROOT/backend"

if [ ! -d ".venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
fi

# Activate venv
# shellcheck disable=SC1091
source .venv/bin/activate

echo "Installing / updating Python dependencies..."
pip install -q -r requirements.txt

# ── Node / npm setup ──────────────────────────────────────────────────────────
cd "$REPO_ROOT/frontend"
if [ ! -d "node_modules" ]; then
  echo "Installing Node dependencies (npm install)..."
  npm install --silent
fi

# ── Print banner ─────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  🦅  Eagle Game Engine"
echo ""
echo "  Backend  →  http://${LAN_IP}:8000  (also localhost:8000)"
echo "  Frontend →  http://${LAN_IP}:5173  (also localhost:5173)"
echo ""
echo "  🔑  Default Admin Credentials:"
echo "      Email:    admin@eagle.local"
echo "      Password: admin123"
echo "      (Change these after first login!)"
echo ""
echo "  Press Ctrl+C to stop."
echo "============================================================"
echo ""

# ── Start backend ─────────────────────────────────────────────────────────────
(
  cd "$REPO_ROOT/backend"
  source .venv/bin/activate
  python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 2>&1 \
    | while IFS= read -r line; do printf '\033[36m[backend] \033[0m%s\n' "$line"; done
) &

# ── Start frontend ────────────────────────────────────────────────────────────
(
  cd "$REPO_ROOT/frontend"
  npm run dev 2>&1 \
    | while IFS= read -r line; do printf '\033[33m[frontend]\033[0m %s\n' "$line"; done
) &

wait
