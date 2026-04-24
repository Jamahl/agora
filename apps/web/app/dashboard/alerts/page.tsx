"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";

type Alert = {
  id: number;
  category: string;
  summary: string;
  interview_id: number;
  status: string;
  created_at: string;
};

type Tab = "unread" | "acknowledged";

const RED_CATEGORIES = new Set(["harassment", "discrimination", "self_harm"]);

function categoryTone(category: string, unread: boolean): string {
  const c = (category || "").toLowerCase();
  if (unread && RED_CATEGORIES.has(c)) {
    return "bg-danger-500 text-white";
  }
  if (RED_CATEGORIES.has(c)) {
    return "bg-danger-500/10 text-danger-500";
  }
  if (["retention", "burnout", "compensation"].includes(c)) {
    return "bg-warn-500/10 text-warn-500";
  }
  return "bg-surface-100 text-ink-700";
}

function labelize(s: string): string {
  return (s || "").replace(/_/g, " ");
}

export default function AlertsPage() {
  const [tab, setTab] = useState<Tab>("unread");
  const [rows, setRows] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async (t: Tab) => {
    setRows(null);
    setError(null);
    try {
      const data = await api<Alert[]>(`/alerts?status=${t}`);
      setRows(data);
    } catch (e: any) {
      setError(e.message || "Failed to load alerts");
      setRows([]);
    }
  };

  useEffect(() => {
    load(tab);
  }, [tab]);

  const acknowledge = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      await api(`/alerts/${id}/acknowledge`, { method: "POST" });
      setRows((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    } catch (e: any) {
      setError(e.message || "Failed to acknowledge");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <p className="mt-1 text-sm text-ink-500">
          Signals from interviews that need attention. Click into an interview for full context.
        </p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-surface-200">
        <TabBtn active={tab === "unread"} onClick={() => setTab("unread")}>
          Unread
        </TabBtn>
        <TabBtn
          active={tab === "acknowledged"}
          onClick={() => setTab("acknowledged")}
        >
          Acknowledged
        </TabBtn>
      </div>

      {error && (
        <div className="card mb-4 border-danger-500 text-sm text-danger-500">{error}</div>
      )}

      {rows === null ? (
        <div className="card text-sm text-ink-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card text-center">
          <div className="text-ink-700 font-medium">
            {tab === "unread" ? "No unread alerts" : "No acknowledged alerts"}
          </div>
          <div className="mt-1 text-sm text-ink-500">
            {tab === "unread"
              ? "You're all caught up."
              : "Alerts you acknowledge will appear here."}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => {
            const unread = tab === "unread";
            const isRed =
              unread && RED_CATEGORIES.has((a.category || "").toLowerCase());
            return (
              <div
                key={a.id}
                className={`card ${
                  isRed ? "border-danger-500" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge ${categoryTone(a.category, unread)}`}>
                        {labelize(a.category)}
                      </span>
                      <span className="text-xs text-ink-500">
                        {formatDistanceToNow(new Date(a.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-ink-900 whitespace-pre-wrap">
                      {a.summary}
                    </div>
                    <div className="mt-2 text-xs">
                      <Link
                        href={`/dashboard/interviews/${a.interview_id}`}
                        className="text-accent-500 hover:underline"
                      >
                        View interview #{a.interview_id}
                      </Link>
                    </div>
                  </div>
                  {unread && (
                    <button
                      className="btn-secondary"
                      disabled={busyId === a.id}
                      onClick={() => acknowledge(a.id)}
                    >
                      {busyId === a.id ? "Working…" : "Acknowledge"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-ink-900 text-ink-900"
          : "border-transparent text-ink-500 hover:text-ink-700"
      }`}
    >
      {children}
    </button>
  );
}
