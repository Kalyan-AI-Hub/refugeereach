# RefugeeReach — Demo Reproduction Guide

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| RAM | 8 GB | 16 GB recommended for comfortable CPU inference |
| Disk | 20 GB free | Gemma 4 model ~9 GB, Docker images ~3 GB |
| OS | Windows 10+, Ubuntu 20.04+, macOS 12+ | Tested on Windows 11 |
| Ollama | Latest | ollama.com/download |
| Docker Desktop | Latest | For Docker Compose path only |
| Python | 3.11+ | For manual path only |
| Node.js | 18+ | For manual path only |

---

## Path A — Docker Compose (recommended)

```bash
# 1. Pull the model (once — ~9 GB download)
ollama pull gemma4

# 2. Start the full stack
docker-compose up --build

# 3. Seed demo data (once, in a second terminal)
docker exec refugeereach_backend python scripts/seed_demo_data.py

# 4. Open the app
# UI:     http://localhost:3000
# API:    http://localhost:8000/health
# Docs:   http://localhost:8000/docs
```

---

## Path B — Manual (faster iteration)

```bash
# Terminal 1 — Ollama
ollama serve
ollama pull gemma4
ollama pull nomic-embed-text   # for ChromaDB embeddings

# Terminal 2 — Backend
cd app/backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Mac/Linux
pip install --upgrade pip setuptools wheel
pip install openai-whisper --no-build-isolation
pip install -r requirements.txt
pip install uvicorn[standard]
mkdir db
python -m uvicorn main:app --reload --port 8000

# Terminal 3 — Seed data (once, after backend is up)
cd ../..
python scripts/seed_demo_data.py

# Terminal 4 — Frontend
cd app/frontend
npm install
npm run dev
# UI: http://localhost:5173
```

---

## Running the end-to-end demo flow

This walkthrough covers the full intake scenario from language selection through PDF export.

### Step 1 — Welcome & Language Detection

1. Open the app. The WelcomeScreen shows the RefugeeReach header with an online/offline indicator.
2. Accept the privacy consent checkbox.
3. Either:
   - Tap the Arabic flag 🇸🇾 to select Arabic directly, **or**
   - Tap the microphone and play `data/sample_documents/arabic_voice_sample.wav`
4. A teal card appears confirming "العربية" detected. Tap **Continue**.

### Step 2 — Document Capture

1. Tap the camera zone and upload `data/sample_documents/synthetic_syrian_passport.jpg`.
2. Tap **Read Document**. Gemma 4 extracts fields (takes 3–8 seconds on CPU).
3. Observe the extracted fields with confidence color coding:
   - Green borders: high confidence, auto-populated
   - Amber borders: moderate confidence, review recommended
   - Red borders: low confidence, manual entry required
4. Tap **Show source** under any field to see the exact text Gemma 4 read from the document.
5. Fill any red-bordered fields manually. Tap **Continue to Intake**.

### Step 3 — Intake Interview

1. The agent asks the first question in the detected language.
2. Tap the microphone and speak (or play a sample audio file), or proceed manually.
3. The progress bar fills as required fields complete.
4. Tap **Continue to Medical** when ready (or after 3+ turns).

### Step 4 — Medical Handoff

1. Select **Show document** and upload `data/sample_documents/synthetic_vaccination_record.jpg`.
2. Tap **Analyze Document**. A structured medical summary appears with urgency badge.
3. Expected urgency: **ROUTINE** (vaccination record — no acute symptoms).
4. Tap **Continue to Skills**.

### Step 5 — Skills Matching

1. Answer the 3 questions:
   - Prior work: `pediatric nurse`
   - Certifications: `first aid, child health`
   - Languages: `Arabic, English`
2. Tap **Find Opportunities**. ChromaDB returns matched roles.
3. Expected matches: medical or community health roles from the seeded catalog.
4. Tap **Complete & Export**.

### Step 6 — Staff Export

1. Review the module checklist (all 4 modules complete).
2. Read the staff disclaimer.
3. Tap **Confirm & Approve**.
4. Tap **Download PDF Summary**. A branded PDF downloads to your device.
5. Open the PDF — it contains registration details, medical handoff note, and opportunity matches.

---

## Offline proof

1. Complete at least Steps 1–2 with Ollama running.
2. Toggle your device to airplane mode (disconnect network).
3. Continue from Step 3 — the system continues to function.
4. The red dot in the header confirms "Offline mode".
5. The Ollama inference logs in the terminal show local model inference continuing.

---

## Expected outputs

| Step | Expected result |
|------|----------------|
| Language detection | Arabic (ar) detected with ≥ 0.85 confidence |
| Passport extraction | ≥ 5 of 8 fields populated, overall confidence ≥ 0.80 |
| Medical urgency | ROUTINE (synthetic vaccination record) |
| Skills matches | 2–3 results from seeded opportunity catalog |
| PDF generation | Downloaded within 5 seconds, ~2 pages |
| Offline operation | All steps 1–6 complete with no network |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `ollama: command not found` | Install from ollama.com/download and restart terminal |
| `Error: memory layout cannot be allocated` | Pull a smaller model: `ollama pull gemma4:4b` |
| `ModuleNotFoundError: No module named 'fastapi'` | Run `pip install -r requirements.txt` inside the venv |
| `chromadb` import error | Run `pip install chromadb` inside the venv |
| Whisper first run slow | Normal — downloads base model (~140 MB) on first call |
| Confidence scores all 0.0 | Gemma 4 returned legacy format — backend handles both formats automatically |
| Frontend shows unstyled | Check `tailwind.config.js` and `postcss.config.js` exist in `app/frontend/` |
