import React, { useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function StaffExportScreen() {
  const caseId = sessionStorage.getItem("caseId");
  const [confirmed, setConfirmed] = useState(false);
  const [exported, setExported] = useState(false);
  const [loading, setLoading] = useState(false);

  async function exportPdf() {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/export/${caseId}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `case_${caseId}.pdf`;
      a.click();
      setExported(true);
    } finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col items-center flex-1 gap-5 p-6 max-w-lg mx-auto w-full">
      <div className="text-center">
        <h2 className="text-2xl font-black text-blue-900">Staff Review & Export</h2>
        <p className="text-slate-500 text-sm mt-1">Review the collected information before generating the case summary</p>
      </div>

      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 w-full">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0">⚠️</span>
          <div>
            <p className="font-bold text-amber-900 text-sm">Staff verification required</p>
            <p className="text-amber-800 text-sm mt-1">
              All AI-generated information must be verified by a staff member before official use.
              This summary supports — it does not replace — professional judgement.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full overflow-hidden">
        <div className="bg-blue-900 text-white px-5 py-4">
          <p className="font-bold">Case Summary</p>
          <p className="text-blue-300 text-xs mt-0.5">Case ID: {caseId}</p>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <span className="text-xl">📄</span>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Documents</p>
              <p className="text-sm text-slate-700 font-medium">Identity document captured & extracted</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <span className="text-xl">🎤</span>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Intake</p>
              <p className="text-sm text-slate-700 font-medium">Voice intake interview completed</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <span className="text-xl">🏥</span>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Medical</p>
              <p className="text-sm text-slate-700 font-medium">Medical handoff note generated</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <span className="text-xl">💼</span>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Skills</p>
              <p className="text-sm text-slate-700 font-medium">Opportunity matches identified</p>
            </div>
          </div>
        </div>
      </div>

      {!confirmed ? (
        <button
          onClick={() => setConfirmed(true)}
          className="w-full bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-xl font-bold text-lg shadow transition-all active:scale-95"
        >
          ✓ Confirm & Approve Information
        </button>
      ) : (
        <div className="flex flex-col gap-3 w-full">
          <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-bold text-green-900 text-sm">Approved by staff</p>
              <p className="text-green-700 text-xs mt-0.5">Information confirmed. Ready to generate PDF.</p>
            </div>
          </div>

          {!exported ? (
            <button
              onClick={exportPdf}
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white py-4 rounded-xl font-bold text-lg shadow transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Generating PDF…</>
              ) : "⬇ Download PDF Summary"}
            </button>
          ) : (
            <div className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-4 text-center">
              <p className="text-2xl mb-1">🖨️</p>
              <p className="font-bold text-teal-900">PDF downloaded</p>
              <p className="text-teal-700 text-sm mt-1">Print and hand to the client. File is saved to your device.</p>
            </div>
          )}

          <button
            onClick={() => { sessionStorage.clear(); window.location.href = "/"; }}
            className="w-full border-2 border-slate-200 hover:border-slate-300 text-slate-600 py-3 rounded-xl font-semibold transition-all"
          >
            + Start New Case
          </button>
        </div>
      )}
    </div>
  );
}
