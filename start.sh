#!/usr/bin/env zsh
# RefugeeReach — startup script for macOS / zsh
# Run from the repo root:  ./start.sh
# Opens backend + frontend in separate Terminal windows.

set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
BACK="$REPO/app/backend"
FRONT="$REPO/app/frontend"
PYTHON="$BACK/.venv/bin/python"
MODEL="gemma4:e4b"

# ── helpers ───────────────────────────────────────────────────────────────────

step()  { printf "\n\033[36m▶  %s\033[0m\n" "$*"; }
ok()    { printf "   \033[32m✓  %s\033[0m\n" "$*"; }
warn()  { printf "   \033[33m⚠  %s\033[0m\n" "$*"; }
fail()  { printf "   \033[31m✗  %s\033[0m\n" "$*"; exit 1; }

open_terminal() {
  # Opens a new macOS Terminal window running the given command string
  local cmd="$1"
  osascript -e "tell application \"Terminal\" to do script \"$cmd\""
}

wait_port() {
  local url="$1" timeout="${2:-90}" elapsed=0
  printf "   Waiting for %s " "$url"
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -sf "$url" >/dev/null 2>&1; then printf "\n"; return 0; fi
    printf "."
    sleep 2
    elapsed=$((elapsed + 2))
  done
  printf "\n"
  return 1
}

# ── 1. Ollama ─────────────────────────────────────────────────────────────────

step "Checking Ollama"
if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  ok "Ollama is already running"
else
  warn "Starting ollama serve…"
  ollama serve &>/dev/null &
  wait_port "http://localhost:11434/api/tags" 30 || fail "Ollama did not start"
  ok "Ollama started"
fi

# ── 2. Models ─────────────────────────────────────────────────────────────────

step "Checking required models"

require_model() {
  local name="$1"
  if curl -sf http://localhost:11434/api/tags 2>/dev/null | grep -q "\"$name\""; then
    ok "$name already available"
  else
    warn "$name not found — pulling now (may take several minutes)…"
    ollama pull "$name" || fail "Failed to pull $name"
    ok "$name ready"
  fi
}

require_model "$MODEL"
require_model "nomic-embed-text"

# Keep .env MODEL_NAME in sync
if [ -f "$BACK/.env" ]; then
  sed -i '' "s/^MODEL_NAME=.*/MODEL_NAME=$MODEL/" "$BACK/.env"
  ok ".env MODEL_NAME = $MODEL"
fi

# ── 3. Python venv ────────────────────────────────────────────────────────────

step "Checking Python venv"
if [ ! -f "$PYTHON" ]; then
  warn "venv not found — creating and installing requirements…"
  python3 -m venv "$BACK/.venv"
  "$PYTHON" -m pip install --quiet -r "$BACK/requirements.txt"
  "$PYTHON" -m pip install --quiet greenlet
  ok "venv ready"
else
  ok "venv exists"
fi

# ── 4. DB directories ─────────────────────────────────────────────────────────

step "Ensuring data directories"
mkdir -p "$BACK/db/chroma"
ok "DB directories ready"

# ── 5. Backend ────────────────────────────────────────────────────────────────

step "Starting backend (FastAPI)"

# Free port 8000 if something is already on it
if lsof -ti:8000 >/dev/null 2>&1; then
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  sleep 1
  ok "Cleared old process on :8000"
fi

open_terminal "export PATH=\$HOME/.local/bin:\$PATH && cd '$BACK' && '$PYTHON' -m uvicorn main:app --port 8000 --reload"

wait_port "http://127.0.0.1:8000/health" 90 || fail "Backend did not start within 90s — check the backend terminal for errors"
ok "Backend ready"

# ── 6. Seed ChromaDB ──────────────────────────────────────────────────────────

step "Checking ChromaDB seed"

seed_count=$("$PYTHON" - <<'PYEOF' 2>/dev/null
import sys
sys.path.insert(0, ".")
try:
    import chromadb, os
    c = chromadb.PersistentClient(path=os.path.join(os.path.dirname(sys.argv[0] if sys.argv[0] != "" else "."), "db/chroma"))
    cols = [col.name for col in c.list_collections()]
    print(c.get_collection("opportunities").count() if "opportunities" in cols else 0)
except Exception:
    print(0)
PYEOF
) || seed_count=0

# Run the check from the backend dir so relative paths resolve
seed_count=$(cd "$BACK" && "$PYTHON" - <<'PYEOF' 2>/dev/null
import chromadb
try:
    c = chromadb.PersistentClient(path="db/chroma")
    cols = [col.name for col in c.list_collections()]
    print(c.get_collection("opportunities").count() if "opportunities" in cols else 0)
except Exception:
    print(0)
PYEOF
) || seed_count=0

if [ "${seed_count:-0}" -gt 0 ] 2>/dev/null; then
  ok "ChromaDB has $seed_count opportunities — skipping seed"
else
  warn "ChromaDB is empty — seeding now…"
  "$PYTHON" "$REPO/scripts/seed_demo_data.py" && ok "ChromaDB seeded" || warn "Seed had errors — skills matching may not work"
fi

# ── 7. Node / frontend ────────────────────────────────────────────────────────

step "Starting frontend (Vite)"

# Load nvm so npm is available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

if ! command -v npm >/dev/null 2>&1; then
  fail "npm not found — install Node.js via nvm: nvm install --lts"
fi

if [ ! -d "$FRONT/node_modules" ]; then
  warn "node_modules missing — running npm install…"
  (cd "$FRONT" && npm install)
fi

open_terminal "export NVM_DIR=\$HOME/.nvm && source \$NVM_DIR/nvm.sh && cd '$FRONT' && npm run dev"

printf "   Waiting for Vite (10s)"
sleep 10
printf "\n"
ok "Frontend ready — http://localhost:5173"

# ── 8. Summary ────────────────────────────────────────────────────────────────

printf "\n\033[36m══════════════════════════════════════════\033[0m\n"
printf "\033[1m  RefugeeReach is running\033[0m\n"
printf "  \033[32mFrontend : http://localhost:5173\033[0m\n"
printf "  \033[32mBackend  : http://localhost:8000\033[0m\n"
printf "  \033[90mAPI docs : http://localhost:8000/docs\033[0m\n"
printf "  \033[90mModel    : %s\033[0m\n" "$MODEL"
printf "\n"
printf "  \033[90mBackend and frontend are in their own Terminal windows.\033[0m\n"
printf "  \033[90mClose those windows (or Ctrl+C them) to stop.\033[0m\n"
printf "\033[36m══════════════════════════════════════════\033[0m\n\n"

# Open browser
open "http://localhost:5173"
