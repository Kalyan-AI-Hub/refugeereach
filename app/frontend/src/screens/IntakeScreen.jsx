import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const REQUIRED_FIELDS = ["person_name", "date_of_birth", "nationality", "gender", "family_size", "current_location", "intake_status", "preferred_language"];

export default function IntakeScreen() {
  const navigate = useNavigate();
  const caseId = sessionStorage.getItem("caseId");
  const language = sessionStorage.getItem("language") || "en";
  const [caseState, setCaseState] = useState({ case_id: caseId });
  const [reply, setReply] = useState("Tell me a little about yourself and your family. I'm here to help.");
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState([]);
  const chunksRef = React.useRef([]);

  async function recordAndSend() {
    setLoading(true);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/wav" });
      const form = new FormData();
      form.append("audio", blob, "turn.wav");
      form.append("hint_language", language);
      const sttRes = await axios.post(`${API}/api/intake/transcribe`, form);
      const text = sttRes.data.text;

      const turnRes = await axios.post(`${API}/api/intake/turn`, {
        case_id: caseId,
        case_state: caseState,
        message: text,
        language,
      });

      const newState = turnRes.data.updated_case;
      setCaseState(newState);
      setReply(turnRes.data.reply);
      setTurns(prev => [...prev, { user: text, agent: turnRes.data.reply }]);
      setLoading(false);
    };
    recorder.start();
    setRecording(true);
    setTimeout(() => { recorder.stop(); setRecording(false); }, 6000);
  }

  const filled = REQUIRED_FIELDS.filter(f => caseState[f]).length;
  const progress = Math.round((filled / REQUIRED_FIELDS.length) * 100);

  return (
    <div className="flex flex-col items-center flex-1 gap-4 p-6 max-w-lg mx-auto w-full">
      <div className="text-center">
        <h2 className="text-2xl font-black text-blue-900">Registration Interview</h2>
        <p className="text-slate-500 text-sm mt-1">Answer by voice — I will guide you through each step</p>
      </div>

      <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex justify-between text-xs text-slate-500 mb-2">
          <span>Progress</span>
          <span>{filled}/{REQUIRED_FIELDS.length} fields complete</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-blue-600 to-teal-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full p-5 min-h-24 flex items-start gap-3">
        <div className="w-9 h-9 bg-blue-700 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">RR</div>
        <p className="text-slate-700 text-base leading-relaxed">{reply}</p>
      </div>

      {turns.length > 0 && (
        <div className="w-full flex flex-col gap-2 max-h-36 overflow-y-auto">
          {turns.slice(-2).map((t, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="self-end bg-blue-100 text-blue-900 rounded-xl rounded-br-sm px-3 py-2 text-sm max-w-xs">
                {t.user}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-2 mt-2">
        <button
          onClick={recordAndSend}
          disabled={recording || loading}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-lg transition-all ${recording ? "bg-red-500 animate-pulse scale-95" : "bg-blue-700 hover:bg-blue-800 active:scale-95"} text-white disabled:opacity-50`}
        >
          🎤
        </button>
        {recording && <p className="text-red-500 text-sm font-medium animate-pulse">Listening… (6 seconds)</p>}
        {loading && !recording && <p className="text-slate-500 text-sm">Processing your response…</p>}
        {!recording && !loading && <p className="text-slate-400 text-xs">Tap to speak</p>}
      </div>

      <button
        onClick={() => navigate("/medical")}
        className="mt-auto w-full border-2 border-teal-500 text-teal-700 hover:bg-teal-50 py-3 rounded-xl font-semibold transition-all"
      >
        Continue to Medical →
      </button>
    </div>
  );
}
