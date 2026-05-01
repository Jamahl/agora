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
  employee: { id: number; name: string; department?: string | null } | null;
  interview_id: number | null;
  similarity?: number;
  match_reason?: string | null;
};

type KeyResult = {
  id: number;
  description: string;
  target_metric?: string | null;
  current_value?: string | null;
  feedback?: Insight[];
};

type Attribution = {
  employee_id: number;
  name: string;
  count: number;
};

type OKRDetail = {
  id: number;
  objective: string;
  scope_type?: string;
  scope_id?: string | null;
  key_results: KeyResult[];
  insights: Insight[];
  attribution: Attribution[];
  departments?: { name: string; count: number }[];
  why?: string;
};

type Summary = {
  summary: string;
  source_count: number;
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

export default function OKRDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [detail, setDetail] = useState<OKRDetail | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await api<OKRDetail>(`/dashboard/okrs/${id}`);
        setDetail(res);
      } catch (e: any) {
        setError(e.message || "Failed to load OKR.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await api<Summary>(`/dashboard/okrs/${id}/summary`);
        setSummary(res);
      } catch (e: any) {
        setSummaryError(e.message || "Failed to generate summary.");
      } finally {
        setSummaryLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <div className="mx-auto max-w-5xl px-6 py-8 text-ink-500">Loading…</div>;
  }
  if (error || !detail) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link href="/dashboard/okrs" className="text-sm text-accent-500 hover:underline">
          ← OKRs
        </Link>
        <div className="card mt-4 text-danger-500">{error || "Not found."}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/dashboard/okrs" className="text-sm text-accent-500 hover:underline">
        ← OKRs
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{detail.objective}</h1>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="badge bg-lilac-50 text-lilac-700">
          {detail.scope_type === "department" ? `Department: ${detail.scope_id}` : "Company OKR"}
        </span>
        {detail.why && <span className="text-sm text-ink-500">{detail.why}</span>}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card bg-surface-50">
            <h2 className="text-lg font-medium">AI summary</h2>
            {summaryLoading ? (
              <div className="mt-2 text-sm italic text-ink-500">Generating…</div>
            ) : summaryError ? (
              <div className="mt-2 text-sm text-danger-500">{summaryError}</div>
            ) : summary ? (
              <div>
                <p className="mt-2 text-sm text-ink-700 whitespace-pre-wrap">{summary.summary}</p>
                <div className="mt-3 text-xs text-ink-500">
                  Based on {summary.source_count} {summary.source_count === 1 ? "insight" : "insights"}
                </div>
              </div>
            ) : null}
          </div>

          <div className="card">
            <h2 className="text-lg font-medium">Key results</h2>
            {detail.key_results.length === 0 ? (
              <div className="mt-3 text-sm text-ink-500">No key results defined.</div>
            ) : (
              <ul className="mt-3 space-y-4">
                {detail.key_results.map((k) => (
                  <li key={k.id} className="rounded-lg border border-surface-200 p-4 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-lilac-500" />
                      <div>
                        <div className="font-medium text-ink-900">{k.description}</div>
                        {k.target_metric && <div className="mt-1 text-xs text-ink-500">Target: {k.target_metric}</div>}
                      </div>
                    </div>
                    {k.feedback && k.feedback.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Direct feedback linked to this KR
                        </div>
                        {k.feedback.slice(0, 4).map((ins) => (
                          <Link key={`${k.id}-${ins.id}`} href={`/dashboard/interviews/${ins.interview_id}`} className="block rounded-md bg-lilac-50 p-3 hover:bg-lilac-100">
                            <div className="flex items-center gap-2">
                              <span className={`badge ${insightBadgeClass(ins.type)}`}>{formatInsightType(ins.type)}</span>
                              <span className="text-xs text-ink-500">sev {ins.severity}</span>
                              {ins.similarity && <span className="text-xs text-lilac-700">{Math.round(ins.similarity * 100)}% match</span>}
                            </div>
                            <p className="mt-1 text-ink-700">{ins.content}</p>
                            {ins.employee && <div className="mt-1 text-xs text-ink-500">— {ins.employee.name}{ins.employee.department ? ` · ${ins.employee.department}` : ""}</div>}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md border border-dashed border-surface-200 p-3 text-xs text-ink-500">
                        No direct feedback linked to this KR yet. Agora will watch for strong related signals in upcoming interviews.
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2 className="text-lg font-medium">Insights</h2>
            {detail.insights.length === 0 ? (
              <div className="mt-3 text-sm text-ink-500">
                No objective-level feedback yet. Agora will connect relevant notes after interviews complete.
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
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
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="text-lg font-medium">Attribution</h2>
            {detail.attribution.length === 0 ? (
              <div className="mt-3 text-sm text-ink-500">No attributions yet.</div>
            ) : (
              <ul className="mt-3 space-y-2">
                {detail.attribution.map((a) => (
                  <li key={a.employee_id} className="flex items-center justify-between text-sm">
                    <Link href={`/dashboard/employees/${a.employee_id}`} className="font-medium hover:text-accent-500">
                      {a.name}
                    </Link>
                    <span className="badge bg-surface-100 text-ink-700">{a.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {detail.departments && detail.departments.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-medium">Departments</h2>
              <ul className="mt-3 space-y-2">
                {detail.departments.map((d) => (
                  <li key={`dept-${d.name}`} className="flex items-center justify-between text-sm">
                    <span>{d.name}</span>
                    <span className="badge bg-lilac-50 text-lilac-700">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
