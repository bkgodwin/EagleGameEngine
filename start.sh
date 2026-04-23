#!/usr/bin/env bash
# Eagle Game Engine – start both backend and frontend.
# Run from the repo root:  bash start.sh
# Press Ctrl+C to stop everything.

trap 'echo; echo "Stopping Eagle Game Engine..."; kill 0' SIGINT SIGTERM

echo "============================================"
echo "  🦅  Eagle Game Engine"
echo "  Backend  →  http://localhost:8000"
echo "  Frontend →  http://localhost:5173"
echo "  Press Ctrl+C to stop."
echo "============================================"
echo ""

# Start backend (Python / uvicorn)
(
  cd "$(dirname "$0")/backend"
  python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 2>&1 \
    | while IFS= read -r line; do printf '\033[36m[backend] \033[0m%s\n' "$line"; done
) &

# Start frontend (Vite dev server)
(
  cd "$(dirname "$0")/frontend"
  npm run dev 2>&1 \
    | while IFS= read -r line; do printf '\033[33m[frontend]\033[0m %s\n' "$line"; done
) &

wait
