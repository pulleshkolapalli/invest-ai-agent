import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * layout.tsx — Root Layout (Next.js App Router)
 *
 * This wraps every page. It:
 * 1. Loads global CSS (fonts, variables, base styles)
 * 2. Sets SEO metadata (title, description, Open Graph)
 * 3. Sets viewport for responsive design
 *
 * WHY APP ROUTER?
 * Next.js 14 App Router is the modern standard. It supports React Server
 * Components, streaming, improved caching, and the Metadata API for SEO.
 */

export const metadata: Metadata = {
  title: "AlphaLens — AI Investment Research Agent",
  description:
    "AI-powered investment research agent. Enter any company name and get a full INVEST / HOLD / PASS verdict with SWOT analysis, financials, risk factors, and competitor mapping — powered by LangGraph and Google Gemini.",
  keywords: [
    "investment research",
    "AI investing",
    "stock analysis",
    "LangGraph",
    "Gemini AI",
    "SWOT analysis",
    "financial analysis",
    "investment agent",
  ],
  authors: [{ name: "Pullesh Kolapalli", url: "https://github.com/pulleshkolapalli" }],
  openGraph: {
    title: "AlphaLens — AI Investment Research Agent",
    description:
      "Get a full AI-powered investment report for any company in under a minute.",
    type: "website",
    siteName: "AlphaLens",
  },
  twitter: {
    card: "summary_large_image",
    title: "AlphaLens — AI Investment Research Agent",
    description: "AI-powered INVEST / HOLD / PASS verdicts for any company.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0e17",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
