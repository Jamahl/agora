"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";

type Theme = {
  id: number;
  label: string;
  summary: string | null;
  member_count: number;
  created_at: string | null;
};

function safeDate(iso: string | null) {
  if (!iso) return "";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return "";
  }
}

export default function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<Theme[]>("/dashboard/themes");
        setThemes(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Themes</h1>
      <p className="mt-1 text-sm text-ink-500">Insight clusters identified across your organization.</p>

      {loading ? (
        <div className="mt-6 text-sm text-ink-500">Loading…</div>
      ) : themes.length === 0 ? (
        <div className="card mt-6 text-sm text-ink-500">
          No themes yet — themes appear after your second round.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {themes.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/themes/${t.id}`}
              className="card block transition-colors hover:border-ink-300"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink-900">{t.label}</div>
                  {t.summary && (
                    <p className="mt-1 text-sm text-ink-500">{t.summary}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="badge bg-surface-100 text-ink-700">
                    {t.member_count} {t.member_count === 1 ? "insight" : "insights"}
                  </span>
                  {t.created_at && (
                    <div className="mt-1 text-xs text-ink-500">{safeDate(t.created_at)}</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
