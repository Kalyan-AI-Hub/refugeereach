import React, { useState, useRef } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

const URGENCY = {
  urgent:   { border: "border-red-700",   bg: "bg-red-900 bg-opacity-20",   badge: "bg-red-900 bg-opacity-50 text-red-400 border border-red-700",    label: "URGENT" },
  elevated: { border: "border-amber-700", bg: "bg-amber-900 bg-opacity-20", badge: "bg-amber-900 bg-opacity-50 text-amber-400 border border-amber-700", label: "ELEVATED" },
  routine:  { border: "border-green-800", bg: "bg-green-900 bg-opacity-10", badge: "bg-green-900 bg-opacity-50 text-green-400 border border-green-700", label: "ROUTINE" },
};

export default function MedicalTab({ caseId, onStepDone }) {
  const [mode, setMode] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [handoff, setHandoff] = useState(null);
  const [error, setError] = useState(null);
  const [textInput, setTextInput] = useState("");

  const inputRef = useRef(null);
  const chunksRef = useRef([]);
  const cancelledRef = useRef(false);
  const recorderRef = useRef(null);
  const stopTimerRef = useRef(null);

  async function submitImage() {
    if (!file) return;
    cancelledRef.current = false;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("case_id", caseId);
    form.append("file", file);
    try {
      const res = await axios.post(`${API}/api/medical/handoff-from-image`, form, { timeout: 45000 });
      if (!cancelledRef.current) {
        setHandoff(res.data.summary);
        onStepDone("medical");
      }
    } catch {
      if (!cancelledRef.current) setError("Analysis failed — check backend connection and ensure Ollama has gemma4 loaded.");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }

  async function startVoice() {
    cancelledRef.current = false;
    setError(null);
    setLoading(true);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (!cancelledRef.current) {
        setError("Microphone access denied — please use the document upload option instead.");
        setLoading(false);
        setMode(null);
      }
      return;
    }

    if (cancelledRef.current) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = e => chunksRef.current.push(e.data);

    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      recorderRef.current = null;
      setRecording(false);

      if (cancelledRef.current) { setLoading(false); return; }

      const blob = new Blob(chunksRef.current, { type: "audio/wav" });
      const form = new FormData();
      form.append("audio", blob, "symptoms.wav");

      try {
        const stt = await axios.post(`${API}/api/intake/transcribe`, form, { timeout: 25000 });
        if (cancelledRef.current) return;
        const res = await axios.post(`${API}/api/medical/handoff-from-text`, {
          case_id: caseId,
          symptoms: stt.data.text,
        }, { timeout: 30000 });
        if (!cancelledRef.current) {
          setHandoff(res.data.summary);
          onStepDone("medical");
        }
      } catch {
        if (!cancelledRef.current) setError("Voice processing failed — check backend connection.");
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    };

    recorder.start();
    setRecording(true);
    stopTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, 8000);
  }

  async function submitText() {
    if (!textInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API}/api/medical/handoff-from-text`, {
        case_id: caseId,
        symptoms: textInput.trim(),
      }, { timeout: 45000 });
      setHandoff(res.data.summary);
      onStepDone("medical");
    } catch {
      setError("Analysis failed — check backend connection.");
    } finally {
      setLoading(false);
    }
  }

  function cancelAll() {
    cancelledRef.current = true;
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;
    setMode(null);
    setPreview(null);
    setFile(null);
    setLoading(false);
    setRecording(false);
    setError(null);
    setTextInput("");
  }

  const urgency = URGENCY[handoff?.urgency_level] || URGENCY.routine;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-5/12 border-r border-gray-800 flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-gray-800">
          <h2 className="text-base font-bold text-gray-100">Medical Intake</h2>
          <p className="text-gray-500 text-xs mt-0.5">Upload a medical document or describe symptoms by voice</p>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Mode selector */}
          {!mode && !handoff && (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setMode("image")}
                className="flex items-center gap-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-teal-600 rounded-2xl p-5 transition-all text-left"
              >
                <span className="text-3xl">📋</span>
                <div>
                  <p className="font-semibold text-gray-100">Upload medical document</p>
                  <p className="text-xs text-gray-500 mt-0.5">Prescription · Consultation note · Vaccination record</p>
                </div>
              </button>
              <button
                onClick={() => { setMode("voice"); startVoice(); }}
                className="flex items-center gap-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-teal-600 rounded-2xl p-5 transition-all text-left"
              >
                <span className="text-3xl">🎤</span>
                <div>
                  <p className="font-semibold text-gray-100">Describe symptoms by voice</p>
                  <p className="text-xs text-gray-500 mt-0.5">Speak about conditions, medications, and allergies</p>
                </div>
              </button>
              <button
                onClick={() => setMode("text")}
                className="flex items-center gap-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-teal-600 rounded-2xl p-5 transition-all text-left"
              >
                <span className="text-3xl">⌨️</span>
                <div>
                  <p className="font-semibold text-gray-100">Type symptoms</p>
                  <p className="text-xs text-gray-500 mt-0.5">Describe conditions, medications, and allergies by text</p>
                </div>
              </button>
            </div>
          )}

          {/* Image upload mode */}
          {mode === "image" && !handoff && (
            <>
              <button
                onClick={() => inputRef.current.click()}
                className="w-full h-44 border-2 border-dashed border-gray-700 rounded-2xl flex flex-col items-center justify-center gap-2 overflow-hidden hover:border-teal-600 transition-all"
              >
                {preview
                  ? <img src={preview} alt="medical document" className="w-full h-full object-cover" />
                  : (
                    <>
                      <span className="text-4xl opacity-40">📋</span>
                      <span className="text-sm text-gray-400">Click to select a file</span>
                      <span className="text-xs text-gray-600">JPG · PNG · PDF</span>
                    </>
                  )
                }
              </button>
              {/* No capture attribute — allow file picker on desktop and camera on mobile */}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files[0];
                  if (f) { setFile(f); setPreview(URL.createObjectURL(f)); }
                }}
              />
              {file && !loading && (
                <button
                  onClick={submitImage}
                  className="w-full bg-teal-600 hover:bg-teal-500 text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                >
                  Analyze Document
                </button>
              )}
              {loading && (
                <div className="flex items-center justify-center gap-2 py-3 text-gray-400 text-sm">
                  <Spinner /> Analyzing with Gemma 4…
                </div>
              )}
            </>
          )}

          {/* Voice recording mode */}
          {mode === "voice" && recording && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-20 h-20 rounded-full bg-red-600 animate-pulse flex items-center justify-center text-white text-3xl shadow-lg shadow-red-900">
                🎤
              </div>
              <div>
                <p className="text-red-400 font-semibold animate-pulse text-center">Recording — up to 8 seconds</p>
                <p className="text-gray-500 text-sm text-center mt-1">Describe conditions, medications, allergies</p>
              </div>
              <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-xl px-4 py-2">
                <p className="text-xs text-red-300">Recording in progress</p>
              </div>
            </div>
          )}

          {/* Text input mode */}
          {mode === "text" && !handoff && (
            <>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 focus:border-teal-500 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none resize-none transition-all"
                rows={6}
                placeholder="Describe symptoms, existing conditions, medications, and allergies…"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                disabled={loading}
              />
              {!loading && (
                <button
                  onClick={submitText}
                  disabled={!textInput.trim()}
                  className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                >
                  Analyze with Gemma 4
                </button>
              )}
              {loading && (
                <div className="flex items-center justify-center gap-2 py-3 text-gray-400 text-sm">
                  <Spinner /> Analyzing with Gemma 4…
                </div>
              )}
            </>
          )}

          {/* Processing spinner (after recording stops) */}
          {mode === "voice" && !recording && loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner />
              <p className="text-gray-400 text-sm">Processing with Gemma 4…</p>
              <p className="text-gray-600 text-xs text-center">Transcribing and generating medical summary</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-xl p-3">
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Go back / Stop — shown when in a mode but no handoff yet */}
          {mode && !handoff && (
            <button
              onClick={cancelAll}
              className="text-xs text-gray-500 hover:text-gray-300 underline text-center transition-colors mt-2"
            >
              {recording ? "⏹ Stop recording" : "← Go back"}
            </button>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {!handoff ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
            <span className="text-5xl opacity-25">🏥</span>
            <p className="text-sm">Medical handoff summary will appear here</p>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            <div className={`border-2 rounded-2xl overflow-hidden ${urgency.border} ${urgency.bg}`}>
              <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
                <span className="font-bold text-gray-100">Medical Handoff Summary</span>
                <span className={`px-3 py-1 rounded-full text-xs font-black ${urgency.badge}`}>
                  {urgency.label}
                </span>
              </div>

              <div className="p-5 flex flex-col gap-3">
                <p className="text-gray-200 text-sm leading-relaxed">{handoff.summary_for_staff}</p>

                {handoff.chief_complaint && (
                  <div className="bg-gray-900 bg-opacity-60 border border-gray-700 rounded-xl p-4">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Chief complaint</p>
                    <p className="text-gray-300 text-sm">{handoff.chief_complaint}</p>
                  </div>
                )}

                {handoff.current_medications?.length > 0 && (
                  <div className="bg-gray-900 bg-opacity-60 border border-gray-700 rounded-xl p-4">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Medications</p>
                    <ul className="text-sm text-gray-300 space-y-1">
                      {handoff.current_medications.map((m, i) => <li key={i}>• {m}</li>)}
                    </ul>
                  </div>
                )}

                {handoff.allergies?.length > 0 && (
                  <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-xl p-4">
                    <p className="text-xs text-red-400 font-semibold uppercase tracking-wide mb-1.5">⚠ Allergies</p>
                    <ul className="text-sm text-red-300 space-y-1">
                      {handoff.allergies.map((a, i) => <li key={i}>• {a}</li>)}
                    </ul>
                  </div>
                )}

                <div className="bg-gray-900 bg-opacity-40 border border-gray-700 rounded-xl p-3">
                  <p className="text-xs text-gray-500">
                    This summary supports clinical intake — it does not replace a medical assessment by a qualified clinician.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => { setHandoff(null); setMode(null); setFile(null); setPreview(null); setError(null); }}
              className="text-xs text-gray-500 hover:text-gray-300 underline text-center transition-colors"
            >
              Add another medical record
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
