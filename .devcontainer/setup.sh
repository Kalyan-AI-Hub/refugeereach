#!/usr/bin/env bash
# Runs once after the devcontainer is created.
# Judges only need to run: ollama pull gemma4:e4b && ./start.sh

set -e

echo "==> Installing Python dependencies"
pip install --quiet --upgrade pip
pip install --quiet -r app/backend/requirements.txt

echo "==> Installing frontend dependencies"
cd app/frontend && npm install --silent && cd ../..

echo "==> Installing ffmpeg (required for Whisper)"
sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg

echo "==> Installing Ollama"
curl -fsSL https://ollama.com/install.sh | sh

echo ""
echo "================================================================"
echo "  RefugeeReach devcontainer ready!"
echo ""
echo "  Next steps:"
echo "    1. ollama pull gemma4:e4b       (~10 min, one-time)"
echo "    2. ollama pull nomic-embed-text (~300 MB)"
echo "    3. python scripts/seed_demo_data.py"
echo "    4. ./start.sh"
echo ""
echo "  The UI opens automatically on port 5173."
echo "================================================================"
