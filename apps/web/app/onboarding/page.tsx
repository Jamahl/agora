"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Logo } from "@/components/Logo";

type Step = 0 | 1 | 2 | 3 | 4 | 5;

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await api<{ has_session: boolean }>("/admin/session/me");
        if (!me.has_session) {
          await api("/admin/session/bootstrap", { method: "POST", body: "{}" });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <main className="grid min-h-screen place-items-center text-ink-500">Loading…</main>;

  const titles = [
    "Welcome",
    "Company profile",
    "Employees",
    "OKRs",
    "Cadence",
    "Integrations",
    "Go live",
  ];

  return (
    <main className="min-h-screen bg-surface-50">
      <header className="border-b border-surface-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="text-sm text-ink-500">Step {step + 1} of 6</div>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded ${i <= step ? "bg-ink-900" : "bg-surface-200"}`} />
          ))}
        </div>
        {step === 0 && <StepWelcome next={() => setStep(1)} />}
        {step === 1 && <StepCompany next={() => setStep(2)} />}
        {step === 2 && <StepEmployees next={() => setStep(3)} />}
        {step === 3 && <StepOKRs next={() => setStep(4)} />}
        {step === 4 && <StepCadence next={() => setStep(5)} />}
        {step === 5 && <StepGoLive onDone={() => router.replace("/dashboard")} />}
      </div>
    </main>
  );
}

function StepWelcome({ next }: { next: () => void }) {
  return (
    <div className="card">
      <h1 className="text-2xl font-semibold">Set up Agora for your company</h1>
      <p className="mt-2 text-ink-500">
        Six steps. ~10 minutes. You'll add your company profile, your team, your OKRs, and pick a cadence.
        When you're done, Agora schedules the first round of interviews.
      </p>
      <button className="btn-primary mt-6" onClick={next}>Begin</button>
    </div>
  );
}

function StepCompany({ next }: { next: () => void }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [hrContact, setHrContact] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api("/admin/company", {
        method: "PATCH",
        body: JSON.stringify({ name, industry, description, admin_email: adminEmail, hr_contact: hrContact }),
      });
      next();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="card">
      <h2 className="text-xl font-semibold">Company profile</h2>
      <p className="mt-1 text-sm text-ink-500">Used by the interview agent for context — so it can say "how's the launch going?" not "how's work?"</p>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Company name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Industry</label>
          <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </div>
        <div>
          <label className="label">Admin email</label>
          <input className="input" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">What the company does (one paragraph)</label>
          <textarea className="input min-h-[90px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">HR contact for sensitive escalations (name + email)</label>
          <input className="input" value={hrContact} onChange={(e) => setHrContact(e.target.value)} placeholder="Sarah Chen (sarah@company.com)" />
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button className="btn-primary" disabled={!name.trim() || saving} onClick={save}>
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

function StepEmployees({ next }: { next: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const emptyForm = { name: "", email: "", job_title: "", department: "" };
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => setRows(await api("/employees"));
  useEffect(() => {
    load();
  }, []);

  const canAdd = form.name.trim() && form.email.trim();

  const add = async () => {
    if (!canAdd) return;
    setErr(null);
    setSaving(true);
    try {
      await api("/employees", { method: "POST", body: JSON.stringify(form) });
      setForm(emptyForm);
      load();
    } catch (e: any) {
      const msg = e?.message || "Failed to add employee.";
      try {
        const firstColon = msg.indexOf(":");
        const payload = firstColon >= 0 ? msg.slice(firstColon + 1).trim() : msg;
        const parsed = JSON.parse(payload);
        setErr(parsed?.message || msg);
      } catch {
        setErr(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: number) => {
    await api(`/employees/${id}/archive`, { method: "POST" });
    load();
  };

  const importCsv = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    const r = await api<{ created: number; errors: any[] }>("/employees/import-csv", { method: "POST", body: fd });
    alert(`Created ${r.created}. Errors: ${r.errors.length}`);
    load();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canAdd && !saving) {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="card">
      <h2 className="text-xl font-semibold">Employees</h2>
      <p className="mt-1 text-sm text-ink-500">Add your team. CSV or manual. Add as many as you want, then click Continue at the bottom.</p>

      <div className="mt-4">
        <label className="btn-secondary cursor-pointer">
          Upload CSV
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
          />
        </label>
        <span className="ml-3 text-xs text-ink-500">Columns: name, email, job_title, department, linkedin_url, manager_email</span>
      </div>

      <div className="mt-6 rounded-lg border border-surface-200 bg-surface-50 p-4">
        <div className="text-sm font-medium text-ink-700">Add an employee</div>
        <div className="mt-3 grid grid-cols-4 gap-2" onKeyDown={onKey}>
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Role" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
          <input className="input" placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-primary" onClick={add} disabled={!canAdd || saving}>
            {saving ? "Adding…" : "+ Add employee"}
          </button>
          {err && <div className="text-sm text-danger-500">{err}</div>}
          <div className="ml-auto text-xs text-ink-500">Tip: press Enter to add, then keep going.</div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-6">
          <div className="text-sm text-ink-500 mb-2">Added ({rows.length})</div>
          <table className="w-full text-sm">
            <thead className="text-ink-500">
              <tr>
                <th className="text-left font-medium py-2">Name</th>
                <th className="text-left font-medium">Email</th>
                <th className="text-left font-medium">Role</th>
                <th className="text-left font-medium">Dept</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-surface-100">
                  <td className="py-2">{r.name}</td>
                  <td>{r.email}</td>
                  <td>{r.job_title}</td>
                  <td>{r.department}</td>
                  <td className="text-right">
                    <button className="btn-ghost" onClick={() => archive(r.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between border-t border-surface-200 pt-4">
        <div className="text-sm text-ink-500">
          {rows.length === 0 ? "Add at least one employee to continue." : `${rows.length} employee${rows.length === 1 ? "" : "s"} ready.`}
        </div>
        <button className="btn-primary" disabled={rows.length === 0} onClick={next}>Continue to OKRs →</button>
      </div>
    </div>
  );
}

function StepOKRs({ next }: { next: () => void }) {
  const [okrs, setOkrs] = useState<any[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [manual, setManual] = useState({ objective: "", kr: "" });
  const load = async () => setOkrs(await api("/okrs"));
  useEffect(() => { load(); }, []);

  const parse = async () => {
    setParsing(true);
    try {
      const r = await api<{ objectives: any[] }>("/okrs/extract", { method: "POST", body: JSON.stringify({ text: pasteText }) });
      setPreview(r.objectives);
    } finally {
      setParsing(false);
    }
  };

  const commitPreview = async () => {
    if (!preview) return;
    for (const o of preview) {
      await api("/okrs", { method: "POST", body: JSON.stringify(o) });
    }
    setPreview(null);
    setPasteText("");
    load();
  };

  const addManual = async () => {
    if (!manual.objective) return;
    const krs = manual.kr.split("\n").filter((s) => s.trim()).map((s) => ({ description: s.trim() }));
    await api("/okrs", { method: "POST", body: JSON.stringify({ objective: manual.objective, key_results: krs }) });
    setManual({ objective: "", kr: "" });
    load();
  };

  return (
    <div className="card">
      <h2 className="text-xl font-semibold">OKRs</h2>
      <p className="mt-1 text-sm text-ink-500">Paste your OKR doc; we'll extract structure. Or add one manually.</p>

      <div className="mt-4">
        <label className="label">Paste OKRs</label>
        <textarea className="input min-h-[140px] font-mono text-xs" value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
        <button className="btn-secondary mt-2" disabled={parsing || !pasteText.trim()} onClick={parse}>{parsing ? "Parsing…" : "Parse with AI"}</button>
      </div>

      {preview && (
        <div className="mt-4 border border-accent-400 rounded-md p-4 bg-accent-400/10">
          <div className="font-medium mb-2">Preview — confirm before committing</div>
          {preview.map((o, i) => (
            <div key={i} className="mb-3">
              <div className="font-medium">{o.objective}</div>
              <ul className="mt-1 ml-4 list-disc text-sm text-ink-500">
                {o.key_results?.map((k: any, j: number) => (<li key={j}>{k.description}{k.target_metric ? ` — ${k.target_metric}` : ""}</li>))}
              </ul>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="btn-primary" onClick={commitPreview}>Save all</button>
            <button className="btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-surface-200 pt-4">
        <div className="font-medium">Add manually</div>
        <input className="input mt-2" placeholder="Objective" value={manual.objective} onChange={(e) => setManual({ ...manual, objective: e.target.value })} />
        <textarea className="input mt-2 min-h-[70px]" placeholder="Key results (one per line)" value={manual.kr} onChange={(e) => setManual({ ...manual, kr: e.target.value })} />
        <button className="btn-secondary mt-2" onClick={addManual}>Add OKR</button>
      </div>

      {okrs.length > 0 && (
        <div className="mt-6">
          <div className="text-sm text-ink-500 mb-2">Saved OKRs ({okrs.length})</div>
          {okrs.map((o) => (
            <div key={o.id} className="mb-3">
              <div className="font-medium">{o.objective}</div>
              <ul className="ml-4 list-disc text-sm text-ink-500">
                {o.key_results?.map((k: any) => (<li key={k.id}>{k.description}</li>))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button className="btn-primary" onClick={next}>Continue</button>
      </div>
    </div>
  );
}

function StepCadence({ next }: { next: () => void }) {
  const [cadence, setCadence] = useState(14);
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [saving, setSaving] = useState(false);

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const save = async () => {
    setSaving(true);
    try {
      await api("/admin/company/cadence", {
        method: "PATCH",
        body: JSON.stringify({
          cadence_days: cadence,
          timezone: tz,
          window_start_hour: startHour,
          window_end_hour: endHour,
          weekdays,
        }),
      });
      next();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="card">
      <h2 className="text-xl font-semibold">Cadence</h2>
      <p className="mt-1 text-sm text-ink-500">How often Agora interviews each person and when invites land.</p>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label className="label">Interview every</label>
          <select className="input" value={cadence} onChange={(e) => setCadence(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={21}>21 days</option>
            <option value={28}>28 days</option>
          </select>
        </div>
        <div>
          <label className="label">Timezone</label>
          <input className="input" value={tz} onChange={(e) => setTz(e.target.value)} />
        </div>
        <div>
          <label className="label">Window start</label>
          <select className="input" value={startHour} onChange={(e) => setStartHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, i) => (<option key={i} value={i}>{i}:00</option>))}
          </select>
        </div>
        <div>
          <label className="label">Window end</label>
          <select className="input" value={endHour} onChange={(e) => setEndHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, i) => (<option key={i + 1} value={i + 1}>{i + 1}:00</option>))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Weekdays</label>
          <div className="flex gap-2">
            {labels.map((l, i) => (
              <button
                key={l}
                className={`btn ${weekdays.includes(i) ? "bg-ink-900 text-white" : "bg-surface-100"}`}
                onClick={() => setWeekdays(weekdays.includes(i) ? weekdays.filter((d) => d !== i) : [...weekdays, i].sort())}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button className="btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Continue"}</button>
      </div>
    </div>
  );
}

function StepGoLive({ onDone }: { onDone: () => void }) {
  const [info, setInfo] = useState<any>(null);
  const [going, setGoing] = useState(false);
  useEffect(() => {
    (async () => {
      const [company, employees, okrs] = await Promise.all([
        api("/admin/company"),
        api("/employees"),
        api("/okrs"),
      ]);
      setInfo({ company, employees, okrs });
    })();
  }, []);
  const go = async () => {
    setGoing(true);
    try {
      await api("/admin/company/complete-onboarding", { method: "POST" });
      onDone();
    } finally {
      setGoing(false);
    }
  };
  if (!info) return <div className="card">Loading…</div>;
  return (
    <div className="card">
      <h2 className="text-xl font-semibold">Go live</h2>
      <p className="mt-1 text-sm text-ink-500">First invites go out as soon as you confirm.</p>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-md border border-surface-200 p-4">
          <div className="text-xs text-ink-500">Company</div>
          <div className="mt-1 font-medium">{info.company.name}</div>
        </div>
        <div className="rounded-md border border-surface-200 p-4">
          <div className="text-xs text-ink-500">Employees</div>
          <div className="mt-1 font-medium">{info.employees.length}</div>
        </div>
        <div className="rounded-md border border-surface-200 p-4">
          <div className="text-xs text-ink-500">OKRs</div>
          <div className="mt-1 font-medium">{info.okrs.length}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-ink-500">
        Cadence: every {info.company.cadence_days} days · window {info.company.window_start_hour}:00–{info.company.window_end_hour}:00 {info.company.timezone}
      </div>
      <div className="mt-6">
        <button className="btn-primary" disabled={going || info.employees.length === 0} onClick={go}>
          {going ? "Scheduling…" : "Go live — schedule first round"}
        </button>
      </div>
    </div>
  );
}
