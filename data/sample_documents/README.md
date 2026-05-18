# Sample Documents

Synthetic demo documents for RefugeeReach evaluation and demo video.

All documents are **entirely fictional**. No real personal data is used.
Label clearly in any demo video: "SYNTHETIC — DEMO DOCUMENT — NOT REAL"

## Generate

```bash
cd refugeereach
python scripts/generate_synthetic_docs.py
```

Requires Pillow (`pip install Pillow`). Outputs:

| File | Type | Used in demo step |
|------|------|-------------------|
| `synthetic_syrian_passport.jpg` | Arabic passport | Step 2 — Document capture |
| `synthetic_vaccination_record.jpg` | Child vaccination record | Step 4 — Medical handoff |
| `synthetic_eviction_notice.jpg` | Legal eviction notice | Optional — legal document demo |
| `synthetic_medical_note.jpg` | Medical consultation note | Step 4 — Medical image path |

## Voice samples

Voice samples for language detection testing are not auto-generated.
Record or source short phrases (5–10 words) in each language:

| File | Language | Suggested phrase |
|------|----------|-----------------|
| `arabic_voice_sample.wav` | Arabic | "مرحبا، أنا بحاجة إلى مساعدة" (Hello, I need help) |
| `ukrainian_voice_sample.wav` | Ukrainian | "Привіт, мені потрібна допомога" |
| `dari_voice_sample.wav` | Dari | "سلام، من کمک نیاز دارم" |
| `french_voice_sample.wav` | French | "Bonjour, j'ai besoin d'aide" |
| `english_voice_sample.wav` | English | "Hello, I need assistance please" |

Use a text-to-speech tool or record yourself. Keep files under 500 KB (WAV, 16kHz mono).
