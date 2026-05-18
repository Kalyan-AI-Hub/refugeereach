import React, { useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const QUESTIONS = [
  { id: "profession", label: "Previous work / profession", placeholder: "e.g. teacher, engineer, carpenter, nurse…" },
  { id: "education", label: "Highest education level", placeholder: "e.g. secondary school, bachelor's, vocational…" },
  { id: "languages", label: "Languages spoken", placeholder: "e.g. Arabic, English, French, Turkish…" },
  { id: "skills", label: "Other skills or certifications", placeholder: "e.g. driving licence, first aid, computing…" },
];

function MatchCard({ index, match }) {
  const score = match.score ?? match.similarity ?? 0.5;
  const pct = Math.round(score * 100);
  const barColor = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-gray-600";
  const pctColor = pct >= 70 ? "text-green-400" : pct >= 50 ? "text-amber-400" : "text-gray-500";

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-6 h-6 rounded-full bg-teal-800 flex items-center justify-center text-xs font-bold text-teal-200 shrink-0 mt-0.5">
            {index + 1}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-100">
              {match.title || match.name || `Opportunity ${index + 1}`}
            </p>
            {match.match_reason && (
              <p className="text-xs text-teal-300 mt-1 leading-relaxed italic">{match.match_reason}</p>
            )}
            {(match.description || match.summary) && (
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{match.description || match.summary}</p>
            )}
            {match.organization && (
              <p className="text-xs text-teal-500 mt-1">{match.organization}</p>
            )}
            {match.location && (
              <p className="text-xs text-gray-600 mt-0.5">📍 {match.location}</p>
            )}
          </div>
        </div>
        <span className={`text-sm font-bold ml-3 shrink-0 ${pctColor}`}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mt-2">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
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

export default function SkillsTab({ caseId, lang, onStepDone }) {
  const [answers, setAnswers] = useState({});
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function toList(str) {
    return (str || "").split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  }

  async function findMatches() {
    setLoading(true);
    setError(null);
    try {
      const body = {
        case_id: caseId,
        prior_roles: toList(answers.profession),
        education_level: answers.education || "",
        languages_spoken: toList(answers.languages),
        certifications: toList(answers.skills),
        location: "",
        preferred_language: lang || "en",
      };
      const res = await axios.post(`${API}/api/skills/match`, body, { timeout: 90000 });
      setMatches(res.data.matches || []);
      onStepDone("skills");
    } catch {
      setError("Matching failed — ensure the backend and ChromaDB are running.");
    } finally {
      setLoading(false);
    }
  }

  const hasInput = Object.values(answers).some(v => v.trim());

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-5/12 border-r border-gray-800 flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-gray-800">
          <h2 className="text-base font-bold text-gray-100">Skills Assessment</h2>
          <p className="text-gray-500 text-xs mt-0.5">Share your background to find relevant opportunities</p>
        </div>

        <div className="p-5 flex flex-col gap-4 flex-1">
          {QUESTIONS.map(q => (
            <div key={q.id}>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide block mb-1.5">
                {q.label}
              </label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-teal-500 placeholder-gray-600 transition-all"
                placeholder={q.placeholder}
                value={answers[q.id] || ""}
                onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
              />
            </div>
          ))}

          {!hasInput && (
            <p className="text-xs text-gray-600 text-center">Fill in at least one field to search for opportunities</p>
          )}

          {error && (
            <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-xl p-3">
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <button
            onClick={findMatches}
            disabled={!hasInput || loading}
            className="mt-auto w-full bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
            title={!hasInput ? "Fill in at least one field to search" : ""}
          >
            {loading ? <><Spinner /> Finding matches…</> : "Find Opportunities →"}
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {matches === null ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
            <span className="text-5xl opacity-25">🎯</span>
            <p className="text-sm">Matched opportunities will appear here</p>
            <p className="text-xs text-gray-700">Powered by nomic-embed-text + ChromaDB</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
            <span className="text-5xl opacity-25">🔍</span>
            <p className="text-sm">No matches found</p>
            <p className="text-xs text-gray-700">Try adding more detail to your profile above</p>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Matched Opportunities</h3>
              <span className="text-xs text-teal-500 font-semibold">{matches.length} results</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm bg-green-500" />
                <span className="text-xs text-gray-600">≥ 70% strong match</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm bg-amber-500" />
                <span className="text-xs text-gray-600">50–69% partial match</span>
              </div>
            </div>
            {matches.map((m, i) => <MatchCard key={i} index={i} match={m} />)}
          </div>
        )}
      </div>
    </div>
  );
}
