"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

type InsightType = "blocker" | "win" | "start_doing" | "stop_doing" | "tooling_gap" | "sentiment_note" | string;

type Insight = {
  id: number;
  type: InsightType;
  content: string;
  severity: number;
  employee: { id: number; name: string } | null;
  interview_id: number | null;
};

type ThemeDetail = {
  id: number;
  label: string;
  summary: string | null;
  insights: Insight[];
};

function insightBadgeClass(type: InsightType) {
  switch (type) {
    case "blocker":
      return "bg-danger-500/15 text-danger-500";
    case "win":
      return "bg-ok-500/15 text-ok-500";
    case "start_doing":
    case "stop_doing":
      return "bg-ink-900/10 text-ink-900";
    case "tooling_gap":
      return "bg-warn-500/15 text-warn-500";
    default:
      return "bg-surface-100 text-ink-700";
  }
}

function severityClass(s: number) {
  if (s >= 4) return "text-danger-500";
  if (s === 3) return "text-warn-500";
  return "text-ink-500";
}

function formatInsightType(type: string) {
  return type.replace(/_/g, " ");
}

export default function ThemeDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [detail, setDetail] = useState<ThemeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await api<ThemeDetail>(`/dashboard/themes/${id}`);
        setDetail(res);
      } catch (e: any) {
        setError(e.message || "Failed to load theme.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <div className="mx-auto max-w-5xl px-6 py-8 text-ink-500">Loading…</div>;
  }
  if (error || !detail) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link href="/dashboard/themes" className="text-sm text-accent-500 hover:underline">
          ← Themes
        </Link>
        <div className="card mt-4 text-danger-500">{error || "Not found."}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/dashboard/themes" className="text-sm text-accent-500 hover:underline">
        ← Themes
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{detail.label}</h1>
      {detail.summary && <p className="mt-3 text-ink-700">{detail.summary}</p>}

      <h2 className="mt-8 text-lg font-medium">
        Member insights
        <span className="ml-2 text-sm font-normal text-ink-500">({detail.insights.length})</span>
      </h2>
      {detail.insights.length === 0 ? (
        <div className="card mt-3 text-sm text-ink-500">No insights in this theme yet.</div>
      ) : (
        <div className="card mt-3">
          <ul className="space-y-3">
            {detail.insights.map((ins) => (
              <li key={ins.id} className="border-b border-surface-100 pb-3 last:border-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <span className={`badge ${insightBadgeClass(ins.type)} shrink-0`}>
                    {formatInsightType(ins.type)}
                  </span>
                  <p className="text-sm text-ink-700">{ins.content}</p>
                  <span className={`ml-auto text-xs ${severityClass(ins.severity)} shrink-0`}>sev {ins.severity}</span>
                </div>
                {(ins.employee || ins.interview_id) && (
                  <div className="mt-1 pl-1 text-xs text-ink-500">
                    {ins.employee && (
                      <>
                        —{" "}
                        <Link href={`/dashboard/employees/${ins.employee.id}`} className="hover:text-accent-500">
                          {ins.employee.name}
                        </Link>
                      </>
                    )}
                    {ins.interview_id && (
                      <>
                        {" · "}
                        <Link href={`/dashboard/interviews/${ins.interview_id}`} className="hover:text-accent-500">
                          interview
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
