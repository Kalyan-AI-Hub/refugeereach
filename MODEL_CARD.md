# RefugeeReach — Model Card

## Base model

`gemma4:e4b` served via Ollama (local inference path — primary).  
`google/gemma-4-4b-it` loaded in 4-bit via bitsandbytes (cloud inference path — optional GPU deployment).

## Inference configuration

| Parameter | Value | Reason |
|-----------|-------|--------|
| Temperature | 0.1 | Extraction tasks require consistency, not creativity |
| Max tokens | 1024 (extraction), 512 (intake Q&A), 768 (medical handoff) | Bounded per task type |
| Quantization | 4-bit (local Ollama) / bitsandbytes NF4 (Kaggle/HuggingFace) | Fits 8 GB RAM |
| Stream | false | Structured JSON output requires complete response |

## Languages tested

| Language | Code | Whisper detection | Gemma generation |
|----------|------|------------------|-----------------|
| Arabic (Modern Standard) | ar | ✓ | ✓ |
| Ukrainian | uk | ✓ | ✓ |
| Dari / Persian | fa | ✓ | ✓ |
| French | fr | ✓ | ✓ |
| English | en | ✓ | ✓ |

## Tasks and models

| Task | Model | Notes |
|------|-------|-------|
| Speech-to-text / language detection | Whisper base (local) | Runs fully offline on CPU |
| Document field extraction | Gemma 4 E4B (vision) | Image passed as base64 vision input |
| Intake interview agent | Gemma 4 E4B (function calling) | Tool-calling loop; 5 tools defined |
| Medical handoff generation | Gemma 4 E4B (text) | Structured JSON output enforced by prompt |
| Skills / opportunity matching | ChromaDB + nomic-embed-text | Vector similarity on opportunity catalog |
| PDF export | fpdf2 (pure Python) | No native library dependency |
| Voice output (TTS) | pyttsx3 | Offline SAPI voices; non-literate user support |

## Known failure modes

| Failure mode | Likelihood | Mitigation |
|---|---|---|
| Handwritten documents | Medium | Accuracy drops ~20% vs printed. Confidence scoring flags affected fields. |
| Low-contrast or glare-affected images | Medium | Image preprocessing (contrast +30%, sharpness +20%) applied before inference. |
| Dialectal Arabic (e.g. Levantine, Egyptian) | Low–Medium | Whisper may misclassify as MSA. Manual language override available on WelcomeScreen. |
| Very long documents (multi-page) | Low | Only first visible region is processed. Staff prompted to recapture if key fields missing. |
| Model hallucination on blank/unclear fields | Low | Prompt explicitly instructs: "If a field is not visible, set value to null." Confidence threshold < 0.60 blocks auto-population. |

## Safety boundaries

1. **Medical module:** Generates intake summaries only. System prompt explicitly prohibits diagnosis and treatment recommendation. Urgency classification uses a fixed 3-level enum (routine / elevated / urgent) — no free-form clinical assessment.
2. **Legal module:** Explains document content and rights orientation only. Does not provide legal advice or jurisdiction-specific guidance.
3. **Confidence thresholds:** Fields below 60% confidence are blocked from auto-population and require manual staff entry.
4. **Staff confirmation gate:** No case data is exported without explicit staff confirmation action.
5. **Source grounding:** Every extracted field includes `source_text` — the literal characters read from the document — so staff can verify extraction accuracy without re-examining the original.
6. **Data locality:** All case data is stored in local SQLite and ChromaDB only. No data is transmitted to external services.
7. **Session isolation:** "Start New Case" clears sessionStorage completely. No data persists between cases in the browser.

## Prompts

All system prompts are stored in `models/prompts/` and are versioned with the repository:

- `document_extraction.md` — document vision extraction with confidence and source_text per field
- `medical_handoff.md` — medical handoff note generation with urgency classification
- `medical_handoff_vision.md` — vision path variant for photographed medical documents
- `intake_agent_system.md` — intake interview agent system prompt with tool definitions

## Scope statement

RefugeeReach is designed as a **front-line augmentation tool for humanitarian intake staff**. It is not a replacement for caseworkers, medical professionals, or legal advisors. Every output is explicitly framed as a support summary requiring human review and confirmation before use.
