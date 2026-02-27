"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface LogEntry {
  id: string;
  timestamp: string;
  classification: string;
  severity: string;
  flow: string;
  location: string;
  docLevel: string;
  userScore: number;
  bizScore: number;
  specGapFlag: boolean;
  confidence: string;
  workaround: string;
  summary: string;
  title: string;
  jiraLink: string;
}

const sevColors: Record<string, string> = {
  Critical: "bg-red-600 text-white",
  High: "bg-orange-500 text-white",
  Medium: "bg-yellow-400 text-gray-900",
  Low: "bg-green-100 text-green-800",
};
const classColors: Record<string, string> = {
  Bug: "bg-red-100 text-red-800",
  "UX Improvement": "bg-purple-100 text-purple-800",
  "Feature Request": "bg-blue-100 text-blue-800",
  "Spec Gap": "bg-yellow-100 text-yellow-800",
};
const classEmoji: Record<string, string> = {
  Bug: "🐛",
  "UX Improvement": "✨",
  "Feature Request": "💡",
  "Spec Gap": "🌫️",
};
const docBadges: Record<string, { label: string; color: string }> = {
  none: { label: "No docs", color: "bg-red-100 text-red-700" },
  partial: { label: "Partial docs", color: "bg-yellow-100 text-yellow-700" },
  full: { label: "Full docs", color: "bg-green-100 text-green-700" },
};

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex gap-1 items-center mt-1">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className={`h-2 w-7 rounded-full ${i <= score ? color : "bg-gray-200"}`} />
      ))}
      <span className="text-xs text-gray-400 ml-1">{score}/5</span>
    </div>
  );
}

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;
  const [entry, setEntry] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [editingJira, setEditingJira] = useState(false);
  const [jiraInput, setJiraInput] = useState("");

  const fetchEntry = useCallback(async () => {
    try {
      const res = await fetch("/api/log");
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { setError("Failed to load ticket data."); return; }
      if (data.entries) {
        const found = data.entries.find((e: LogEntry) => e.id === decodeURIComponent(ticketId));
        if (found) setEntry(found);
        else setError("Ticket not found.");
      } else {
        setError(data.error || "Failed to load.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchEntry(); }, [fetchEntry]);

  const saveTitle = async () => {
    if (!entry || !titleInput.trim()) return;
    await fetch("/api/log", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, title: titleInput.trim() }),
    });
    setEditingTitle(false);
    fetchEntry();
  };

  const saveJira = async () => {
    if (!entry || !jiraInput.trim()) return;
    await fetch("/api/log", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, jiraLink: jiraInput.trim() }),
    });
    setEditingJira(false);
    fetchEntry();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-2 animate-pulse">⏳</div>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Loading ticket...</p>
        </div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">😕</div>
          <p className="text-sm text-red-300 mb-4">{error || "Ticket not found"}</p>
          <Link href="/log" className="text-xs px-4 py-2 rounded-xl font-semibold" style={{ background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
            ← Back to Ticket Log
          </Link>
        </div>
      </div>
    );
  }

  const emoji = classEmoji[entry.classification] || "❓";
  const docBadge = docBadges[entry.docLevel] || docBadges.none;

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">{emoji}</div>
          <h2 className="text-2xl font-bold text-white">Here&apos;s your verdict</h2>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
            {entry.id} · {new Date(entry.timestamp).toLocaleString()}
          </p>
        </div>

        {/* Editable Title */}
        <div className="mb-5 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{ color: "rgba(255,255,255,0.3)" }}>
            Ticket Title
          </label>
          {editingTitle ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveTitle()}
                className="flex-1 px-4 py-3 rounded-xl text-base font-bold outline-none"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(99,102,241,0.5)", color: "white" }}
              />
              <button onClick={saveTitle} disabled={!titleInput.trim()} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: titleInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.05)", color: titleInput.trim() ? "white" : "rgba(255,255,255,0.25)" }}>
                Save
              </button>
              <button onClick={() => setEditingTitle(false)} className="px-2 py-2 rounded-xl text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-white flex-1">{entry.title || `Ticket #${entry.id.split("-").pop()?.toUpperCase() || entry.id}`}</p>
              <button
                onClick={() => { setEditingTitle(true); setTitleInput(entry.title || ""); }}
                className="text-xs px-2 py-0.5 rounded-lg shrink-0"
                style={{ color: "rgba(99,102,241,0.7)" }}
              >
                edit
              </button>
            </div>
          )}
        </div>

        {/* Classification & Severity */}
        <div className="rounded-2xl border border-white/10 p-5 mb-4" style={{ background: "rgba(255,255,255,0.07)" }}>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${classColors[entry.classification] || "bg-gray-100"}`}>{emoji} {entry.classification}</span>
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${sevColors[entry.severity] || "bg-gray-100"}`}>{entry.severity} Severity</span>
            {entry.specGapFlag && entry.classification !== "Spec Gap" && (
              <span className="px-3 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-800">🌫️ Spec Gap</span>
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${docBadge.color}`}>📂 {docBadge.label}</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{entry.summary}</p>
        </div>

        {/* Impact Scores */}
        <div className="rounded-2xl border border-white/10 p-5 mb-4" style={{ background: "rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>Impact Scores</p>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-white/80">User Impact</p>
              <ScoreBar score={Number(entry.userScore)} color="bg-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/80">Business Impact</p>
              <ScoreBar score={Number(entry.bizScore)} color="bg-indigo-400" />
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="rounded-2xl border border-white/10 p-5 mb-4" style={{ background: "rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Details</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            <span>🛣️ <strong className="text-white/80">Flow:</strong> {entry.flow}</span>
            <span>📍 <strong className="text-white/80">Location:</strong> {entry.location}</span>
            <span>📂 <strong className="text-white/80">Docs:</strong> {entry.docLevel}</span>
            {entry.confidence && <span>🎯 <strong className="text-white/80">Confidence:</strong> {entry.confidence}</span>}
            {entry.workaround && <span>🔧 <strong className="text-white/80">Workaround:</strong> {entry.workaround}</span>}
          </div>
        </div>

        {/* Jira Link */}
        <div className="rounded-2xl border border-white/10 p-5 mb-4" style={{ background: "rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Jira Link</p>
          {entry.jiraLink && !editingJira ? (
            <div className="flex items-center gap-2">
              <a href={entry.jiraLink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold truncate" style={{ color: "#a5b4fc" }}>
                🔗 {entry.jiraLink}
              </a>
              <button onClick={() => { setEditingJira(true); setJiraInput(entry.jiraLink); }} className="text-xs px-2 py-0.5 rounded-lg shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>edit</button>
            </div>
          ) : editingJira ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={jiraInput}
                onChange={e => setJiraInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveJira()}
                placeholder="https://jira.atlassian.net/browse/PROJ-123"
                className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold outline-none"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(99,102,241,0.5)", color: "white" }}
              />
              <button onClick={saveJira} disabled={!jiraInput.trim()} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: jiraInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.05)", color: jiraInput.trim() ? "white" : "rgba(255,255,255,0.25)" }}>Save</button>
              <button onClick={() => { setEditingJira(false); setJiraInput(""); }} className="px-2 py-2 rounded-xl text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>✕</button>
            </div>
          ) : (
            <button onClick={() => { setEditingJira(true); setJiraInput(""); }} className="text-xs font-semibold" style={{ color: "rgba(99,102,241,0.7)" }}>+ Add Jira link</button>
          )}
        </div>

        {/* Back to log */}
        <Link href="/log" className="block mt-4 w-full py-3 rounded-2xl font-semibold text-sm border text-center" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
          ← Back to Ticket Log
        </Link>
      </div>
    </div>
  );
}
