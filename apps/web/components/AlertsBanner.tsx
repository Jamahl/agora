"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

type Alert = {
  id: string;
  category: string;
  summary: string;
  interview_id?: string | null;
  status: string;
  created_at: string;
};

export function AlertsBanner() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [acking, setAcking] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<Alert[]>("/alerts?status=unread");
        if (!cancelled) setAlerts(data);
      } catch {
        if (!cancelled) setAlerts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const acknowledge = async (id: string) => {
    setAcking((s) => ({ ...s, [id]: true }));
    try {
      await api(`/alerts/${id}/acknowledge`, { method: "POST", body: "{}" });
      setAlerts((cur) => (cur ? cur.filter((a) => a.id !== id) : cur));
    } catch {
      setAcking((s) => ({ ...s, [id]: false }));
    }
  };

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex items-start justify-between gap-4 rounded-xl border border-danger-500/30 bg-danger-500/5 p-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="badge bg-danger-500/10 text-danger-500">
                {a.category}
              </span>
              <span className="text-xs text-ink-500">
                {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-900">{a.summary}</p>
          </div>
          <button
            className="btn-secondary shrink-0"
            disabled={!!acking[a.id]}
            onClick={() => acknowledge(a.id)}
          >
            {acking[a.id] ? "Acknowledging…" : "Acknowledge"}
          </button>
        </div>
      ))}
    </div>
  );
}
