import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const LANGUAGES = [
  { code: "ar", label: "العربية", flag: "🇸🇾" },
  { code: "uk", label: "Українська", flag: "🇺🇦" },
  { code: "fa", label: "دری", flag: "🇦🇫" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

export default function WelcomeScreen() {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [detected, setDetected] = useState(null);
  const [error, setError] = useState(null);
  const [consent, setConsent] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  async function startRecording() {
    if (!consent) { setError("Please accept the privacy notice first."); return; }
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/wav" });
      const form = new FormData();
      form.append("audio", blob, "sample.wav");
      try {
        const res = await axios.post(`${API}/api/intake/transcribe`, form);
        setDetected(res.data);
      } catch {
        setError("Could not detect language. Please try again.");
      }
    };
    mediaRef.current = recorder;
    recorder.start();
    setRecording(true);
    setTimeout(() => { recorder.stop(); setRecording(false); }, 4000);
  }

  function selectLanguage(code) {
    setDetected({ language: code, text: "" });
  }

  async function proceed() {
    const res = await axios.post(`${API}/api/cases/`, {
      preferred_language: detected?.language || "en",
    });
    sessionStorage.setItem("caseId", res.data.case_id);
    sessionStorage.setItem("language", detected?.language || "en");
    navigate("/document");
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-6 max-w-lg mx-auto w-full">

      <div className="text-center">
        <h1 className="text-3xl font-black text-blue-900 tracking-tight">Welcome</h1>
        <p className="text-slate-500 mt-1 text-sm">مرحبا · Вітаємо · Bienvenue · خوش آمدید</p>
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 w-full">
        <p className="text-slate-700 text-center font-medium mb-5">
          Speak a short phrase and we will detect your language — or tap your flag below.
        </p>

        <div className="flex justify-center gap-3 mb-6 flex-wrap">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => selectLanguage(l.code)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 transition-all ${detected?.language === l.code ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-slate-300"}`}
            >
              <span className="text-2xl">{l.flag}</span>
              <span className="text-xs text-slate-600 font-medium">{l.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={startRecording}
            disabled={recording}
            className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl shadow-lg transition-all ${recording ? "bg-red-500 scale-95 animate-pulse" : "bg-blue-700 hover:bg-blue-800 active:scale-95"} text-white disabled:opacity-70`}
          >
            🎤
          </button>
          {recording
            ? <p className="text-red-500 font-medium text-sm animate-pulse">Listening… (4 seconds)</p>
            : <p className="text-slate-400 text-xs">Tap to speak</p>
          }
        </div>
      </div>

      {detected && (
        <div className="bg-teal-50 border-2 border-teal-400 rounded-2xl p-5 w-full shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{LANGUAGES.find(l => l.code === detected.language)?.flag || "🌍"}</span>
            <div>
              <p className="text-xs text-teal-600 font-semibold uppercase tracking-wide">Detected language</p>
              <p className="text-xl font-bold text-teal-900">
                {LANGUAGES.find(l => l.code === detected.language)?.label || detected.language}
              </p>
            </div>
          </div>
          {detected.text && <p className="text-slate-500 text-sm italic mb-3">"{detected.text}"</p>}
          <button
            onClick={proceed}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 rounded-xl font-bold text-lg shadow transition-all active:scale-95"
          >
            Continue →
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 w-full text-red-700 text-sm text-center">
          {error}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 w-full">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={e => setConsent(e.target.checked)}
            className="mt-1 w-4 h-4 accent-teal-600 shrink-0"
          />
          <span className="text-xs text-amber-800">
            <strong>Privacy notice:</strong> Your information is stored only on this device and is never sent to the internet. You may ask staff to delete your data at any time.
          </span>
        </label>
      </div>
    </div>
  );
}
