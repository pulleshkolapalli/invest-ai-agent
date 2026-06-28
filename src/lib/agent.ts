/**
 * agent.ts — LangGraph Investment Research Pipeline
 *
 * WHY LANGGRAPH?
 * LangGraph's StateGraph lets us build a pipeline of AI "nodes" that each:
 *   1. Receive the full shared state (companyName + all prior analysis)
 *   2. Do their specialist job (one LLM call with a domain-specific persona)
 *   3. Return a partial state update
 * The graph wires these together in order. This is better than a single
 * mega-prompt because: (a) each node produces focused, high-quality output,
 * (b) later nodes can reference earlier analysis, (c) it's easy to add/remove
 * steps, and (d) streaming shows real progress to the user.
 *
 * WHY GEMINI 1.5 FLASH?
 * - Free tier available (no billing needed for testing)
 * - Very fast per-call latency (~2-5s per node)
 * - 1M context window future-proofs web-search integration
 * - Google's production-grade model
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// ─── Shared State Definition ──────────────────────────────────────────────────
/**
 * This object is the "shared memory" flowing through the entire pipeline.
 * Every node receives it, enriches it, and returns only the fields it changed.
 * LangGraph merges each return into the cumulative state automatically.
 */
const AgentState = Annotation.Root({
  // Input
  companyName: Annotation<string>(),

  // Node 1: Research Plan
  researchPlan: Annotation<string>(),

  // Node 2: Company Overview
  companyOverview: Annotation<string>(),

  // Node 3: Financial Health
  financialHealth: Annotation<string>(),
  keyMetrics: Annotation<Record<string, string>>(),

  // Node 4: Competitive Landscape
  competitiveLandscape: Annotation<string>(),
  competitors: Annotation<string[]>(),

  // Node 5: Growth Prospects
  growthProspects: Annotation<string>(),

  // Node 6: Risk Factors
  riskFactors: Annotation<string>(),
  redFlags: Annotation<string[]>(),
  greenFlags: Annotation<string[]>(),

  // Node 7: Market Sentiment
  sentimentAnalysis: Annotation<string>(),

  // Node 8: SWOT Analysis (NEW)
  swotAnalysis: Annotation<{
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  }>(),

  // Node 9: Final Verdict
  verdict: Annotation<"INVEST" | "PASS" | "HOLD" | "">(),
  confidenceScore: Annotation<number>(),
  reasoning: Annotation<string>(),
  investmentThesis: Annotation<string>(),

  // Internal tracking
  currentStep: Annotation<string>(),
  error: Annotation<string>(),
});

// Export the type so the frontend can use it for TypeScript safety
export type AgentStateType = typeof AgentState.State;

// ─── LLM Factory ─────────────────────────────────────────────────────────────
/**
 * We create a new LLM instance per call rather than a singleton.
 * WHY: Next.js API routes can be cold-started by Vercel, so a module-level
 * singleton might have a stale or undefined API key. Per-call is safer.
 *
 * temperature: 0.3 → slightly creative but factual (0 = deterministic)
 * maxOutputTokens: 2048 → enough for 200-word analysis sections
 */
function getLLM(temperature = 0.3) {
  return new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    apiKey: process.env.GOOGLE_API_KEY!,
    temperature,
    maxOutputTokens: 2048,
  });
}

// Helper: safely parse JSON from LLM response (LLMs sometimes wrap in backticks)
function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ─── Node 1: Research Planner ─────────────────────────────────────────────────
/**
 * WHY THIS NODE EXISTS:
 * Acts as the "Coordinator" that sets the research agenda. By explicitly
 * planning first, all subsequent nodes have context about what matters most
 * for this specific company. It's like a research director briefing their team.
 */
async function planResearch(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  // PROMPT: Senior research director persona with a specific, structured task
  const response = await llm.invoke([
    new SystemMessage(
      `You are a senior investment research director at a top-tier hedge fund with 20 years of experience. 
      You create precise, actionable research plans. Be concise and analytical. 
      Focus on what matters most for an investment decision.`
    ),
    new HumanMessage(
      `Create a focused investment research plan for "${state.companyName}".
      Identify the 5 most critical areas to investigate for a sound investment thesis.
      Format: numbered list, 1-2 sentences per point. Total: under 150 words.`
    ),
  ]);

  return {
    researchPlan: response.content as string,
    currentStep: "plan_complete",
  };
}

// ─── Node 2: Company Overview ─────────────────────────────────────────────────
/**
 * WHY THIS NODE EXISTS:
 * Establishes ground truth about the company — what it does, who leads it,
 * how big it is. This context is referenced by ALL subsequent nodes.
 * Without it, the financial analyst would have no baseline.
 */
async function analyzeCompanyOverview(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  const response = await llm.invoke([
    new SystemMessage(
      `You are a senior equity research analyst at Goldman Sachs. 
      Provide factual, data-driven company analysis. 
      Always include specific numbers, dates, and verifiable facts.
      Write in a professional investment research style.`
    ),
    new HumanMessage(
      `Write a company overview for "${state.companyName}" covering:
      1. Business model and primary revenue streams
      2. Founded year, headquarters, CEO/key executives  
      3. Market position and approximate market cap/valuation
      4. Key products/services (top 3-4)
      5. Major milestones from 2022-2025
      
      Use specific numbers. Write 180-220 words in paragraph form.`
    ),
  ]);

  return {
    companyOverview: response.content as string,
    currentStep: "overview_complete",
  };
}

// ─── Node 3: Financial Health ─────────────────────────────────────────────────
/**
 * WHY THIS NODE EXISTS:
 * Financial health is the single most important factor for an investment decision.
 * This node uses a CFA persona to extract revenue, margins, valuation multiples,
 * and cash flow — the four pillars of financial analysis.
 * 
 * It also makes TWO LLM calls: one for narrative analysis, one to extract
 * structured JSON metrics displayed as cards in the UI.
 */
async function analyzeFinancials(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  // Call 1: Narrative financial analysis
  const analysisResponse = await llm.invoke([
    new SystemMessage(
      `You are a CFA-certified financial analyst with expertise in equity research.
      Provide realistic financial analysis based on your knowledge.
      Always cite approximate figures with ranges where exact data is unavailable.
      Be honest about data limitations.`
    ),
    new HumanMessage(
      `Analyze the financial health of "${state.companyName}" for an investment decision:
      
      1. Revenue: Latest year figure + YoY growth rate
      2. Profitability: Gross margin, net margin, EBITDA margin
      3. Balance sheet: Cash position vs debt levels
      4. Valuation: P/E ratio, P/S ratio, or relevant multiples
      5. Free cash flow: Generation and trend
      
      If exact data is unavailable, give informed estimates with ranges.
      Professional tone, 180-220 words.`
    ),
  ]);

  // Call 2: Structured key metrics extraction (displayed as metric cards)
  const metricsResponse = await llm.invoke([
    new SystemMessage(
      `Extract data as JSON only. No markdown, no explanation, just valid JSON.`
    ),
    new HumanMessage(
      `For "${state.companyName}", provide approximate key metrics as a JSON object:
      {
        "Revenue": "e.g. $380B annually",
        "Growth": "e.g. +8% YoY",
        "Net Margin": "e.g. 26%",
        "Market Cap": "e.g. $3.5T",
        "Employees": "e.g. 150,000",
        "Founded": "e.g. 1976",
        "Sector": "e.g. Technology",
        "HQ": "e.g. Cupertino, CA"
      }
      Return ONLY valid JSON. No backticks, no explanation.`
    ),
  ]);

  const keyMetrics = safeParseJSON<Record<string, string>>(
    metricsResponse.content as string,
    { note: "See financial analysis section for metrics" }
  );

  return {
    financialHealth: analysisResponse.content as string,
    keyMetrics,
    currentStep: "financials_complete",
  };
}

// ─── Node 4: Competitive Landscape ───────────────────────────────────────────
/**
 * WHY THIS NODE EXISTS:
 * No company exists in isolation. Understanding the competitive moat (or lack of
 * one) is critical: a great company in a commoditized market can still be a bad
 * investment. This node uses Porter's Five Forces framework.
 */
async function analyzeCompetition(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  // Call 1: Narrative competitive analysis
  const analysisResponse = await llm.invoke([
    new SystemMessage(
      `You are a strategy consultant at McKinsey specializing in competitive intelligence for investment firms.
      Apply Porter's Five Forces thinking. Be specific about moat quality.`
    ),
    new HumanMessage(
      `Analyze the competitive landscape for "${state.companyName}":
      
      1. Top 3-4 direct competitors (name + brief differentiation)
      2. Market share estimate (approximate %)
      3. Competitive moat: rate and explain (network effects / switching costs / brand / IP / cost)
      4. Key competitive threats (incumbents, disruptors, substitutes)
      5. Porter's Five Forces: one sentence summary
      
      Be specific with competitor names and percentages. 180-220 words.`
    ),
  ]);

  // Call 2: Competitor list as JSON array (for competitor chips in UI)
  const competitorResponse = await llm.invoke([
    new SystemMessage(`Return ONLY a JSON array of strings. No markdown.`),
    new HumanMessage(
      `List the 4-5 main competitors of "${state.companyName}" as a JSON array.
      Example: ["Competitor A", "Competitor B", "Competitor C"]
      Return ONLY the JSON array.`
    ),
  ]);

  const competitors = safeParseJSON<string[]>(
    competitorResponse.content as string,
    []
  );

  return {
    competitiveLandscape: analysisResponse.content as string,
    competitors,
    currentStep: "competition_complete",
  };
}

// ─── Node 5: Growth Prospects ─────────────────────────────────────────────────
/**
 * WHY THIS NODE EXISTS:
 * Past financial performance is backward-looking. Investors care about future
 * growth. This node projects the TAM (Total Addressable Market) and identifies
 * catalysts — the reasons growth could accelerate or decelerate.
 */
async function analyzeGrowth(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  const response = await llm.invoke([
    new SystemMessage(
      `You are a growth equity analyst specializing in identifying high-potential investment opportunities.
      You combine top-down market sizing with bottom-up company analysis.
      Always quantify market sizes. Be optimistic but realistic.`
    ),
    new HumanMessage(
      `Analyze growth prospects for "${state.companyName}":
      
      1. TAM (Total Addressable Market) with a dollar estimate
      2. Top 3 growth catalysts for the next 2-3 years (be specific)
      3. New product/service lines in the pipeline
      4. International expansion potential (if applicable)
      5. Technology tailwinds or headwinds (AI, regulation, etc.)
      
      Be specific with market size figures (e.g. "$500B by 2027").
      Professional tone, 180-220 words.`
    ),
  ]);

  return {
    growthProspects: response.content as string,
    currentStep: "growth_complete",
  };
}

// ─── Node 6: Risk Factors ─────────────────────────────────────────────────────
/**
 * WHY THIS NODE EXISTS:
 * Risk analysis is the most critical node for capital protection.
 * Every investment thesis must be stress-tested against what could go wrong.
 * This node produces both narrative risk analysis AND structured green/red flags
 * for the UI cards.
 */
async function analyzeRisks(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  // Call 1: Narrative risk analysis
  const riskResponse = await llm.invoke([
    new SystemMessage(
      `You are a chief risk officer at a major investment bank.
      You identify and quantify investment risks with precision.
      Use a framework: regulatory / market / operational / technology / governance.
      Rate each risk: LOW / MEDIUM / HIGH with one-sentence justification.`
    ),
    new HumanMessage(
      `Identify top risk factors for investing in "${state.companyName}":
      
      1. Regulatory/legal risks (rate: LOW/MEDIUM/HIGH)
      2. Market/macro risks (rate: LOW/MEDIUM/HIGH) 
      3. Operational risks (rate: LOW/MEDIUM/HIGH)
      4. Technology disruption risks (rate: LOW/MEDIUM/HIGH)
      5. Management/governance risks (rate: LOW/MEDIUM/HIGH)
      
      Be specific — name actual risks (e.g. "DOJ antitrust case", "China market exposure").
      170-200 words.`
    ),
  ]);

  // Call 2: Structured green/red flags JSON (for flag cards in UI)
  const flagsResponse = await llm.invoke([
    new SystemMessage(`Return ONLY valid JSON. No markdown. No explanation.`),
    new HumanMessage(
      `For "${state.companyName}", list 3-4 specific investment flags as JSON:
      {
        "redFlags": ["specific concern 1", "specific concern 2", "specific concern 3"],
        "greenFlags": ["specific strength 1", "specific strength 2", "specific strength 3"]
      }
      Make flags specific and factual (e.g. "Revenue grew 42% YoY in FY2024").
      Return ONLY the JSON object.`
    ),
  ]);

  const flags = safeParseJSON<{ redFlags: string[]; greenFlags: string[] }>(
    flagsResponse.content as string,
    { redFlags: [], greenFlags: [] }
  );

  return {
    riskFactors: riskResponse.content as string,
    redFlags: flags.redFlags || [],
    greenFlags: flags.greenFlags || [],
    currentStep: "risks_complete",
  };
}

// ─── Node 7: Market Sentiment ─────────────────────────────────────────────────
/**
 * WHY THIS NODE EXISTS:
 * Even fundamentally strong companies can be bad investments if sentiment is
 * extremely negative (short interest, regulatory concerns) or if they're
 * priced for perfection. Sentiment is the "temperature check" on the market's
 * current view.
 */
async function analyzeSentiment(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  const response = await llm.invoke([
    new SystemMessage(
      `You are a market sentiment analyst covering institutional and retail investor behavior.
      Track Wall Street consensus, news flow, insider activity, and social sentiment.
      Be specific: name analyst firms, cite actual ratings where known.`
    ),
    new HumanMessage(
      `Analyze market sentiment for "${state.companyName}" (as of 2024-2025):
      
      1. Wall Street consensus: analyst buy/hold/sell breakdown (approximate %)
      2. Recent news sentiment: summarize positive/negative narrative
      3. Insider activity: recent buying or selling trends
      4. Institutional sentiment: major fund positioning
      5. Retail/social sentiment: Reddit, StockTwits, X (Twitter) tone
      
      Overall sentiment: BULLISH / NEUTRAL / BEARISH with one reason.
      150-180 words.`
    ),
  ]);

  return {
    sentimentAnalysis: response.content as string,
    currentStep: "sentiment_complete",
  };
}

// ─── Node 8: SWOT Analysis (NEW) ──────────────────────────────────────────────
/**
 * WHY THIS NODE EXISTS:
 * SWOT is the classic strategic framework every investor knows. It synthesizes
 * ALL previous research (overview, financials, competition, risks, sentiment)
 * into four structured categories. This node comes AFTER all analysis nodes
 * so it can draw on the full picture.
 *
 * WHY IT COMES HERE (not first):
 * The SWOT is a synthesis, not a research task. It's more accurate when the
 * LLM has already "thought through" each dimension separately in prior nodes.
 * This mirrors how a real research team would write the SWOT page LAST in a
 * report, after the individual sections are drafted.
 */
async function generateSWOT(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const llm = getLLM();

  // We pass the research context so the SWOT is grounded in prior analysis
  const context = `
Company: ${state.companyName}
Overview: ${state.companyOverview?.slice(0, 300)}
Financials: ${state.financialHealth?.slice(0, 300)}
Competition: ${state.competitiveLandscape?.slice(0, 300)}
Risks: ${state.riskFactors?.slice(0, 300)}
  `.trim();

  const response = await llm.invoke([
    new SystemMessage(`Return ONLY valid JSON. No markdown. No explanation.`),
    new HumanMessage(
      `Based on this research context about "${state.companyName}":
${context}

Generate a SWOT analysis as JSON with 4 items per category:
{
  "strengths": ["strength 1", "strength 2", "strength 3", "strength 4"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3", "weakness 4"],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3", "opportunity 4"],
  "threats": ["threat 1", "threat 2", "threat 3", "threat 4"]
}

Each item should be a specific, factual 1-sentence point.
Return ONLY the JSON object.`
    ),
  ]);

  const swot = safeParseJSON<{
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  }>(response.content as string, {
    strengths: ["Strong market position"],
    weaknesses: ["Requires further analysis"],
    opportunities: ["Market expansion potential"],
    threats: ["Competitive pressure"],
  });

  return {
    swotAnalysis: swot,
    currentStep: "swot_complete",
  };
}

// ─── Node 9: Final Verdict ────────────────────────────────────────────────────
/**
 * WHY THIS NODE EXISTS:
 * This is the "Chief Investment Officer" — it reads ALL prior analysis and
 * makes the final INVEST / HOLD / PASS decision with a confidence score.
 * It's deliberately placed LAST so it has maximum context.
 *
 * WHY A SEPARATE NODE (not embedded in one of the earlier ones)?
 * The verdict node's job is synthesis and decision-making, not research.
 * Separating it gives a clear audit trail: you can see exactly what information
 * the final decision was based on.
 *
 * VERDICT SEMANTICS:
 * - INVEST: Strong fundamental case, acceptable risk, positive momentum
 * - HOLD: Mixed signals, wait for clarity, or good company at bad price
 * - PASS: Fundamental concerns, excessive risk, or structural decline
 */
async function generateVerdict(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const llm = getLLM(0.1); // Lower temperature = more consistent decisions

  // Build full context from all prior nodes
  const context = `
COMPANY: ${state.companyName}
RESEARCH PLAN: ${state.researchPlan}
COMPANY OVERVIEW: ${state.companyOverview}
FINANCIAL HEALTH: ${state.financialHealth}
COMPETITIVE LANDSCAPE: ${state.competitiveLandscape}
GROWTH PROSPECTS: ${state.growthProspects}
RISK FACTORS: ${state.riskFactors}
MARKET SENTIMENT: ${state.sentimentAnalysis}
GREEN FLAGS: ${(state.greenFlags || []).join(", ")}
RED FLAGS: ${(state.redFlags || []).join(", ")}
  `.trim();

  const response = await llm.invoke([
    new SystemMessage(
      `You are the Chief Investment Officer of a $10B hedge fund.
      You make the final investment decision based on comprehensive research.
      You are rational, data-driven, and clear. You do not hedge excessively.
      Return ONLY valid JSON. No markdown. No preamble.`
    ),
    new HumanMessage(
      `Based on this complete investment research on "${state.companyName}":

${context}

Make a final investment decision. Return ONLY this JSON:
{
  "verdict": "INVEST" or "HOLD" or "PASS",
  "confidenceScore": <integer 0-100>,
  "reasoning": "<2-3 sentences: clear, specific rationale for the decision>",
  "investmentThesis": "<1 paragraph: the bull/bear case that supports this decision>"
}

Scoring guide:
- INVEST: Use when fundamentals are strong, growth is clear, risks are manageable
- HOLD: Use when mixed signals, expensive valuation, or better entry point needed  
- PASS: Use when structural decline, excessive risk, or governance concerns

Return ONLY the JSON object.`
    ),
  ]);

  const parsed = safeParseJSON<{
    verdict: "INVEST" | "HOLD" | "PASS";
    confidenceScore: number;
    reasoning: string;
    investmentThesis: string;
  }>(response.content as string, {
    verdict: "HOLD",
    confidenceScore: 50,
    reasoning: response.content as string,
    investmentThesis: "Analysis complete. See detailed research above.",
  });

  return {
    verdict: parsed.verdict || "HOLD",
    confidenceScore: Math.min(100, Math.max(0, parsed.confidenceScore || 50)),
    reasoning: parsed.reasoning || "",
    investmentThesis: parsed.investmentThesis || "",
    currentStep: "complete",
  };
}

// ─── Build the LangGraph StateGraph ──────────────────────────────────────────
/**
 * The graph defines the TOPOLOGY of our AI pipeline.
 * Each .addNode() registers an async function.
 * Each .addEdge() defines the execution order.
 * 
 * Current topology: LINEAR (sequential)
 * Each node builds on the prior one's output.
 * Future improvement: parallelize nodes 2, 3, 4 (they're independent)
 * which would cut latency from ~60s to ~30s.
 */
function buildAgentGraph() {
  const graph = new StateGraph(AgentState)
    .addNode("plan", planResearch)                // Node 1: Coordinator
    .addNode("overview", analyzeCompanyOverview)  // Node 2: Research Agent
    .addNode("financials", analyzeFinancials)     // Node 3: Financial Analysis
    .addNode("competition", analyzeCompetition)   // Node 4: Competitive Analysis
    .addNode("growth", analyzeGrowth)             // Node 5: Growth Analysis
    .addNode("risks", analyzeRisks)               // Node 6: Risk Analysis
    .addNode("sentiment", analyzeSentiment)       // Node 7: News/Sentiment
    .addNode("swot", generateSWOT)                // Node 8: SWOT Synthesis
    .addNode("generateVerdictNode", generateVerdict) // Node 9: Decision Agent (renamed to avoid state collision)
    // Wire the nodes in sequence
    .addEdge(START, "plan")
    .addEdge("plan", "overview")
    .addEdge("overview", "financials")
    .addEdge("financials", "competition")
    .addEdge("competition", "growth")
    .addEdge("growth", "risks")
    .addEdge("risks", "sentiment")
    .addEdge("sentiment", "swot")
    .addEdge("swot", "generateVerdictNode")
    .addEdge("generateVerdictNode", END);

  return graph.compile();
}

// ─── Step Labels (displayed in the UI progress tracker) ──────────────────────
const STEP_LABELS: Record<string, string> = {
  plan: "📋 Planning Research",
  overview: "🏢 Researching Company",
  financials: "💰 Analyzing Financials",
  competition: "⚔️ Mapping Competition",
  growth: "📈 Evaluating Growth",
  risks: "⚠️ Assessing Risks",
  sentiment: "📡 Reading Market Sentiment",
  swot: "🔲 Building SWOT Analysis",
  generateVerdictNode: "🎯 Generating Recommendation",
};

// ─── Main Export: Run the Agent ───────────────────────────────────────────────
/**
 * runInvestmentAgent()
 * 
 * Streams the LangGraph pipeline using app.stream() which emits one event
 * per node completion. We call onProgress() for each step so the UI can
 * update the progress tracker in real-time.
 * 
 * The function returns the FINAL accumulated state after all nodes complete.
 * This fixes the previous bug of running twice.
 */
export async function runInvestmentAgent(
  companyName: string,
  onProgress?: (step: string) => void
): Promise<AgentStateType> {
  const app = buildAgentGraph();

  // Initial state — all fields empty, companyName is the only input
  const initialState: Partial<AgentStateType> = {
    companyName,
    researchPlan: "",
    companyOverview: "",
    financialHealth: "",
    keyMetrics: {},
    competitiveLandscape: "",
    competitors: [],
    growthProspects: "",
    riskFactors: "",
    redFlags: [],
    greenFlags: [],
    sentimentAnalysis: "",
    swotAnalysis: {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    },
    verdict: "",
    confidenceScore: 0,
    reasoning: "",
    investmentThesis: "",
    currentStep: "starting",
    error: "",
  };

  let finalState: AgentStateType = initialState as AgentStateType;

  /**
   * app.stream() yields one event per node:
   * { "nodeName": { ...partialStateFromThatNode } }
   * 
   * We merge each partial update into finalState so at the end,
   * finalState is the complete accumulated result of all nodes.
   */
  for await (const event of await app.stream(initialState)) {
    const [nodeName, nodeState] = Object.entries(event)[0] as [
      string,
      Partial<AgentStateType>
    ];
    // Accumulate state updates
    finalState = { ...finalState, ...nodeState };
    // Notify the API route so it can SSE-push progress to the frontend
    if (onProgress) {
      const label = STEP_LABELS[nodeName] || nodeName;
      onProgress(label);
    }
  }

  return finalState;
}
