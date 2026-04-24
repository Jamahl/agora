"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";

type InsightType = "blocker" | "win" | "start_doing" | "stop_doing" | "tooling_gap" | "sentiment_note" | string;

type TopInsight = {
  type: InsightType;
  content: string;
  severity: number;
};

type Sentiment = {
  morale: number;
  energy: number;
  candor: number;
  urgency: number;
};

type InterviewRow = {
  id: number;
  scheduled_at: string | null;
  ended_at: string | null;
  status: string;
  insight_count: number;
  top_insights: TopInsight[];
  sentiment: Sentiment | null;
};

type EmployeeDetail = {
  id: number;
  name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  manager_id: number | null;
  memory_summary: string | null;
  status: "active" | "archived";
  interviews: InterviewRow[];
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

function safeFormatDate(iso: string | null, fallback = "—") {
  if (!iso) return fallback;
  try {
    return format(parseISO(iso), "MMM d, yyyy · h:mm a");
  } catch {
    return fallback;
  }
}

function SentimentTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-surface-200 px-3 py-2 text-center">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value.toFixed(1)}</div>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await api<EmployeeDetail>(`/dashboard/employees/${id}`);
        setData(res);
      } catch (e: any) {
        setError(e.message || "Failed to load employee.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <div className="mx-auto max-w-5xl px-6 py-8 text-ink-500">Loading…</div>;
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link href="/dashboard/employees" className="text-sm text-accent-500 hover:underline">
          ← Employees
        </Link>
        <div className="card mt-4 text-danger-500">{error || "Not found."}</div>
      </div>
    );
  }

  const sortedInterviews = [...data.interviews].sort((a, b) => {
    const ad = a.ended_at || a.scheduled_at || "";
    const bd = b.ended_at || b.scheduled_at || "";
    return bd.localeCompare(ad);
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/dashboard/employees" className="text-sm text-accent-500 hover:underline">
        ← Employees
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <div className="mt-1 text-sm text-ink-500">
            {data.job_title || "—"}
            {data.department && (
              <>
                {" · "}
                <Link href={`/dashboard/departments/${encodeURIComponent(data.department)}`} className="hover:text-accent-500">
                  {data.department}
                </Link>
              </>
            )}
            {" · "}
            <span>{data.email}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <TestInterviewButton employeeId={data.id} />
          <span className={`badge ${data.status === "active" ? "bg-ok-500/15 text-ok-500" : "bg-surface-100 text-ink-500"}`}>
            {data.status}
          </span>
        </div>
      </div>

      {data.memory_summary && (
        <p className="mt-6 italic text-ink-500">{data.memory_summary}</p>
      )}

      <h2 className="mt-8 text-lg font-medium">Interview history</h2>
      {sortedInterviews.length === 0 ? (
        <div className="card mt-3 text-sm text-ink-500">
          No interviews yet — the first one runs when the cadence window opens.
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {sortedInterviews.map((iv) => (
            <div key={iv.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    href={`/dashboard/interviews/${iv.id}`}
                    className="text-base font-medium hover:text-accent-500"
                  >
                    {safeFormatDate(iv.ended_at || iv.scheduled_at, "Scheduled")}
                  </Link>
                  <div className="mt-0.5 text-xs text-ink-500">
                    {iv.status} · {iv.insight_count} {iv.insight_count === 1 ? "insight" : "insights"}
                  </div>
                </div>
                <Link
                  href={`/dashboard/interviews/${iv.id}`}
                  className="btn-ghost"
                >
                  View →
                </Link>
              </div>

              {iv.sentiment && (
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <SentimentTile label="Morale" value={iv.sentiment.morale} />
                  <SentimentTile label="Energy" value={iv.sentiment.energy} />
                  <SentimentTile label="Candor" value={iv.sentiment.candor} />
                  <SentimentTile label="Urgency" value={iv.sentiment.urgency} />
                </div>
              )}

              {iv.top_insights.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {iv.top_insights.map((ins, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className={`badge ${insightBadgeClass(ins.type)} shrink-0`}>
                        {formatInsightType(ins.type)}
                      </span>
                      <span className="text-ink-700">{ins.content}</span>
                      <span className={`ml-auto text-xs ${severityClass(ins.severity)} shrink-0`}>
                        sev {ins.severity}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TestInterviewButton({ employeeId }: { employeeId: number }) {
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await api<{ link: string; link_token: string }>(
        `/employees/${employeeId}/start-test-interview`,
        { method: "POST" }
      );
      window.open(r.link, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      alert(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="btn-primary" disabled={busy} onClick={start}>
      {busy ? "Starting…" : "Start test interview"}
    </button>
  );
}
