import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const QUESTIONS = [
  { label: "Prior work", text: "What kind of work did you do before?", icon: "💼", placeholder: "e.g. nurse, teacher, driver, farmer…" },
  { label: "Certifications", text: "Do you have any certifications or formal training?", icon: "🎓", placeholder: "e.g. first aid, teaching degree, CDL license…" },
  { label: "Languages", text: "What languages do you speak?", icon: "🌐", placeholder: "e.g. Arabic, English, French…" },
];

export default function SkillsScreen() {
  const navigate = useNavigate();
  const caseId = sessionStorage.getItem("caseId");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [input, setInput] = useState("");
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);

  async function next() {
    const updated = [...answers, input];
    setAnswers(updated);
    setInput("");
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      setLoading(true);
      const res = await axios.post(`${API}/api/skills/match`, {
        case_id: caseId,
        prior_roles: [updated[0]],
        certifications: updated[1] ? [updated[1]] : [],
        languages_spoken: updated[2] ? [updated[2]] : [],
      });
      setMatches(res.data.matches);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center flex-1 gap-5 p-6 max-w-lg mx-auto w-full">
      <div className="text-center">
        <h2 className="text-2xl font-black text-blue-900">Skills & Opportunities</h2>
        <p className="text-slate-500 text-sm mt-1">Help us find roles and support that match your background</p>
      </div>

      {!matches && !loading && (
        <>
          <div className="flex gap-2 w-full">
            {QUESTIONS.map((q, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i < step ? "bg-teal-500" : i === step ? "bg-blue-500" : "bg-slate-200"}`} />
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{QUESTIONS[step].icon}</span>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">{QUESTIONS[step].label}</p>
                <p className="text-lg font-bold text-slate-800">{QUESTIONS[step].text}</p>
              </div>
            </div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && input && next()}
              className="w-full border-2 border-slate-200 focus:border-blue-400 rounded-xl px-4 py-3 text-base outline-none transition-all"
              placeholder={QUESTIONS[step].placeholder}
              autoFocus
            />
            <button
              onClick={next}
              disabled={!input}
              className="mt-3 w-full bg-blue-700 hover:bg-blue-800 text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-all active:scale-95"
            >
              {step < QUESTIONS.length - 1 ? "Next →" : "Find Opportunities"}
            </button>
          </div>
          <p className="text-slate-400 text-sm">Question {step + 1} of {QUESTIONS.length}</p>
        </>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-blue-700 font-semibold">Finding opportunities with Gemma 4…</p>
        </div>
      )}

      {matches && (
        <div className="w-full flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <p className="font-bold text-slate-800 text-lg">Matched Opportunities</p>
            <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">{matches.length} found</span>
          </div>

          {matches.length === 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-slate-500">
              No matches found at this time. Staff will review manually.
            </div>
          )}

          {matches.map((m, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center text-teal-700 font-black shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-blue-900 text-base">{m.title}</p>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">{m.description}</p>
                  {m.location && (
                    <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                      <span>📍</span>{m.location}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={() => navigate("/export")}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white py-4 rounded-xl font-bold text-lg shadow transition-all active:scale-95 mt-2"
          >
            Complete & Export →
          </button>
        </div>
      )}
    </div>
  );
}
