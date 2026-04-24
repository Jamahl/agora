"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Summary = {
  interviews: number;
  blockers: number;
  wins: number;
};

export function HeroStrip() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<Summary>("/dashboard/home/summary");
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

  const items = [
    { label: "Interviews (7d)", value: data?.interviews ?? 0 },
    { label: "Blockers (7d)", value: data?.blockers ?? 0 },
    { label: "Wins (7d)", value: data?.wins ?? 0 },
  ];

  return (
    <div className="card">
      <div className="grid grid-cols-3 gap-6">
        {items.map((item) => (
          <div key={item.label}>
            <div className="text-sm text-ink-500">{item.label}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-ink-900">
              {loading ? (
                <span className="text-ink-300 text-sm font-normal">Loading…</span>
              ) : error ? (
                <span className="text-ink-300 text-sm font-normal">—</span>
              ) : (
                item.value
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
