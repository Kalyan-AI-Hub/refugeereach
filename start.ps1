# RefugeeReach — one-shot startup script
# Run from the repo root: .\start.ps1   (PowerShell on macOS or Windows)
# Opens backend + frontend in separate terminal windows. Ctrl+C this window to stop them.

$REPO   = $PSScriptRoot
$BACK   = "$REPO/app/backend"
$FRONT  = "$REPO/app/frontend"
$MODEL  = "gemma4:e4b"       # Gemma 4 E4B — multimodal, function calling, multilingual (~9.6 GB)

# Detect platform for venv path
if ($IsWindows) {
    $PYTHON = "$BACK/.venv/Scripts/python.exe"
} else {
    $PYTHON = "$BACK/.venv/bin/python"
}

# ── helpers ──────────────────────────────────────────────────────────────────

function Write-Step($msg) { Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   ✓  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   ⚠  $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "   ✗  $msg" -ForegroundColor Red }

function Require-Model($name) {
    try {
        $tags  = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
        $found = $tags.models | Where-Object { $_.name -like "$name*" }
        if ($found) { Write-Ok "$name already available"; return }
    } catch {}
    Write-Warn "$name not found — pulling now (this may take several minutes)…"
    ollama pull $name
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to pull $name"; exit 1 }
    Write-Ok "$name ready"
}

function Wait-Port($url, $timeoutSec = 90) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-RestMethod -Uri $url -TimeoutSec 2 -ErrorAction Stop
            return $r
        } catch { Start-Sleep -Seconds 2 }
        Write-Host "." -NoNewline
    }
    return $null
}

# ── 1. Ollama ─────────────────────────────────────────────────────────────────

Write-Step "Checking Ollama"
try {
    Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop | Out-Null
    Write-Ok "Ollama is running"
} catch {
    Write-Warn "Starting ollama serve…"
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    $null = Wait-Port "http://localhost:11434/api/tags" 30
    Write-Ok "Ollama started"
}

# ── 2. Models ────────────────────────────────────────────────────────────────

Write-Step "Checking required models"
Require-Model $MODEL
Require-Model "nomic-embed-text"

# Keep .env in sync
(Get-Content "$BACK/.env") -replace "^MODEL_NAME=.*", "MODEL_NAME=$MODEL" |
    Set-Content "$BACK/.env"
Write-Ok ".env MODEL_NAME = $MODEL"

# ── 3. Python venv ────────────────────────────────────────────────────────────

Write-Step "Checking Python venv"
if (-not (Test-Path $PYTHON)) {
    Write-Warn "venv not found — creating and installing requirements…"
    python3 -m venv "$BACK/.venv"
    & $PYTHON -m pip install --quiet -r "$BACK/requirements.txt"
    & $PYTHON -m pip install --quiet greenlet
    Write-Ok "venv ready"
} else {
    Write-Ok "venv exists"
}

# ── 4. DB directories ─────────────────────────────────────────────────────────

Write-Step "Ensuring data directories exist"
New-Item -ItemType Directory -Force -Path "$BACK/db/chroma" | Out-Null
Write-Ok "DB directories ready"

# ── 5. Backend ────────────────────────────────────────────────────────────────

Write-Step "Starting backend (FastAPI)"

# Kill anything on port 8000
$old = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($old) {
    $old | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    Write-Ok "Cleared old process on :8000"
}

if ($IsWindows) {
    $backCmd = "`"$PYTHON`" -m uvicorn main:app --port 8000 --reload"
    $backProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/k title RefugeeReach-Backend && cd /d `"$BACK`" && $backCmd" `
        -PassThru
} else {
    $backProc = Start-Process -FilePath "osascript" `
        -ArgumentList "-e", "tell application `"Terminal`" to do script `"export PATH=\`"\$HOME/.local/bin:\$PATH\`" && cd '$BACK' && '$PYTHON' -m uvicorn main:app --port 8000 --reload`"" `
        -PassThru
}

Write-Host "   Waiting for backend" -NoNewline
$health = Wait-Port "http://127.0.0.1:8000/health" 90
if (-not $health) {
    Write-Host ""
    Write-Fail "Backend did not start within 90s — check the backend terminal for errors"
    exit 1
}
Write-Host ""
Write-Ok "Backend ready — model: $($health.model)"

# ── 6. Seed ChromaDB ──────────────────────────────────────────────────────────

Write-Step "Checking ChromaDB seed"

$seedCount = & $PYTHON -c @"
import chromadb
try:
    c = chromadb.PersistentClient(path='$BACK/db/chroma')
    cols = [col.name for col in c.list_collections()]
    print(c.get_collection('opportunities').count() if 'opportunities' in cols else 0)
except:
    print(0)
"@ 2>&1

if ([int]$seedCount -gt 0) {
    Write-Ok "ChromaDB has $seedCount opportunities — skipping seed"
} else {
    Write-Warn "ChromaDB is empty — seeding now…"
    & $PYTHON "$REPO/scripts/seed_demo_data.py"
    if ($LASTEXITCODE -ne 0) { Write-Warn "Seed had errors — skills matching may not work" }
    else                      { Write-Ok "ChromaDB seeded" }
}

# ── 7. Frontend ───────────────────────────────────────────────────────────────

Write-Step "Starting frontend (Vite)"

# Check if node_modules exist, install if missing
if (-not (Test-Path "$FRONT/node_modules")) {
    Write-Warn "node_modules missing — running npm install…"
    Push-Location $FRONT
    npm install
    Pop-Location
}

if ($IsWindows) {
    $frontProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/k title RefugeeReach-Frontend && cd /d `"$FRONT`" && npm run dev" `
        -PassThru
} else {
    $frontProc = Start-Process -FilePath "osascript" `
        -ArgumentList "-e", "tell application `"Terminal`" to do script `"cd '$FRONT' && npm run dev`"" `
        -PassThru
}

Write-Host "   Waiting for Vite (10s)" -NoNewline
Start-Sleep -Seconds 10
Write-Host ""
Write-Ok "Frontend ready — http://localhost:5173"

# ── 8. Summary ────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  RefugeeReach is running" -ForegroundColor White
Write-Host "  Frontend : http://localhost:5173" -ForegroundColor Green
Write-Host "  Backend  : http://localhost:8000" -ForegroundColor Green
Write-Host "  API docs : http://localhost:8000/docs" -ForegroundColor DarkGray
Write-Host "  Model    : $MODEL" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Backend and frontend are in their own terminal windows." -ForegroundColor DarkGray
Write-Host "  Close those windows (or Ctrl+C them) to stop." -ForegroundColor DarkGray
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan

# Open browser
Start-Process "http://localhost:5173"
