"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

type Blocker = {
  id: string;
  interview_id: string;
  employee: { id: string; name: string; department?: string | null };
  content: string;
  severity: number;
  score: number;
  created_at: string;
};

function severityBadge(severity: number) {
  if (severity >= 4) return "badge bg-danger-500/10 text-danger-500";
  if (severity === 3) return "badge bg-warn-500/10 text-warn-500";
  return "badge bg-surface-100 text-ink-500";
}

export function TopBlockers() {
  const [data, setData] = useState<Blocker[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<Blocker[]>("/dashboard/home/blockers?limit=5");
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
        <h3 className="text-base font-semibold text-ink-900">Top blockers</h3>
        <span className="text-xs text-ink-500">Last 7 days</span>
      </div>
      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-ink-300">Loading…</div>
        ) : error ? (
          <div className="text-sm text-ink-300">Could not load blockers.</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-ink-500">
            No blockers yet — once your first round runs, the sharpest friction shows up here.
          </div>
        ) : (
          <ul className="divide-y divide-surface-100">
            {data.map((b) => (
              <li key={b.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/employees/${b.employee.id}`}
                        className="text-sm font-medium text-ink-900 hover:underline"
                      >
                        {b.employee.name}
                      </Link>
                      {b.employee.department && (
                        <span className="text-xs text-ink-500">· {b.employee.department}</span>
                      )}
                      <span className={severityBadge(b.severity)}>S{b.severity}</span>
                    </div>
                    <Link
                      href={`/dashboard/interviews/${b.interview_id}`}
                      className="mt-1 block text-sm text-ink-700 hover:underline"
                    >
                      {b.content}
                    </Link>
                    <div className="mt-1 text-xs text-ink-500">
                      {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
