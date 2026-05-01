"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";

type InsightType = "blocker" | "win" | "start_doing" | "stop_doing" | "tooling_gap" | "sentiment_note" | string;

type TopInsight = {
  id?: number;
  type: InsightType;
  content: string;
  severity: number;
  review_state?: string;
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
  stats?: {
    total_interviews: number;
    completed_interviews: number;
    pending_interviews: number;
    average_sentiment: Sentiment | null;
    last_sentiment: Sentiment | null;
  };
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

function leadershipMemoryText(name: string, text: string | null) {
  if (!text) return "";
  return text
    .replace(/\byou've\b/gi, `${name} has`)
    .replace(/\byou have\b/gi, `${name} has`)
    .replace(/\byou're\b/gi, `${name} is`)
    .replace(/\byou are\b/gi, `${name} is`)
    .replace(/\byou mentioned\b/gi, `${name} previously mentioned`)
    .replace(/\byou shared\b/gi, `${name} previously shared`)
    .replace(/\byou raised\b/gi, `${name} previously raised`)
    .replace(/\byou\b/gi, name)
    .replace(/\byour\b/gi, `${name}'s`);
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
  const stats = data.stats || {
    total_interviews: data.interviews.length,
    completed_interviews: data.interviews.filter((iv) => iv.status === "completed").length,
    pending_interviews: data.interviews.filter((iv) => ["scheduled", "in_progress", "no_show"].includes(iv.status)).length,
    average_sentiment: null,
    last_sentiment: sortedInterviews.find((iv) => iv.status === "completed")?.sentiment || null,
  };
  const latestCompleted = sortedInterviews.find((iv) => iv.status === "completed");
  const historyInterviews = sortedInterviews.filter(
    (iv) => iv.status === "completed" && (iv.insight_count > 0 || iv.sentiment)
  );
  const latestSignal = latestCompleted
    ? `${safeFormatDate(latestCompleted.ended_at || latestCompleted.scheduled_at)} · ${latestCompleted.insight_count} ${latestCompleted.insight_count === 1 ? "insight" : "insights"} captured`
    : "No completed interview signal yet";
  const recentInsights = historyInterviews.flatMap((iv) =>
    iv.top_insights.map((ins) => ({ ...ins, interviewId: iv.id }))
  ).slice(0, 3);
  const averageScore = stats.average_sentiment
    ? ((stats.average_sentiment.morale + stats.average_sentiment.energy + stats.average_sentiment.candor + stats.average_sentiment.urgency) / 4).toFixed(1)
    : null;
  const managerMemory = leadershipMemoryText(data.name, data.memory_summary);
  const leadershipOverview = [
    `${data.name} is ${data.status} ${data.job_title ? `as ${data.job_title}` : "on the team"}${data.department ? ` in ${data.department}` : ""}.`,
    stats.completed_interviews
      ? `Agora has ${stats.completed_interviews} completed interview${stats.completed_interviews === 1 ? "" : "s"} to read from${stats.pending_interviews ? `, with ${stats.pending_interviews} pending follow-up${stats.pending_interviews === 1 ? "" : "s"}` : ""}.`
      : "Agora does not have a completed interview yet, so treat this profile as a scheduling and context view for now.",
    managerMemory ? `Recent conversation summary: ${managerMemory}` : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/dashboard/employees" className="text-sm text-accent-500 hover:underline">
        ← Employees
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{data.name}</h1>
            <span className={`badge ${data.status === "active" ? "bg-ok-500/15 text-ok-500" : "bg-surface-100 text-ink-500"}`}>
              {data.status}
            </span>
          </div>
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
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-lilac-100 bg-white p-4 shadow-sm shadow-lilac-50">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-500">Completed</div>
          <div className="mt-1 text-2xl font-semibold text-ink-900">{stats.completed_interviews}</div>
        </div>
        <div className="rounded-xl border border-lilac-100 bg-white p-4 shadow-sm shadow-lilac-50">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-500">Pending</div>
          <div className="mt-1 text-2xl font-semibold text-ink-900">{stats.pending_interviews}</div>
        </div>
        <div className="rounded-xl border border-lilac-100 bg-white p-4 shadow-sm shadow-lilac-50">
          <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-500">
            Avg score
            <span
              tabIndex={0}
              className="group relative inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-lilac-50 text-[10px] font-semibold text-lilac-700 ring-1 ring-lilac-100"
              aria-label="Average score is out of 5. It is the mean of morale, energy, candor, and urgency across completed interviews with sentiment. Higher generally means healthier signal; urgency is included as pressure signal, so interpret it with the detailed scores."
            >
              ?
              <span className="pointer-events-none absolute right-0 top-5 z-20 hidden w-72 rounded-lg border border-surface-200 bg-white p-3 normal-case tracking-normal text-ink-700 shadow-xl group-hover:block group-focus:block">
                Score is out of 5. It averages morale, energy, candor, and urgency across completed interviews with sentiment. Higher generally means stronger signal, but urgency reflects pressure too, so read it alongside the interview details.
              </span>
            </span>
          </div>
          <div className="mt-1 text-2xl font-semibold text-ink-900">{averageScore || "—"}</div>
        </div>
        <div className="rounded-xl border border-lilac-100 bg-white p-4 shadow-sm shadow-lilac-50">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-500">Latest signal</div>
          <div className="mt-1 text-sm font-medium leading-5 text-ink-900">{latestSignal}</div>
        </div>
      </div>

      <div className="card mt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Leadership overview</h2>
            <p className="mt-1 text-sm text-ink-500">
              Manager-facing summary of what to know before acting.
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-ink-700">{leadershipOverview}</p>
        {recentInsights.length > 0 && (
          <div className="mt-4">
            <div className="label">Recent leadership signals</div>
            <ul className="mt-2 space-y-2">
              {recentInsights.map((ins, idx) => (
                <li key={`${ins.interviewId}-${ins.id || idx}`} className="flex items-start gap-2 text-sm">
                  <span className={`badge ${insightBadgeClass(ins.type)} shrink-0`}>
                    {formatInsightType(ins.type)}
                  </span>
                  <span className="text-ink-700">{ins.content}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <PendingInvites employeeId={data.id} employeeName={data.name} />

      <h2 className="mt-8 text-lg font-medium">Interview history</h2>
      {historyInterviews.length === 0 ? (
        <div className="card mt-3 text-sm text-ink-500">
          No completed interviews with signal yet. Scheduled and empty interviews stay out of history.
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {historyInterviews.map((iv) => (
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
                  {iv.top_insights.map((ins, i) => {
                    const sensitive = ins.review_state && ins.review_state !== "live";
                    return (
                      <li
                        key={ins.id || `insight-${iv.id}-${i}`}
                        className={
                          sensitive
                            ? "flex items-start gap-2 rounded-md border-l-4 border-lilac-500 bg-lilac-50 px-3 py-2 text-sm font-semibold"
                            : "flex items-start gap-2 text-sm"
                        }
                      >
                        <span
                          className={`badge ${
                            sensitive
                              ? ins.review_state === "needs_review"
                                ? "bg-danger-500 text-white"
                                : ins.review_state === "suppressed"
                                  ? "bg-surface-100 text-ink-500"
                                  : "bg-lilac-50 text-lilac-700"
                              : insightBadgeClass(ins.type)
                          } shrink-0`}
                        >
                          {sensitive ? `sensitive · ${ins.review_state === "needs_review" ? "pending" : ins.review_state}` : formatInsightType(ins.type)}
                        </span>
                        <span className={sensitive ? "text-ink-900" : "text-ink-700"}>
                          {ins.content}
                        </span>
                        <span className={`ml-auto text-xs ${severityClass(ins.severity)} shrink-0`}>
                          sev {ins.severity}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type PendingInterview = {
  id: number;
  scheduled_at: string;
  status: string;
  link_token: string;
  research_label: string | null;
  invite_sent_at: string | null;
  reminder_sent_at: string | null;
};

function PendingInvites({ employeeId, employeeName }: { employeeId: number; employeeName: string }) {
  const [rows, setRows] = useState<PendingInterview[] | null>(null);
  const [busy, setBusy] = useState<number | "schedule" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api<PendingInterview[]>(`/employees/${employeeId}/pending-interviews`);
      setRows(r);
    } catch (e: any) {
      setError(e?.message || "Failed to load pending invites");
    }
  };
  useEffect(() => {
    load();
  }, [employeeId]);

  const scheduleNew = async () => {
    setBusy("schedule");
    setError(null);
    try {
      await api(`/employees/${employeeId}/schedule-next`, { method: "POST" });
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to schedule");
    } finally {
      setBusy(null);
    }
  };

  const sendInvite = async (id: number) => {
    setBusy(id);
    setError(null);
    try {
      await api(`/interviews/${id}/send-invite`, { method: "POST" });
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to send");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Pending interviews</h2>
        <button
          className="btn-secondary"
          onClick={scheduleNew}
          disabled={busy === "schedule"}
          aria-label={`Schedule the next interview for ${employeeName} and send the invite`}
        >
          {busy === "schedule" ? "Scheduling…" : "Schedule next + send invite"}
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-500">
        Schedules the next cadence slot and immediately emails the interview link. Use Resend invite on an existing row if the employee needs it again.
      </p>
      {error && <div className="mt-2 text-sm text-danger-500">{error}</div>}
      {rows === null ? (
        <div className="mt-3 text-sm text-ink-300">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card mt-3 text-sm text-ink-500">
          No pending interviews. Schedule the next cadence interview to queue {employeeName.split(" ")[0]} up and send their invite.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((iv) => {
            const invited = !!iv.invite_sent_at;
            return (
              <div
                key={iv.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-surface-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {safeFormatDate(iv.scheduled_at, "—")}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    {iv.research_label ? (
                      <span className="badge bg-accent-400/10 text-accent-500">
                        research · {iv.research_label}
                      </span>
                    ) : (
                      <span className="badge bg-surface-100 text-ink-500">cadence</span>
                    )}
                    <span className={`badge ${iv.status === "no_show" ? "bg-danger-500/10 text-danger-500" : "bg-surface-100 text-ink-500"}`}>
                      {iv.status}
                    </span>
                    {invited ? (
                      <span className="badge bg-ok-500/15 text-ok-500">
                        invite sent {safeFormatDate(iv.invite_sent_at)}
                      </span>
                    ) : (
                      <span className="badge bg-warn-500/15 text-warn-500">not sent</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className={invited ? "btn-ghost" : "btn-primary"}
                    onClick={() => sendInvite(iv.id)}
                    disabled={busy === iv.id}
                    aria-label={`${invited ? "Resend" : "Send"} invite for ${employeeName}'s ${safeFormatDate(iv.scheduled_at, "scheduled")} interview`}
                  >
                    {busy === iv.id ? "Sending…" : invited ? "Resend invite" : "Send invite"}
                  </button>
                </div>
              </div>
            );
          })}
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
