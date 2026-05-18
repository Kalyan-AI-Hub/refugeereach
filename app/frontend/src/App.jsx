import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import DocumentTab from "./tabs/DocumentTab";
import IntakeTab from "./tabs/IntakeTab";
import MedicalTab from "./tabs/MedicalTab";
import SkillsTab from "./tabs/SkillsTab";
import ExportTab from "./tabs/ExportTab";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const LANGUAGES = [
  { code: "ar", label: "العربية", abbr: "AR", color: "bg-emerald-700", name: "Arabic" },
  { code: "uk", label: "Українська", abbr: "UA", color: "bg-blue-600", name: "Ukrainian" },
  { code: "fa", label: "دری", abbr: "FA", color: "bg-orange-700", name: "Dari" },
  { code: "fr", label: "Français", abbr: "FR", color: "bg-indigo-700", name: "French" },
  { code: "en", label: "English", abbr: "EN", color: "bg-violet-700", name: "English" },
];

function RefugeeReachLogo({ size = "md" }) {
  const dim = size === "lg" ? "w-16 h-16" : size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const svgSize = size === "lg" ? 42 : size === "sm" ? 22 : 28;
  return (
    <div className={`${dim} bg-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-900 shrink-0`}>
      <svg viewBox="0 0 40 40" width={svgSize} height={svgSize} fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Shield */}
        <path d="M 8 6 L 32 6 L 32 23 Q 32 34 20 39 Q 8 34 8 23 Z"
              stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="white" fillOpacity="0.15"/>
        {/* Person — head */}
        <circle cx="20" cy="17" r="4.5" fill="white"/>
        {/* Person — shoulders */}
        <path d="M 12.5 30 Q 12.5 23 20 23 Q 27.5 23 27.5 30"
              fill="white"/>
      </svg>
    </div>
  );
}

function LangBadge({ lang, size = "md" }) {
  const s = size === "sm" ? "w-5 h-5 text-xs" : size === "lg" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
  return (
    <div className={`${s} rounded-full ${lang.color} flex items-center justify-center font-bold text-white shrink-0`}>
      {lang.abbr}
    </div>
  );
}

const TABS = [
  { id: "document", label: "Document", icon: "📄" },
  { id: "intake",   label: "Intake",   icon: "🗣" },
  { id: "medical",  label: "Medical",  icon: "🏥" },
  { id: "skills",   label: "Skills",   icon: "🎯" },
  { id: "export",   label: "Export",   icon: "📊" },
];

const STEPS = [
  { key: "language",  label: "Language",  tab: null },
  { key: "documents", label: "Documents", tab: "document" },
  { key: "intake",    label: "Intake",    tab: "intake" },
  { key: "medical",   label: "Medical",   tab: "medical" },
  { key: "skills",    label: "Skills",    tab: "skills" },
];

function Spinner({ size = 5 }) {
  return (
    <svg className={`animate-spin h-${size} w-${size}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function LanguageModal({ onDone }) {
  const [selected, setSelected] = useState(null);
  const [recording, setRecording] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const chunksRef = useRef([]);
  const cancelledRef = useRef(false);

  async function detect() {
    setError(null);
    cancelledRef.current = false;
    setDetecting(true);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access denied — please select your language manually.");
      setDetecting(false);
      return;
    }
    if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = e => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (cancelledRef.current) { setDetecting(false); setRecording(false); return; }
      const blob = new Blob(chunksRef.current, { type: "audio/wav" });
      const form = new FormData();
      form.append("audio", blob, "sample.wav");
      try {
        const res = await axios.post(`${API}/api/intake/transcribe`, form, { timeout: 20000 });
        const lang = res.data.language;
        if (lang && LANGUAGES.find(l => l.code === lang)) {
          setSelected(lang);
        } else {
          setError("Could not detect language — please select manually.");
        }
      } catch {
        setError("Could not reach backend — please select your language manually.");
      }
      setDetecting(false);
      setRecording(false);
    };
    recorder.start();
    setRecording(true);
    setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 4000);
  }

  async function begin() {
    if (!selected || !consent) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API}/api/cases/`, { preferred_language: selected, consent_given: true }, { timeout: 10000 });
      localStorage.setItem("caseId", res.data.case_id);
      localStorage.setItem("language", selected);
      onDone({ caseId: res.data.case_id, lang: selected });
    } catch {
      setError("Could not connect to backend — ensure the server is running on port 8000.");
      setLoading(false);
    }
  }

  const langObj = LANGUAGES.find(l => l.code === selected);
  const canBegin = selected && consent && !loading;

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-8 shadow-2xl">
        <div className="text-center mb-7">
          <div className="flex justify-center mb-4">
            <RefugeeReachLogo size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100">RefugeeReach</h1>
          <p className="text-teal-400 text-sm font-medium mt-1">Dignified intake for every displaced person</p>
          <p className="text-gray-600 text-xs mt-2">مرحبا · Вітаємо · Bienvenue · خوش آمدید</p>
        </div>

        {/* Language grid */}
        <div className="grid grid-cols-5 gap-2 mb-5">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => setSelected(l.code)}
              className={`flex flex-col items-center gap-2 py-3 px-1 rounded-xl border-2 transition-all ${
                selected === l.code
                  ? "border-teal-500 bg-teal-500 bg-opacity-15"
                  : "border-gray-700 hover:border-gray-500 bg-gray-800"
              }`}
            >
              <LangBadge lang={l} size="lg" />
              <span className="text-xs text-gray-300 leading-tight text-center">{l.label}</span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-gray-600 text-xs">or speak to auto-detect</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {/* Mic */}
        <div className="flex flex-col items-center mb-5 gap-2">
          <button
            onClick={detect}
            disabled={recording || detecting}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg transition-all ${
              recording
                ? "bg-red-600 animate-pulse scale-95"
                : detecting
                ? "bg-gray-700"
                : "bg-teal-600 hover:bg-teal-500 active:scale-95"
            } text-white disabled:cursor-not-allowed`}
          >
            {detecting && !recording ? <Spinner /> : recording ? "⏹" : "🎤"}
          </button>
          {recording && <p className="text-red-400 text-xs animate-pulse">Listening for 4 seconds…</p>}
        </div>

        {/* Selection confirmation */}
        {langObj ? (
          <div className="bg-teal-500 bg-opacity-10 border border-teal-700 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-3">
            <LangBadge lang={langObj} size="md" />
            <div>
              <p className="text-teal-300 font-semibold text-sm">{langObj.label}</p>
              <p className="text-gray-500 text-xs">{langObj.name} selected</p>
            </div>
          </div>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 mb-4 text-center">
            <p className="text-gray-500 text-xs">Select a language above to continue</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-xl px-4 py-2.5 mb-4">
            <p className="text-red-300 text-xs">{error}</p>
          </div>
        )}

        {/* Consent */}
        <label className="flex items-start gap-3 cursor-pointer mb-5 bg-gray-800 border border-gray-700 rounded-xl p-4">
          <input
            type="checkbox"
            checked={consent}
            onChange={e => setConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-teal-500 shrink-0"
          />
          <span className="text-xs text-gray-400 leading-relaxed">
            <strong className="text-gray-300">Privacy notice (required):</strong> Your information is stored only on this device and never transmitted online. You may ask staff to delete your data at any time.
          </span>
        </label>

        <button
          onClick={begin}
          disabled={!canBegin}
          className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-600 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold text-base transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          {loading ? <><Spinner /> Creating case…</> : "Begin Intake →"}
        </button>
        {!selected && (
          <p className="text-center text-xs text-gray-600 mt-2">Select a language to enable this button</p>
        )}
        {selected && !consent && (
          <p className="text-center text-xs text-gray-600 mt-2">Accept the privacy notice to continue</p>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [caseId, setCaseId] = useState(localStorage.getItem("caseId") || null);
  const [lang, setLang] = useState(localStorage.getItem("language") || null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showModal, setShowModal] = useState(!localStorage.getItem("caseId"));
  const [activeTab, setActiveTab] = useState("document");
  const [online, setOnline] = useState(navigator.onLine);
  const [backendOk, setBackendOk] = useState(null);
  const [stepsDone, setStepsDone] = useState({
    language: !!localStorage.getItem("caseId"),
    documents: false,
    intake: false,
    medical: false,
    skills: false,
  });

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);


  useEffect(() => {
    axios.get(`${API}/health`, { timeout: 4000 })
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  function onLangDone({ caseId: id, lang: l }) {
    setCaseId(id);
    setLang(l);
    setShowModal(false);
    setActiveTab("document");
    setStepsDone({ language: true, documents: false, intake: false, medical: false, skills: false });
  }

  function newIntake() {
    if (!window.confirm("Start a new intake? The current session will be cleared.")) return;
    localStorage.removeItem("caseId");
    localStorage.removeItem("language");
    setCaseId(null);
    setLang(null);
    setActiveTab("document");
    setStepsDone({ language: false, documents: false, intake: false, medical: false, skills: false });
    setShowModal(true);
  }

  function onStepDone(step) {
    setStepsDone(s => ({ ...s, [step]: true }));
  }

  function switchLang(code) {
    setLang(code);
    localStorage.setItem("language", code);
    setShowLangPicker(false);
  }

  function navigateStep(step) {
    if (step.tab) setActiveTab(step.tab);
    else if (!caseId) setShowModal(true);
  }

  const langObj = LANGUAGES.find(l => l.code === lang);
  const tabProps = { caseId, lang, onStepDone };

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {showModal && <LanguageModal onDone={onLangDone} />}

      {/* Backend warning banner */}
      {backendOk === false && (
        <div className="bg-red-950 border-b border-red-800 px-4 py-2 flex items-center gap-2 shrink-0">
          <span className="text-red-400 text-sm">⚠</span>
          <p className="text-xs text-red-300">
            Backend not reachable — AI features unavailable. Start with:{" "}
            <code className="font-mono bg-red-900 bg-opacity-60 px-1.5 py-0.5 rounded text-red-200">
              python -m uvicorn main:app --port 8000
            </code>{" "}
            in the <code className="font-mono bg-red-900 bg-opacity-60 px-1 rounded text-red-200">app/backend/</code> directory.
          </p>
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <RefugeeReachLogo size="sm" />
          <div>
            <div className="font-bold text-sm text-gray-100 leading-tight tracking-tight">RefugeeReach</div>
            <div className="text-teal-600 text-xs font-medium">Dignified intake · Offline-first · Gemma 4</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Step pills — clickable navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.key}>
                <button
                  onClick={() => navigateStep(s)}
                  title={s.tab ? `Go to ${s.label}` : "Change language"}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    stepsDone[s.key]
                      ? "bg-teal-500 text-gray-900 hover:bg-teal-400"
                      : "bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-500 hover:text-gray-300"
                  }`}
                >
                  {stepsDone[s.key] ? "✓ " : ""}{s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-3 h-px ${stepsDone[s.key] ? "bg-teal-500" : "bg-gray-700"}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Language switcher — click to change mid-session */}
          {langObj && caseId && (
            <div className="relative">
              <button
                onClick={() => setShowLangPicker(p => !p)}
                className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 hover:border-teal-600 rounded-full px-3 py-1.5 text-xs transition-all"
                title="Switch language"
              >
                <LangBadge lang={langObj} size="sm" />
                <span className="text-gray-300 font-medium">{langObj.name}</span>
                <span className="text-gray-500 ml-0.5">▾</span>
              </button>

              {showLangPicker && (
                <>
                  {/* Backdrop — closes picker when clicking outside */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowLangPicker(false)}
                  />
                  {/* Dropdown — sits above backdrop */}
                  <div className="absolute right-0 top-full mt-1.5 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden min-w-[140px]">
                    {LANGUAGES.map(l => (
                      <button
                        key={l.code}
                        onClick={() => switchLang(l.code)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-gray-800 transition-all text-left ${
                          l.code === lang ? "text-teal-400 font-semibold" : "text-gray-300"
                        }`}
                      >
                        <LangBadge lang={l} size="sm" />
                        <span>{l.name}</span>
                        {l.code === lang && <span className="ml-auto text-teal-500">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* New intake button */}
          {caseId && (
            <button
              onClick={newIntake}
              className="px-3 py-1.5 text-xs border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded-full transition-all"
              title="Start a fresh intake for a new person"
            >
              + New intake
            </button>
          )}

          {/* Online/offline */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border ${
            online
              ? "border-green-800 bg-green-950 text-green-400"
              : "border-amber-800 bg-amber-950 text-amber-400"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${online ? "bg-green-400" : "bg-amber-400"} animate-pulse`} />
            {online ? "Online" : "Offline mode"}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 flex gap-0.5 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
              activeTab === tab.id
                ? "border-teal-500 text-teal-400"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === "document" && <DocumentTab {...tabProps} />}
        {activeTab === "intake"   && <IntakeTab   {...tabProps} />}
        {activeTab === "medical"  && <MedicalTab  {...tabProps} />}
        {activeTab === "skills"   && <SkillsTab   {...tabProps} />}
        {activeTab === "export"   && <ExportTab   {...tabProps} />}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-700 py-1.5 border-t border-gray-800 shrink-0">
        RefugeeReach · Powered by Gemma 4 · All data stored locally on this device
      </footer>
    </div>
  );
}
