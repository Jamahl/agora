"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";

type ResearchRequest = {
  id: number;
  question: string;
  status: string;
  plan?: any;
  report?: {
    exec_summary?: string;
    findings?: string[];
    recommendations?: string[];
    supporting_quotes?: string[];
    interview_ids?: number[];
    progress?: string;
    updated_at?: string;
  } | null;
  created_at: string;
  approved_at?: string | null;
};

function statusTone(status: string): string {
  switch (status) {
    case "draft":
      return "bg-surface-100 text-ink-700";
    case "approved":
    case "scheduled":
      return "bg-accent-500/10 text-accent-500";
    case "in_progress":
      return "bg-warn-500/10 text-warn-500";
    case "complete":
    case "completed":
      return "bg-ok-500/10 text-ok-500";
    case "rejected":
      return "bg-danger-500/10 text-danger-500";
    default:
      return "bg-surface-100 text-ink-700";
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export default function ResearchListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ResearchRequest[] | null>(null);
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await api<ResearchRequest[]>("/research");
      setRows(data);
    } catch (e: any) {
      setError(e.message || "Failed to load research");
      setRows([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!question.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api<ResearchRequest>("/research", {
        method: "POST",
        body: JSON.stringify({ question: question.trim() }),
      });
      router.push(`/dashboard/research/${created.id}`);
    } catch (e: any) {
      setError(e.message || "Failed to create research request");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Research</h1>
        <p className="mt-1 text-sm text-ink-500">
          Ask Agora to investigate a business question. Nothing is sent until you launch the brief.
        </p>
      </div>

      <div className="card mb-8">
        <label className="label" htmlFor="question">What do you want to learn?</label>
        <textarea
          id="question"
          className="input min-h-[90px]"
          placeholder="e.g. Why did engineering velocity drop last month?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={submitting}
        />
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-ink-500">
            Step 1: Agora drafts a brief. Step 2: you review who to talk to. Step 3: launch.
          </div>
          <button className="btn-primary" disabled={!question.trim() || submitting} onClick={submit}>
            {submitting ? "Drafting brief…" : "Draft research brief"}
          </button>
        </div>
        {error && <div className="mt-3 text-sm text-danger-500">{error}</div>}
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Requests</h2>
        {rows && rows.length > 0 && (
          <div className="text-xs text-ink-500">{rows.length} total</div>
        )}
      </div>

      {rows === null ? (
        <div className="card text-sm text-ink-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card text-center">
          <div className="text-ink-700 font-medium">No research yet</div>
          <div className="mt-1 text-sm text-ink-500">
            Ask your first question above. Briefs are drafts until you launch them.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard/research/${r.id}`}
              className="card block transition-colors hover:border-ink-300"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium text-ink-900">{r.question}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                    <span>
                      Created{" "}
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                    {r.report?.progress && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-ink-700">
                          {r.report.progress} interviews done
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span className={`badge ${statusTone(r.status)}`}>
                  {statusLabel(r.status)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
