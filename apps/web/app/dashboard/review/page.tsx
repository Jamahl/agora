"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";

type ReviewItem = {
  id: number;
  content: string;
  type: string;
  severity: string;
  created_at: string;
  employee: { id: number; name: string };
  interview: { id: number; scheduled_at: string };
};

function typeTone(type: string): string {
  const t = (type || "").toLowerCase();
  if (["harassment", "discrimination", "self_harm", "safety"].includes(t)) {
    return "bg-danger-500/10 text-danger-500";
  }
  if (["compensation", "legal", "retention"].includes(t)) {
    return "bg-warn-500/10 text-warn-500";
  }
  if (["manager", "team", "culture"].includes(t)) {
    return "bg-accent-500/10 text-accent-500";
  }
  return "bg-surface-100 text-ink-700";
}

function severityTone(severity: string): string {
  const s = (severity || "").toLowerCase();
  if (s === "high" || s === "critical") return "bg-danger-500/10 text-danger-500";
  if (s === "medium") return "bg-warn-500/10 text-warn-500";
  if (s === "low") return "bg-surface-100 text-ink-700";
  return "bg-surface-100 text-ink-700";
}

function labelize(s: string): string {
  return (s || "").replace(/_/g, " ");
}

export default function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    try {
      const data = await api<ReviewItem[]>("/review");
      setItems(data);
    } catch (e: any) {
      setError(e.message || "Failed to load review queue");
      setItems([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (id: number, action: "approve" | "suppress") => {
    setBusyId(id);
    setError(null);
    try {
      await api(`/review/${id}/${action}`, { method: "POST" });
      setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
    } catch (e: any) {
      setError(e.message || `Failed to ${action}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <p className="mt-1 text-sm text-ink-500">
          Sensitive paraphrases flagged for your review before they leave the raw layer.
          Approve to pass through. Suppress to keep private.
        </p>
      </div>

      {error && (
        <div className="card mb-4 border-danger-500 text-sm text-danger-500">{error}</div>
      )}

      {items === null ? (
        <div className="card text-sm text-ink-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="card text-center">
          <div className="text-ink-700 font-medium">Nothing to review</div>
          <div className="mt-1 text-sm text-ink-500">
            You'll see flagged paraphrases here when they come in.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-ink-900">{item.employee.name}</div>
                  <div className="mt-1 text-xs text-ink-500">
                    Interview{" "}
                    <Link
                      href={`/dashboard/interviews/${item.interview.id}`}
                      className="text-accent-500 hover:underline"
                    >
                      #{item.interview.id}
                    </Link>
                    {" · "}
                    {formatDistanceToNow(new Date(item.interview.scheduled_at), {
                      addSuffix: true,
                    })}
                    {" · flagged "}
                    {formatDistanceToNow(new Date(item.created_at), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`badge ${typeTone(item.type)}`}>
                    {labelize(item.type)}
                  </span>
                  <span className={`badge ${severityTone(item.severity)}`}>
                    {labelize(item.severity)}
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-md bg-surface-50 p-3 text-sm text-ink-700 whitespace-pre-wrap">
                {item.content}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  className="btn-primary"
                  disabled={busyId === item.id}
                  onClick={() => decide(item.id, "approve")}
                >
                  {busyId === item.id ? "Working…" : "Approve"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={busyId === item.id}
                  onClick={() => decide(item.id, "suppress")}
                >
                  Suppress
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
