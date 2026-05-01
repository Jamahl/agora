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
  scope_type?: string;
  scope_id?: string | null;
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

  const companyOkrs = okrs.filter((o) => (o.scope_type || "company") === "company");
  const departmentOkrs = okrs.filter((o) => o.scope_type === "department");

  const renderOkrs = (items: OKR[]) => (
    <div className="space-y-3">
      {items.map((o) => (
        <Link key={o.id} href={`/dashboard/okrs/${o.id}`} className="card block transition-colors hover:border-lilac-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-ink-900">{o.objective}</div>
              <div className="mt-1 text-xs text-ink-500">
                {o.key_results.length} key result{o.key_results.length === 1 ? "" : "s"} · Agora will link interview feedback as signal appears.
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {o.scope_type === "department" && <span className="badge bg-lilac-50 text-lilac-700">{o.scope_id}</span>}
              {o.status && <span className="badge bg-surface-100 text-ink-700">{o.status}</span>}
            </div>
          </div>
          {o.key_results.length > 0 && (
            <ul className="mt-3 ml-4 list-disc text-sm text-ink-500">
              {o.key_results.map((k) => (
                <li key={k.id}>{k.description}{k.target_metric ? ` — ${k.target_metric}` : ""}</li>
              ))}
            </ul>
          )}
        </Link>
      ))}
    </div>
  );

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
        <div className="mt-6 space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Company OKRs</h2>
            {companyOkrs.length ? renderOkrs(companyOkrs) : <div className="card text-sm text-ink-500">No company-level OKRs yet.</div>}
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Department OKRs</h2>
            {departmentOkrs.length ? renderOkrs(departmentOkrs) : <div className="card text-sm text-ink-500">No department-level OKRs yet.</div>}
          </section>
        </div>
      )}
    </div>
  );
}
