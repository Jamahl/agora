"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Department = {
  name: string;
  count: number;
};

export default function DepartmentsPage() {
  const [rows, setRows] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<Department[]>("/dashboard/departments");
        setRows(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Departments</h1>
      <p className="mt-1 text-sm text-ink-500">View sentiment, blockers, and employees grouped by department.</p>

      {loading ? (
        <div className="mt-6 text-sm text-ink-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card mt-6 text-sm text-ink-500">
          No departments yet. Assign employees to a department on the Employees page.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((d) => (
            <Link
              key={`dept-${d.name}`}
              href={`/dashboard/departments/${encodeURIComponent(d.name)}`}
              className="card transition-colors hover:border-lilac-200"
            >
              <div className="text-base font-medium text-ink-900">{d.name}</div>
              <div className="mt-1 text-sm text-ink-500">
                {d.count} {d.count === 1 ? "employee" : "employees"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
