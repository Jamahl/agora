"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "@/lib/api";

type DepartmentEmployee = {
  id: number;
  name: string;
  job_title: string | null;
};

type UpcomingInterview = {
  id: number;
  employee_name: string;
  scheduled_at: string | null;
  link_token: string | null;
};

type DepartmentDetail = {
  name: string;
  employees: DepartmentEmployee[];
  upcoming: UpcomingInterview[];
};

type Blocker = {
  id: number;
  content: string;
  severity: number;
  employee: { id: number; name: string } | null;
  interview_id: number | null;
  created_at?: string | null;
};

type SentimentPoint = {
  date: string;
  morale?: number;
  energy?: number;
  candor?: number;
  urgency?: number;
};

function severityClass(s: number) {
  if (s >= 4) return "text-danger-500";
  if (s === 3) return "text-warn-500";
  return "text-ink-500";
}

function safeDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, h:mm a");
  } catch {
    return iso;
  }
}

export default function DepartmentDetailPage() {
  const params = useParams();
  const nameRaw = (params?.name as string) || "";
  const name = decodeURIComponent(nameRaw);

  const [detail, setDetail] = useState<DepartmentDetail | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [sentiment, setSentiment] = useState<SentimentPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    (async () => {
      try {
        const q = encodeURIComponent(name);
        const [d, b, s] = await Promise.all([
          api<DepartmentDetail>(`/dashboard/departments/${q}`),
          api<Blocker[]>(`/dashboard/home/blockers?department=${q}`).catch(() => []),
          api<SentimentPoint[]>(`/dashboard/home/sentiment-trend?department=${q}`).catch(() => []),
        ]);
        setDetail(d);
        setBlockers(b || []);
        setSentiment(s || []);
      } catch (e: any) {
        setError(e.message || "Failed to load department.");
      } finally {
        setLoading(false);
      }
    })();
  }, [name]);

  if (loading) {
    return <div className="mx-auto max-w-5xl px-6 py-8 text-ink-500">Loading…</div>;
  }
  if (error || !detail) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link href="/dashboard/departments" className="text-sm text-accent-500 hover:underline">
          ← Departments
        </Link>
        <div className="card mt-4 text-danger-500">{error || "Not found."}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/dashboard/departments" className="text-sm text-accent-500 hover:underline">
        ← Departments
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{detail.name}</h1>
      <p className="mt-1 text-sm text-ink-500">
        {detail.employees.length} {detail.employees.length === 1 ? "employee" : "employees"}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="text-lg font-medium">Sentiment trend</h2>
          {sentiment.length === 0 ? (
            <div className="mt-3 text-sm text-ink-500">
              No interview data yet — trends appear once this department has completed interviews.
            </div>
          ) : (
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sentiment}>
                  <CartesianGrid stroke="#EEF0F3" vertical={false} />
                  <XAxis dataKey="date" stroke="#8A96A3" fontSize={12} />
                  <YAxis stroke="#8A96A3" fontSize={12} domain={[0, 5]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="morale" stroke="#2F5BEA" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="energy" stroke="#2F8F4E" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="candor" stroke="#D98613" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="urgency" stroke="#D64545" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-lg font-medium">Upcoming interviews</h2>
          {detail.upcoming.length === 0 ? (
            <div className="mt-3 text-sm text-ink-500">No upcoming interviews scheduled.</div>
          ) : (
            <ul className="mt-3 space-y-2">
              {detail.upcoming.map((u) => (
                <li key={u.id} className="text-sm">
                  <div className="font-medium">{u.employee_name}</div>
                  <div className="text-xs text-ink-500">{safeDate(u.scheduled_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-lg font-medium">Top blockers</h2>
          {blockers.length === 0 ? (
            <div className="mt-3 text-sm text-ink-500">No blockers surfaced for this department.</div>
          ) : (
            <ul className="mt-3 space-y-3">
              {blockers.map((b) => (
                <li key={b.id} className="border-b border-surface-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    <span className="badge bg-danger-500/15 text-danger-500 shrink-0">blocker</span>
                    <p className="text-sm text-ink-700">{b.content}</p>
                    <span className={`ml-auto text-xs ${severityClass(b.severity)} shrink-0`}>sev {b.severity}</span>
                  </div>
                  {b.employee && (
                    <div className="mt-1 pl-1 text-xs text-ink-500">
                      —{" "}
                      <Link href={`/dashboard/employees/${b.employee.id}`} className="hover:text-accent-500">
                        {b.employee.name}
                      </Link>
                      {b.interview_id && (
                        <>
                          {" · "}
                          <Link href={`/dashboard/interviews/${b.interview_id}`} className="hover:text-accent-500">
                            interview
                          </Link>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="text-lg font-medium">Team</h2>
          {detail.employees.length === 0 ? (
            <div className="mt-3 text-sm text-ink-500">No employees assigned to this department.</div>
          ) : (
            <ul className="mt-3 space-y-2">
              {detail.employees.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <Link href={`/dashboard/employees/${e.id}`} className="font-medium hover:text-accent-500">
                    {e.name}
                  </Link>
                  <span className="text-xs text-ink-500">{e.job_title || "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
