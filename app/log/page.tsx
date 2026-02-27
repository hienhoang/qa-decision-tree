"use client";

import { useState, useEffect, useCallback } from "react";
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

export default function LogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [jiraInput, setJiraInput] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 20;
  const CACHE_KEY = "ticket-log-cache";
  const CACHE_MAX_AGE_MS = 60_000; // 1 min

  const fetchEntries = useCallback(async (showCachedFirst = true) => {
    if (showCachedFirst && typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { entries: cachedEntries, ts } = JSON.parse(cached);
          if (cachedEntries?.length >= 0 && ts && Date.now() - ts < CACHE_MAX_AGE_MS) {
            setEntries(cachedEntries); // stored as newest-first
            setLoading(false);
          }
        }
      } catch { /* ignore stale cache */ }
    }
    try {
      const res = await fetch("/api/log");
      const data = await res.json();
      if (data.entries) {
        const newestFirst = [...data.entries].reverse();
        setEntries(newestFirst);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ entries: newestFirst, ts: Date.now() }));
        }
      } else if (data.error) {
        setError(data.error + (data.raw ? ` — ${data.raw}` : ""));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleAddJiraLink = async (id: string) => {
    if (!jiraInput.trim()) return;
    try {
      await fetch("/api/log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, jiraLink: jiraInput.trim() }),
      });
      setEditingId(null);
      setJiraInput("");
      fetchEntries(false);
    } catch (err) {
      console.error("Failed to update Jira link:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch("/api/log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDeletingId(null);
      fetchEntries(false);
    } catch (err) {
      console.error("Failed to delete entry:", err);
    }
  };

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">📋 Ticket Log</h1>
            <p className="text-sm mt-1" style={{ color: "rgba(165,180,252,0.6)" }}>
              View, link, and manage classified issues
            </p>
          </div>
          {process.env.NEXT_PUBLIC_SHEET_LINK && (
            <a
              href={process.env.NEXT_PUBLIC_SHEET_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all shrink-0"
              style={{ background: "rgba(34,197,94,0.15)", color: "#86efac", border: "1px solid rgba(34,197,94,0.3)" }}
            >
              📊 Open Spreadsheet ↗
            </a>
          )}
        </div>

        {loading && (
          <div className="text-center py-20">
            <div className="text-2xl mb-2 animate-pulse">⏳</div>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Loading entries...</p>
          </div>
        )}

        {error && (
          <div className="rounded-2xl p-4 mb-4" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-center py-20 rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="text-4xl mb-3">🗂️</div>
            <p className="text-sm font-semibold text-white/60">No entries yet</p>
            <p className="text-xs mt-1 text-white/30">Classify an issue to see it here</p>
          </div>
        )}

        <div className="space-y-3">
          {entries.slice((page - 1) * perPage, page * perPage).map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-white/10 transition-all"
                style={{ background: "rgba(255,255,255,0.07)" }}
              >
                {/* Card header */}
                <div className="p-5 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${classColors[entry.classification] || "bg-gray-100 text-gray-800"}`}>
                        {classEmoji[entry.classification] || "❓"} {entry.classification}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${sevColors[entry.severity] || "bg-gray-100"}`}>
                        {entry.severity}
                      </span>
                      {entry.specGapFlag && entry.classification !== "Spec Gap" && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">🌫️ Spec Gap</span>
                      )}
                    </div>
                    <Link
                      href={`/ticket/${encodeURIComponent(entry.id)}`}
                      className="text-base font-bold text-white hover:text-indigo-300 transition-colors mb-1 truncate block"
                    >
                      {entry.title || `Ticket #${entry.id.split("-").pop()?.toUpperCase() || entry.id}`}
                    </Link>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                      <span>📍 {entry.location}</span>
                      <span>🕐 {new Date(entry.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="shrink-0 text-white/30 text-sm mt-1 transition-transform px-1 py-1"
                    style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
                  >
                    ▼
                  </button>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 pt-4 pb-5 space-y-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    {/* Details */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Details</p>
                      <p className="text-sm text-white/70 mb-2">{entry.summary}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                        <span>🛣️ {entry.flow}</span>
                        <span>📍 {entry.location}</span>
                        <span>👤 User Impact: {entry.userScore}/5</span>
                        <span>💼 Biz Impact: {entry.bizScore}/5</span>
                        <span>📂 Docs: {entry.docLevel}</span>
                        {entry.confidence && <span>🎯 {entry.confidence}</span>}
                        {entry.workaround && <span>🔧 {entry.workaround}</span>}
                      </div>
                    </div>

                    {/* Jira Link */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Jira Link</p>
                      {entry.jiraLink ? (
                        <div className="flex items-center gap-2">
                          <a
                            href={entry.jiraLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold truncate"
                            style={{ color: "#a5b4fc" }}
                          >
                            🔗 {entry.jiraLink}
                          </a>
                          <button
                            onClick={() => { setEditingId(entry.id); setJiraInput(entry.jiraLink); }}
                            className="text-xs px-2 py-0.5 rounded-lg shrink-0"
                            style={{ color: "rgba(255,255,255,0.3)" }}
                          >
                            edit
                          </button>
                        </div>
                      ) : editingId === entry.id ? null : (
                        <button
                          onClick={() => { setEditingId(entry.id); setJiraInput(""); }}
                          className="text-xs font-semibold transition-all"
                          style={{ color: "rgba(99,102,241,0.7)" }}
                        >
                          + Add Jira link
                        </button>
                      )}

                      {editingId === entry.id && (
                        <div className="flex gap-2 mt-2">
                          <input
                            autoFocus
                            value={jiraInput}
                            onChange={e => setJiraInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleAddJiraLink(entry.id)}
                            placeholder="https://jira.atlassian.net/browse/PROJ-123"
                            className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold outline-none"
                            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(99,102,241,0.5)", color: "white" }}
                          />
                          <button
                            onClick={() => handleAddJiraLink(entry.id)}
                            disabled={!jiraInput.trim()}
                            className="px-3 py-2 rounded-xl text-xs font-bold"
                            style={{ background: jiraInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.05)", color: jiraInput.trim() ? "white" : "rgba(255,255,255,0.25)" }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setJiraInput(""); }}
                            className="px-2 py-2 rounded-xl text-xs"
                            style={{ color: "rgba(255,255,255,0.4)" }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {deletingId === entry.id ? (
                        <>
                          <p className="text-xs text-red-300 flex-1">Delete this entry?</p>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs"
                            style={{ color: "rgba(255,255,255,0.4)" }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeletingId(entry.id)}
                          className="text-xs px-2 py-1 rounded-lg transition-all"
                          style={{ color: "rgba(239,68,68,0.6)" }}
                          onMouseEnter={e => e.currentTarget.style.color = "rgba(239,68,68,1)"}
                          onMouseLeave={e => e.currentTarget.style.color = "rgba(239,68,68,0.6)"}
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {entries.length > perPage && (
          <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              onClick={() => { setPage(p => p - 1); setExpandedId(null); }}
              disabled={page <= 1}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: page > 1 ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
                color: page > 1 ? "#a5b4fc" : "rgba(255,255,255,0.15)",
                border: `1px solid ${page > 1 ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}`,
                cursor: page > 1 ? "pointer" : "not-allowed",
              }}
            >
              ← Previous
            </button>
            <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
              Page {page} of {Math.ceil(entries.length / perPage)} · {entries.length} tickets
            </p>
            <button
              onClick={() => { setPage(p => p + 1); setExpandedId(null); }}
              disabled={page >= Math.ceil(entries.length / perPage)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: page < Math.ceil(entries.length / perPage) ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
                color: page < Math.ceil(entries.length / perPage) ? "#a5b4fc" : "rgba(255,255,255,0.15)",
                border: `1px solid ${page < Math.ceil(entries.length / perPage) ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}`,
                cursor: page < Math.ceil(entries.length / perPage) ? "pointer" : "not-allowed",
              }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
