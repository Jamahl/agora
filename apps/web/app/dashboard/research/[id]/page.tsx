"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";

type PlanEmployee = { employee_id: number; reason: string };
type Plan = {
  question?: string;
  goal?: string;
  research_type?: string;
  audience_mode?: string;
  selected_departments?: string[];
  recommended_employees?: PlanEmployee[];
  selected_employees?: PlanEmployee[];
  sample_questions?: string[];
  timeline?: string;
  readout_threshold?: number;
  employees: PlanEmployee[];
  eta_days: number;
  notes?: string;
};
type Report = {
  exec_summary?: string;
  findings?: string[];
  recommendations?: string[];
  supporting_quotes?: string[];
  interview_ids?: number[];
  progress?: string;
  updated_at?: string;
} | null;

type ResearchRequest = {
  id: number;
  question: string;
  status: string;
  plan?: Plan;
  report?: Report;
  created_at: string;
  approved_at?: string | null;
};

type Employee = {
  id: number;
  name: string;
  email?: string;
  job_title?: string;
  department?: string;
};

function statusTone(status: string): string {
  switch (status) {
    case "draft":
      return "bg-surface-100 text-ink-700";
    case "approved":
    case "scheduled":
      return "bg-accent-500/10 text-accent-500";
    case "in_progress":
      return "bg-warn-500/10 text-warn-500";
    case "complete":
    case "completed":
      return "bg-ok-500/10 text-ok-500";
    case "rejected":
      return "bg-danger-500/10 text-danger-500";
    default:
      return "bg-surface-100 text-ink-700";
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function researchStyleHelp(style: string): string {
  switch (style) {
    case "pulse_check":
      return "A broad read on how a group feels right now.";
    case "decision_support":
      return "Focused on evidence leadership needs before choosing a direction.";
    case "idea_discovery":
      return "Designed to surface suggestions, alternatives, and unexplored options.";
    case "follow_up":
      return "Checks whether a known issue has changed since prior signal.";
    default:
      return "Drills into why something is happening and what is causing it.";
  }
}

export default function ResearchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [research, setResearch] = useState<ResearchRequest | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editEmployees, setEditEmployees] = useState<PlanEmployee[]>([]);
  const [editEta, setEditEta] = useState<number>(7);
  const [editGoal, setEditGoal] = useState("");
  const [editStyle, setEditStyle] = useState("root_cause");
  const [addSelect, setAddSelect] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    try {
      const [r, roster] = await Promise.all([
        api<ResearchRequest>(`/research/${id}`),
        api<Employee[]>("/employees"),
      ]);
      setResearch(r);
      setEmployees(roster || []);
      if (r.plan) {
        const picked = r.plan.selected_employees || r.plan.employees || [];
        setEditEmployees(picked.map((e) => ({ ...e })));
        setEditEta(r.plan.eta_days ?? 7);
        setEditGoal(r.plan.goal || "");
        setEditStyle(r.plan.research_type || "root_cause");
      }
    } catch (e: any) {
      setError(e.message || "Failed to load research");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const employeeMap = useMemo(() => {
    const m = new Map<number, Employee>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const isDraft = research?.status === "draft";

  const availableToAdd = useMemo(() => {
    const picked = new Set(editEmployees.map((e) => e.employee_id));
    return employees.filter((e) => !picked.has(e.id));
  }, [employees, editEmployees]);

  const updateReason = (idx: number, reason: string) => {
    setEditEmployees((prev) => prev.map((row, i) => (i === idx ? { ...row, reason } : row)));
  };
  const removeRow = (idx: number) => {
    setEditEmployees((prev) => prev.filter((_, i) => i !== idx));
  };
  const addRow = () => {
    const empId = Number(addSelect);
    if (!empId) return;
    setEditEmployees((prev) => [...prev, { employee_id: empId, reason: "" }]);
    setAddSelect("");
  };

  const patchPlan = async (): Promise<boolean> => {
    if (!research) return false;
    try {
      const updated = await api<ResearchRequest>(`/research/${research.id}/plan`, {
        method: "PATCH",
        body: JSON.stringify({
          selected_employees: editEmployees,
          employees: editEmployees,
          eta_days: editEta,
          goal: editGoal,
          research_type: editStyle,
        }),
      });
      setResearch(updated);
      if (updated.plan) {
        const picked = updated.plan.selected_employees || updated.plan.employees || [];
        setEditEmployees(picked.map((e) => ({ ...e })));
        setEditEta(updated.plan.eta_days ?? editEta);
        setEditGoal(updated.plan.goal || editGoal);
        setEditStyle(updated.plan.research_type || editStyle);
      }
      return true;
    } catch (e: any) {
      setError(e.message || "Failed to update plan");
      return false;
    }
  };

  const approve = async () => {
    if (!research) return;
    setBusy("launch");
    setError(null);
    try {
      const ok = await patchPlan();
      if (!ok) return;
      const updated = await api<ResearchRequest>(`/research/${research.id}/approve`, {
        method: "POST",
      });
      setResearch(updated);
    } catch (e: any) {
      setError(e.message || "Failed to launch research");
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!research) return;
    if (!confirm("Cancel this research brief? Interviews won't be scheduled.")) return;
    setBusy("reject");
    setError(null);
    try {
      const updated = await api<ResearchRequest>(`/research/${research.id}/reject`, {
        method: "POST",
      });
      setResearch(updated);
    } catch (e: any) {
      setError(e.message || "Failed to reject");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="card text-sm text-ink-500">Loading…</div>
      </div>
    );
  }

  if (!research) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link href="/dashboard/research" className="text-sm text-accent-500 hover:underline">
          &larr; Back to research
        </Link>
        <div className="card mt-4 text-sm text-danger-500">
          {error || "Research request not found."}
        </div>
      </div>
    );
  }

  const report = research.report || null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/dashboard/research"
        className="text-sm text-accent-500 hover:underline"
      >
        &larr; Back to research
      </Link>

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{research.question}</h1>
          <div className="mt-1 text-xs text-ink-500">
            Created{" "}
            {formatDistanceToNow(new Date(research.created_at), { addSuffix: true })}
            {research.approved_at && (
              <>
                {" · "}
                Launched{" "}
                {formatDistanceToNow(new Date(research.approved_at), { addSuffix: true })}
              </>
            )}
          </div>
        </div>
        <span className={`badge ${statusTone(research.status)}`}>
          {statusLabel(research.status)}
        </span>
      </div>

      {error && (
        <div className="card mb-4 border-danger-500 text-sm text-danger-500">{error}</div>
      )}

      {/* Brief section */}
      <div className="card mb-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Research brief</h2>
          {!isDraft && (
            <div className="text-xs text-ink-500">Read-only — brief is launched.</div>
          )}
        </div>

        {isDraft ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">What decision should this help you make?</label>
                <textarea
                  className="input min-h-[80px]"
                  value={editGoal}
                  onChange={(e) => setEditGoal(e.target.value)}
                  placeholder="What should leadership be able to decide after this?"
                />
              </div>
              <div>
                <label className="label">Research style</label>
                <select className="input" value={editStyle} onChange={(e) => setEditStyle(e.target.value)}>
                  <option value="root_cause">Root cause</option>
                  <option value="pulse_check">Pulse check</option>
                  <option value="decision_support">Decision support</option>
                  <option value="idea_discovery">Idea discovery</option>
                  <option value="follow_up">Follow-up</option>
                </select>
                <div className="mt-1 text-xs text-ink-500">{researchStyleHelp(editStyle)}</div>
              </div>
              <div>
              <label className="label">ETA (days)</label>
              <input
                type="number"
                min={1}
                className="input max-w-[160px]"
                value={editEta}
                onChange={(e) => setEditEta(Number(e.target.value) || 0)}
              />
              </div>
            </div>

            <div className="mt-6">
              <div className="label">Who we'll talk to</div>
              {editEmployees.length === 0 ? (
                <div className="rounded-md border border-dashed border-surface-200 p-4 text-sm text-ink-500">
                  No one selected yet. Add people below.
                </div>
              ) : (
                <div className="space-y-3">
                  {editEmployees.map((row, idx) => {
                    const emp = employeeMap.get(row.employee_id);
                    return (
                      <div
                        key={`${row.employee_id}-${idx}`}
                        className="rounded-md border border-surface-200 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">
                              {emp?.name || `Employee #${row.employee_id}`}
                            </div>
                            {emp && (
                              <div className="text-xs text-ink-500">
                                {emp.job_title}
                                {emp.job_title && emp.department ? " · " : ""}
                                {emp.department}
                              </div>
                            )}
                          </div>
                          <button
                            className="btn-ghost"
                            onClick={() => removeRow(idx)}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="mt-2">
                          <label className="label">Reason</label>
                          <input
                            className="input"
                            value={row.reason}
                            onChange={(e) => updateReason(idx, e.target.value)}
                            placeholder="Why this person?"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-lg border border-lilac-100 bg-lilac-50 p-4">
              <div className="font-medium text-ink-900">Add more participants</div>
              <p className="mt-1 text-sm text-ink-600">
                Agora suggested the first group. Add anyone else whose context would improve the readout.
              </p>
              {availableToAdd.length > 0 ? (
              <div className="mt-3 flex gap-2">
                <select
                  className="input max-w-sm"
                  value={addSelect}
                  onChange={(e) => setAddSelect(e.target.value)}
                >
                  <option value="">Add someone to the brief…</option>
                  {availableToAdd.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.job_title ? ` — ${e.job_title}` : ""}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary" disabled={!addSelect} onClick={addRow}>
                  Add participant
                </button>
              </div>
              ) : (
                <div className="mt-3 text-sm text-ink-500">Everyone active is already on this brief.</div>
              )}
            </div>

            {research.plan?.notes && (
              <div className="mt-6 rounded-md bg-surface-50 p-3 text-sm text-ink-700">
                <div className="mb-1 text-xs font-medium uppercase text-ink-500">
                  Expected output
                </div>
                {research.plan.notes}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <button
                className="btn-secondary"
                disabled={busy !== null}
                onClick={reject}
              >
                {busy === "reject" ? "Cancelling…" : "Cancel"}
              </button>
              <button
                className="btn-primary"
                disabled={busy !== null || editEmployees.length === 0}
                onClick={approve}
              >
                {busy === "launch" ? "Launching…" : "Launch research"}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="text-sm text-ink-700">
              Timeline:{" "}
              <span className="font-medium">
                {research.plan?.timeline || `${research.plan?.eta_days ?? "—"} days`}
              </span>
            </div>
            {research.plan?.goal && (
              <div>
                <div className="label">Goal</div>
                <p className="text-sm text-ink-700">{research.plan.goal}</p>
              </div>
            )}
            <div>
              <div className="label">Research style</div>
              <span className="badge bg-lilac-50 text-lilac-700">
                {(research.plan?.research_type || "root_cause").replace(/_/g, " ")}
              </span>
              <p className="mt-1 text-sm text-ink-500">
                {researchStyleHelp(research.plan?.research_type || "root_cause")}
              </p>
            </div>
            <div>
              <div className="label">Who we'll talk to</div>
              {((research.plan?.selected_employees || research.plan?.employees) || []).length === 0 ? (
                <div className="text-sm text-ink-500">No one on the brief.</div>
              ) : (
                <div className="space-y-2">
                  {(research.plan!.selected_employees || research.plan!.employees).map((row, i) => {
                    const emp = employeeMap.get(row.employee_id);
                    return (
                      <div
                        key={`${row.employee_id}-${i}`}
                        className="rounded-md border border-surface-200 p-3"
                      >
                        <div className="font-medium">
                          {emp?.name || `Employee #${row.employee_id}`}
                        </div>
                        {emp && (
                          <div className="text-xs text-ink-500">
                            {emp.job_title}
                            {emp.job_title && emp.department ? " · " : ""}
                            {emp.department}
                          </div>
                        )}
                        {row.reason && (
                          <div className="mt-1 text-sm text-ink-700">{row.reason}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {research.plan?.notes && (
              <div className="rounded-md bg-surface-50 p-3 text-sm text-ink-700">
                <div className="mb-1 text-xs font-medium uppercase text-ink-500">
                  Expected output
                </div>
                {research.plan.notes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Report section */}
      {!isDraft && (
        <div className="card">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Report</h2>
            {report?.progress && (
              <span className="badge bg-accent-500/10 text-accent-500">
                {report.progress} interviews
              </span>
            )}
          </div>

          {!report ? (
            <div className="mt-4 rounded-md border border-dashed border-surface-200 p-6 text-center text-sm text-ink-500">
              Interviews are being scheduled. The report updates as responses come in.
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {report.exec_summary && (
                <div>
                  <div className="label">Executive summary</div>
                  <p className="text-sm text-ink-700 whitespace-pre-wrap">
                    {report.exec_summary}
                  </p>
                </div>
              )}

              {report.findings && report.findings.length > 0 && (
                <div>
                  <div className="label">Findings</div>
                  <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
                    {report.findings.map((f, i) => (
                      <li key={`finding-${i}-${f.slice(0, 20)}`}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {report.recommendations && report.recommendations.length > 0 && (
                <div>
                  <div className="label">Recommendations</div>
                  <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
                    {report.recommendations.map((r, i) => (
                      <li key={`recommendation-${i}-${r.slice(0, 20)}`}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {report.supporting_quotes && report.supporting_quotes.length > 0 && (
                <div>
                  <div className="label">Supporting quotes</div>
                  <div className="space-y-2">
                    {report.supporting_quotes.map((q, i) => (
                      <blockquote
                        key={`quote-${i}-${q.slice(0, 20)}`}
                        className="border-l-2 border-accent-500 pl-3 text-sm italic text-ink-700"
                      >
                        {q}
                      </blockquote>
                    ))}
                  </div>
                </div>
              )}

              {report.interview_ids && report.interview_ids.length > 0 && (
                <div>
                  <div className="label">Interviews</div>
                  <div className="flex flex-wrap gap-2">
                    {report.interview_ids.map((iid) => (
                      <Link
                        key={iid}
                        href={`/dashboard/interviews/${iid}`}
                        className="badge bg-surface-100 text-ink-700 hover:bg-surface-200"
                      >
                        #{iid}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {report.updated_at && (
                <div className="text-xs text-ink-500">
                  Last updated{" "}
                  {formatDistanceToNow(new Date(report.updated_at), { addSuffix: true })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
