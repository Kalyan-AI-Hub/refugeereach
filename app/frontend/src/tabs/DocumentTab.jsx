import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const PROGRES_MAP = {
  surname: "proGres: FamilyName",
  given_names: "proGres: GivenName",
  date_of_birth: "proGres: DateOfBirth",
  nationality: "proGres: CountryOfOrigin",
  document_number: "proGres: DocumentNumber",
  sex: "proGres: Sex",
  place_of_birth: "proGres: PlaceOfBirth",
};

function ConfidenceBar({ fieldKey, fieldData, onEdit }) {
  const [showSource, setShowSource] = useState(false);
  const { value, confidence, source_text } = fieldData;
  const pct = confidence != null ? Math.round(confidence * 100) : null;
  const blocked = confidence != null && confidence < 0.6;
  const review = confidence != null && confidence >= 0.6 && confidence < 0.85;

  const barColor =
    confidence == null ? "bg-gray-600"
    : confidence >= 0.85 ? "bg-green-500"
    : confidence >= 0.6 ? "bg-amber-500"
    : "bg-red-500";

  const pctColor =
    confidence == null ? "text-gray-500"
    : confidence >= 0.85 ? "text-green-400"
    : confidence >= 0.6 ? "text-amber-400"
    : "text-red-400";

  const label = fieldKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className={`bg-gray-800 rounded-xl p-4 border ${blocked ? "border-red-700" : review ? "border-amber-800" : "border-gray-700"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
        {pct != null && <span className={`text-xs font-bold ${pctColor}`}>{pct}%</span>}
      </div>

      {pct != null && (
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-3">
          <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
      )}

      {blocked ? (
        <div className="flex flex-col gap-2">
          <span className="text-red-400 text-xs font-semibold">⛔ Manual entry required</span>
          <input
            className="w-full bg-gray-900 border border-red-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-red-400 placeholder-gray-600"
            placeholder="Type value manually…"
            value={value || ""}
            onChange={e => onEdit(fieldKey, e.target.value)}
          />
        </div>
      ) : (
        <input
          className="w-full bg-transparent text-sm font-semibold text-gray-100 border-b border-gray-700 focus:border-teal-500 focus:outline-none pb-0.5 transition-all placeholder-gray-600"
          value={value || ""}
          onChange={e => onEdit(fieldKey, e.target.value)}
          placeholder="—"
        />
      )}

      {review && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-xs text-amber-400">Staff review recommended</span>
        </div>
      )}
      {confidence == null && value && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          <span className="text-xs text-gray-500">Manually entered</span>
        </div>
      )}

      {source_text && (
        <div className="mt-2">
          <button
            onClick={() => setShowSource(s => !s)}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {showSource ? "▲ Hide source" : "▼ Source text"}
          </button>
          {showSource && (
            <div className="mt-1.5 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 font-mono">"{source_text}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export default function DocumentTab({ caseId, lang, onStepDone }) {
  const language = lang || "en";
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [fields, setFields] = useState({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const inputRef = useRef(null);
  const translationCardRef = useRef(null);
  const rightPanelRef = useRef(null);
  const audioRef = useRef(null);

  // Scroll the right panel to show the translation card whenever translation starts or arrives
  useEffect(() => {
    if ((translating || translation) && rightPanelRef.current) {
      rightPanelRef.current.scrollTop = 0;
    }
  }, [translating, translation]);

  function onCapture(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setExtracted(null);
    setFields({});
    setSaved(false);
    setError(null);
    // Clear the input so the same file can be re-selected
    e.target.value = "";
  }

  function stopSpeaking() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
  }

  async function speakText(text) {
    if (!text) return;
    if (speaking) { stopSpeaking(); return; }
    setSpeaking(true);

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
    } catch {}

    try {
      const form = new FormData();
      form.append("text", text.slice(0, 500));
      form.append("language", language);
      const res = await axios.post(`${API}/api/intake/speak`, form, { responseType: "blob", timeout: 30000 });
      if (!res.data || res.data.size < 1000) { setSpeaking(false); return; }
      const url = URL.createObjectURL(res.data);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; setSpeaking(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; setSpeaking(false); };
      await audio.play();
    } catch {
      audioRef.current = null;
      setSpeaking(false);
    }
  }

  async function translate() {
    if (!file) return;
    setTranslating(true);
    setTranslation(null);
    const form = new FormData();
    form.append("file", file);
    form.append("target_language", language);
    try {
      const res = await axios.post(`${API}/api/documents/translate`, form, { timeout: 90000 });
      setTranslation(res.data.explanation);
    } catch {
      setTranslation("Translation failed — please try again.");
    } finally {
      setTranslating(false);
    }
  }

  async function extract() {
    if (!file || !caseId) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("case_id", caseId);
    form.append("file", file);
    try {
      const res = await axios.post(`${API}/api/documents/extract`, form, { timeout: 60000 });
      const data = res.data.extracted;
      setExtracted(data);
      setFields(data.fields || {});
      sessionStorage.setItem("documentId", res.data.document_id);
    } catch {
      setError("Extraction failed — ensure the backend is running and Ollama has gemma4 loaded.");
    } finally {
      setLoading(false);
    }
  }

  function editField(key, val) {
    setFields(prev => {
      const field = prev[key];
      const wasBlocked = field?.confidence != null && field.confidence < 0.6;
      return {
        ...prev,
        [key]: {
          ...field,
          value: val,
          // Once user fills a blocked field, drop the confidence marker so it
          // no longer shows as red — the value is now manually verified.
          confidence: wasBlocked && val.trim() ? null : field?.confidence,
        },
      };
    });
  }

  function save() {
    setSaved(true);
    onStepDone("documents");
  }

  function reset() {
    stopSpeaking();
    setFile(null);
    setPreview(null);
    setExtracted(null);
    setFields({});
    setSaved(false);
    setError(null);
    setTranslation(null);
  }

  const overallConf = extracted?.overall_confidence;
  const blockedCount = Object.values(fields).filter(f => f.confidence != null && f.confidence < 0.6).length;
  const reviewCount = Object.values(fields).filter(f => f.confidence != null && f.confidence >= 0.6 && f.confidence < 0.85).length;
  const canSave = extracted && (blockedCount === 0 || Object.values(fields).every(f => f.value));
  const progresFields = Object.entries(PROGRES_MAP).filter(([k]) => fields[k]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-5/12 border-r border-gray-800 flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-gray-800">
          <h2 className="text-base font-bold text-gray-100">Document Vision</h2>
          <p className="text-gray-500 text-xs mt-0.5">Upload or photograph a passport, ID card, or official document</p>
        </div>

        <div className="p-5 flex flex-col gap-4 flex-1">
          {/* Drop zone / image preview */}
          {preview ? (
            <div className="w-full border border-gray-700 rounded-2xl overflow-hidden">
              <img
                src={preview}
                alt="document preview"
                className="w-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => inputRef.current.click()}
                title="Click to change document"
              />
            </div>
          ) : (
            <div
              onClick={() => inputRef.current.click()}
              className="w-full h-48 border-2 border-dashed border-gray-700 hover:border-teal-600 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer text-gray-500 hover:text-teal-400"
            >
              <span className="text-4xl opacity-40">📄</span>
              <span className="text-sm font-medium">Click to select a file</span>
              <span className="text-xs text-gray-600">JPG · PNG · or use camera on mobile</span>
            </div>
          )}
          {/* No capture attribute — regular file picker on desktop, camera option on mobile */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onCapture}
          />

          {/* Filename + change link */}
          {file && (
            <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-400 text-sm shrink-0">📎</span>
                <span className="text-sm text-gray-300 truncate">{file.name}</span>
              </div>
              <button
                onClick={() => inputRef.current.click()}
                className="text-xs text-teal-500 hover:text-teal-300 shrink-0 ml-2 transition-colors"
              >
                Change
              </button>
            </div>
          )}

          {/* Action buttons */}
          {file && !extracted && (
            <div className="flex flex-col gap-2">
              <button
                onClick={extract}
                disabled={loading || translating}
                className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {loading ? <><Spinner /> Reading with Gemma 4…</> : "Extract Fields"}
              </button>
              <button
                onClick={translate}
                disabled={loading || translating}
                className="w-full bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {translating ? <><Spinner /> Translating…</> : "Translate & Explain"}
              </button>
            </div>
          )}
          {file && extracted && !saved && (
            <button
              onClick={translate}
              disabled={translating}
              className="w-full bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
            >
              {translating ? <><Spinner /> Translating…</> : "Translate & Explain"}
            </button>
          )}

          {translating && (
            <div className="bg-purple-900 bg-opacity-30 border border-purple-700 rounded-xl p-3 flex items-center gap-2">
              <Spinner />
              <p className="text-xs text-purple-300">Gemma 4 is reading and translating — the explanation will appear on the right, and be read aloud when ready.</p>
            </div>
          )}

          {translation && !translating && (
            <div className="bg-purple-900 bg-opacity-20 border border-purple-800 rounded-xl p-3 flex items-center gap-2">
              <span className="text-purple-400 text-sm shrink-0">🌐</span>
              <p className="text-xs text-purple-300">Explanation ready — see the right panel. Tap <strong>🔊 Speak</strong> to hear it aloud.</p>
            </div>
          )}

          {error && (
            <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-xl p-3">
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Extraction summary card */}
          {extracted && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-100 capitalize">
                    {extracted.document_type?.replace(/_/g, " ") || "Document"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{Object.keys(fields).length} fields extracted</p>
                </div>
                {overallConf != null && (
                  <div className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                    overallConf >= 0.85 ? "bg-green-900 bg-opacity-40 text-green-400 border-green-700"
                    : overallConf >= 0.6 ? "bg-amber-900 bg-opacity-40 text-amber-400 border-amber-700"
                    : "bg-red-900 bg-opacity-40 text-red-400 border-red-700"
                  }`}>
                    {Math.round(overallConf * 100)}% overall
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Alert banners */}
          {blockedCount > 0 && (
            <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-xl p-3 flex items-start gap-2">
              <span className="text-red-400 shrink-0">⛔</span>
              <p className="text-xs text-red-300">
                {blockedCount} field{blockedCount > 1 ? "s" : ""} blocked — confidence too low. Manual entry required before saving.
              </p>
            </div>
          )}

          {reviewCount > 0 && blockedCount === 0 && (
            <div className="bg-amber-900 bg-opacity-30 border border-amber-700 rounded-xl p-3 flex items-start gap-2">
              <span className="text-amber-400 shrink-0">⚠</span>
              <p className="text-xs text-amber-300">
                {reviewCount} field{reviewCount > 1 ? "s" : ""} flagged for staff review — please verify before saving.
              </p>
            </div>
          )}

          {saved && (
            <div className="bg-green-900 bg-opacity-30 border border-green-700 rounded-xl p-3 flex items-center gap-2">
              <span className="text-green-400">✓</span>
              <p className="text-xs text-green-300 font-semibold">Document saved to case</p>
            </div>
          )}

          {/* Safety disclaimer */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 mt-auto">
            <p className="text-xs text-gray-500 leading-relaxed">
              AI extraction requires staff verification before official use. Fields with confidence &lt; 60% must be entered manually.
            </p>
          </div>

          {/* Action buttons */}
          {extracted && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={save}
                disabled={!canSave || saved}
                className="flex-1 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm transition-all"
              >
                {saved ? "✓ Saved" : "Confirm & save"}
              </button>
              <button
                onClick={reset}
                className="px-4 py-2.5 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded-xl text-sm transition-all"
              >
                Add another
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right panel — plain block container so children stack at natural height (no flex shrink) */}
      <div ref={rightPanelRef} className="flex-1 overflow-y-auto">

        {/* Translation card — always rendered at the top when active */}
        {(translation || translating) && (
          <div ref={translationCardRef} className="mx-5 mt-5 mb-4 bg-purple-950 bg-opacity-40 border border-purple-700 rounded-2xl overflow-hidden">
            <div className="bg-purple-900 bg-opacity-50 border-b border-purple-800 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-purple-300 text-sm">🌐</span>
                <div>
                  <p className="text-sm font-bold text-purple-200">Document Explanation</p>
                  <p className="text-xs text-purple-400">Gemma 4 — explained in your language</p>
                </div>
              </div>
              {translation && !translating && (
                <button
                  onClick={() => speakText(translation)}
                  className="flex items-center gap-1.5 bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                >
                  {speaking ? "⏹ Stop" : "🔊 Speak"}
                </button>
              )}
            </div>
            <div className="p-4">
              {translating
                ? <div className="flex items-center gap-2 text-purple-400 text-sm"><Spinner /> Gemma 4 is reading and translating…</div>
                : <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{translation}</p>
              }
            </div>
          </div>
        )}

        {/* Empty state */}
        {!extracted && !translation && !translating && (
          <div className="flex flex-col items-center justify-center text-gray-600 gap-3 min-h-64 py-16">
            <span className="text-5xl opacity-25">🔍</span>
            <p className="text-sm">Upload a document to extract fields or translate</p>
            {!caseId && (
              <p className="text-xs text-gray-700">Complete the language step first to create a case</p>
            )}
          </div>
        )}

        {/* Extracted fields */}
        {extracted && (
          <>
            {/* Confidence legend */}
            <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm bg-green-500" />
                <span className="text-xs text-gray-500">≥ 85% auto-accepted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm bg-amber-500" />
                <span className="text-xs text-gray-500">60–84% staff review</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm bg-red-500" />
                <span className="text-xs text-gray-500">&lt; 60% manual entry</span>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Extracted Fields</h3>
              {Object.entries(fields).map(([k, v]) => (
                <ConfidenceBar key={k} fieldKey={k} fieldData={v} onEdit={editField} />
              ))}
            </div>

            {progresFields.length > 0 && (
              <div className="mx-5 mb-5 bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
                <div className="bg-blue-950 border-b border-blue-900 px-4 py-3 flex items-center gap-2">
                  <span className="text-blue-400 text-sm">🏛</span>
                  <div>
                    <p className="text-sm font-bold text-blue-200">UNHCR proGres v4 Preview</p>
                    <p className="text-xs text-blue-500">Auto-populated from document extraction</p>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-2 gap-4">
                  {progresFields.map(([k, progresLabel]) => (
                    <div key={k} className="flex flex-col gap-1">
                      <span className="text-xs text-blue-400 font-mono">{progresLabel}</span>
                      <span className="text-sm text-gray-200 font-semibold">{fields[k]?.value || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
