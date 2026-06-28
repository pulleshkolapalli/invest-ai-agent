"use client";

/**
 * page.tsx — Main Application UI
 *
 * This is the single-page React component that handles:
 * 1. Company name input + quick-pick chips
 * 2. Recent searches (localStorage)
 * 3. Real-time progress tracker (SSE stream from /api/research)
 * 4. Full investment report display with:
 *    - Verdict card (INVEST / HOLD / PASS)
 *    - Key metrics grid
 *    - Strengths & Concerns flag cards
 *    - SWOT analysis (2×2 grid)
 *    - Competitor chips
 *    - Research tabs (6 detailed sections)
 *    - PDF Export & Copy buttons
 * 5. Error handling with actionable messages
 *
 * WHY "use client"?
 * This component uses React hooks (useState, useEffect, useRef) and browser
 * APIs (fetch, localStorage, window.print). These only work in the browser,
 * so we mark it as a Client Component in Next.js App Router.
 */

import { useState, useEffect, useRef } from "react";
import type { AgentStateType } from "@/lib/agent";

// ─── Constants ────────────────────────────────────────────────────────────────

/** These match the STEP_LABELS in agent.ts */
const STEPS = [
  "📋 Planning Research",
  "🏢 Researching Company",
  "💰 Analyzing Financials",
  "⚔️ Mapping Competition",
  "📈 Evaluating Growth",
  "⚠️ Assessing Risks",
  "📡 Reading Market Sentiment",
  "🔲 Building SWOT Analysis",
  "🎯 Generating Recommendation",
];

/** Quick-pick company buttons on the home screen */
const QUICK_PICKS = [
  "Apple", "Tesla", "Microsoft", "Google", "NVIDIA", "Amazon",
  "Meta", "Netflix", "AMD", "Intel",
  "Zomato", "Reliance", "Infosys", "TCS", "HDFC Bank", "Paytm", "Swiggy"
];

/** Research detail tabs — each maps to a field in AgentStateType */
const TABS = [
  { key: "overview", label: "🏢 Company", field: "companyOverview" },
  { key: "financials", label: "💰 Financials", field: "financialHealth" },
  { key: "competition", label: "⚔️ Competition", field: "competitiveLandscape" },
  { key: "growth", label: "📈 Growth", field: "growthProspects" },
  { key: "risks", label: "⚠️ Risks", field: "riskFactors" },
  { key: "sentiment", label: "📡 Sentiment", field: "sentimentAnalysis" },
];

const MAX_RECENT = 5; // Max recent searches to store

// ─── Component ────────────────────────────────────────────────────────────────
export default function Home() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [result, setResult] = useState<AgentStateType | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Progress percentage for the progress bar
  const progressPct =
    completedSteps.length > 0 ? (completedSteps.length / STEPS.length) * 100 : 0;

  // ── Load recent searches from localStorage on mount ────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem("alphalens_recent");
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch {
      // localStorage not available (SSR safety)
    }
  }, []);

  // ── Save a search to recent history ───────────────────────────────────────
  function addToRecent(name: string) {
    setRecentSearches((prev) => {
      const filtered = prev.filter(
        (s) => s.toLowerCase() !== name.toLowerCase()
      );
      const updated = [name, ...filtered].slice(0, MAX_RECENT);
      try {
        localStorage.setItem("alphalens_recent", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }

  // ── Main research function ─────────────────────────────────────────────────
  /**
   * Calls POST /api/research and reads the SSE stream.
   * Server-Sent Events (SSE) format: "data: {JSON}\n\n"
   * 
   * We buffer incomplete lines and parse complete SSE messages as they arrive.
   * This gives us real-time progress updates without polling.
   */
  async function runResearch(companyName: string) {
    if (!companyName.trim() || loading) return;
    const name = companyName.trim();

    setLoading(true);
    setError("");
    setResult(null);
    setCompletedSteps([]);
    setCurrentStep(STEPS[0]);
    setActiveTab("overview");
    addToRecent(name);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: name }),
      });

      // Handle non-streaming errors (400, 500 responses)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Read the SSE stream chunk by chunk
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // SSE messages are delimited by double newlines
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep the incomplete last chunk

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "progress") {
              // Update the step tracker in real-time
              setCurrentStep(data.step);
              setCompletedSteps((prev) =>
                prev.includes(data.step) ? prev : [...prev, data.step]
              );
            } else if (data.type === "complete") {
              // Research finished — display the full report
              setResult(data.result);
              setCompletedSteps(STEPS);
              setCurrentStep("");
              // Smooth scroll to results
              setTimeout(() => {
                resultsRef.current?.scrollIntoView({ behavior: "smooth" });
              }, 200);
            } else if (data.type === "error") {
              setError(data.message);
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // ── PDF Export ────────────────────────────────────────────────────────────
  /**
   * We use window.print() with print-specific CSS (defined in globals.css).
   * This is simpler than jsPDF and produces better-formatted output.
   * The CSS hides the search bar and shows only the report content when printing.
   */
  function handlePDFExport() {
    window.print();
  }

  // ── Copy Report to Clipboard ──────────────────────────────────────────────
  function handleCopy() {
    if (!result) return;

    const text = `
INVESTMENT RESEARCH REPORT
===========================
Company: ${result.companyName}
Verdict: ${result.verdict}
Confidence: ${result.confidenceScore}%
Generated by AlphaLens AI

REASONING
${result.reasoning}

INVESTMENT THESIS
${result.investmentThesis}

KEY METRICS
${Object.entries(result.keyMetrics || {})
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}

STRENGTHS
${(result.greenFlags || []).map((f) => `• ${f}`).join("\n")}

CONCERNS
${(result.redFlags || []).map((f) => `• ${f}`).join("\n")}

SWOT ANALYSIS
Strengths: ${(result.swotAnalysis?.strengths || []).join(", ")}
Weaknesses: ${(result.swotAnalysis?.weaknesses || []).join(", ")}
Opportunities: ${(result.swotAnalysis?.opportunities || []).join(", ")}
Threats: ${(result.swotAnalysis?.threats || []).join(", ")}

COMPANY OVERVIEW
${result.companyOverview}

FINANCIAL HEALTH
${result.financialHealth}

COMPETITIVE LANDSCAPE
${result.competitiveLandscape}

GROWTH PROSPECTS
${result.growthProspects}

RISK FACTORS
${result.riskFactors}

MARKET SENTIMENT
${result.sentimentAnalysis}

---
Disclaimer: This is AI-generated research for educational purposes only.
Not financial advice. AlphaLens | alphalens.vercel.app
    `.trim();

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Verdict color class ───────────────────────────────────────────────────
  const verdictClass =
    result?.verdict === "INVEST"
      ? "invest"
      : result?.verdict === "PASS"
      ? "pass"
      : "hold";

  const verdictEmoji =
    result?.verdict === "INVEST"
      ? "✅"
      : result?.verdict === "PASS"
      ? "❌"
      : "⏸";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="app-wrapper">
      {/* ── Header ── */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon">📊</div>
          <div className="logo-text">
            Alpha<span>Lens</span>
          </div>
        </div>
        <div className="header-badge">AI INVESTMENT RESEARCH AGENT</div>
      </header>

      <main className="main">
        {/* ── Hero ── */}
        <section className="hero animate-in">
          <div className="hero-eyebrow">
            Powered by LangGraph · OpenRouter
          </div>
          <h1 className="hero-title">
            Research any company.
            <br />
            Get an <span className="highlight">AI verdict.</span>
          </h1>
          <p className="hero-sub">
            Enter a company name and our multi-agent AI pipeline runs a
            full 9-step investment research — financials, competition, SWOT,
            risk analysis — then gives you an{" "}
            <strong>INVEST / HOLD / PASS</strong> decision.
          </p>
        </section>

        {/* ── Search Box ── */}
        <section className="search-section animate-in animate-in-delay">
          <div className="search-box">
            <input
              ref={inputRef}
              id="company-search-input"
              className="search-input"
              placeholder="Enter company name (e.g. Apple, Zomato, Tesla...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runResearch(query)}
              disabled={loading}
              autoComplete="off"
            />
            <button
              id="research-btn"
              className="search-btn"
              onClick={() => runResearch(query)}
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ marginRight: 8 }} />
                  Researching...
                </>
              ) : (
                "Analyse →"
              )}
            </button>
          </div>

          {/* Quick Picks */}
          <div className="quick-picks">
            <span className="quick-label">Try:</span>
            {QUICK_PICKS.map((c) => (
              <button
                key={c}
                className="quick-chip"
                onClick={() => {
                  setQuery(c);
                  runResearch(c);
                }}
                disabled={loading}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        {/* ── Recent Searches ── */}
        {recentSearches.length > 0 && !loading && !result && (
          <div className="recent-searches animate-in animate-in-delay-2">
            <div className="recent-title">🕐 Recent Searches</div>
            <div className="recent-list">
              {recentSearches.map((name) => (
                <button
                  key={name}
                  className="recent-item"
                  onClick={() => {
                    setQuery(name);
                    runResearch(name);
                  }}
                >
                  <span className="recent-item-icon">🔍</span>
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Progress Tracker ── */}
        {loading && (
          <section className="progress-section animate-in">
            <div className="progress-header">
              <div className="progress-title">Running Research Pipeline</div>
              <div className="progress-company">{query}</div>
            </div>
            <div className="progress-steps">
              {STEPS.map((step) => {
                const isDone = completedSteps.includes(step);
                const isActive = currentStep === step && !isDone;
                return (
                  <div
                    key={step}
                    className={`progress-step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
                  >
                    <div className="step-dot" />
                    <div className="step-label">{step}</div>
                    {isDone && <div className="step-check">✓</div>}
                  </div>
                );
              })}
            </div>
            <div className="progress-bar-wrap">
              <div
                className="progress-bar-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </section>
        )}

        {/* ── Error State ── */}
        {error && (
          <div
            className="animate-in"
            style={{
              background: "rgba(255,77,106,0.08)",
              border: "1px solid rgba(255,77,106,0.3)",
              borderRadius: 12,
              padding: "16px 20px",
              color: "var(--red)",
              marginBottom: 24,
              fontSize: 14,
            }}
          >
            ⚠️ {error}
            {error.includes("GOOGLE_API_KEY") && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                Get a free key at{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--blue)" }}
                >
                  aistudio.google.com
                </a>{" "}
                then add it to <code>.env.local</code> as{" "}
                <code>GOOGLE_API_KEY=your_key</code>
              </div>
            )}
          </div>
        )}

        {/* ── Results Section ── */}
        {result && (
          <div className="results-section" ref={resultsRef}>

            {/* ── Verdict Card ── */}
            <div className={`verdict-card ${verdictClass} animate-in`}>
              <div className="verdict-glow" />
              <div className="verdict-top">
                <div className="verdict-badge">
                  {verdictEmoji} {result.verdict}
                </div>
                <div className="confidence-ring">
                  <div className="ring-label">Confidence</div>
                  <div className="ring-value">{result.confidenceScore}%</div>
                </div>
              </div>
              <div className="verdict-company">{result.companyName}</div>
              <div className="verdict-reasoning">{result.reasoning}</div>
              {result.investmentThesis && (
                <div className="verdict-thesis">
                  &ldquo;{result.investmentThesis}&rdquo;
                </div>
              )}

              {/* Action Buttons */}
              <div className="action-buttons">
                <button
                  id="pdf-export-btn"
                  className="action-btn"
                  onClick={handlePDFExport}
                >
                  📄 Export PDF
                </button>
                <button
                  id="copy-report-btn"
                  className={`action-btn ${copied ? "success" : ""}`}
                  onClick={handleCopy}
                >
                  {copied ? "✅ Copied!" : "📋 Copy Report"}
                </button>
              </div>
            </div>

            {/* ── Key Metrics Grid ── */}
            {result.keyMetrics && Object.keys(result.keyMetrics).length > 0 && (
              <div className="animate-in animate-in-delay">
                <div
                  className="section-title"
                  style={{ marginBottom: 12, border: "none", paddingBottom: 0 }}
                >
                  📊 Key Metrics
                </div>
                <div className="metrics-grid">
                  {Object.entries(result.keyMetrics).map(([key, value]) => (
                    <div key={key} className="metric-card">
                      <div className="metric-label">{key}</div>
                      <div className="metric-value">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Strengths & Concerns ── */}
            {(result.greenFlags?.length > 0 || result.redFlags?.length > 0) && (
              <div className="flags-grid animate-in animate-in-delay-2">
                <div className="flags-card green">
                  <div className="flags-title">✅ Strengths</div>
                  {result.greenFlags?.map((f, i) => (
                    <div key={i} className="flag-item">
                      <div className="flag-dot" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
                <div className="flags-card red">
                  <div className="flags-title">⚠️ Concerns</div>
                  {result.redFlags?.map((f, i) => (
                    <div key={i} className="flag-item">
                      <div className="flag-dot" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SWOT Analysis Card ── */}
            {result.swotAnalysis && (
              <div className="swot-card animate-in animate-in-delay-3">
                <div className="swot-title">🔲 SWOT Analysis</div>
                <div className="swot-grid">
                  {/* Strengths */}
                  <div className="swot-quadrant s">
                    <div className="swot-quadrant-title">💪 Strengths</div>
                    {(result.swotAnalysis.strengths || []).map((item, i) => (
                      <div key={i} className="swot-item">
                        <div className="swot-bullet" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  {/* Weaknesses */}
                  <div className="swot-quadrant w">
                    <div className="swot-quadrant-title">🔻 Weaknesses</div>
                    {(result.swotAnalysis.weaknesses || []).map((item, i) => (
                      <div key={i} className="swot-item">
                        <div className="swot-bullet" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  {/* Opportunities */}
                  <div className="swot-quadrant o">
                    <div className="swot-quadrant-title">🚀 Opportunities</div>
                    {(result.swotAnalysis.opportunities || []).map((item, i) => (
                      <div key={i} className="swot-item">
                        <div className="swot-bullet" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  {/* Threats */}
                  <div className="swot-quadrant t">
                    <div className="swot-quadrant-title">⚡ Threats</div>
                    {(result.swotAnalysis.threats || []).map((item, i) => (
                      <div key={i} className="swot-item">
                        <div className="swot-bullet" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Competitors ── */}
            {result.competitors && result.competitors.length > 0 && (
              <div className="competitors-section animate-in animate-in-delay-4">
                <div className="competitors-title">⚔️ Key Competitors</div>
                <div className="competitor-chips">
                  {result.competitors.map((c, i) => (
                    <span key={i} className="competitor-chip">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Research Detail Tabs ── */}
            <div className="research-container animate-in animate-in-delay-4">
              <div className="tabs-bar">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    id={`tab-${tab.key}`}
                    className={`tab-btn ${activeTab === tab.key ? "active" : ""}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="tab-content">
                {TABS.map((tab) =>
                  activeTab === tab.key ? (
                    <div key={tab.key}>
                      <div className="section-title">{tab.label} Analysis</div>
                      <p>{result[tab.field as keyof AgentStateType] as string}</p>
                    </div>
                  ) : null
                )}
              </div>
            </div>

            {/* ── Disclaimer ── */}
            <div className="disclaimer">
              ⚠️ <strong>Disclaimer:</strong> AlphaLens is an AI research tool
              for educational purposes only. This is <strong>not financial advice</strong>.
              Always conduct your own due diligence and consult a registered
              financial advisor before making investment decisions.
            </div>
          </div>
        )}

        {/* ── Empty State ── */}
        {!loading && !result && !error && (
          <div className="empty-state animate-in animate-in-delay-2">
            <div className="empty-icon">🔍</div>
            <div className="empty-text">
              Enter a company name above to start the AI research pipeline
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
