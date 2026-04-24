"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type KeyResult = {
  id: number;
  description: string;
  target_metric: string | null;
  current_value: string | null;
  status: string | null;
};

type OKR = {
  id: number;
  objective: string;
  status: string | null;
  key_results: KeyResult[];
};

export default function OKRsPage() {
  const [okrs, setOkrs] = useState<OKR[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<OKR[]>("/okrs");
        setOkrs(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold">OKRs</h1>
      <p className="mt-1 text-sm text-ink-500">Your company objectives and key results.</p>

      {loading ? (
        <div className="mt-6 text-sm text-ink-500">Loading…</div>
      ) : okrs.length === 0 ? (
        <div className="card mt-6 text-sm text-ink-500">
          No OKRs yet. Add them during onboarding or from the settings page.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {okrs.map((o) => (
            <Link
              key={o.id}
              href={`/dashboard/okrs/${o.id}`}
              className="card block transition-colors hover:border-ink-300"
            >
              <div className="flex items-start justify-between">
                <div className="font-medium text-ink-900">{o.objective}</div>
                {o.status && (
                  <span className="badge bg-surface-100 text-ink-700 shrink-0">{o.status}</span>
                )}
              </div>
              {o.key_results.length > 0 && (
                <ul className="mt-2 ml-4 list-disc text-sm text-ink-500">
                  {o.key_results.map((k) => (
                    <li key={k.id}>
                      {k.description}
                      {k.target_metric ? ` — ${k.target_metric}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
