"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";

type InsightType = "blocker" | "win" | "start_doing" | "stop_doing" | "tooling_gap" | "sentiment_note" | string;

type Insight = {
  id: number;
  type: InsightType;
  content: string;
  severity: number;
  direct_quote: string | null;
  review_state: string | null;
  created_at: string | null;
};

type Sentiment = {
  morale: number;
  energy: number;
  candor: number;
  urgency: number;
  notes: string | null;
};

type TranscriptSegment = {
  speaker: string;
  ts: number | string | null;
  text: string;
};

type Transcript = {
  segments: TranscriptSegment[];
};

type Interview = {
  id: number;
  employee_id: number;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  cleaned_transcript: Transcript | null;
  corrected_summary: string | null;
  insights: Insight[];
  sentiment: Sentiment | null;
};

type EmployeeLite = {
  id: number;
  name: string;
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

function safeFormatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy · h:mm a");
  } catch {
    return iso;
  }
}

function formatTs(ts: number | string | null | undefined) {
  if (ts === null || ts === undefined || ts === "") return "";
  const n = typeof ts === "string" ? parseFloat(ts) : ts;
  if (isNaN(n)) return typeof ts === "string" ? ts : "";
  const mins = Math.floor(n / 60);
  const secs = Math.floor(n % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function SentimentTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-surface-200 px-3 py-3 text-center">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold">{value.toFixed(1)}</div>
    </div>
  );
}

export default function InterviewDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [interview, setInterview] = useState<Interview | null>(null);
  const [employee, setEmployee] = useState<EmployeeLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await api<Interview>(`/interviews/${id}`);
        setInterview(res);
        if (res?.employee_id) {
          try {
            const emp = await api<EmployeeLite>(`/dashboard/employees/${res.employee_id}`);
            setEmployee({ id: emp.id, name: emp.name });
          } catch {
            // employee lookup is best-effort
          }
        }
      } catch (e: any) {
        setError(e.message || "Failed to load interview.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <div className="mx-auto max-w-5xl px-6 py-8 text-ink-500">Loading…</div>;
  }
  if (error || !interview) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="card text-danger-500">{error || "Not found."}</div>
      </div>
    );
  }

  const segments = interview.cleaned_transcript?.segments || [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {employee ? (
        <Link href={`/dashboard/employees/${employee.id}`} className="text-sm text-accent-500 hover:underline">
          ← {employee.name}
        </Link>
      ) : (
        <Link href="/dashboard/employees" className="text-sm text-accent-500 hover:underline">
          ← Employees
        </Link>
      )}

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Interview · {safeFormatDate(interview.ended_at || interview.started_at || interview.scheduled_at)}
          </h1>
          <div className="mt-1 text-sm text-ink-500">
            {employee && (
              <>
                <Link href={`/dashboard/employees/${employee.id}`} className="hover:text-accent-500">
                  {employee.name}
                </Link>
                {" · "}
              </>
            )}
            <span className="capitalize">{interview.status}</span>
          </div>
        </div>
      </div>

      {interview.sentiment && (
        <div className="mt-6">
          <h2 className="text-lg font-medium">Sentiment</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SentimentTile label="Morale" value={interview.sentiment.morale} />
            <SentimentTile label="Energy" value={interview.sentiment.energy} />
            <SentimentTile label="Candor" value={interview.sentiment.candor} />
            <SentimentTile label="Urgency" value={interview.sentiment.urgency} />
          </div>
          {interview.sentiment.notes && (
            <p className="mt-3 text-sm italic text-ink-500">{interview.sentiment.notes}</p>
          )}
        </div>
      )}

      {interview.corrected_summary && (
        <div className="card mt-6">
          <h2 className="text-lg font-medium">Summary</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{interview.corrected_summary}</p>
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-lg font-medium">
          Insights
          <span className="ml-2 text-sm font-normal text-ink-500">({interview.insights.length})</span>
        </h2>
        {interview.insights.length === 0 ? (
          <div className="card mt-3 text-sm text-ink-500">
            No insights extracted from this interview.
          </div>
        ) : (
          <div className="card mt-3">
            <ul className="space-y-3">
              {interview.insights.map((ins) => {
                const sensitive = ins.review_state === "needs_review";
                return (
                  <li
                    key={ins.id}
                    className={
                      sensitive
                        ? "-mx-4 rounded-md border-l-4 border-danger-500 bg-danger-500/5 px-4 py-3"
                        : "border-b border-surface-100 pb-3 last:border-0 last:pb-0"
                    }
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`badge shrink-0 ${
                          sensitive
                            ? "bg-danger-500 text-white"
                            : insightBadgeClass(ins.type)
                        }`}
                      >
                        {sensitive ? "sensitive · pending review" : formatInsightType(ins.type)}
                      </span>
                      <p className={sensitive ? "text-sm font-semibold text-ink-900" : "text-sm text-ink-700"}>
                        {ins.content}
                      </p>
                      <span className={`ml-auto text-xs shrink-0 ${severityClass(ins.severity)}`}>
                        sev {ins.severity}
                      </span>
                    </div>
                    {ins.direct_quote && (
                      <blockquote className="mt-2 border-l-2 border-surface-200 pl-3 text-xs italic text-ink-500">
                        "{ins.direct_quote}"
                      </blockquote>
                    )}
                    {sensitive && (
                      <div className="mt-2 text-xs text-danger-500">
                        This item was flagged during the interview. It will not appear in dashboards
                        until you approve it in the Review queue.
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6">
        <details className="card">
          <summary className="cursor-pointer select-none text-lg font-medium">
            Transcript
            <span className="ml-2 text-sm font-normal text-ink-500">
              ({segments.length} {segments.length === 1 ? "segment" : "segments"})
            </span>
          </summary>
          {segments.length === 0 ? (
            <div className="mt-3 text-sm text-ink-500">
              No transcript available — either the call hasn't finished processing, or the interview didn't happen.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {segments.map((seg, i) => (
                <div key={i} className="text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-ink-900">{seg.speaker}</span>
                    {seg.ts !== null && seg.ts !== undefined && seg.ts !== "" && (
                      <span className="text-xs text-ink-500">{formatTs(seg.ts)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-ink-700">{seg.text}</p>
                </div>
              ))}
            </div>
          )}
        </details>
      </div>
    </div>
  );
}
