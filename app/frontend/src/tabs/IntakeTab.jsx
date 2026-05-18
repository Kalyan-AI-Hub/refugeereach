import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const REQUIRED_FIELDS = [
  "person_name", "date_of_birth", "nationality", "gender",
  "family_size", "current_location", "preferred_language",
];

const OPENING = {
  ar: "مرحباً. أنا هنا لمساعدتك في تسجيل بياناتك. هل يمكنك إخباري باسمك الكامل وجنسيتك؟",
  uk: "Ласкаво просимо. Я тут, щоб допомогти вам зареєструватися. Скажіть, будь ласка, ваше ім'я та громадянство?",
  fa: "خوش آمدید. من اینجا هستم تا به شما در ثبت نام کمک کنم. لطفاً نام و ملیت خود را بگویید؟",
  fr: "Bienvenue. Je suis ici pour vous aider à vous enregistrer. Pouvez-vous me donner votre nom complet et votre nationalité ?",
  en: "Welcome. I'm here to help you register. Could you tell me your full name and nationality?",
};

function Spinner({ size = 4 }) {
  return (
    <svg className={`animate-spin h-${size} w-${size} shrink-0`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

async function playTts(text, language) {
  // Unlock audio context before the fetch so play() isn't blocked by autoplay policy
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
  } catch {}
  return new Promise((resolve) => {
    const form = new FormData();
    form.append("text", text.slice(0, 400));
    form.append("language", language);
    axios.post(`${API}/api/intake/speak`, form, { responseType: "blob", timeout: 15000 })
      .then(res => {
        if (!res.data || res.data.size < 1000) { resolve(); return; }
        const url = URL.createObjectURL(res.data);
        const audio = new Audio(url);
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        audio.play().catch(() => resolve());
      })
      .catch(() => resolve());
  });
}

export default function IntakeTab({ caseId, lang, onStepDone }) {
  const language = lang || "en";
  const opening = OPENING[language] || OPENING.en;

  const [caseState, setCaseState] = useState({ case_id: caseId, preferred_language: lang || "en" });
  const [turns, setTurns] = useState([{ role: "agent", text: opening }]);
  const [recording, setRecording] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [loadingTurn, setLoadingTurn] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [useText, setUseText] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [kioskMode, setKioskMode] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);

  const chunksRef = useRef([]);
  const recorderRef = useRef(null);
  const stopTimerRef = useRef(null);
  const bottomRef = useRef(null);

  const filled = REQUIRED_FIELDS.filter(f => caseState[f]).length;
  const progress = Math.round((filled / REQUIRED_FIELDS.length) * 100);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  // Reset state when caseId changes (new intake)
  useEffect(() => {
    setCaseState({ case_id: caseId, preferred_language: lang || "en" });
    setTurns([{ role: "agent", text: OPENING[language] || OPENING.en }]);
    setDone(false);
    setError(null);
  }, [caseId]);

  // Kiosk mode: auto-play TTS for opening message when kiosk mode first enabled
  useEffect(() => {
    if (!kioskMode) return;
    setTtsPlaying(true);
    playTts(opening, language).then(() => {
      setTtsPlaying(false);
      if (!done) startRecording();
    });
  }, [kioskMode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendMessage(text) {
    if (!text.trim() || !caseId) return;
    setLoadingTurn(true);
    setError(null);

    setTurns(prev => [...prev, { role: "user", text }]);

    try {
      const res = await axios.post(`${API}/api/intake/turn`, {
        case_id: caseId,
        case_state: caseState,
        message: text,
        language,
      }, { timeout: 120000 });

      const newState = res.data.updated_case || caseState;
      const reply = res.data.reply || "";

      setCaseState(newState);
      setTurns(prev => [...prev, { role: "agent", text: reply }]);

      // Check completion
      const newFilled = REQUIRED_FIELDS.filter(f => newState[f]).length;
      const isComplete = newFilled >= REQUIRED_FIELDS.length;
      if (isComplete) {
        setDone(true);
        onStepDone("intake");
      }

      // TTS — in kiosk mode: await TTS then auto-start mic; otherwise fire-and-forget
      if (reply) {
        if (kioskMode) {
          setTtsPlaying(true);
          await playTts(reply, language);
          setTtsPlaying(false);
          if (!isComplete) startRecording();
        } else {
          playTts(reply, language);
        }
      }

    } catch {
      setError("Could not reach the backend — check that uvicorn is running on port 8000.");
    } finally {
      setLoadingTurn(false);
    }
  }

  async function startRecording() {
    setError(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access denied — use the text input below instead.");
      setUseText(true);
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

      setLoadingAudio(true);
      const blob = new Blob(chunksRef.current, { type: "audio/wav" });
      const form = new FormData();
      form.append("audio", blob, "turn.wav");
      form.append("hint_language", language);

      try {
        const stt = await axios.post(`${API}/api/intake/transcribe`, form, { timeout: 25000 });
        const text = stt.data?.text?.trim();
        if (text) {
          setLoadingAudio(false);
          await sendMessage(text);
        } else {
          setError("Could not transcribe audio — try speaking more clearly or use text input.");
          setLoadingAudio(false);
        }
      } catch {
        setError("Transcription failed — use text input below.");
        setUseText(true);
        setLoadingAudio(false);
      }
    };

    recorder.start();
    setRecording(true);
    stopTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, 6000);
  }

  function stopEarly() {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function submitText(e) {
    e.preventDefault();
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    await sendMessage(text);
  }

  const busy = recording || loadingAudio || loadingTurn || ttsPlaying;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — controls */}
      <div className="w-5/12 border-r border-gray-800 flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-gray-800">
          <h2 className="text-base font-bold text-gray-100">Guided Intake</h2>
          <p className="text-gray-500 text-xs mt-0.5">Answer by voice or text — the assistant will guide you step by step</p>
        </div>

        <div className="p-5 flex flex-col gap-4 flex-1">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>Registration progress</span>
              <span className={`font-semibold ${progress === 100 ? "text-green-400" : "text-teal-400"}`}>
                {filled}/{REQUIRED_FIELDS.length} fields
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-teal-400 h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            {/* Field status pills */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {REQUIRED_FIELDS.map(f => (
                <span
                  key={f}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-all ${
                    caseState[f]
                      ? "border-teal-700 bg-teal-900 bg-opacity-40 text-teal-300"
                      : "border-gray-700 bg-gray-800 text-gray-600"
                  }`}
                >
                  {f.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>

          {/* Kiosk mode toggle */}
          <div className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all cursor-pointer ${
            kioskMode ? "border-teal-600 bg-teal-500 bg-opacity-10" : "border-gray-700 hover:border-gray-600"
          }`} onClick={() => !done && setKioskMode(m => !m)}>
            <div>
              <p className="text-sm font-semibold text-gray-200">Voice-First Kiosk Mode</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {kioskMode ? "Active — agent speaks then mic auto-starts" : "Agent speaks, mic auto-starts after each response"}
              </p>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative ${kioskMode ? "bg-teal-500" : "bg-gray-700"}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${kioskMode ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
          </div>

          {/* TTS playing indicator */}
          {ttsPlaying && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-teal-900 bg-opacity-30 border border-teal-700 rounded-xl">
              <div className="flex gap-0.5">
                {[0,1,2,3].map(i => (
                  <div key={i} className="w-1 bg-teal-400 rounded-full animate-bounce" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
              <span className="text-xs text-teal-300">Speaking…</span>
            </div>
          )}

          {/* Mic button */}
          {!useText && (
            <div className="flex flex-col items-center gap-3 py-2">
              <button
                onClick={recording ? stopEarly : startRecording}
                disabled={loadingAudio || loadingTurn}
                className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-lg transition-all
                  ${recording
                    ? "bg-red-600 animate-pulse scale-95 shadow-red-900"
                    : busy
                    ? "bg-gray-700 cursor-not-allowed"
                    : "bg-teal-600 hover:bg-teal-500 active:scale-95 shadow-teal-900"
                  } text-white`}
              >
                {loadingAudio || loadingTurn ? <Spinner size={7} /> : recording ? "⏹" : "🎤"}
              </button>
              <p className="text-xs text-center text-gray-500">
                {recording
                  ? <span className="text-red-400 animate-pulse">Listening… tap to stop early</span>
                  : loadingAudio
                  ? <span className="text-gray-400">Transcribing…</span>
                  : loadingTurn
                  ? <span className="text-gray-400">Thinking…</span>
                  : ttsPlaying
                  ? <span className="text-teal-400 animate-pulse">Speaking…</span>
                  : kioskMode
                  ? "Kiosk mode — mic auto-starts after response"
                  : "Tap to speak (6 seconds)"}
              </p>
              <button
                onClick={() => setUseText(true)}
                className="text-xs text-gray-600 hover:text-gray-400 underline transition-colors"
              >
                Switch to text input
              </button>
            </div>
          )}

          {/* Text input */}
          {useText && (
            <form onSubmit={submitText} className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Type your response
              </label>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 focus:border-teal-500 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 resize-none focus:outline-none transition-all"
                rows={3}
                placeholder="Type your answer here…"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitText(e); }
                }}
                disabled={busy}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!textInput.trim() || busy}
                  className="flex-1 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                >
                  {busy ? <><Spinner /> Processing…</> : "Send →"}
                </button>
                <button
                  type="button"
                  onClick={() => setUseText(false)}
                  className="px-3 py-2.5 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded-xl text-sm transition-all"
                  title="Switch to voice input"
                >
                  🎤
                </button>
              </div>
            </form>
          )}

          {error && (
            <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-xl p-3">
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {done && (
            <div className="bg-green-900 bg-opacity-30 border border-green-700 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-green-400 text-lg">✓</span>
                <span className="font-semibold text-green-300 text-sm">Registration complete</span>
              </div>
              <p className="text-xs text-gray-400">All required fields collected. Continue to Medical intake.</p>
            </div>
          )}

          {!caseId && (
            <div className="bg-amber-900 bg-opacity-30 border border-amber-700 rounded-xl p-3">
              <p className="text-xs text-amber-300">
                No active case — complete the Language step first to create a case record.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel — conversation */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Conversation</span>
          <span className="text-xs text-gray-600">{turns.length} exchanges</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          {turns.map((turn, i) => (
            <div
              key={i}
              className={`flex gap-3 ${turn.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {turn.role === "agent" && (
                <div className="w-8 h-8 rounded-full bg-teal-700 flex items-center justify-center text-xs font-bold text-teal-100 shrink-0 mt-0.5">
                  RR
                </div>
              )}
              <div
                className={`max-w-xs rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  turn.role === "agent"
                    ? "bg-gray-800 text-gray-200 rounded-tl-sm border border-gray-700"
                    : "bg-teal-700 text-white rounded-tr-sm"
                }`}
              >
                {turn.text}
              </div>
            </div>
          ))}

          {(loadingAudio || loadingTurn) && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-700 flex items-center justify-center shrink-0">
                <Spinner size={3} />
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(j => (
                    <div
                      key={j}
                      className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce"
                      style={{ animationDelay: `${j * 0.15}s` }}
                    />
                  ))}
                </div>
                {loadingTurn && (
                  <span className="text-xs text-gray-500 ml-1">Gemma 4 thinking…</span>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="p-3 border-t border-gray-800 shrink-0">
          <p className="text-xs text-gray-700 text-center">
            Powered by Gemma 4 · All responses stored locally · This conversation is not legal advice
          </p>
        </div>
      </div>
    </div>
  );
}
