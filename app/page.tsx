"use client";

import { useState, useRef, useEffect } from "react";

// ── Doc context ───────────────────────────────────────────────────────────
const DOC_OPTIONS = [
  { id: "none",    label: "No docs exist",        emoji: "🕳️", desc: "No spec, no design, no planning doc",          color: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)",  text: "#fca5a5" },
  { id: "partial", label: "Some context exists",  emoji: "🤔", desc: "Something's there but incomplete or outdated", color: "rgba(234,179,8,0.15)",  border: "rgba(234,179,8,0.4)",   text: "#fde68a" },
  { id: "full",    label: "Docs cover this area", emoji: "✅", desc: "Figma, spec, or planning doc exists for this", color: "rgba(99,102,241,0.2)",  border: "rgba(99,102,241,0.5)",  text: "#a5b4fc" },
];

// ── Classification rules ──────────────────────────────────────────────────
const RULES: { classification: string; test: (a: Record<string, string>, doc?: string) => boolean }[] = [
  { classification: "Spec Gap",        test: (a, doc) => doc === "none" && ["feels_how","start"].some(k => a[k]?.includes("feels wrong") || a[k]?.includes("don't know") || a[k]?.includes("no idea") || a["start"]?.includes("No idea")) },
  { classification: "Spec Gap",        test: (a) => !!(a["decision"]?.includes("Never defined") || a["decision"]?.includes("Don't know") || a["spec_gap"] != null || a["partial_decision"]?.includes("ambiguous") || a["partial_decision"]?.includes("not covered")) },
  { classification: "Feature Request", test: (a) => !!(a["start"]?.includes("missing a capability") || a["start"]?.includes("Missing") || a["feature"]?.includes("Brand new")) },
  { classification: "Bug",             test: (a) => !!(a["broke_how"] != null || a["broke"] != null || a["frequency"] != null) },
  { classification: "UX Improvement",  test: (a) => !!(a["feels_off"] != null || a["feels_how"] != null) },
  { classification: "Spec Gap",        test: () => true },
];

function deriveClassification(answers: Record<string, string>, docLevel: string) {
  for (const rule of RULES) {
    if (rule.test(answers, docLevel)) return rule.classification;
  }
  return "Spec Gap";
}

// ── Scoring maps ──────────────────────────────────────────────────────────
const USER_IMPACT_SCORES: Record<string, number> = {
  "Blocked completely": 5, "🚧 Blocked completely": 5,
  "Frustrated":         4, "😤 Frustrated": 4,
  "Confused":           3, "😕 Confused": 3,
  "Minor":              2, "🙂 Minor": 2,
  "Cosmetic only":      1, "💅 Cosmetic only": 1,
};
const USER_IMPACT_LABELS: Record<number, string> = {
  5: "User cannot complete their task at all",
  4: "User can complete it but the experience is painful",
  3: "User is unsure what happened or what to do next",
  2: "User notices but moves on quickly",
  1: "Unlikely to change user behavior",
};
const BIZ_IMPACT_SCORES: Record<string, number> = {
  "Revenue":          5, "💸 Revenue": 5,
  "Retention":        4, "📉 Retention": 4,
  "Reputation":       3, "👁️ Reputation": 3,
  "Internal friction":2, "⚙️ Internal friction": 2,
  "Low risk":         1, "🟢 Low risk": 1,
};
const BIZ_IMPACT_LABELS: Record<number, string> = {
  5: "Could directly cause drop-off or failed conversions",
  4: "Could cause users to lose trust or churn",
  3: "Visible to customers in a way that reflects poorly",
  2: "Creates friction for the team, not users",
  1: "Unlikely to move any needle if left unfixed",
};

function scoreUserImpact(answers: Record<string, string>) {
  const val = answers["user_impact"] || "";
  for (const [k, v] of Object.entries(USER_IMPACT_SCORES)) { if (val.includes(k.replace(/^\S+\s/,""))) return v; }
  return 3;
}
function scoreBizImpact(answers: Record<string, string>) {
  const val = answers["biz_impact"] || "";
  for (const [k, v] of Object.entries(BIZ_IMPACT_SCORES)) { if (val.includes(k.replace(/^\S+\s/,""))) return v; }
  return 2;
}

function deriveSeverity(userScore: number, bizScore: number, answers: Record<string, string>) {
  const hasWorkaround = answers["workaround"]?.includes("Easy one");
  const noWorkaround  = answers["workaround"]?.includes("None");
  const isCore        = answers["flow"]?.includes("Core");
  const isEdge        = answers["flow"]?.includes("Edge");

  if (userScore === 5 && bizScore >= 4 && noWorkaround) return "Critical";
  if (userScore === 5 && isCore) return "Critical";
  if (userScore >= 4 && bizScore >= 4) return "High";
  if (userScore >= 4 && isEdge) return "High";
  if (userScore >= 3 && bizScore >= 3 && !hasWorkaround) return "High";
  if (userScore >= 3) return "Medium";
  if (userScore <= 2 && bizScore <= 2) return "Low";
  return "Medium";
}

// ── Rich reasoning library ────────────────────────────────────────────────
const REASONING: Record<string, Record<string, unknown>> = {
  Bug: {
    openers: {
      "Crash / error / blank screen": "The product is throwing an error where it shouldn't — this is a clear functional failure, not a matter of interpretation.",
      "Wrong data / output":          "Something is producing incorrect output. Whether it's a calculation, a display, or a data fetch, the result isn't what it should be.",
      "Action does nothing":          "The user triggered an action and nothing happened. That's a broken contract between the UI and the system.",
      "Regression":                   "This used to work and now it doesn't — which means something changed that broke it. Regressions tend to have a specific cause worth finding.",
      "Worked before, broken now":    "This used to work and now it doesn't — which means something changed that broke it. Regressions tend to have a specific cause worth finding.",
      default:                        "The product is failing to do what it's supposed to do. Regardless of spec, something is objectively broken here.",
    } as Record<string, string>,
    freq: {
      "Every time": "It's consistently reproducible, which makes it easier to diagnose and harder to ignore.",
      "Intermittent": "It's intermittent — which can make it tricky to reproduce, but doesn't make it less real.",
      "Once so far": "It's only happened once so far, so treat this as a signal worth watching rather than an emergency.",
    } as Record<string, string>,
    docNone:    "There's no spec for this area, but a functional failure is a functional failure — it doesn't need a design doc to be a bug.",
    docPartial: "The documentation is incomplete, but functional failures like this don't require a spec to classify.",
  },
  "UX Improvement": {
    openers: {
      "Looks wrong":              "The visual execution doesn't match what a user would expect. Layout, spacing, or color is off in a way that affects perceived quality.",
      "Looks off — visual / layout": "The visual execution doesn't match what a user would expect. Layout, spacing, or color is off in a way that affects perceived quality.",
      "Confusing":                "The user didn't know what to do next — that's a navigation or communication failure, even if nothing is technically broken.",
      "Confusing to navigate":    "The user didn't know what to do next — that's a navigation or communication failure, even if nothing is technically broken.",
      "Clunky / friction":        "The task is completable, but it takes more effort than it should. Friction like this compounds over repeated use.",
      "Too many steps / friction":"The task is completable, but it takes more effort than it should. Friction like this compounds over repeated use.",
      "Behavior wrong":           "The behavior exists, but it feels like a mistake — not a missing feature, but a wrong decision that's already been shipped.",
      "Behavior seems like a mistake": "The behavior exists, but it feels like a mistake — not a missing feature, but a wrong decision that's already been shipped.",
      default:                    "The product works, but the experience isn't right. This is worth fixing even if nothing is technically broken.",
    } as Record<string, string>,
    opinionNote: {
      preference: "Worth noting: the reporter flagged this as a personal preference. That doesn't make it invalid, but it's worth a second opinion before prioritizing.",
      unsure:     "The reporter isn't sure others would notice this. Consider whether it's consistent with broader usability patterns before escalating.",
      default:    "",
    } as Record<string, string>,
    docNone:    "Without a spec it's hard to say what 'correct' looks like — but this is clearly a UX judgment call, not a functional failure.",
    docPartial: "The available documentation doesn't fully cover this area, so some of this assessment is inferred rather than spec-backed.",
  },
  "Feature Request": {
    openers: {
      "Brand new idea":              "This is net-new — the product was never designed to do this. Whether it's worth building is a product conversation.",
      "Should exist but doesn't":    "The user expects this to exist based on how the rest of the product works. It's not documented, but the gap is obvious enough that it reads as a missing feature.",
      default:                       "The product doesn't currently support this. It's not broken — it's just not there yet.",
    } as Record<string, string>,
    docNone:    "There's no spec for this area, so it's hard to know if this was ever considered. File it and let the PM decide.",
    docPartial: "The partial documentation doesn't address this capability. It may have been out of scope or just never defined.",
  },
  "Spec Gap": {
    openers: {
      none:    "There's no documentation, no design, and no defined behavior for this area. Before anyone fixes or files anything, the team needs to decide what 'correct' looks like.",
      partial: "The documentation that exists doesn't cover this. It's ambiguous enough that classifying it as a bug or UX issue would be a guess.",
      full:    "Even with documentation available, this area wasn't covered. That's a spec gap — the behavior can't be evaluated without knowing what was intended.",
      default: "Expected behavior here was never defined. This needs a product decision before it can be classified, prioritized, or fixed.",
    } as Record<string, string>,
    discussed: {
      "Discussed but unresolved": "It's come up before but nothing was decided — which means the ambiguity is known. Now's a good time to close it.",
      "Never discussed":          "This has never been discussed at all, which means the team may not even know it's undefined.",
      default:                    "",
    } as Record<string, string>,
  },
};

function deriveReasoning(classification: string, answers: Record<string, string>, docLevel: string) {
  const strip   = (s: string) => (s || "").replace(/^\S+\s/, "").trim();
  const broke   = strip(answers["broke_how"] || answers["broke"] || "");
  const feels   = strip(answers["feels_how"] || answers["feels_off"] || "");
  const freq    = strip(answers["frequency"] || "");
  const scope   = strip(answers["scope"] || "");
  const opinion = answers["opinion"] || "";
  const discussed = strip(answers["spec_gap"] || "");

  const sentences: string[] = [];

  if (classification === "Bug") {
    const R = REASONING.Bug;
    const openers = R.openers as Record<string, string>;
    const freqMap = R.freq as Record<string, string>;
    sentences.push(openers[broke] || openers.default);
    if (freq && freqMap[freq]) sentences.push(freqMap[freq]);
    if (docLevel === "none")    sentences.push(R.docNone as string);
    if (docLevel === "partial") sentences.push(R.docPartial as string);
  } else if (classification === "UX Improvement") {
    const R = REASONING["UX Improvement"];
    const openers = R.openers as Record<string, string>;
    const opinionNote = R.opinionNote as Record<string, string>;
    sentences.push(openers[feels] || openers.default);
    if (docLevel === "none")    sentences.push(R.docNone as string);
    if (docLevel === "partial") sentences.push(R.docPartial as string);
    const note = opinion.includes("preference") ? opinionNote.preference : opinion.includes("unsure") ? opinionNote.unsure : "";
    if (note) sentences.push(note);
  } else if (classification === "Feature Request") {
    const R = REASONING["Feature Request"];
    const openers = R.openers as Record<string, string>;
    const start = strip(answers["start"] || answers["feature"] || "");
    sentences.push(openers[start] || openers.default);
    if (docLevel === "none")    sentences.push(R.docNone as string);
    if (docLevel === "partial") sentences.push(R.docPartial as string);
  } else if (classification === "Spec Gap") {
    const R = REASONING["Spec Gap"];
    const openers = R.openers as Record<string, string>;
    const discussedMap = R.discussed as Record<string, string>;
    sentences.push(openers[docLevel] || openers.default);
    const disc = discussedMap[discussed];
    if (disc) sentences.push(disc);
  }

  if (scope && classification !== "Spec Gap") {
    const scopeMap: Record<string, string> = {
      "All users":        "This affects everyone — prioritize accordingly.",
      "Most users":       "Most users will encounter this, so the blast radius is significant.",
      "Specific segment": "It's scoped to a specific segment, which limits impact but doesn't eliminate urgency.",
      "Just me":          "Only the reporter has seen it so far — worth tracking before escalating.",
    };
    if (scopeMap[scope]) sentences.push(scopeMap[scope]);
  }

  return sentences.join(" ");
}

// ── Severity explanation ──────────────────────────────────────────────────
const SEVERITY_EXPLANATIONS: Record<string, ((a: Record<string, string>) => string | null)[]> = {
  Critical: [
    (a) => a["workaround"]?.includes("None") && a["flow"]?.includes("Core") ? "There's no workaround and this sits in a core flow — users are stuck with no way around it." : null,
    (a) => a["user_impact"]?.includes("Blocked") && a["biz_impact"]?.includes("Revenue") ? "Users can't complete their task and it's on a revenue-critical path. That's as bad as it gets." : null,
    () => "The combination of user impact, business risk, and limited workaround pushes this to the top of the pile.",
  ],
  High: [
    (a) => a["user_impact"]?.includes("Frustrated") && a["biz_impact"]?.includes("Retention") ? "Users can get through it, but the friction is real enough to affect whether they come back." : null,
    (a) => a["user_impact"]?.includes("Blocked") && a["flow"]?.includes("Edge") ? "Even though it's an edge case, users who hit it are completely blocked — that's a high-severity experience." : null,
    () => "High user impact combined with meaningful business risk makes this worth prioritizing this sprint.",
  ],
  Medium: [
    (a) => a["workaround"]?.includes("Easy") ? "There's an easy workaround, which softens the urgency — but this still needs to be fixed." : null,
    (a) => a["user_impact"]?.includes("Confused") ? "Users are confused but not blocked. Confusion compounds over time and erodes trust, so don't let this sit forever." : null,
    () => "The impact is real but not critical. This belongs in the backlog with a clear plan to address it.",
  ],
  Low: [
    (a) => a["user_impact"]?.includes("Cosmetic") ? "This is cosmetic — it won't change what users do, but it affects polish and perceived quality." : null,
    (a) => a["biz_impact"]?.includes("Low risk") ? "Low business risk and low user impact. Fix it when the opportunity arises, not before." : null,
    () => "Worth fixing eventually, but this shouldn't displace higher-priority work.",
  ],
};

function deriveSeverityExplanation(severity: string, answers: Record<string, string>) {
  const candidates = SEVERITY_EXPLANATIONS[severity] || [];
  for (const fn of candidates) {
    const result = fn(answers);
    if (result) return result;
  }
  return candidates[candidates.length - 1]?.(answers) || "";
}

function deriveFlags(answers: Record<string, string>, docLevel: string) {
  const opinionFlag = !!(answers["opinion"]?.includes("preference") || answers["opinion"]?.includes("unsure others"));
  const opinionNote = opinionFlag ? "The reporter flagged this may be their own preference. Consider validating with another user before prioritizing." : "";
  const specGapFlag = !!(answers["decision"]?.includes("Never defined") || answers["decision"]?.includes("Don't know") || answers["partial_decision"]?.includes("not covered") || answers["partial_decision"]?.includes("ambiguous") || docLevel === "none");
  return { opinionFlag, opinionNote, specGapFlag };
}

function resolveLocation(answers: Record<string, string>) {
  const strip = (s: string) => (s || "").replace(/^\S+\s/, "").trim();
  const keys = ["location_ballot_feature","location_vg","location_global","location_other","location_ballot","location"];
  for (const k of keys) {
    const v = strip(answers[k] || "");
    if (v) return v;
  }
  return "Not specified";
}

function buildTicket(classification: string, severity: string, userScore: number, bizScore: number, answers: Record<string, string>, docLevel: string) {
  const strip     = (s: string) => (s || "").replace(/^\S+\s/, "").trim();
  const flow      = strip(answers["flow"]      || "Not specified");
  const location  = resolveLocation(answers);
  const freq      = strip(answers["frequency"] || "Not specified");
  const scope     = strip(answers["scope"]     || "Not specified");
  const workaround= strip(answers["workaround"]|| "Not specified");
  const confidence= strip(answers["confidence"]|| "Not specified");
  const broke     = strip(answers["broke_how"] || answers["broke"] || "");
  const feelsHow  = strip(answers["feels_how"] || answers["feels_off"] || "");
  const docLabel  = { none: "None", partial: "Partial", full: "Full" }[docLevel] || "Unknown";
  const opinion   = strip(answers["opinion"] || "");
  const discussed = strip(answers["spec_gap"] || "");

  const isCore    = flow.toLowerCase().includes("core");
  const flowLabel = isCore ? "Core" : flow.toLowerCase().includes("edge") ? "Edge Case" : "Supporting";
  const specFlag  = deriveFlags(answers, docLevel).specGapFlag ? "Yes" : "No";
  const workaroundText = workaround.toLowerCase().includes("none") ? "None" : workaround.toLowerCase().includes("clunky") ? "Clunky workaround exists — see notes" : "Simple workaround exists";

  const header = [
    `SUMMARY: [${classification}] ${broke || feelsHow || classification} in ${location} — ${flowLabel} flow`,
    `TYPE: ${classification}`,
    `SEVERITY: ${severity}`,
    `USER IMPACT: ${userScore}/5 — ${USER_IMPACT_LABELS[userScore]}`,
    `BUSINESS IMPACT: ${bizScore}/5 — ${BIZ_IMPACT_LABELS[bizScore]}`,
    `FLOW: ${flowLabel}`,
    `LOCATION: ${location}`,
    `SPEC GAP FLAG: ${specFlag}`,
    `DOC LEVEL: ${docLabel}`,
  ].join("\n");

  if (classification === "Bug") {
    return [
      header,
      ``,
      `DESCRIPTION:`,
      `A ${broke.toLowerCase() || "functional failure"} was observed in ${location} during a ${flowLabel.toLowerCase()} flow.`,
      `The issue occurs ${freq.toLowerCase()} and affects ${scope.toLowerCase()}.`,
      ``,
      `STEPS TO REPRODUCE:`,
      `1. Navigate to ${location}`,
      `2. Perform the action that triggers the issue`,
      `3. Observe: ${broke.toLowerCase() || "unexpected behavior occurs"}`,
      ``,
      `EXPECTED BEHAVIOR:`,
      `The product should complete the action without error or unexpected behavior.`,
      ``,
      `ACTUAL BEHAVIOR:`,
      broke ? `${broke} occurred.` : `The product failed to behave as expected.`,
      ``,
      `FREQUENCY: ${freq}`,
      `WORKAROUND: ${workaroundText}`,
      `SCOPE: ${scope}`,
      ``,
      `ENVIRONMENT:`,
      `Browser: [fill in]`,
      `Device: [fill in]`,
      `URL: [fill in]`,
      ``,
      `NOTES:`,
      `Confidence: ${confidence}. Documentation level: ${docLabel}.${specFlag === "Yes" ? " Spec gap flagged — needs product/design input before action." : ""}`,
    ].join("\n");
  }

  if (classification === "UX Improvement") {
    return [
      header,
      "\n",
      `USER STORY:`,
      `As a user navigating ${location}, I expect the experience to be intuitive,`,
      `but instead ${feelsHow.toLowerCase() || "something feels off"} — making the ${flowLabel.toLowerCase()} flow harder than it should be.`,
      "\n",
      `WHAT'S HAPPENING:`,
      `The ${location} exhibits a UX issue: ${feelsHow.toLowerCase() || "something feels wrong"}.`,
      `This is part of a ${flowLabel.toLowerCase()} flow and affects ${scope.toLowerCase()}.`,
      "\n",
      `STEPS TO OBSERVE:`,
      `1. Navigate to ${location}`,
      `2. Attempt to complete the relevant task`,
      `3. Observe: ${feelsHow.toLowerCase() || "experience issue"}`,
      "\n",
      `EXPECTED EXPERIENCE:`,
      `The experience should feel intuitive and match user expectations.`,
      "\n",
      `ACTUAL EXPERIENCE:`,
      feelsHow ? `The experience is ${feelsHow.toLowerCase()}.` : `The experience feels off.`,
      "\n",
      `WORKAROUND: ${workaroundText}`,
      `SCOPE: ${scope}`,
      opinion ? `OPINION NOTE: Reporter noted this may be ${opinion.toLowerCase()}.` : "",
      "\n",
      `NOTES:`,
      `Confidence: ${confidence}. Documentation level: ${docLabel}.${specFlag === "Yes" ? " Spec gap flagged — needs product/design input before action." : ""}`,
    ].filter(Boolean).join("\n");
  }

  if (classification === "Feature Request") {
    const featureType = strip(answers["feature"] || answers["start"] || "");
    return [
      header,
      "\n",
      `USER STORY:`,
      `As a user in the ${location} area, I need a capability that doesn't currently exist,`,
      `so that I can complete my task in the ${flowLabel.toLowerCase()} flow without a gap.`,
      "\n",
      `WHAT'S MISSING:`,
      `A new capability is needed that the product does not currently support.`,
      featureType ? `Type: ${featureType}.` : "",
      `This was identified in ${location} during a ${flowLabel.toLowerCase()} flow.`,
      "\n",
      `PROPOSED BEHAVIOR:`,
      `The product should support this capability. [PM/Design to define specifics]`,
      "\n",
      `SCOPE: ${scope}`,
      `WORKAROUND: ${workaroundText}`,
      "\n",
      `NOTES:`,
      `Confidence: ${confidence}. Documentation level: ${docLabel}.`,
    ].filter(Boolean).join("\n");
  }

  // Spec Gap
  return [
    header,
    "\n",
    `WHAT'S UNDEFINED:`,
    `Expected behavior for ${location} has not been defined.`,
    `Without a spec, this cannot be confidently classified, prioritized, or fixed.`,
    "\n",
    `WHY THIS IS A SPEC GAP:`,
    discussed === "Discussed but unresolved"
      ? `This has been discussed before but no decision was reached. The ambiguity is known.`
      : discussed === "Never discussed"
      ? `This has never been discussed — the team may not know it's undefined.`
      : `It's unclear whether this was ever considered. The behavior exists but has no defined intent.`,
    "\n",
    `CURRENT BEHAVIOR:`,
    `Behavior exists in ${location} but cannot be evaluated without a spec.`,
    feelsHow ? `Observation: ${feelsHow.toLowerCase()}.` : "",
    broke ? `Observation: ${broke.toLowerCase()}.` : "",
    "\n",
    `RECOMMENDED ACTION:`,
    `Do not file as a bug or UX issue yet. Bring to PM + Design for alignment first.`,
    "\n",
    `SCOPE: ${scope}`,
    `FLOW: ${flowLabel}`,
    "\n",
    `NOTES:`,
    `Confidence: ${confidence}. Documentation level: ${docLabel}. This needs a product decision before it can be acted on.`,
  ].filter(Boolean).join("\n");
}

// ── Decision tree nodes ───────────────────────────────────────────────────
interface TreeOption {
  label: string;
  emoji: string;
  next: string;
}

interface TreeNode {
  q: string;
  options?: TreeOption[];
  type?: string;
  next?: string;
}

const TAIL_NODES: Record<string, TreeNode> = {
  flow:        { q: "Which flow?",       options: [{ label: "Core flow", emoji: "🛣️", next: "location" },{ label: "Supporting flow", emoji: "🔀", next: "location" },{ label: "Edge case", emoji: "🌿", next: "location" },{ label: "Not sure", emoji: "🤷", next: "user_impact" }]},
  location:    { q: "Which area of the product?", options: [
    { label: "Ballot pages", emoji: "🗳️", next: "location_ballot" },
    { label: "Voter Guide pages", emoji: "📋", next: "location_vg" },
    { label: "Global elements", emoji: "🌐", next: "location_global" },
    { label: "Marketing Site", emoji: "📣", next: "user_impact" },
    { label: "Other — I'll describe it", emoji: "✏️", next: "location_other" },
  ]},
  location_ballot: { q: "Which ballot area?", options: [
    { label: "Unscoped Ballot", emoji: "🗳️", next: "location_ballot_feature" },
    { label: "Address Scoped Ballot", emoji: "📍", next: "location_ballot_feature" },
    { label: "Issue Scoped Ballot", emoji: "⚖️", next: "location_ballot_feature" },
    { label: "Other — I'll describe it", emoji: "✏️", next: "location_other" },
  ]},
  location_ballot_feature: { q: "Which feature?", options: [
    { label: "Address Input", emoji: "📬", next: "user_impact" },
    { label: "Personalized Questionnaire", emoji: "📝", next: "user_impact" },
    { label: "Candidate Profile", emoji: "👤", next: "user_impact" },
    { label: "Measure Choice Profile", emoji: "⚖️", next: "user_impact" },
    { label: "Ballot Entity Cards", emoji: "🃏", next: "user_impact" },
    { label: "Other — I'll describe it", emoji: "✏️", next: "location_other" },
  ]},
  location_vg: { q: "Which Voter Guide feature?", options: [
    { label: "Voter Guide Ballot", emoji: "📋", next: "user_impact" },
    { label: "Voter Guide Candidate Profile", emoji: "👤", next: "user_impact" },
    { label: "Voter Guide Measure Choice Profile", emoji: "⚖️", next: "user_impact" },
    { label: "Other — I'll describe it", emoji: "✏️", next: "location_other" },
  ]},
  location_global: { q: "Which global element?", options: [
    { label: "Marketing Site Navigation", emoji: "🧭", next: "user_impact" },
    { label: "Ballot Navigation", emoji: "🗺️", next: "user_impact" },
    { label: "Share", emoji: "↗️", next: "user_impact" },
    { label: "Ballot Entity Cards", emoji: "🃏", next: "user_impact" },
    { label: "Footer", emoji: "📐", next: "user_impact" },
    { label: "Other — I'll describe it", emoji: "✏️", next: "location_other" },
  ]},
  location_other: { q: "Describe the area", type: "text", next: "user_impact" },
  user_impact: { q: "User experience?",  options: [{ label: "Blocked completely", emoji: "🚧", next: "biz_impact" },{ label: "Frustrated", emoji: "😤", next: "biz_impact" },{ label: "Confused", emoji: "😕", next: "biz_impact" },{ label: "Minor", emoji: "🙂", next: "biz_impact" },{ label: "Cosmetic only", emoji: "💅", next: "biz_impact" }]},
  biz_impact:  { q: "Business risk?",    options: [{ label: "Revenue", emoji: "💸", next: "workaround" },{ label: "Retention", emoji: "📉", next: "workaround" },{ label: "Reputation", emoji: "👁️", next: "workaround" },{ label: "Internal friction", emoji: "⚙️", next: "workaround" },{ label: "Low risk", emoji: "🟢", next: "workaround" }]},
  workaround:  { q: "Workaround?",       options: [{ label: "None", emoji: "❌", next: "scope" },{ label: "Clunky one", emoji: "🔄", next: "scope" },{ label: "Easy one", emoji: "✅", next: "scope" }]},
  scope:       { q: "How many users?",   options: [{ label: "All users", emoji: "🌍", next: "confidence" },{ label: "Most users", emoji: "👥", next: "confidence" },{ label: "Specific segment", emoji: "🎯", next: "confidence" },{ label: "Just me", emoji: "🙋", next: "confidence" }]},
  confidence:  { q: "How confident?",    options: [{ label: "Confident", emoji: "✅", next: "DONE" },{ label: "Pretty sure", emoji: "🤔", next: "DONE" },{ label: "Unsure", emoji: "❓", next: "DONE" }]},
};

const NODES_NONE: Record<string, TreeNode> = {
  start:     { q: "What's happening?", options: [{ label: "Something is broken", emoji: "💥", next: "broke_how" },{ label: "Something feels wrong", emoji: "🤔", next: "feels_how" },{ label: "Missing a capability", emoji: "💡", next: "flow" },{ label: "No idea", emoji: "🌀", next: "flow" }]},
  broke_how: { q: "How does it break?", options: [{ label: "Crash / error / blank screen", emoji: "🔴", next: "frequency" },{ label: "Wrong data or output", emoji: "🔢", next: "frequency" },{ label: "Action does nothing", emoji: "🫥", next: "frequency" },{ label: "Worked before, broken now", emoji: "📉", next: "frequency" }]},
  frequency: { q: "How often?", options: [{ label: "Every time", emoji: "🔁", next: "flow" },{ label: "Intermittent", emoji: "🎲", next: "flow" },{ label: "Once so far", emoji: "👀", next: "flow" }]},
  feels_how: { q: "What kind of wrong?", options: [{ label: "Looks off — visual / layout", emoji: "🎨", next: "flow" },{ label: "Confusing to navigate", emoji: "😵", next: "flow" },{ label: "Too many steps / friction", emoji: "🐌", next: "flow" },{ label: "Behavior seems like a mistake", emoji: "🤨", next: "flow" }]},
  ...TAIL_NODES,
};

const NODES_PARTIAL: Record<string, TreeNode> = {
  start:            { q: "What's going on?", options: [{ label: "Something broke or errored", emoji: "💥", next: "broke" },{ label: "It works but feels off", emoji: "🤔", next: "feels_off" },{ label: "Missing a capability", emoji: "💡", next: "feature" },{ label: "No idea", emoji: "🌫️", next: "no_idea" }]},
  broke:            { q: "How does it break?", options: [{ label: "Crash / error / blank", emoji: "🔴", next: "frequency" },{ label: "Wrong data / output", emoji: "🔢", next: "frequency" },{ label: "Action does nothing", emoji: "🫥", next: "frequency" },{ label: "Regression", emoji: "📉", next: "frequency" }]},
  frequency:        { q: "How often?", options: [{ label: "Every time", emoji: "🔁", next: "flow" },{ label: "Intermittent", emoji: "🎲", next: "flow" },{ label: "Once so far", emoji: "👀", next: "flow" }]},
  feels_off:        { q: "What kind of off?", options: [{ label: "Looks wrong", emoji: "🎨", next: "partial_decision" },{ label: "Confusing", emoji: "😵", next: "partial_decision" },{ label: "Clunky / friction", emoji: "🐌", next: "partial_decision" },{ label: "Behavior wrong", emoji: "🤨", next: "partial_decision" }]},
  feature:          { q: "New idea or implied?", options: [{ label: "Brand new idea", emoji: "🚀", next: "flow" },{ label: "Should exist but doesn't", emoji: "🧩", next: "partial_decision" }]},
  no_idea:          { q: "Broken or just unexpected?", options: [{ label: "Definitely broken", emoji: "🔧", next: "broke" },{ label: "Just unexpected", emoji: "👻", next: "feels_off" },{ label: "Truly no idea", emoji: "🌀", next: "flow" }]},
  partial_decision: { q: "Does what you have cover this?", options: [{ label: "Yes — and this doesn't match", emoji: "📋", next: "opinion" },{ label: "Kinda — it's ambiguous", emoji: "🌫️", next: "flow" },{ label: "No — not covered", emoji: "🕳️", next: "flow" }]},
  opinion:          { q: "Opinion or something users would notice?", options: [{ label: "Any user would notice", emoji: "👥", next: "flow" },{ label: "I noticed, unsure others would", emoji: "🔬", next: "flow" },{ label: "Honestly my preference", emoji: "🙋", next: "flow" }]},
  ...TAIL_NODES,
};

const NODES_FULL: Record<string, TreeNode> = {
  start:     { q: "What's going on?", options: [{ label: "Something broke or errored", emoji: "💥", next: "broke" },{ label: "It works but feels off", emoji: "🤔", next: "feels_off" },{ label: "Missing a capability", emoji: "💡", next: "feature" },{ label: "No idea", emoji: "🌫️", next: "no_idea" }]},
  broke:     { q: "How does it break?", options: [{ label: "Crash / error / blank", emoji: "🔴", next: "frequency" },{ label: "Wrong data / output", emoji: "🔢", next: "frequency" },{ label: "Action does nothing", emoji: "🫥", next: "frequency" },{ label: "Regression", emoji: "📉", next: "frequency" }]},
  frequency: { q: "How often?", options: [{ label: "Every time", emoji: "🔁", next: "flow" },{ label: "Intermittent", emoji: "🎲", next: "flow" },{ label: "Once so far", emoji: "👀", next: "flow" }]},
  feels_off: { q: "What kind of off?", options: [{ label: "Looks wrong", emoji: "🎨", next: "decision" },{ label: "Confusing", emoji: "😵", next: "decision" },{ label: "Clunky / friction", emoji: "🐌", next: "decision" },{ label: "Behavior wrong", emoji: "🤨", next: "decision" }]},
  feature:   { q: "New idea or implied?", options: [{ label: "Brand new idea", emoji: "🚀", next: "flow" },{ label: "Should exist but doesn't", emoji: "🧩", next: "decision" }]},
  no_idea:   { q: "Broken or just unexpected?", options: [{ label: "Definitely broken", emoji: "🔧", next: "broke" },{ label: "Just unexpected", emoji: "👻", next: "feels_off" },{ label: "Truly no idea", emoji: "🌀", next: "spec_gap" }]},
  decision:  { q: "Was a design/product decision made here?", options: [{ label: "Yes — and this doesn't match", emoji: "📋", next: "opinion" },{ label: "Yes — but the decision is wrong", emoji: "🙈", next: "opinion" },{ label: "No — never defined", emoji: "🕳️", next: "spec_gap" },{ label: "Don't know", emoji: "🤷", next: "spec_gap" }]},
  opinion:   { q: "Opinion or something users would notice?", options: [{ label: "Any user would notice", emoji: "👥", next: "flow" },{ label: "I noticed, unsure others would", emoji: "🔬", next: "flow" },{ label: "Honestly my preference", emoji: "🙋", next: "flow" }]},
  spec_gap:  { q: "Has this ever been discussed?", options: [{ label: "Discussed but unresolved", emoji: "💬", next: "flow" },{ label: "Never discussed", emoji: "🫙", next: "flow" },{ label: "Don't know", emoji: "🤷", next: "flow" }]},
  ...TAIL_NODES,
};

const TREES: Record<string, Record<string, TreeNode>> = { none: NODES_NONE, partial: NODES_PARTIAL, full: NODES_FULL };

// ── Layouts ───────────────────────────────────────────────────────────────
const TAIL_LAYOUT: Record<string, { x: number; y: number }> = {
  flow:                   { x: 295, y: 530 },
  location:               { x: 130, y: 660 },
  location_ballot:        { x: 30,  y: 790 },
  location_ballot_feature:{ x: 30,  y: 920 },
  location_vg:            { x: 220, y: 790 },
  location_global:        { x: 390, y: 790 },
  user_impact:            { x: 430, y: 660 },
  biz_impact:             { x: 430, y: 1060 },
  workaround:             { x: 430, y: 1190 },
  scope:                  { x: 430, y: 1320 },
  confidence:             { x: 430, y: 1450 },
};
const LAYOUTS: Record<string, Record<string, { x: number; y: number }>> = {
  none:    { start: { x: 255, y: 40 }, broke_how: { x: 80, y: 165 }, frequency: { x: 80, y: 310 }, feels_how: { x: 390, y: 165 }, ...TAIL_LAYOUT },
  partial: { start: { x: 255, y: 40 }, broke: { x: 60, y: 165 }, frequency: { x: 60, y: 300 }, feels_off: { x: 250, y: 165 }, feature: { x: 430, y: 165 }, no_idea: { x: 590, y: 165 }, partial_decision: { x: 295, y: 310 }, opinion: { x: 295, y: 420 }, ...TAIL_LAYOUT },
  full:    { start: { x: 295, y: 40 }, broke: { x: 60, y: 165 }, frequency: { x: 60, y: 300 }, feels_off: { x: 240, y: 165 }, feature: { x: 420, y: 165 }, no_idea: { x: 570, y: 165 }, decision: { x: 295, y: 300 }, opinion: { x: 200, y: 415 }, spec_gap: { x: 450, y: 415 }, ...TAIL_LAYOUT },
};
const NODE_W = 148, NODE_H = 70;

const NEXT_STEPS: Record<string, { steps: string[]; critical?: string; warning?: string; color: string; icon: string }> = {
  "Bug":            { steps: ["Copy ticket draft.", "Eng Jira board → Backlog.", "Paste, set type Bug + severity.", "Leave unassigned for eng lead."], critical: "⚠️ Critical: Post in Slack + tag eng lead.", color: "border-red-200 bg-red-50", icon: "🐛" },
  "UX Improvement": { steps: ["Copy ticket draft.", "Design Jira board → Backlog.", "Labels: ux-improvements, needs-design.", "Add needs-product if needed."], color: "border-purple-200 bg-purple-50", icon: "✨" },
  "Feature Request":{ steps: ["Copy ticket draft.", "Design Jira board → Backlog.", "Labels: feature-request, needs-product, needs-design."], color: "border-blue-200 bg-blue-50", icon: "💡" },
  "Spec Gap":       { steps: ["Don't file a Jira ticket yet.", "Post in shared Slack channel.", "Tag PM + designer together.", "Wait for alignment first."], warning: "Filing before alignment creates noise.", color: "border-yellow-200 bg-yellow-50", icon: "🌫️" },
};
const sevColors: Record<string, string>   = { Critical: "bg-red-600 text-white", High: "bg-orange-500 text-white", Medium: "bg-yellow-400 text-gray-900", Low: "bg-green-100 text-green-800 border border-green-300" };
const classColors: Record<string, string> = { Bug: "bg-red-100 text-red-800", "UX Improvement": "bg-purple-100 text-purple-800", "Feature Request": "bg-blue-100 text-blue-800", "Spec Gap": "bg-yellow-100 text-yellow-800" };
const classEmoji: Record<string, string>  = { Bug: "🐛", "UX Improvement": "✨", "Feature Request": "💡", "Spec Gap": "🌫️" };
const accentHex: Record<string, string>   = { Bug: "#ef4444", "UX Improvement": "#a855f7", "Feature Request": "#3b82f6", "Spec Gap": "#eab308", default: "#6366f1" };

function getEdges(nodes: Record<string, TreeNode>) {
  const edges: { from: string; to: string }[] = [], seen = new Set<string>();
  Object.entries(nodes).forEach(([from, node]) => {
    if (!node.options) return;
    node.options.forEach(o => {
      const key = `${from}→${o.next}`;
      if (o.next !== "DONE" && !seen.has(key) && nodes[o.next]) { seen.add(key); edges.push({ from, to: o.next }); }
    });
  });
  return edges;
}

// ── Sheets logging ────────────────────────────────────────────────────────
let lastSubmittedId = "";
const submitToSheet = async (resultObj: ResultData, answers: Record<string, string>, docLvl: string, title?: string) => {
  const strip = (s: string) => (s || "").replace(/^\S+\s/, "").trim();
  const location = resolveLocation(answers);
  const shortId = Math.random().toString(36).slice(2, 6).toUpperCase();
  const id = `QA-${Date.now()}-${shortId}`;
  lastSubmittedId = id;
  const defaultTitle = `Ticket #${shortId}`;
  try {
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        classification: resultObj.classification,
        severity:       resultObj.severity,
        flow:           strip(answers["flow"] || ""),
        location,
        docLevel:       docLvl,
        userScore:      resultObj.userScore,
        bizScore:       resultObj.bizScore,
        specGapFlag:    resultObj.specGapFlag,
        confidence:     strip(answers["confidence"] || ""),
        workaround:     strip(answers["workaround"] || ""),
        summary:        resultObj.jiraTicket.split("\n")[0].replace("SUMMARY: ", ""),
        title:          title || defaultTitle,
        jiraTicket:     resultObj.jiraTicket,
        reasoning:      resultObj.reasoning,
        severityExplanation: resultObj.severityExplanation,
        opinionFlag:    resultObj.opinionFlag,
        opinionNote:    resultObj.opinionNote,
      }),
    });
    const data = await res.json();
    if (!data.success) console.error("Sheet log error:", data.error);
    return defaultTitle;
  } catch (err) {
    console.error("Sheet submission failed:", err);
    return defaultTitle;
  }
};

const updateTitle = async (title: string) => {
  if (!lastSubmittedId || !title.trim()) return;
  try {
    await fetch("/api/log", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lastSubmittedId, title: title.trim() }),
    });
  } catch (err) {
    console.error("Title update failed:", err);
  }
};

// ── Score bar ─────────────────────────────────────────────────────────────
function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex gap-1 items-center mt-1">
      {[1,2,3,4,5].map(i => <div key={i} className={`h-2 w-7 rounded-full ${i <= score ? color : "bg-gray-200"}`} />)}
      <span className="text-xs text-gray-400 ml-1">{score}/5</span>
    </div>
  );
}

// ── Doc screen ────────────────────────────────────────────────────────────
function DocScreen({ onProceed }: { onProceed: (level: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="fixed inset-x-0 bottom-0 flex flex-col" style={{ top: "49px" }}>
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">📂</div>
            <h1 className="text-xl font-bold text-white mb-2">How much context do you have?</h1>
            <p className="text-sm" style={{ color: "rgba(165,180,252,0.55)" }}>This shapes the questions you&apos;ll see.</p>
          </div>
          <div className="space-y-3">
            {DOC_OPTIONS.map(o => (
              <button key={o.id} onClick={() => setPicked(o.id)}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all"
                style={{ background: picked === o.id ? o.color : "rgba(255,255,255,0.04)", border: `2px solid ${picked === o.id ? o.border : "rgba(255,255,255,0.08)"}` }}>
                <span className="text-2xl shrink-0">{o.emoji}</span>
                <div>
                  <p className="text-sm font-bold" style={{ color: picked === o.id ? o.text : "rgba(255,255,255,0.75)" }}>{o.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{o.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="shrink-0 px-4 pt-4 pb-6" style={{ background: "linear-gradient(to bottom,#1e1b4b,#0d0b2b)", borderTop: picked ? "2px solid #6366f1" : "2px solid rgba(255,255,255,0.08)", boxShadow: picked ? "0 -12px 48px rgba(99,102,241,0.45)" : "none", transition: "all 0.4s" }}>
        <div className="max-w-md mx-auto">
          <button onClick={() => picked && onProceed(picked)} disabled={!picked}
            className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all"
            style={{ background: picked ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.05)", color: picked ? "white" : "rgba(255,255,255,0.25)", boxShadow: picked ? "0 4px 24px rgba(99,102,241,0.4)" : "none", cursor: picked ? "pointer" : "not-allowed" }}>
            {picked ? "Start classifying →" : "Pick one to continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
interface ResultData {
  classification: string;
  severity: string;
  userScore: number;
  bizScore: number;
  reasoning: string;
  severityExplanation: string;
  opinionFlag: boolean;
  opinionNote: string;
  specGapFlag: boolean;
  jiraTicket: string;
}

export default function App() {
  const [screen, setScreen]     = useState("doc");
  const [docLevel, setDocLevel] = useState<string | null>(null);
  const [path, setPath]         = useState(["start"]);
  const [answers, setAnswers]   = useState<Record<string, string>>({});
  const [result, setResult]     = useState<ResultData | null>(null);
  const [copied, setCopied]     = useState(false);
  const [writeIn, setWriteIn]   = useState("");
  const [tab, setTab]           = useState("result");
  const [ticketTitle, setTicketTitle] = useState("");
  const [titleSaved, setTitleSaved] = useState(false);
  const containerRef            = useRef<HTMLDivElement>(null);

  const NODES  = docLevel ? TREES[docLevel]   : TREES.none;
  const LAYOUT = docLevel ? LAYOUTS[docLevel] : LAYOUTS.none;
  const edges  = getEdges(NODES);
  const currentId   = path[path.length - 1];
  const currentNode = NODES[currentId];

  useEffect(() => {
    if (!containerRef.current || result || screen !== "tree") return;
    const pos = LAYOUT[currentId];
    if (!pos) return;
    containerRef.current.scrollTo({ top: Math.max(0, pos.y + NODE_H / 2 - containerRef.current.clientHeight / 2), behavior: "smooth" });
  }, [currentId, result, screen, LAYOUT]);

  const handleDoc = (level: string) => { setDocLevel(level); setScreen("tree"); };

  const choose = (opt: TreeOption) => {
    const newAns = { ...answers, [currentId]: `${opt.emoji} ${opt.label}` };
    setAnswers(newAns);
    if (opt.next === "DONE") finish(newAns);
    else { setWriteIn(""); setPath(p => [...p, opt.next]); }
  };

  const submitWriteIn = () => {
    if (!writeIn.trim()) return;
    const newAns = { ...answers, [currentId]: `✏️ ${writeIn.trim()}` };
    setAnswers(newAns);
    const next = currentNode?.next;
    if (next === "DONE") finish(newAns);
    else { setWriteIn(""); setPath(p => [...p, next!]); }
  };

  const finish = async (allAns: Record<string, string>) => {
    const dl = docLevel || "none";
    const classification = deriveClassification(allAns, dl);
    const userScore      = scoreUserImpact(allAns);
    const bizScore       = scoreBizImpact(allAns);
    const severity       = deriveSeverity(userScore, bizScore, allAns);
    const reasoning      = deriveReasoning(classification, allAns, dl);
    const { opinionFlag, opinionNote, specGapFlag } = deriveFlags(allAns, dl);
    const severityExplanation = deriveSeverityExplanation(severity, allAns);
    const jiraTicket     = buildTicket(classification, severity, userScore, bizScore, allAns, dl);
    const resultData = { classification, severity, userScore, bizScore, reasoning, severityExplanation, opinionFlag, opinionNote, specGapFlag, jiraTicket };
    setResult(resultData);
    const defaultTitle = await submitToSheet(resultData, allAns, dl);
    setTicketTitle(defaultTitle);
  };

  const back  = () => { if (path.length < 2) return; const a = { ...answers }; delete a[path[path.length-2]]; setAnswers(a); setPath(p => p.slice(0,-1)); };
  const reset = () => { setScreen("doc"); setDocLevel(null); setPath(["start"]); setAnswers({}); setResult(null); setTab("result"); setTicketTitle(""); setTitleSaved(false); };
  const copy  = () => { if (!result) return; navigator.clipboard.writeText(result.jiraTicket); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (screen === "doc") return <DocScreen onProceed={handleDoc} />;

  if (result) {
    const ns = NEXT_STEPS[result.classification];
    const accent = accentHex[result.classification] || accentHex.default;
    const docBadge = { none: { label: "No docs", color: "bg-red-100 text-red-700" }, partial: { label: "Partial docs", color: "bg-yellow-100 text-yellow-700" }, full: { label: "Full docs", color: "bg-green-100 text-green-700" } }[docLevel || "none"]!;
    return (
      <div className="min-h-screen py-10 px-4">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">{classEmoji[result.classification]}</div>
            <h2 className="text-2xl font-bold text-white">Here&apos;s your verdict</h2>
            <p className="text-sm mt-1" style={{ color: "rgba(165,180,252,0.6)" }}>Ticket written. Zero typing required.</p>
          </div>
          <div className="mb-5 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{ color: "rgba(255,255,255,0.3)" }}>
              Ticket Title
            </label>
            <div className="flex gap-2">
              <input
                value={ticketTitle}
                onChange={e => { setTicketTitle(e.target.value); setTitleSaved(false); }}
                onKeyDown={e => { if (e.key === "Enter" && ticketTitle.trim()) { updateTitle(ticketTitle); setTitleSaved(true); setTimeout(() => setTitleSaved(false), 2000); } }}
                placeholder="e.g. Petition signature button unresponsive on mobile"
                className="flex-1 px-4 py-3 rounded-xl text-base font-bold outline-none transition-all"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(99,102,241,0.3)", color: "white" }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(99,102,241,0.7)"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)"}
              />
              <button
                onClick={() => { if (ticketTitle.trim()) { updateTitle(ticketTitle); setTitleSaved(true); setTimeout(() => setTitleSaved(false), 2000); } }}
                disabled={!ticketTitle.trim()}
                className="px-4 py-3 rounded-xl text-xs font-bold shrink-0 transition-all"
                style={{
                  background: titleSaved ? "rgba(34,197,94,0.3)" : ticketTitle.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.05)",
                  color: titleSaved ? "#86efac" : ticketTitle.trim() ? "white" : "rgba(255,255,255,0.25)",
                }}
              >
                {titleSaved ? "✅ Saved" : "Save"}
              </button>
            </div>
          </div>
          <div className="flex gap-2 mb-5 rounded-2xl p-1.5" style={{ background: "rgba(255,255,255,0.07)" }}>
            {(["result","ticket","path"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${tab===t?"bg-white text-gray-900 shadow":"text-white/50 hover:text-white"}`}>
                {t==="result"?"📊 Result":t==="ticket"?"📋 Ticket":"🌳 Path"}
              </button>
            ))}
          </div>

          {tab === "result" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${classColors[result.classification]}`}>{classEmoji[result.classification]} {result.classification}</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${sevColors[result.severity]}`}>{result.severity} Severity</span>
                  {result.severityExplanation && (
                    <p className="w-full text-xs mt-2 mb-1" style={{ color: "rgba(255,255,255,0.45)" }}>{result.severityExplanation}</p>
                  )}
                  {result.specGapFlag && result.classification !== "Spec Gap" && <span className="px-3 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-800">🌫️ Spec Gap</span>}
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${docBadge.color}`}>📂 {docBadge.label}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{result.reasoning}</p>
              </div>
              <div className="rounded-2xl border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.07)" }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>Impact Scores</p>
                <div className="space-y-4">
                  <div><p className="text-sm font-semibold text-white/80">User Impact</p><ScoreBar score={result.userScore} color="bg-purple-400"/><p className="text-xs mt-1 text-white/50">{USER_IMPACT_LABELS[result.userScore]}</p></div>
                  <div><p className="text-sm font-semibold text-white/80">Business Impact</p><ScoreBar score={result.bizScore} color="bg-indigo-400"/><p className="text-xs mt-1 text-white/50">{BIZ_IMPACT_LABELS[result.bizScore]}</p></div>
                </div>
              </div>
              {result.opinionFlag && (
                <div className="rounded-2xl p-4" style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)" }}>
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-1">🧠 Heads up</p>
                  <p className="text-sm text-amber-200">{result.opinionNote}</p>
                </div>
              )}
              <div className={`rounded-2xl border p-5 ${ns.color}`}>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{ns.icon} What to do next</p>
                <ol className="space-y-2">{ns.steps.map((s,i) => <li key={i} className="flex gap-3 text-sm text-gray-700"><span className="font-bold text-gray-400 shrink-0">{i+1}.</span><span>{s}</span></li>)}</ol>
                {ns.critical && result.severity==="Critical" && <div className="mt-3 bg-red-100 border border-red-300 rounded-xl p-3 text-sm text-red-800 font-medium">{ns.critical}</div>}
                {ns.warning  && <div className="mt-3 bg-yellow-100 border border-yellow-300 rounded-xl p-3 text-sm text-yellow-800 font-medium">⚠️ {ns.warning}</div>}
              </div>
            </div>
          )}

          {tab === "ticket" && (
            <div className="rounded-2xl border border-white/10 p-5" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Jira Ticket Draft</p>
                <button onClick={copy} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}>{copied?"✅ Copied!":"Copy"}</button>
              </div>
              <pre className="text-xs whitespace-pre-wrap leading-relaxed rounded-xl p-5 overflow-auto max-h-96" style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>{result.jiraTicket}</pre>
            </div>
          )}

          {tab === "path" && (
            <div className="rounded-2xl border border-white/10 p-4" style={{ background: "rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-4 text-center" style={{ color: "rgba(255,255,255,0.3)" }}>Your Decision Path</p>
              <div className="flex flex-col items-center">
                <div className="w-full max-w-xs rounded-2xl px-4 py-3 text-center" style={{ border: "1.5px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)" }}>
                  <p className="text-xs mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Context</p>
                  <p className="text-sm font-bold text-white">📂 {DOC_OPTIONS.find(o=>o.id===docLevel)?.label}</p>
                </div>
                <div className="w-0.5 h-4" style={{ background: accent }} />
                {path.map((id, i) => {
                  const node = NODES[id]; const ans = answers[id];
                  return (
                    <div key={id} className="flex flex-col items-center w-full max-w-xs">
                      <div className="w-full rounded-2xl px-4 py-3 text-center" style={{ border: `2px solid ${accent}`, background: `${accent}22` }}>
                        <p className="text-xs mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Step {i+1}</p>
                        <p className="text-sm font-bold text-white">{node?.q}</p>
                      </div>
                      {ans && <div className="flex flex-col items-center"><div className="w-0.5 h-3" style={{ background: accent }}/><div className="px-3 py-1 rounded-full text-xs font-semibold text-white" style={{ background: `${accent}44`, border: `1px solid ${accent}66` }}>{ans}</div><div className="w-0.5 h-3" style={{ background: accent }}/></div>}
                    </div>
                  );
                })}
                <div className="w-full max-w-xs rounded-2xl px-4 py-3 text-center" style={{ background: accent }}>
                  <p className="text-sm font-bold text-white">{classEmoji[result.classification]} {result.classification}</p>
                </div>
              </div>
            </div>
          )}
          <button onClick={reset} className="mt-4 w-full py-3 rounded-2xl font-bold text-sm transition-all" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }}>← Classify another issue</button>
        </div>
      </div>
    );
  }

  // ── Tree ──────────────────────────────────────────────────────────────────
  const isActive   = (id: string) => id === currentId;
  const isAnswered = (id: string) => answers[id] !== undefined;
  const isOnPath   = (id: string) => path.includes(id);
  const getEdgeSt  = (f: string, t: string) => { const fi=path.indexOf(f),ti=path.indexOf(t); if(fi!==-1&&ti!==-1&&ti===fi+1)return"lit"; if(isOnPath(f)&&isOnPath(t))return"lit"; return"dim"; };
  const layoutKeys = Object.keys(LAYOUT);

  return (
    <div className="fixed inset-x-0 bottom-0 flex flex-col" style={{ top: "49px" }}>
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <button onClick={() => { setScreen("doc"); setPath(["start"]); setAnswers({}); }}
          className="text-xs px-3 py-1 rounded-full font-semibold"
          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(165,180,252,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}>
          📂 {DOC_OPTIONS.find(o=>o.id===docLevel)?.label} — change
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto">
        <svg width={780} height={1600} className="mx-auto block" style={{ minWidth: 780 }}>
          <defs>
            <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <marker id="arrowDim" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#1e293b"/></marker>
            <marker id="arrowLit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#6366f1"/></marker>
          </defs>
          {edges.map(({from,to}) => {
            const f=LAYOUT[from],t=LAYOUT[to]; if(!f||!t)return null;
            const st=getEdgeSt(from,to), x1=f.x+NODE_W/2, y1=f.y+NODE_H, x2=t.x+NODE_W/2, y2=t.y, mid=(y1+y2)/2;
            return <path key={`${from}-${to}`} d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`} fill="none" stroke={st==="lit"?"#6366f1":"#1e293b"} strokeWidth={st==="lit"?2:1} strokeOpacity={st==="lit"?1:0.35} strokeDasharray={st==="dim"?"4 4":"none"} markerEnd={`url(#arrow${st==="lit"?"Lit":"Dim"})`}/>;
          })}
          {Object.entries(LAYOUT).map(([id,pos]) => {
            const node=NODES[id]; if(!node||!node.options)return null;
            const active=isActive(id), answered=isAnswered(id), ans=answers[id];
            let fill="#0f172a",stroke="#1e293b",strokeW=1,textCol="#475569";
            if(active){fill="#1e1b4b";stroke="#818cf8";strokeW=2.5;textCol="#e0e7ff";}
            else if(answered){fill="#171537";stroke="#4f46e5";strokeW=1.5;textCol="#a5b4fc";}
            else if(isOnPath(id)){stroke="#334155";textCol="#64748b";}
            const nodeH=answered&&ans?NODE_H+22:NODE_H;
            return (
              <g key={id} filter={active?"url(#glow)":undefined}>
                <rect x={pos.x} y={pos.y} width={NODE_W} height={nodeH} rx={12} fill={fill} stroke={stroke} strokeWidth={strokeW}/>
                <circle cx={pos.x+14} cy={pos.y+14} r={9} fill={active?"#6366f1":answered?"#312e81":"#1e293b"}/>
                <text x={pos.x+14} y={pos.y+18} textAnchor="middle" fontSize="8" fontWeight="700" fill={active?"white":"#64748b"}>{layoutKeys.indexOf(id)+1}</text>
                <foreignObject x={pos.x+28} y={pos.y+5} width={NODE_W-36} height={NODE_H-10}>
                  <div style={{fontSize:"10px",fontWeight:700,color:textCol,lineHeight:1.35,paddingTop:"3px",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{node.q}</div>
                </foreignObject>
                {answered&&ans&&(
                  <foreignObject x={pos.x+6} y={pos.y+NODE_H+2} width={NODE_W-12} height={20}>
                    <div style={{fontSize:"9px",fontWeight:600,color:"#818cf8",background:"rgba(99,102,241,0.18)",border:"1px solid rgba(99,102,241,0.35)",borderRadius:"6px",padding:"2px 6px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ans}</div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="shrink-0 w-full" style={{ background:"linear-gradient(to bottom,#1e1b4b,#0d0b2b)", borderTop:"2px solid #6366f1", boxShadow:"0 -12px 48px rgba(99,102,241,0.45)" }}>
        <div className="max-w-lg mx-auto px-4 pt-4 pb-5">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"/>
            <span className="text-xs font-bold uppercase tracking-widest" style={{color:"#a5b4fc"}}>{currentNode?.q}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"/>
          </div>
          {currentNode?.type === "text" ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={writeIn}
                onChange={e => setWriteIn(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitWriteIn()}
                placeholder="e.g. Election Results page..."
                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold outline-none"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(99,102,241,0.5)", color: "white" }}
              />
              <button onClick={submitWriteIn} disabled={!writeIn.trim()}
                className="px-4 py-3 rounded-xl text-sm font-bold transition-all"
                style={{ background: writeIn.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.05)", color: writeIn.trim() ? "white" : "rgba(255,255,255,0.25)", cursor: writeIn.trim() ? "pointer" : "not-allowed" }}>
                →
              </button>
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-2">
            {currentNode?.options?.map(opt=>(
              <button key={opt.label} onClick={()=>choose(opt)}
                className="flex items-center gap-2 px-3 py-3 rounded-xl text-left transition-all"
                style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.11)"}}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(99,102,241,0.28)";e.currentTarget.style.borderColor="rgba(99,102,241,0.65)";}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.borderColor="rgba(255,255,255,0.11)";}}>
                <span className="text-xl shrink-0">{opt.emoji}</span>
                <span className="text-xs font-semibold leading-tight" style={{color:"rgba(255,255,255,0.8)"}}>{opt.label}</span>
              </button>
            ))}
          </div>
          )}
          {path.length>1&&(
            <button onClick={back} className="mt-3 w-full text-xs py-1 transition-all" style={{color:"rgba(165,180,252,0.4)"}}
              onMouseEnter={e=>e.currentTarget.style.color="rgba(165,180,252,0.8)"}
              onMouseLeave={e=>e.currentTarget.style.color="rgba(165,180,252,0.4)"}>← Back</button>
          )}
        </div>
      </div>
    </div>
  );
}
