import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function confidenceStyle(score) {
  if (score == null) return { ring: "border-slate-200 bg-slate-50", label: "bg-slate-100 text-slate-500", dot: "bg-slate-300" };
  if (score >= 0.85) return { ring: "border-green-200 bg-green-50", label: "bg-green-100 text-green-700", dot: "bg-green-500" };
  if (score >= 0.60) return { ring: "border-amber-200 bg-amber-50", label: "bg-amber-100 text-amber-700", dot: "bg-amber-400" };
  return { ring: "border-red-200 bg-red-50", label: "bg-red-100 text-red-700", dot: "bg-red-500" };
}

function confidenceLabel(score) {
  if (score == null) return "—";
  if (score >= 0.85) return `${Math.round(score * 100)}% · High`;
  if (score >= 0.60) return `${Math.round(score * 100)}% · Review`;
  return `${Math.round(score * 100)}% · Manual entry required`;
}

function FieldCard({ fieldKey, fieldData, onChange }) {
  const [showSource, setShowSource] = useState(false);
  const { value, confidence, source_text } = fieldData;
  const blocked = confidence != null && confidence < 0.60;
  const style = confidenceStyle(confidence);

  return (
    <div className={`border-2 rounded-xl p-3 ${style.ring} transition-all`}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {fieldKey.replace(/_/g, " ")}
        </label>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${style.label}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {confidenceLabel(confidence)}
          </div>
        </div>
      </div>

      {blocked ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-red-600 font-medium">Field blocked — confidence too low. Please enter manually:</p>
          <input
            className="w-full bg-white border border-red-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-red-500"
            placeholder="Enter value manually…"
            value={value || ""}
            onChange={e => onChange(fieldKey, e.target.value)}
          />
        </div>
      ) : (
        <input
          className="w-full bg-transparent font-semibold text-sm focus:outline-none border-b border-transparent focus:border-slate-300 pb-0.5 transition-all"
          value={value || ""}
          onChange={e => onChange(fieldKey, e.target.value)}
          placeholder="—"
        />
      )}

      {source_text && (
        <button
          onClick={() => setShowSource(s => !s)}
          className="mt-1.5 text-xs text-slate-400 hover:text-slate-600 underline"
        >
          {showSource ? "Hide source ▲" : "Show source ▼"}
        </button>
      )}
      {showSource && source_text && (
        <div className="mt-1 bg-white bg-opacity-70 border border-slate-200 rounded-lg px-2 py-1.5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-0.5">From document</p>
          <p className="text-xs text-slate-600 font-mono">"{source_text}"</p>
        </div>
      )}
    </div>
  );
}

export default function DocumentScreen() {
  const navigate = useNavigate();
  const caseId = sessionStorage.getItem("caseId");
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [fields, setFields] = useState({});
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  function onCapture(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setExtracted(null);
    setFields({});
  }

  async function extract() {
    if (!file) return;
    setLoading(true);
    const form = new FormData();
    form.append("case_id", caseId);
    form.append("file", file);
    try {
      const res = await axios.post(`${API}/api/documents/extract`, form);
      const data = res.data.extracted;
      setExtracted(data);
      setFields(data.fields || {});
      sessionStorage.setItem("documentId", res.data.document_id);
    } finally {
      setLoading(false);
    }
  }

  function updateField(key, value) {
    setFields(prev => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
  }

  const overallConfidence = extracted?.overall_confidence;
  const blockedCount = Object.values(fields).filter(f => f.confidence != null && f.confidence < 0.60).length;
  const canContinue = extracted && blockedCount === 0 || Object.values(fields).every(f => f.value);

  return (
    <div className="flex flex-col items-center flex-1 gap-5 p-6 max-w-lg mx-auto w-full">
      <div className="text-center">
        <h2 className="text-2xl font-black text-blue-900">Document Capture</h2>
        <p className="text-slate-500 text-sm mt-1">Show your passport, ID card, or any official document</p>
      </div>

      <button
        onClick={() => inputRef.current.click()}
        className="w-full h-52 border-2 border-dashed border-blue-300 rounded-2xl flex flex-col items-center justify-center gap-2 text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-all bg-white shadow-sm overflow-hidden"
      >
        {preview
          ? <img src={preview} alt="document" className="w-full h-full object-cover" />
          : <><span className="text-5xl">📄</span><span className="font-semibold text-sm">Tap to capture document</span><span className="text-xs text-slate-400">Camera or file upload</span></>
        }
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onCapture} />

      {file && !extracted && (
        <button
          onClick={extract}
          disabled={loading}
          className="w-full bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-xl font-bold text-lg shadow transition-all active:scale-95 disabled:opacity-60"
        >
          {loading
            ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Reading with Gemma 4…</span>
            : "Read Document"
          }
        </button>
      )}

      {extracted && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow w-full overflow-hidden">
          <div className="bg-blue-900 text-white px-5 py-3 flex items-center justify-between">
            <div>
              <span className="font-bold capitalize">{extracted.document_type?.replace(/_/g, " ")}</span>
              <span className="text-blue-400 text-xs ml-2">· {Object.keys(fields).length} fields extracted</span>
            </div>
            {overallConfidence != null && (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${overallConfidence >= 0.85 ? "bg-green-400" : overallConfidence >= 0.6 ? "bg-amber-400" : "bg-red-400"}`} />
                <span className="text-xs text-blue-200">{Math.round(overallConfidence * 100)}% overall</span>
              </div>
            )}
          </div>

          {blockedCount > 0 && (
            <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <span className="text-red-500 text-lg shrink-0">⚠️</span>
              <p className="text-xs text-red-700 font-medium">
                {blockedCount} field{blockedCount > 1 ? "s" : ""} could not be read reliably. Please enter {blockedCount > 1 ? "them" : "it"} manually before continuing.
              </p>
            </div>
          )}

          <div className="p-4 flex flex-col gap-3">
            {Object.entries(fields).map(([k, v]) => (
              <FieldCard key={k} fieldKey={k} fieldData={v} onChange={updateField} />
            ))}
          </div>

          {extracted.summary && (
            <div className="mx-4 mb-4 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Summary</p>
              <p className="text-slate-700 text-sm leading-relaxed">{extracted.summary}</p>
            </div>
          )}

          <div className="px-4 pb-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>🟢 ≥85% auto-accepted</span>
              <span>🟡 60–84% review recommended</span>
              <span>🔴 &lt;60% manual entry</span>
            </div>
            <button
              onClick={() => navigate("/intake")}
              disabled={!canContinue}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 rounded-xl font-bold text-lg shadow transition-all active:scale-95 disabled:opacity-40"
            >
              {canContinue ? "Continue to Intake →" : "Complete required fields above"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
