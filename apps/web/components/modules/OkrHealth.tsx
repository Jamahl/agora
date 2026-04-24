"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Okr = {
  id: string;
  objective: string;
  volume: number;
  avg_severity: number;
  blockers: number;
  wins: number;
  color: "red" | "amber" | "green" | "gray";
  score: number;
};

function colorClass(color: Okr["color"]) {
  switch (color) {
    case "green":
      return "bg-ok-500/10 text-ok-500";
    case "amber":
      return "bg-warn-500/10 text-warn-500";
    case "red":
      return "bg-danger-500/10 text-danger-500";
    default:
      return "bg-surface-100 text-ink-500";
  }
}

export function OkrHealth() {
  const [data, setData] = useState<Okr[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<Okr[]>("/dashboard/home/okr-health");
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink-900">OKR health</h3>
        <span className="text-xs text-ink-500">Signal by objective</span>
      </div>
      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-ink-300">Loading…</div>
        ) : error ? (
          <div className="text-sm text-ink-300">Could not load OKRs.</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-ink-500">
            No OKRs yet — add objectives in Settings to see health signal here.
          </div>
        ) : (
          <ul className="divide-y divide-surface-100">
            {data.map((o) => (
              <li key={o.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/dashboard/okrs/${o.id}`}
                  className="flex items-start justify-between gap-3 hover:opacity-90"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={"badge " + colorClass(o.color)}>
                        {o.color.toUpperCase()}
                      </span>
                      <span className="truncate text-sm font-medium text-ink-900">
                        {o.objective}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-ink-500">
                      {o.volume} mentions · {o.blockers} blockers · {o.wins} wins
                    </div>
                  </div>
                  <div className="text-right text-sm tabular-nums text-ink-500">
                    {o.avg_severity.toFixed(1)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
