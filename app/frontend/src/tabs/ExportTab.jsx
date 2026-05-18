import React, { useState, useEffect } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const MODULES = [
  { id: "identity", label: "Identity & documentation", icon: "🪪", desc: "Name, DOB, nationality, document number" },
  { id: "medical", label: "Medical handoff", icon: "🏥", desc: "Chief complaint, medications, urgency level" },
  { id: "skills", label: "Skills & opportunities", icon: "🎯", desc: "Background, matched opportunities" },
  { id: "consent", label: "Consent record", icon: "✅", desc: "Privacy notice acknowledgement and timestamp" },
];

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export default function ExportTab({ caseId, lang }) {
  const [selected, setSelected] = useState(new Set(["identity", "medical", "skills", "consent"]));
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [error, setError] = useState(null);
  const [nextSteps, setNextSteps] = useState(null);
  const [nextStepsLoading, setNextStepsLoading] = useState(false);

  useEffect(() => {
    setConfirmed(false);
    setPdfUrl(null);
    setError(null);
    setNextSteps(null);
  }, [caseId]);

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function generate() {
    if (!caseId) {
      setError("No active case — complete the Language step first to create a case.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(
        `${API}/api/export/${caseId}/pdf`,
        { responseType: "blob", timeout: 30000 }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      setPdfUrl(url);
      // Auto-generate the next-steps card in the client's language
      if (!nextSteps) generateNextSteps();
    } catch {
      setError("PDF generation failed. Ensure the backend is running and the case has data from at least the Document step.");
    } finally {
      setLoading(false);
    }
  }

  async function generateNextSteps() {
    if (!caseId) return;
    setNextStepsLoading(true);
    try {
      const res = await axios.get(`${API}/api/cases/${caseId}/next-steps`, { timeout: 60000 });
      setNextSteps(res.data.message);
    } catch {
      setNextSteps("Could not generate next steps — please try again.");
    } finally {
      setNextStepsLoading(false);
    }
  }

  const shortId = caseId ? caseId.slice(0, 8) : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-5/12 border-r border-gray-800 flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-gray-800">
          <h2 className="text-base font-bold text-gray-100">Staff Dashboard</h2>
          <p className="text-gray-500 text-xs mt-0.5">Generate a handoff package for case transfer</p>
        </div>

        <div className="p-5 flex flex-col gap-4 flex-1">
          {!caseId && (
            <div className="bg-amber-900 bg-opacity-30 border border-amber-700 rounded-xl p-4">
              <p className="text-xs text-amber-300">
                No active case yet. Complete the Language step to start an intake before generating a handoff document.
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Include in export</p>
            <div className="flex flex-col gap-2">
              {MODULES.map(m => (
                <label
                  key={m.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    selected.has(m.id)
                      ? "border-teal-600 bg-teal-500 bg-opacity-10"
                      : "border-gray-700 hover:border-gray-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                    className="w-4 h-4 accent-teal-500 shrink-0"
                  />
                  <span className="text-lg shrink-0">{m.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-200">{m.label}</p>
                    <p className="text-xs text-gray-500">{m.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
            confirmed ? "border-amber-600 bg-amber-500 bg-opacity-10" : "border-gray-700"
          }`}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-amber-500 shrink-0"
            />
            <span className="text-xs text-gray-400 leading-relaxed">
              <strong className="text-gray-300">Staff confirmation (required):</strong> I have reviewed the case data and confirm it is accurate and complete before handoff.
            </span>
          </label>

          {error && (
            <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-xl p-3">
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <button
            onClick={generate}
            disabled={!confirmed || loading || selected.size === 0}
            className="mt-auto w-full bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
          >
            {loading ? <><Spinner /> Generating PDF…</> : "Generate Handoff PDF"}
          </button>

          {pdfUrl && (
            <a
              href={pdfUrl}
              download={`case-${shortId}.pdf`}
              className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 text-white py-3 rounded-xl font-semibold transition-all text-sm"
            >
              ⬇ Download case-{shortId}.pdf
            </a>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300">Case Summary Preview</h3>
          {caseId
            ? <p className="text-xs text-gray-600 mt-0.5 font-mono">Case ID: {caseId}</p>
            : <p className="text-xs text-gray-600 mt-0.5">No case active</p>
          }
        </div>

        {!caseId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
            <span className="text-5xl opacity-25">📊</span>
            <p className="text-sm">Complete intake steps to see case summary</p>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-700">
                <p className="text-sm font-semibold text-gray-100">Handoff Contents</p>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">Case {shortId}…</p>
              </div>
              <div className="divide-y divide-gray-700">
                {MODULES.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-base">{m.icon}</span>
                    <div className="flex-1">
                      <span className="text-sm text-gray-300">{m.label}</span>
                      <p className="text-xs text-gray-600">{m.desc}</p>
                    </div>
                    <span className={`text-xs font-semibold ${
                      selected.has(m.id) ? "text-teal-400" : "text-gray-700"
                    }`}>
                      {selected.has(m.id) ? "✓ Included" : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-900 bg-opacity-30 border border-amber-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-300 mb-1">Data handling</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                All data is stored locally on this device. The PDF contains sensitive personal information and must be handled in accordance with your organisation's data protection policy and applicable UNHCR guidelines.
              </p>
            </div>

            {pdfUrl && (
              <div className="bg-green-900 bg-opacity-30 border border-green-700 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-green-400 text-lg">✓</span>
                  <span className="font-semibold text-green-300">PDF ready for download</span>
                </div>
                <a
                  href={pdfUrl}
                  download={`case-${shortId}.pdf`}
                  className="flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 text-white py-2.5 px-4 rounded-xl font-semibold transition-all text-sm"
                >
                  ⬇ case-{shortId}.pdf
                </a>
              </div>
            )}

            {/* What happens next — generated in person's language */}
            <div className="bg-teal-950 bg-opacity-40 border border-teal-800 rounded-2xl overflow-hidden">
              <div className="bg-teal-900 bg-opacity-50 border-b border-teal-800 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-teal-200">What happens next</p>
                  <p className="text-xs text-teal-500">Personalised message in the client's language</p>
                </div>
                <span className="text-teal-300 text-lg">🌟</span>
              </div>
              <div className="p-4">
                {nextSteps ? (
                  <div>
                    <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap mb-3">{nextSteps}</p>
                    <button
                      onClick={() => navigator.clipboard?.writeText(nextSteps)}
                      className="text-xs text-teal-400 hover:text-teal-300 border border-teal-800 hover:border-teal-600 px-3 py-1.5 rounded-lg transition-all"
                    >
                      Copy to clipboard
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-gray-500">
                      Gemma 4 will write a warm, reassuring message for the client in their language — what was registered, what happens next, and where to go.
                    </p>
                    <button
                      onClick={generateNextSteps}
                      disabled={nextStepsLoading || !caseId}
                      className="flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-semibold transition-all"
                    >
                      {nextStepsLoading ? <><Spinner /> Generating…</> : "Generate next steps card"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
