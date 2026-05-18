"""
Generate RefugeeReach architecture diagram PNG — v2.
Fixes: /documents/translate, /cases/next-steps, 5 SQLite tables, 10 ChromaDB opps,
       Responsible AI layer, Gemma 4 Vision+Chat+ToolCalling, all 8 call sites,
       two medical paths, skills reranking via Gemma 4.
Run: python scripts/generate_architecture_diagram.py
Output: docs/architecture/architecture.png
"""

import os
import math
from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 1060
OUT = os.path.join(os.path.dirname(__file__), "../docs/architecture/architecture.png")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

BG      = (18, 22, 30)
BORDER  = (50, 60, 80)
TEAL    = (0, 180, 160)
BLUE    = (60, 140, 220)
GREEN   = (60, 200, 100)
AMBER   = (240, 180, 50)
RED     = (220, 80, 80)
PURPLE  = (160, 100, 220)
TEXT_W  = (240, 245, 255)
TEXT_G  = (130, 145, 165)
ARROW   = (75, 95, 125)
TEAL_DIM = (0, 110, 100)

img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)


def _font(size):
    for path in [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Arial.ttf",
    ]:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


def box(x, y, w, h, fill=(28, 34, 46), border=BORDER, radius=10):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill, outline=border, width=2)


def txt(x, y, t, color=TEXT_W, size=11, align="center"):
    font = _font(size)
    lines = t.split("\n")
    lh = size + 5
    total = len(lines) * lh
    cy = y - total // 2
    for line in lines:
        lw = draw.textlength(line, font=font)
        ox = x - lw / 2 if align == "center" else x
        draw.text((ox, cy), line, fill=color, font=font)
        cy += lh


def arw(x1, y1, x2, y2, color=ARROW, width=2):
    draw.line([x1, y1, x2, y2], fill=color, width=width)
    ang = math.atan2(y2 - y1, x2 - x1)
    s = 7
    draw.polygon([
        (x2, y2),
        (x2 - s * math.cos(ang - 0.4), y2 - s * math.sin(ang - 0.4)),
        (x2 - s * math.cos(ang + 0.4), y2 - s * math.sin(ang + 0.4)),
    ], fill=color)


def div(y, color=(35, 42, 56)):
    draw.line([50, y, W - 50, y], fill=color, width=1)


def layer(y, label):
    font = _font(9)
    draw.text((54, y - 9), label, fill=TEXT_G, font=font)


# ─────────────────────────────────────────────────────────────────────────────
# TITLE
# ─────────────────────────────────────────────────────────────────────────────
txt(W // 2, 30, "RefugeeReach — System Architecture", color=TEXT_W, size=18)
txt(W // 2, 53, "Offline-first · Gemma 4 E4B · Multilingual Humanitarian Intake Assistant", color=TEXT_G, size=10)
div(68)

box(1390, 74, 162, 28, fill=(14, 42, 22), border=GREEN, radius=7)
txt(1471, 88, "FULLY OFFLINE", color=GREEN, size=10)

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 1 — PRESENTATION  (y=75–192)
# ─────────────────────────────────────────────────────────────────────────────
layer(92, "PRESENTATION")

TABS = [
    (75,  "Language\nSelect",              TEAL),
    (245, "Document Vision\n+ Translate",  BLUE),
    (415, "Guided\nIntake",               TEAL),
    (585, "Medical\nHandoff",             RED),
    (755, "Skills\nMatch",               GREEN),
    (925, "PDF Export\n+ Next Steps",    AMBER),
]
for tx, name, color in TABS:
    box(tx, 100, 155, 68, fill=(28, 36, 50), border=color)
    txt(tx + 77, 134, name, color=color, size=10)

box(1110, 100, 210, 68, fill=(24, 30, 43), border=BORDER)
txt(1215, 120, "React 18 + Vite", color=TEXT_G, size=9)
txt(1215, 135, "Tailwind CSS", color=TEXT_G, size=9)
txt(1215, 150, "port 5173", color=TEXT_G, size=9)

div(182)

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 2 — API LAYER  (y=182–318)
# ─────────────────────────────────────────────────────────────────────────────
layer(198, "API LAYER")

ROUTES = [
    (75,  "/api/cases\n+ /{id}/next-steps",                      BORDER),
    (250, "/api/documents\n/extract   /translate",               BLUE),
    (430, "/api/intake\n/turn  /transcribe  /speak",             TEAL),
    (605, "/api/medical\n/handoff-from-text\n/handoff-from-image",RED),
    (790, "/api/skills\n/match",                                 GREEN),
    (950, "/api/export\n/{id}/pdf",                              AMBER),
]
for rx, name, color in ROUTES:
    box(rx, 196, 160, 88, fill=(24, 30, 43), border=color)
    txt(rx + 80, 240, name, color=color, size=9)

box(1130, 196, 230, 88, fill=(24, 30, 43), border=BORDER)
txt(1245, 220, "FastAPI 0.111", color=TEXT_G, size=9)
txt(1245, 235, "uvicorn (async)", color=TEXT_G, size=9)
txt(1245, 250, "port 8000", color=TEXT_G, size=9)
txt(1245, 265, "trace_id middleware", color=TEXT_G, size=9)

div(298)

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 3 — RESPONSIBLE AI  (y=298–415)  ← NEW
# ─────────────────────────────────────────────────────────────────────────────
layer(302, "RESPONSIBLE AI")

RA = [
    (75,  "Input Guardrails\ncrisis · harmful · legal\nblocks before Gemma 4",        RED,    270, 80),
    (360, "Consent Gate\nHTTP 422 if consent=false\nrecorded in AuditLog",             AMBER,  260, 80),
    (635, "Immutable Audit Log\nconsent · update · export\ndelete · guardrail_block",  PURPLE, 275, 80),
    (925, "Vulnerability Flags\n7 categories (SGBV, minor…)\npersisted to CaseRecord", RED,    255, 80),
    (1195,"Right to Erasure\nDELETE /{case_id}\nhard-deletes all 5 tables",            BORDER, 255, 80),
]
for bx, name, color, bw, bh in RA:
    box(bx, 314, bw, bh, fill=(20, 18, 32), border=color)
    txt(bx + bw // 2, 314 + bh // 2, name, color=color, size=9)

div(402)

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 4 — AI / SERVICES  (y=402–590)
# ─────────────────────────────────────────────────────────────────────────────
layer(418, "AI / SERVICES")

# Gemma 4 — large box listing all 8 call sites
box(75, 418, 280, 158, fill=(16, 34, 40), border=TEAL, radius=12)
txt(215, 433, "Gemma 4 E4B (Ollama)", color=TEAL, size=11)
txt(215, 450, "Vision · Chat · Tool Calling", color=TEXT_G, size=9)
for i, line in enumerate([
    "① doc extract        vision + json_mode",
    "② doc translate      vision",
    "③ intake agent       text + tool_calling",
    "④ vuln assessment    text + json_mode",
    "⑤ medical text       text + json_mode",
    "⑥ medical vision     vision + json_mode",
    "⑦ skills rerank      text + json_mode",
    "⑧ next steps card    text",
]):
    font = _font(8)
    lw = draw.textlength(line, font=font)
    draw.text((215 - lw / 2, 463 + i * 13), line, fill=(90, 185, 168), font=font)

box(75, 582, 155, 24, fill=(12, 22, 30), border=(40, 58, 78))
txt(152, 594, "Ollama :11434", color=TEXT_G, size=9)

# Other service boxes (x start after Gemma 4 = 370)
SVCS = [
    (370, "Whisper (base)\nSpeech-to-Text\n~145 MB lazy-load",         BLUE,  170, 100),
    (555, "pyttsx3 TTS\n184 voices\nArabic · Dari included",            AMBER, 170, 100),
    (740, "nomic-embed-text\nChromaDB Stage 1\nvector retrieval",       GREEN, 178, 100),
    (933, "IntakeAgent\nReAct loop · 6 tools\nrolling 20-msg memory",   TEAL,  178, 100),
    (1126,"MedicalService\ntext path + vision path\nurgency classify",   RED,   178, 100),
    (1319,"PDFService\nfpdf2 · arabic-reshaper\npython-bidi RTL",        AMBER, 195, 100),
]
for bx, name, color, bw, bh in SVCS:
    box(bx, 424, bw, bh, fill=(20, 26, 38), border=color)
    txt(bx + bw // 2, 424 + bh // 2, name, color=color, size=9)

# Image preprocessing note (small, under documents)
box(370, 532, 170, 28, fill=(18, 24, 36), border=(50, 70, 90))
txt(455, 546, "ImagePreprocessing\ncontrast +30% · sharpen +20%", color=TEXT_G, size=8)

div(574)

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 5 — PERSISTENCE  (y=574–740)
# ─────────────────────────────────────────────────────────────────────────────
layer(590, "PERSISTENCE")

STORES = [
    (75,   "SQLite · aiosqlite\n5 tables:\ncases · documents\nmedical_handoffs\nskills_profiles · audit_log", BORDER, 200, 110),
    (290,  "ChromaDB\n10 opportunities\n6 referrals\nnomic-embed-text",                                      GREEN,  185, 110),
    (490,  "File system\nsample docs\naudio WAVs",                                                            BORDER, 160, 110),
    (665,  "Whisper\nmodel cache\n~145 MB",                                                                   BLUE,   160, 110),
    (840,  "Gemma 4 E4B\nmodel weights\n9.6 GB",                                                              TEAL,   175, 110),
    (1030, "nomic-embed\nmodel weights\n274 MB",                                                               GREEN,  175, 110),
    (1220, "Prompts (versioned)\ndoc_extraction.md\nmedical_handoff.md\nintake_agent_system.md",               PURPLE, 210, 110),
]
for sx, name, color, sw, sh in STORES:
    box(sx, 584, sw, sh, fill=(18, 24, 36), border=color)
    txt(sx + sw // 2, 584 + sh // 2, name, color=color, size=9)

# ─────────────────────────────────────────────────────────────────────────────
# ARROWS — Presentation → API
# ─────────────────────────────────────────────────────────────────────────────
tab_centers = [tx + 77 for tx, _, _ in TABS]
route_tops  = [rx + 80 for rx, _, _ in ROUTES]

for i, (tc, rt) in enumerate(zip(tab_centers, route_tops)):
    arw(tc, 168, rt, 196)

# ─────────────────────────────────────────────────────────────────────────────
# ARROWS — API → Services (through Responsible AI layer)
# ─────────────────────────────────────────────────────────────────────────────
# cases → Gemma 4 (next-steps)
arw(155, 284, 215, 418, color=TEAL_DIM)
# documents → Gemma 4 (extract + translate both)
arw(330, 284, 215, 418, color=BLUE)
# intake → Whisper
arw(510, 284, 455, 424, color=BLUE)
# intake → TTS
arw(510, 284, 640, 424, color=AMBER)
# intake → IntakeAgent → Gemma 4
arw(510, 284, 1022, 424, color=TEAL)
# medical → MedicalService
arw(685, 284, 1215, 424, color=RED)
# skills → nomic-embed (Stage 1)
arw(870, 284, 829, 424, color=GREEN)
# skills → Gemma 4 (Stage 2 rerank) ← NEW
arw(870, 284, 215, 424, color=(0, 150, 80))
# export → PDF
arw(1030, 284, 1416, 424, color=AMBER)

# ─────────────────────────────────────────────────────────────────────────────
# ARROWS — Services → Persistence
# ─────────────────────────────────────────────────────────────────────────────
# Gemma 4 → SQLite (via cases route)
arw(175, 576, 175, 584, color=TEAL_DIM)
# nomic-embed → ChromaDB
arw(829, 524, 382, 584, color=GREEN)
# IntakeAgent → SQLite
arw(1022, 524, 175, 584, color=TEAL_DIM)
# MedicalService → SQLite
arw(1215, 524, 175, 584, color=RED)
# PDFService → SQLite
arw(1416, 524, 175, 584, color=AMBER)
# Gemma 4 → model weights
arw(215, 576, 927, 584, color=(0, 100, 90))
# nomic-embed → nomic weights
arw(829, 524, 1117, 584, color=(40, 150, 80))
# Prompts → Gemma 4 (dashed-style, just arrow)
arw(1325, 524, 215, 524, color=PURPLE)

# ─────────────────────────────────────────────────────────────────────────────
# ARROWS — IntakeAgent → Gemma 4 (tool_calling loop)
# ─────────────────────────────────────────────────────────────────────────────
arw(1022, 474, 355, 490, color=TEAL, width=2)

# ─────────────────────────────────────────────────────────────────────────────
# SAVE
# ─────────────────────────────────────────────────────────────────────────────
img.save(OUT, "PNG")
print(f"Saved: {OUT}  ({W}x{H})")
