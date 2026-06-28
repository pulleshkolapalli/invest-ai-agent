# AlphaLens — AI Investment Research Agent

> **InsideIIM × Altuni AI Labs** · AI Product Engineer Intern Assignment  
> Built by **Pullesh Kolapalli** · [GitHub: pulleshkolapalli](https://github.com/pulleshkolapalli)

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![LangGraph](https://img.shields.io/badge/LangGraph.js-0.2-blue)](https://langchain-ai.github.io/langgraphjs/)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-1.5%20Flash-orange?logo=google)](https://aistudio.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)

Live Demo: https://alphalens-investment-ai.vercel.app/ 

---

## What Is AlphaLens?

AlphaLens is a full-stack AI investment research agent. A user enters any company name, and the app runs a **9-node LangGraph AI pipeline** — each node is a specialist AI analyst — and produces a comprehensive investment report with a final **INVEST / HOLD / PASS** verdict.

It solves a real problem: instead of reading annual reports, financial news, and analyst PDFs for hours, an investor gets a structured, professional-grade research summary in under 60 seconds.

---

## Features

| Feature | Details |
|---------|---------|
| 🤖 **Multi-Agent AI Pipeline** | 9 LangGraph nodes, each a specialist analyst |
| 📊 **Full Investment Report** | Company overview, financials, competition, growth, risks |
| 🔲 **SWOT Analysis** | 2×2 grid: Strengths, Weaknesses, Opportunities, Threats |
| ⚔️ **Competitor Mapping** | Auto-extracted competitor list |
| 🎯 **Investment Verdict** | INVEST / HOLD / PASS with confidence score (0-100%) |
| 📡 **Real-Time Progress** | Server-Sent Events stream: watch each research step complete |
| 📄 **PDF Export** | Print-optimized report export |
| 📋 **Copy Report** | One-click copy of full report to clipboard |
| 🕐 **Recent Searches** | localStorage-persisted search history |
| 🌙 **Dark Mode** | Trading terminal aesthetic, always dark |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js 14, React 18, TypeScript | App Router, RSC, type safety |
| **Styling** | Vanilla CSS (Space Grotesk + JetBrains Mono) | Full control, trading terminal aesthetic |
| **AI Orchestration** | **LangGraph.js** (StateGraph) | Explicit pipeline control, streaming, extensible |
| **LLM** | **Google Gemini 1.5 Flash** | Free tier, fast, 1M context window |
| **LangChain** | `@langchain/google-genai`, `@langchain/core` | LLM abstraction layer |
| **Streaming** | Server-Sent Events (SSE) | Real-time progress updates |
| **Validation** | Zod (schema validation) | Type-safe LLM output parsing |
| **Deployment** | Vercel | Zero-config Next.js hosting |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│              Next.js App Router (React 18, TypeScript)          │
│   Search Box → Progress Tracker → Verdict → SWOT → Tabs       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /api/research
                           │ SSE stream response
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NEXT.JS API ROUTE                          │
│                  /src/app/api/research/route.ts                 │
│   Input validation → SSE stream → calls LangGraph agent        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LANGGRAPH STATE MACHINE                        │
│                    /src/lib/agent.ts                            │
│                                                                 │
│  [START]                                                        │
│     │                                                           │
│  ┌──▼──────────────────────────────────────────────────────┐   │
│  │ Node 1: planResearch        [Research Director persona]  │   │
│  └──┬──────────────────────────────────────────────────────┘   │
│     │                                                           │
│  ┌──▼──────────────────────────────────────────────────────┐   │
│  │ Node 2: analyzeCompanyOverview  [Equity Analyst persona] │   │
│  └──┬──────────────────────────────────────────────────────┘   │
│     │                                                           │
│  ┌──▼──────────────────────────────────────────────────────┐   │
│  │ Node 3: analyzeFinancials       [CFA Analyst persona]    │   │
│  └──┬──────────────────────────────────────────────────────┘   │
│     │                                                           │
│  ┌──▼──────────────────────────────────────────────────────┐   │
│  │ Node 4: analyzeCompetition   [Strategy Consultant]       │   │
│  └──┬──────────────────────────────────────────────────────┘   │
│     │                                                           │
│  ┌──▼──────────────────────────────────────────────────────┐   │
│  │ Node 5: analyzeGrowth        [Growth Equity Analyst]     │   │
│  └──┬──────────────────────────────────────────────────────┘   │
│     │                                                           │
│  ┌──▼──────────────────────────────────────────────────────┐   │
│  │ Node 6: analyzeRisks         [Risk Officer persona]      │   │
│  └──┬──────────────────────────────────────────────────────┘   │
│     │                                                           │
│  ┌──▼──────────────────────────────────────────────────────┐   │
│  │ Node 7: analyzeSentiment     [Sentiment Analyst]         │   │
│  └──┬──────────────────────────────────────────────────────┘   │
│     │                                                           │
│  ┌──▼──────────────────────────────────────────────────────┐   │
│  │ Node 8: generateSWOT         [SWOT Specialist]           │   │
│  └──┬──────────────────────────────────────────────────────┘   │
│     │                                                           │
│  ┌──▼──────────────────────────────────────────────────────┐   │
│  │ Node 9: generateVerdict      [Chief Investment Officer]  │   │
│  └──┬──────────────────────────────────────────────────────┘   │
│     │                                                           │
│  [END]   → returns AgentStateType to route.ts                  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ Each node streams { type: "progress", step }
                           │ Final node streams { type: "complete", result }
                           ▼
                      React Frontend
                    (real-time updates)
```

---

## LangGraph State

Every node reads from and writes to a single shared `AgentStateType` object:

```typescript
{
  // Input
  companyName: string,

  // Pipeline outputs (one per node)
  researchPlan: string,
  companyOverview: string,
  financialHealth: string,
  keyMetrics: Record<string, string>,   // Displayed as metric cards
  competitiveLandscape: string,
  competitors: string[],                // Displayed as chips
  growthProspects: string,
  riskFactors: string,
  redFlags: string[],                   // Displayed as concern bullets
  greenFlags: string[],                 // Displayed as strength bullets
  sentimentAnalysis: string,
  swotAnalysis: {                       // Displayed as 2×2 SWOT grid
    strengths: string[],
    weaknesses: string[],
    opportunities: string[],
    threats: string[],
  },

  // Final decision
  verdict: "INVEST" | "HOLD" | "PASS",
  confidenceScore: number,              // 0-100
  reasoning: string,
  investmentThesis: string,
}
```

---

## Folder Structure

```
FINAL-alphalens/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── research/
│   │   │       └── route.ts     ← POST endpoint, SSE streaming, input validation
│   │   ├── globals.css          ← All CSS: design tokens, components, print styles
│   │   ├── layout.tsx           ← Root layout, SEO metadata (Open Graph, Twitter)
│   │   └── page.tsx             ← Main UI: search, progress, full report display
│   └── lib/
│       └── agent.ts             ← LangGraph 9-node pipeline (core AI logic)
├── .env.local.example           ← API key template
├── .env.local                   ← Your API key (never committed to git)
├── .gitignore                   ← Excludes node_modules, .env.local, .next
├── next.config.js               ← Next.js config
├── package.json                 ← Dependencies: LangGraph, Gemini, Next.js
├── tsconfig.json                ← TypeScript configuration
├── vercel.json                  ← Vercel function timeout (120s)
└── README.md                    ← This file
```

**Folder Explanations:**
- `src/app/` — Next.js App Router pages and API routes
- `src/app/api/` — Backend API endpoints (POST /research)
- `src/lib/` — Shared business logic (the LangGraph agent)
- `.env.local` — Environment secrets (never committed)

---

## Installation & Running Locally

### Prerequisites
- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **Google Gemini API key** — Free at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

### Setup

```bash
# 1. Enter the project folder
cd "FINAL-alphalens (1)"

# 2. Install dependencies
npm install

# 3. Create your environment file
copy .env.local.example .env.local
# Now open .env.local and add your GOOGLE_API_KEY

# 4. Run the development server
npm run dev

# 5. Open in browser
# http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | ✅ Yes | Google Gemini API key — free at [aistudio.google.com](https://aistudio.google.com/app/apikey) |

---

## Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Then in the **Vercel Dashboard**:
1. Go to your project → **Settings** → **Environment Variables**
2. Add `GOOGLE_API_KEY` with your Gemini API key
3. Redeploy

---

## Example Output

### Apple Inc.
```
Verdict: INVEST ✅ | Confidence: 84%

Reasoning: Apple demonstrates exceptional financial health with ~$380B in annual 
revenue, industry-leading 26% net margins, and $160B+ cash position. The ecosystem 
moat combining hardware, software, services, and 2B+ device users creates powerful 
switching costs competitors cannot easily replicate.

SWOT:
  Strengths:    Services revenue growing 15%+ YoY, $3.5T market cap, iPhone supercycle
  Weaknesses:   China revenue concentration (19%), slowing hardware growth
  Opportunities: Vision Pro spatial computing, AI integration, India market
  Threats:      DOJ antitrust case, geopolitical risk, regulatory pressure on App Store

Key Metrics: Revenue: $383B | Growth: +8% | Net Margin: 26% | Market Cap: $3.5T
```

### Byju's
```
Verdict: PASS ❌ | Confidence: 93%

Reasoning: Byju's faces existential challenges — NCLT insolvency proceedings, 
$1.2B TLB default, auditor resignations, and a valuation collapse from $22B to 
near-zero. No investment thesis survives fundamental governance failure.
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **LangGraph over plain LangChain** | StateGraph gives explicit control over node order, state passing, and streaming. Easy to add conditional edges, retry logic, and parallel nodes in the future. |
| **Sequential nodes (not parallel)** | Each analyst builds on prior context — the SWOT node reads all 7 prior analyses. Parallel would be faster but lose this contextual chain. |
| **SSE over WebSockets** | SSE is simpler (one-directional), stateless, works through HTTP proxies, and Next.js API Routes support it natively. WebSockets would add complexity without benefit here. |
| **Specialist system prompts** | A "CFA analyst" persona produces better financial analysis than a generic prompt. Each node has a domain-specific persona with a specific task. |
| **window.print() for PDF** | Simpler than jsPDF/Puppeteer, produces better-formatted output, and doesn't add any dependencies. Print CSS hides non-report elements. |
| **Gemini 1.5 Flash** | Free tier, fast per-call (~2-4s), 1M context window. Ideal for a demo that needs to be free to run. |
| **localStorage for history** | Zero backend needed. Works offline. Simple and appropriate for a single-user demo app. |

---

## What I Would Improve With More Time

1. **Real-time web search** — Integrate Serper or Tavily API to pull live news and current earnings instead of relying on training data
2. **Parallel research nodes** — Nodes 2, 3, 4 are independent — run them in parallel to cut latency from ~60s to ~25s
3. **Conditional graph edges** — If a company has ongoing fraud allegations, skip straight to PASS without analyzing growth
4. **Financial data APIs** — Yahoo Finance / Alpha Vantage for real stock prices and P/E ratios
5. **User authentication** — Supabase auth + history stored in PostgreSQL
6. **Comparison mode** — Research 2-3 companies side-by-side
7. **Human-in-the-loop** — Let users challenge the verdict and have the agent reconsider

---

## Interview Q&A: Deep Dive into Architecture & Decisions

### Q: Why did you choose LangGraph instead of a simpler LangChain sequence?

**A:** Building an agentic pipeline isn't just about chaining prompts; it's about managing state reliably. I chose LangGraph's `StateGraph` because it treats the research process like a deterministic finite state machine. A simple chain is a black box once it starts executing. With LangGraph:
1. **State Hydration:** I can inspect the exact payload moving between the 'Financial Analyst' node and the 'SWOT Analyst' node. 
2. **Extensibility without Refactoring:** If I want to add a "Fraud Detection" node tomorrow, I just add the node and route an edge. In a traditional chain, I'd have to rewrite the entire sequence logic.
3. **Native Streaming:** `app.stream()` gives us real-time event emission per node natively, which is what powers the highly responsive frontend UI.

### Q: Explain how the final recommendation (INVEST/HOLD/PASS) is actually generated.

**A:** The magic isn't in a massive single prompt—it's in the synthesis phase. The `generateVerdict` node acts as the "Chief Investment Officer" (CIO). By the time execution reaches this node, the state object is fully saturated with structured data from 8 previous specialized nodes (financials, competitive moat, identified risks, SWOT). 

Instead of asking the LLM to research *and* decide simultaneously (which leads to hallucinations and shallow analysis), the CIO node's prompt is purely analytical. It forces the LLM to weigh the previously established facts. I explicitly lowered the temperature for this specific node (`0.1`) compared to the research nodes (`0.3`) because we want deterministic, highly rational synthesis, not creative brainstorming.

### Q: Why did you use Server-Sent Events (SSE) instead of WebSockets?

**A:** WebSockets are massive overkill for this use case and introduce unnecessary state management on the server. Our data flow is strictly unidirectional: Server ➔ Client. 
SSE is built on standard HTTP, works seamlessly through corporate proxies, and Next.js App Router API routes support `ReadableStream` out of the box. We get real-time UI updates (the 9-step progress tracker) without the overhead of managing a WebSocket connection pool, ping/pong heartbeats, or dealing with reconnection logic on the frontend. 

### Q: What's the biggest architectural limitation right now, and how would you fix it?

**A:** The most glaring limitation is that the LLM is bounded by its training data cutoff. If a CEO resigned yesterday, this agent won't know. 
**The Fix:** I would implement a **RAG (Retrieval-Augmented Generation)** pattern specifically for the `analyzeSentiment` and `analyzeCompanyOverview` nodes. I'd integrate a tool like the Tavily Search API or Serper to fetch the top 5 news articles from the last 7 days, inject that context into the prompt, and force the LLM to ground its analysis in real-time events. 

### Q: How would you scale this to handle 10,000 concurrent users?

**A:** Right now, this is a synchronous pipeline running inside a Vercel serverless function (capped at 120s execution time). That architecture will break under heavy load due to API rate limits and function timeouts. 
**The V2 Architecture:**
1. **Decouple Execution:** Move the LangGraph execution to a background worker (e.g., using Inngest or a standard Redis/BullMQ setup on a long-running Node server). 
2. **Polling / Webhooks:** The frontend POSTs a request, gets a `job_id`, and subscribes to SSE or polls for status updates.
3. **Aggressive Caching:** 90% of users will search for "Apple" or "Tesla". I would cache the final `AgentStateType` in Redis or PostgreSQL, keyed by `hash(company_name + current_date)`. If a report is less than 24 hours old, serve it instantly from the cache, bypassing the LLM entirely.

---

## LLM Chat Transcript (Development Process)

**Prompt 1 — Architecture:**
> "I need to build an AI investment research agent using LangGraph.js and Next.js. The agent should take a company name and output an INVEST/PASS/HOLD verdict. Help me design the state graph structure."

*Result: Designed the sequential 9-node pipeline with specialist personas and shared AgentState.*

**Prompt 2 — SWOT node positioning:**
> "Should the SWOT node come before or after the risk analysis node?"

*Result: After — SWOT is a synthesis of all prior research, so it should read the completed analyses.*

**Prompt 3 — SSE streaming fix:**
> "The progress stream works but the final result is empty because I'm calling runInvestmentAgent twice."

*Result: Fixed to capture the return value from the first (streaming) call instead of running again.*

**Prompt 4 — JSON parsing robustness:**
> "My LLM sometimes wraps JSON in markdown backticks. How do I handle this?"

*Result: Built `safeParseJSON()` helper that strips backticks before parsing, with a typed fallback.*

---

*Built by Pullesh Kolapalli · June 2025 · GitHub: [pulleshkolapalli](https://github.com/pulleshkolapalli)*  
*InsideIIM AI Product Engineer Intern Assignment*
