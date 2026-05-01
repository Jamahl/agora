"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

type Theme = {
  id: string;
  label: string;
  summary: string;
  member_count: number;
  created_at: string;
};

export function EmergingThemes() {
  const [data, setData] = useState<Theme[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<Theme[]>("/dashboard/themes");
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
        <h3 className="text-base font-semibold text-ink-900">Emerging themes</h3>
        <span className="text-xs text-ink-500">Clusters across interviews</span>
      </div>
      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-ink-300">Loading…</div>
        ) : error ? (
          <div className="text-sm text-ink-300">Could not load themes.</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-ink-500">
            No themes yet — themes surface once a few interviews share a common thread.
          </div>
        ) : (
          <ul className="divide-y divide-surface-100">
            {data.slice(0, 6).map((t) => (
              <li key={t.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/dashboard/themes/${t.id}`}
                  className="flex items-start justify-between gap-3 hover:opacity-90"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink-900">{t.label}</div>
                    {t.summary && (
                      <div className="mt-1 text-xs text-ink-500">
                        {t.summary}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-ink-500">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                    </div>
                    <div className="mt-1 text-xs text-lilac-700">
                      Surfaced after enough repeated signal clustered across interviews.
                    </div>
                  </div>
                  <span className="badge bg-surface-100 text-ink-500 shrink-0">
                    {t.member_count} {t.member_count === 1 ? "member" : "members"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
