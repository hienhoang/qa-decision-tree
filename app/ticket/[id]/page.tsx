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
  jiraTicket?: string;
  reasoning?: string;
  severityExplanation?: string;
  opinionFlag?: boolean;
  opinionNote?: string;
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
const USER_IMPACT_LABELS: Record<number, string> = {
  5: "User cannot complete their task at all",
  4: "User can complete it but the experience is painful",
  3: "User is unsure what happened or what to do next",
  2: "User notices but moves on quickly",
  1: "Unlikely to change user behavior",
};
const BIZ_IMPACT_LABELS: Record<number, string> = {
  5: "Could directly cause drop-off or failed conversions",
  4: "Could cause users to lose trust or churn",
  3: "Visible to customers in a way that reflects poorly",
  2: "Creates friction for the team, not users",
  1: "Unlikely to move any needle if left unfixed",
};
const NEXT_STEPS: Record<string, { steps: string[]; critical?: string; warning?: string; color: string; icon: string }> = {
  Bug: { steps: ["Copy ticket draft.", "Eng Jira board → Backlog.", "Paste, set type Bug + severity.", "Leave unassigned for eng lead."], critical: "⚠️ Critical: Post in Slack + tag eng lead.", color: "border-red-200 bg-red-50", icon: "🐛" },
  "UX Improvement": { steps: ["Copy ticket draft.", "Design Jira board → Backlog.", "Labels: ux-improvements, needs-design.", "Add needs-product if needed."], color: "border-purple-200 bg-purple-50", icon: "✨" },
  "Feature Request": { steps: ["Copy ticket draft.", "Design Jira board → Backlog.", "Labels: feature-request, needs-product, needs-design."], color: "border-blue-200 bg-blue-50", icon: "💡" },
  "Spec Gap": { steps: ["Don't file a Jira ticket yet.", "Post in shared Slack channel.", "Tag PM + designer together.", "Wait for alignment first."], warning: "Filing before alignment creates noise.", color: "border-yellow-200 bg-yellow-50", icon: "🌫️" },
};
const accentHex: Record<string, string> = { Bug: "#ef4444", "UX Improvement": "#a855f7", "Feature Request": "#3b82f6", "Spec Gap": "#eab308", default: "#6366f1" };

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

function buildTicketFromEntry(entry: LogEntry): string {
  const flow = (entry.flow || "Not specified").replace(/^\S+\s/, "").trim();
  const location = (entry.location || "Not specified").replace(/^\S+\s/, "").trim();
  const docLabel = { none: "None", partial: "Partial", full: "Full" }[entry.docLevel] || "Unknown";
  const isCore = flow.toLowerCase().includes("core");
  const flowLabel = isCore ? "Core" : flow.toLowerCase().includes("edge") ? "Edge Case" : "Supporting";
  const specFlag = entry.specGapFlag ? "Yes" : "No";
  const workaroundText = (entry.workaround || "").toLowerCase().includes("none") ? "None" : (entry.workaround || "").toLowerCase().includes("clunky") ? "Clunky workaround exists — see notes" : "Simple workaround exists";

  const header = [
    `SUMMARY: [${entry.classification}] ${entry.summary || entry.classification} in ${location} — ${flowLabel} flow`,
    `TYPE: ${entry.classification}`,
    `SEVERITY: ${entry.severity}`,
    `USER IMPACT: ${entry.userScore}/5 — ${USER_IMPACT_LABELS[entry.userScore]}`,
    `BUSINESS IMPACT: ${entry.bizScore}/5 — ${BIZ_IMPACT_LABELS[entry.bizScore]}`,
    `FLOW: ${flowLabel}`,
    `LOCATION: ${location}`,
    `SPEC GAP FLAG: ${specFlag}`,
    `DOC LEVEL: ${docLabel}`,
  ].join("\n");

  return [
    header,
    "\n",
    `DESCRIPTION:`,
    entry.summary || `Issue observed in ${location} during a ${flowLabel.toLowerCase()} flow.`,
    "\n",
    `WORKAROUND: ${workaroundText}`,
    `SCOPE: Not specified`,
    "\n",
    `NOTES:`,
    `Confidence: ${entry.confidence || "Not specified"}. Documentation level: ${docLabel}.${specFlag === "Yes" ? " Spec gap flagged — needs product/design input before action." : ""}`,
  ].join("\n");
}

function deriveSeverityExplanation(severity: string, entry: LogEntry): string {
  const workaround = (entry.workaround || "").toLowerCase();
  const flow = (entry.flow || "").toLowerCase();
  if (severity === "Critical" && workaround.includes("none") && flow.includes("core")) return "There's no workaround and this sits in a core flow — users are stuck with no way around it.";
  if (severity === "Critical") return "The combination of user impact, business risk, and limited workaround pushes this to the top of the pile.";
  if (severity === "High") return "High user impact combined with meaningful business risk makes this worth prioritizing this sprint.";
  if (severity === "Medium") return "The impact is real but not critical. This belongs in the backlog with a clear plan to address it.";
  if (severity === "Low") return "Worth fixing eventually, but this shouldn't displace higher-priority work.";
  return "";
}

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;
  const [entry, setEntry] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"result" | "ticket" | "details">("result");
  const [editingJira, setEditingJira] = useState(false);
  const [jiraInput, setJiraInput] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchEntry = useCallback(async () => {
    try {
      const res = await fetch("/api/log");
      const data = await res.json();
      if (data.entries) {
        const found = data.entries.find((e: LogEntry) => e.id === decodeURIComponent(ticketId));
        if (found) {
          setEntry(found);
        } else {
          setError("Ticket not found.");
        }
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

  const copyTicket = () => {
    if (!entry) return;
    const text = entry.jiraTicket || buildTicketFromEntry(entry);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <Link href="/log" className="text-xs px-3 py-1.5 rounded-full font-semibold" style={{ background: "rgba(99,102,241,0.25)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.5)" }}>← Back to Ticket Log</Link>
        </div>
      </div>
    );
  }

  const emoji = classEmoji[entry.classification] || "❓";
  const docBadge = docBadges[entry.docLevel] || docBadges.none;
  const userScore = Number(entry.userScore);
  const bizScore = Number(entry.bizScore);
  const ns = NEXT_STEPS[entry.classification] || NEXT_STEPS["Spec Gap"];
  const accent = accentHex[entry.classification] || accentHex.default;
  const reasoning = entry.reasoning ?? entry.summary;
  const severityExplanation = entry.severityExplanation ?? deriveSeverityExplanation(entry.severity, entry);
  const jiraTicket = entry.jiraTicket || buildTicketFromEntry(entry);

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header — same as verdict */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">{emoji}</div>
          <h2 className="text-2xl font-bold text-white">Here&apos;s your verdict</h2>
          <p className="text-sm mt-1" style={{ color: "rgba(165,180,252,0.6)" }}>Ticket written. Zero typing required.</p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
            {entry.id} · {new Date(entry.timestamp).toLocaleString()}
          </p>
        </div>

        {/* Tabs — same style as verdict */}
        <div className="flex gap-2 mb-5 rounded-2xl p-1.5" style={{ background: "rgba(255,255,255,0.07)" }}>
          {(["result", "ticket", "details"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${tab === t ? "bg-white text-gray-900 shadow" : "text-white/50 hover:text-white"}`}>
              {t === "result" ? "📊 Result" : t === "ticket" ? "📋 Ticket" : "📋 Details"}
            </button>
          ))}
        </div>

        {/* Result tab — same layout as main page verdict */}
        {tab === "result" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${classColors[entry.classification] || "bg-gray-100 text-gray-800"}`}>{emoji} {entry.classification}</span>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${sevColors[entry.severity] || "bg-gray-100"}`}>{entry.severity} Severity</span>
                {severityExplanation && (
                  <p className="w-full text-xs mt-2 mb-1" style={{ color: "rgba(255,255,255,0.45)" }}>{severityExplanation}</p>
                )}
                {entry.specGapFlag && entry.classification !== "Spec Gap" && (
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-800">🌫️ Spec Gap</span>
                )}
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${docBadge.color}`}>📂 {docBadge.label}</span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{reasoning}</p>
            </div>
            <div className="rounded-2xl border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>Impact Scores</p>
              <div className="space-y-4">
                <div><p className="text-sm font-semibold text-white/80">User Impact</p><ScoreBar score={userScore} color="bg-purple-400"/><p className="text-xs mt-1 text-white/50">{USER_IMPACT_LABELS[userScore]}</p></div>
                <div><p className="text-sm font-semibold text-white/80">Business Impact</p><ScoreBar score={bizScore} color="bg-indigo-400"/><p className="text-xs mt-1 text-white/50">{BIZ_IMPACT_LABELS[bizScore]}</p></div>
              </div>
            </div>
            {entry.opinionFlag && entry.opinionNote && (
              <div className="rounded-2xl p-4" style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)" }}>
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-1">🧠 Heads up</p>
                <p className="text-sm text-amber-200">{entry.opinionNote}</p>
              </div>
            )}
            <div className={`rounded-2xl border p-5 ${ns.color}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{ns.icon} What to do next</p>
              <ol className="space-y-2">{ns.steps.map((s, i) => <li key={i} className="flex gap-3 text-sm text-gray-700"><span className="font-bold text-gray-400 shrink-0">{i + 1}.</span><span>{s}</span></li>)}</ol>
              {ns.critical && entry.severity === "Critical" && <div className="mt-3 bg-red-100 border border-red-300 rounded-xl p-3 text-sm text-red-800 font-medium">{ns.critical}</div>}
              {ns.warning && <div className="mt-3 bg-yellow-100 border border-yellow-300 rounded-xl p-3 text-sm text-yellow-800 font-medium">⚠️ {ns.warning}</div>}
            </div>
          </div>
        )}

        {/* Ticket tab — same as main page */}
        {tab === "ticket" && (
          <div className="rounded-2xl border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Jira Ticket Draft</p>
              <button onClick={copyTicket} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}>{copied ? "✅ Copied!" : "Copy"}</button>
            </div>
            <pre className="text-xs whitespace-pre-wrap leading-relaxed rounded-xl p-5 overflow-auto max-h-96" style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>{jiraTicket}</pre>
          </div>
        )}

        {/* Details tab — flow, location, Jira link */}
        {tab === "details" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Info</p>
              <div className="space-y-2 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                <div className="flex gap-2"><span className="shrink-0">🛣️</span><span><strong className="text-white/80">Flow:</strong> {entry.flow}</span></div>
                <div className="flex gap-2"><span className="shrink-0">📍</span><span><strong className="text-white/80">Location:</strong> {entry.location}</span></div>
                <div className="flex gap-2"><span className="shrink-0">📂</span><span><strong className="text-white/80">Docs:</strong> {entry.docLevel}</span></div>
                {entry.confidence && <div className="flex gap-2"><span className="shrink-0">🎯</span><span><strong className="text-white/80">Confidence:</strong> {entry.confidence}</span></div>}
                {entry.workaround && <div className="flex gap-2"><span className="shrink-0">🔧</span><span><strong className="text-white/80">Workaround:</strong> {entry.workaround}</span></div>}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Jira Link</p>
              {entry.jiraLink && !editingJira ? (
                <div className="flex items-center gap-2">
                  <a href={entry.jiraLink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold truncate" style={{ color: "#a5b4fc" }}>🔗 {entry.jiraLink}</a>
                  <button onClick={() => { setEditingJira(true); setJiraInput(entry.jiraLink); }} className="text-xs px-2 py-0.5 rounded-lg shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>edit</button>
                </div>
              ) : editingJira ? (
                <div className="flex gap-2">
                  <input autoFocus value={jiraInput} onChange={e => setJiraInput(e.target.value)} onKeyDown={e => e.key === "Enter" && saveJira()} placeholder="https://jira.atlassian.net/browse/PROJ-123" className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold outline-none" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(99,102,241,0.5)", color: "white" }} />
                  <button onClick={saveJira} disabled={!jiraInput.trim()} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: jiraInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.05)", color: jiraInput.trim() ? "white" : "rgba(255,255,255,0.25)" }}>Save</button>
                  <button onClick={() => { setEditingJira(false); setJiraInput(""); }} className="px-2 py-2 rounded-xl text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>✕</button>
                </div>
              ) : (
                <button onClick={() => { setEditingJira(true); setJiraInput(""); }} className="text-xs font-semibold" style={{ color: "rgba(99,102,241,0.7)" }}>+ Add Jira link</button>
              )}
            </div>
          </div>
        )}

        <Link href="/log" className="mt-4 w-full py-3 rounded-2xl font-bold text-sm transition-all block text-center" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }}>← Back to Ticket Log</Link>
      </div>
    </div>
  );
}
