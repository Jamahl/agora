"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { HeroStrip } from "@/components/modules/HeroStrip";
import { TopBlockers } from "@/components/modules/TopBlockers";
import { OkrHealth } from "@/components/modules/OkrHealth";
import { SentimentTrend } from "@/components/modules/SentimentTrend";
import { EmergingThemes } from "@/components/modules/EmergingThemes";

type Me = {
  has_session: boolean;
  onboarding_complete: boolean;
  company_id?: string | null;
  company_name?: string | null;
};

type Summary = { interviews: number; blockers: number; wins: number };

export default function DashboardHome() {
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoaded, setSummaryLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api<Me>("/admin/session/me");
        if (!cancelled) setCompanyName(me.company_name ?? null);
      } catch {
        /* keep header generic */
      }
      try {
        const s = await api<Summary>("/dashboard/home/summary");
        if (!cancelled) setSummary(s);
      } catch {
        if (!cancelled) setSummary({ interviews: 0, blockers: 0, wins: 0 });
      } finally {
        if (!cancelled) setSummaryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isEmpty = summaryLoaded && summary !== null && summary.interviews === 0;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-900">
          {companyName ? `${companyName} · Home` : "Home"}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          A weekly read on what's blocking, what's winning, and where sentiment is heading.
        </p>
      </header>

      <div className="mb-6">
        <HeroStrip />
      </div>

      {isEmpty ? (
        <div className="card text-sm text-ink-500">
          No interviews yet — once your first round runs, this page fills in with blockers, OKR signal, and sentiment trends.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TopBlockers />
          <OkrHealth />
          <SentimentTrend />
          <EmergingThemes />
        </div>
      )}
    </div>
  );
}
