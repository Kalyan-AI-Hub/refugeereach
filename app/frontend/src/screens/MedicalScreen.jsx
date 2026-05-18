import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const URGENCY = {
  routine:  { bg: "bg-green-50",  border: "border-green-300",  badge: "bg-green-100 text-green-800",  icon: "✅", label: "ROUTINE" },
  elevated: { bg: "bg-amber-50",  border: "border-amber-300",  badge: "bg-amber-100 text-amber-800",  icon: "⚠️", label: "ELEVATED" },
  urgent:   { bg: "bg-red-50",    border: "border-red-300",    badge: "bg-red-100 text-red-800",      icon: "🚨", label: "URGENT" },
};

export default function MedicalScreen() {
  const navigate = useNavigate();
  const caseId = sessionStorage.getItem("caseId");
  const [mode, setMode] = useState(null);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const chunksRef = useRef([]);

  async function submitImage() {
    if (!file) return;
    setLoading(true);
    const form = new FormData();
    form.append("case_id", caseId);
    form.append("file", file);
    try {
      const res = await axios.post(`${API}/api/medical/handoff-from-image`, form);
      setHandoff(res.data.summary);
    } finally { setLoading(false); }
  }

  async function recordSymptoms() {
    setLoading(true);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/wav" });
      const form = new FormData();
      form.append("audio", blob, "symptoms.wav");
      const stt = await axios.post(`${API}/api/intake/transcribe`, form);
      const res = await axios.post(`${API}/api/medical/handoff-from-text`, {
        case_id: caseId, symptoms: stt.data.text,
      });
      setHandoff(res.data.summary);
      setLoading(false);
    };
    recorder.start();
    setTimeout(() => recorder.stop(), 8000);
  }

  const urgency = URGENCY[handoff?.urgency_level] || URGENCY.routine;

  return (
    <div className="flex flex-col items-center flex-1 gap-5 p-6 max-w-lg mx-auto w-full">
      <div className="text-center">
        <h2 className="text-2xl font-black text-blue-900">Medical Information</h2>
        <p className="text-slate-500 text-sm mt-1">Share any medical documents or describe your symptoms</p>
      </div>

      {!mode && !handoff && (
        <div className="grid grid-cols-2 gap-4 w-full">
          <button
            onClick={() => setMode("image")}
            className="flex flex-col items-center gap-3 bg-white border-2 border-slate-200 hover:border-blue-400 rounded-2xl p-6 shadow-sm transition-all hover:shadow-md active:scale-95"
          >
            <span className="text-5xl">📋</span>
            <span className="font-bold text-slate-700">Show document</span>
            <span className="text-xs text-slate-400 text-center">Photograph a medical note, prescription, or record</span>
          </button>
          <button
            onClick={() => { setMode("voice"); recordSymptoms(); }}
            className="flex flex-col items-center gap-3 bg-white border-2 border-slate-200 hover:border-blue-400 rounded-2xl p-6 shadow-sm transition-all hover:shadow-md active:scale-95"
          >
            <span className="text-5xl">🎤</span>
            <span className="font-bold text-slate-700">Describe symptoms</span>
            <span className="text-xs text-slate-400 text-center">Speak about any medical concerns or conditions</span>
          </button>
        </div>
      )}

      {mode === "image" && !handoff && (
        <>
          <button
            onClick={() => inputRef.current.click()}
            className="w-full h-48 border-2 border-dashed border-blue-300 rounded-2xl flex flex-col items-center justify-center gap-2 text-blue-600 hover:bg-blue-50 transition-all bg-white shadow-sm overflow-hidden"
          >
            {preview
              ? <img src={preview} alt="medical" className="w-full h-full object-cover" />
              : <><span className="text-5xl">📋</span><span className="font-semibold text-sm">Tap to capture</span></>
            }
          </button>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { const f = e.target.files[0]; setFile(f); setPreview(URL.createObjectURL(f)); }} />
          {file && (
            <button onClick={submitImage} disabled={loading}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-xl font-bold text-lg shadow disabled:opacity-60 transition-all">
              {loading ? "Analyzing with Gemma 4…" : "Analyze Document"}
            </button>
          )}
        </>
      )}

      {mode === "voice" && !handoff && loading && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-20 h-20 rounded-full bg-red-500 animate-pulse flex items-center justify-center text-white text-3xl">🎤</div>
          <p className="text-red-500 font-semibold animate-pulse">Listening for 8 seconds…</p>
          <p className="text-slate-400 text-sm">Describe your symptoms, conditions, and medications</p>
        </div>
      )}

      {handoff && (
        <div className={`${urgency.bg} border-2 ${urgency.border} rounded-2xl w-full overflow-hidden shadow`}>
          <div className="px-5 py-4 flex items-center justify-between border-b border-current border-opacity-20">
            <div className="flex items-center gap-2">
              <span className="text-xl">{urgency.icon}</span>
              <span className="font-bold text-slate-800">Medical Handoff Summary</span>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-black ${urgency.badge}`}>
              {urgency.label}
            </span>
          </div>
          <div className="p-5">
            <p className="text-slate-700 text-sm leading-relaxed">{handoff.summary_for_staff}</p>
            <div className="mt-4 bg-white bg-opacity-60 rounded-lg p-3">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Staff note</p>
              <p className="text-xs text-slate-600 mt-1">This summary supports clinical intake — it does not replace a medical assessment.</p>
            </div>
          </div>
          <div className="px-5 pb-5">
            <button onClick={() => navigate("/skills")}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 rounded-xl font-bold text-lg shadow transition-all active:scale-95">
              Continue to Skills →
            </button>
          </div>
        </div>
      )}

      {!handoff && mode && (
        <button onClick={() => { setMode(null); setPreview(null); setFile(null); setLoading(false); }}
          className="text-sm text-slate-400 hover:text-slate-600 underline">
          ← Go back
        </button>
      )}
    </div>
  );
}
