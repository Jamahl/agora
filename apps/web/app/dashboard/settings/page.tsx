"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Company = {
  name: string;
  industry?: string;
  description?: string;
  admin_email?: string;
  hr_contact?: string;
  cadence_days?: number;
  timezone?: string;
  window_start_hour?: number;
  window_end_hour?: number;
  weekdays?: number[];
};

type NotionStatus = { connected: boolean; active?: boolean; page_count?: number };
type GmailStatus = { connected: boolean; active?: boolean; admin_email?: string | null };
type NotionPage = Record<string, any>;
type ContextBlock = {
  id: number;
  label: string;
  content: string;
  scope_type: "company" | "department";
  scope_id?: string | null;
  is_active: boolean;
};

const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "cadence", label: "Cadence" },
  { id: "context", label: "Context" },
  { id: "research", label: "Research" },
  { id: "integrations", label: "Integrations" },
  { id: "email-templates", label: "Email templates" },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-ink-500">
          Company profile, interview cadence, and integrations.
        </p>
      </div>
      <nav className="sticky top-0 z-20 mt-5 overflow-x-auto border-y border-lilac-100 bg-white/95 py-3 backdrop-blur">
        <div className="flex min-w-max gap-2">
          {SETTINGS_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-lilac-100 bg-lilac-50 px-3 py-1.5 text-sm font-medium text-lilac-700 hover:bg-lilac-100"
            >
              {section.label}
            </a>
          ))}
        </div>
      </nav>
      <div className="mt-6 space-y-6">
        <section id="profile" className="scroll-mt-24"><ProfileSection /></section>
        <section id="cadence" className="scroll-mt-24"><CadenceSection /></section>
        <section id="context" className="scroll-mt-24"><ContextSection /></section>
        <section id="research" className="scroll-mt-24"><ResearchStylesSection /></section>
        <section id="integrations" className="scroll-mt-24"><IntegrationsSection /></section>
        <section id="email-templates" className="scroll-mt-24"><EmailTemplatesSection /></section>
      </div>
    </div>
  );
}

const TEMPLATE_LABELS: Record<string, string> = {
  invite: "Interview invite",
  reminder: "15-min reminder",
  summary: "Post-call summary (to employee)",
  noshow_admin: "No-show admin notification",
  research_ready: "Research report ready",
};

const RESEARCH_STYLES = [
  {
    key: "root_cause",
    label: "Root cause",
    intent: "Find why an issue is happening and what conditions are creating it.",
    agentBehavior: "The agent asks for examples, causes, trade-offs, and what would change the outcome.",
  },
  {
    key: "pulse_check",
    label: "Pulse check",
    intent: "Get a broad read on how a group feels right now.",
    agentBehavior: "The agent samples sentiment, confidence, energy, and recent shifts without over-indexing on one event.",
  },
  {
    key: "decision_support",
    label: "Decision support",
    intent: "Collect evidence leadership needs before choosing a direction.",
    agentBehavior: "The agent probes risks, constraints, likely impact, and what evidence would make the decision clearer.",
  },
  {
    key: "idea_discovery",
    label: "Idea discovery",
    intent: "Surface suggestions, alternatives, and unexplored options.",
    agentBehavior: "The agent invites concrete ideas, compares options, and asks what the team would try first.",
  },
  {
    key: "follow_up",
    label: "Follow-up",
    intent: "Check whether a known issue has changed since prior signal.",
    agentBehavior: "The agent references the follow-up goal, asks what improved or regressed, and looks for proof.",
  },
];

const VARIABLE_CHIP_CLASS = "rounded bg-amber-50 px-1.5 py-0.5 font-medium text-ink-900 ring-1 ring-amber-200";

function decodeHtml(value: string): string {
  if (typeof window === "undefined") return value;
  const el = document.createElement("textarea");
  el.innerHTML = value;
  return el.value;
}

function htmlToEmailText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return html;
  const normalized = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n");
  const doc = new DOMParser().parseFromString(normalized, "text/html");
  return decodeHtml((doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkify(text: string): string {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#7A4FA8;text-decoration:underline;">$1</a>'
  );
}

function emailTextToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let bullets: string[] = [];
  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(`<ul>${bullets.map((b) => `<li>${linkify(b)}</li>`).join("")}</ul>`);
    bullets = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      continue;
    }
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    blocks.push(`<p>${linkify(trimmed)}</p>`);
  }
  flushBullets();
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#0B0D10;">${blocks.join("\n")}</div>`;
}

const EMPTY_CONTEXT = {
  label: "",
  content: "",
  scope_type: "company" as const,
  scope_id: "",
  is_active: true,
};

type ContextEdit = {
  id?: number;
  label: string;
  content: string;
  scope_type: "company" | "department";
  scope_id?: string | null;
  is_active: boolean;
};

function ResearchStylesSection() {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold">Research styles</h2>
      <p className="mt-1 text-sm text-ink-500">
        Research style is chosen per brief. It changes how the interview agent frames follow-ups once that research round is launched.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {RESEARCH_STYLES.map((style) => (
          <div key={style.key} className="rounded-lg border border-lilac-100 bg-lilac-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-ink-900">{style.label}</div>
              <code className="rounded bg-white px-1.5 py-0.5 text-xs text-lilac-700">
                {style.key}
              </code>
            </div>
            <p className="mt-2 text-sm text-ink-700">{style.intent}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">{style.agentBehavior}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-md border border-surface-200 bg-white p-3 text-xs text-ink-500">
        When a launched research interview starts, Agora passes the brief goal, style, and sample questions into the Retell agent as research context.
      </div>
    </div>
  );
}

function ContextSection() {
  const [blocks, setBlocks] = useState<ContextBlock[]>([]);
  const [editing, setEditing] = useState<ContextEdit>(EMPTY_CONTEXT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setBlocks(await api<ContextBlock[]>("/admin/company/context"));
    } catch (e: any) {
      setError(e?.message || "Failed to load context");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing.label.trim() || !editing.content.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      label: editing.label.trim(),
      content: editing.content.trim(),
      scope_type: editing.scope_type,
      scope_id: editing.scope_type === "department" ? editing.scope_id?.trim() || null : null,
      is_active: editing.is_active,
    };
    try {
      await api(`/admin/company/context${editing.id ? `/${editing.id}` : ""}`, {
        method: editing.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setEditing(EMPTY_CONTEXT);
      await load();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (block: ContextBlock) => {
    await api(`/admin/company/context/${block.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...block, is_active: !block.is_active }),
    });
    await load();
  };

  const remove = async (block: ContextBlock) => {
    if (!confirm(`Delete "${block.label}"?`)) return;
    await api(`/admin/company/context/${block.id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold">Context</h2>
      <p className="mt-1 text-sm text-ink-500">
        Current priorities, announcements, or org changes Agora should use to guide interview follow-ups.
      </p>
      <div className="mt-4 space-y-3">
        {blocks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-lilac-200 bg-lilac-50 p-4 text-sm text-ink-600">
            No context blocks yet. Add one for Q2 priorities, a reorg, or cultural values.
          </div>
        ) : (
          blocks.map((block) => (
            <div key={block.id} className="rounded-lg border border-surface-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-ink-900">{block.label}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-ink-500">
                    <span className="badge bg-lilac-50 text-lilac-700">
                      {block.scope_type === "department" ? `Department: ${block.scope_id}` : "Company-wide"}
                    </span>
                    <span className={`badge ${block.is_active ? "bg-ok-500/10 text-ok-500" : "bg-surface-100 text-ink-500"}`}>
                      {block.is_active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink-700">{block.content}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className="btn-ghost text-xs" onClick={() => setEditing({ ...block, scope_id: block.scope_id || "" })}>Edit</button>
                  <button className="btn-secondary text-xs" onClick={() => toggle(block)}>{block.is_active ? "Pause" : "Activate"}</button>
                  <button className="btn-danger text-xs" onClick={() => remove(block)}>Delete</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-5 rounded-lg border border-lilac-100 bg-lilac-50 p-4">
        <div className="mb-3 font-medium">{editing.id ? "Edit context block" : "Add context block"}</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Label</label>
            <input className="input" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="Q2 priorities" />
          </div>
          <div>
            <label className="label">Scope</label>
            <select className="input" value={editing.scope_type} onChange={(e) => setEditing({ ...editing, scope_type: e.target.value as "company" | "department" })}>
              <option value="company">Company-wide</option>
              <option value="department">Department</option>
            </select>
          </div>
          {editing.scope_type === "department" && (
            <div className="col-span-2">
              <label className="label">Department name</label>
              <input className="input" value={editing.scope_id || ""} onChange={(e) => setEditing({ ...editing, scope_id: e.target.value })} placeholder="Engineering" />
            </div>
          )}
          <div className="col-span-2">
            <label className="label">Content</label>
            <textarea className="input min-h-[120px]" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} placeholder="What should Agora know before the next interview round?" />
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-danger-500">{error}</div>}
        <div className="mt-4 flex items-center gap-2">
          <button className="btn-primary" disabled={saving || !editing.label.trim() || !editing.content.trim()} onClick={save}>{saving ? "Saving…" : editing.id ? "Save context" : "Add context block"}</button>
          {editing.id && <button className="btn-secondary" onClick={() => setEditing(EMPTY_CONTEXT)}>Cancel edit</button>}
        </div>
      </div>
    </div>
  );
}

type TemplateBundleOut = {
  templates: Record<string, { subject: string; body_html: string }>;
  defaults: Record<string, { subject: string; body_html: string }>;
  variables: Record<string, string[]>;
};

function EmailTemplatesSection() {
  const [data, setData] = useState<TemplateBundleOut | null>(null);
  const [editing, setEditing] = useState<Record<string, { subject: string; body_html: string }>>({});
  const [activeKind, setActiveKind] = useState("invite");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api<TemplateBundleOut>("/admin/company/email-templates");
      setData(r);
      setEditing(r.templates);
    } catch (e: any) {
      setError(e?.message || "Failed to load templates");
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api("/admin/company/email-templates", {
        method: "PATCH",
        body: JSON.stringify({ templates: editing }),
      });
      setMessage("Saved.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = async (kind: string) => {
    if (!confirm(`Reset the ${TEMPLATE_LABELS[kind] || kind} template to default?`)) return;
    try {
      await api(`/admin/company/email-templates/${kind}/reset`, { method: "POST" });
      await load();
      setMessage("Reset.");
    } catch (e: any) {
      setError(e?.message || "Reset failed");
    }
  };

  if (!data) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold">Email templates</h2>
        <div className="mt-3 text-sm text-ink-500">Loading…</div>
      </div>
    );
  }

  const kinds = Object.keys(data.templates);
  const selectedKind = kinds.includes(activeKind) ? activeKind : kinds[0];
  const current = editing[selectedKind] || data.templates[selectedKind];
  const vars = data.variables[selectedKind] || [];
  const emailText = htmlToEmailText(current.body_html);
  const isDirty =
    current.subject !== data.templates[selectedKind].subject ||
    current.body_html !== data.templates[selectedKind].body_html;
  return (
    <div className="card">
      <h2 className="text-lg font-semibold">Email templates</h2>
      <p className="mt-1 text-sm text-ink-500">
        Pick one template, edit one clear message view, then save all changes together. Agora handles line breaks, bullets, and links.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          {kinds.map((kind) => {
            const row = editing[kind] || data.templates[kind];
            const dirty =
              row.subject !== data.templates[kind].subject ||
              row.body_html !== data.templates[kind].body_html;
            return (
              <button
                key={kind}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  selectedKind === kind
                    ? "border-lilac-200 bg-lilac-50 text-lilac-700"
                    : "border-surface-200 bg-white text-ink-700 hover:bg-surface-50"
                }`}
                onClick={() => setActiveKind(kind)}
              >
                <span className="font-medium">{TEMPLATE_LABELS[kind] || kind}</span>
                {dirty && <span className="ml-2 text-xs text-warn-500">edited</span>}
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-surface-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">{TEMPLATE_LABELS[selectedKind] || selectedKind}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-500">
                Variables:{" "}
                {vars.map((v, idx) => (
                  <code key={`${selectedKind}-${v}-${idx}`} className={VARIABLE_CHIP_CLASS}>
                    {"{{" + v + "}}"}
                  </code>
                ))}
              </div>
            </div>
            <button className="btn-ghost text-xs" onClick={() => reset(selectedKind)}>
              Reset to default
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="label">Subject</label>
              <input
                className="input"
                value={current.subject}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    [selectedKind]: { ...current, subject: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <label className="label">Email message</label>
              <textarea
                className="input min-h-[260px]"
                value={emailText}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    [selectedKind]: { ...current, body_html: emailTextToHtml(e.target.value) },
                  })
                }
              />
              <div className="mt-1 text-xs text-ink-500">
                Use blank lines for paragraphs, start lines with “-” for bullets, paste full links, and insert variables exactly as shown above.
              </div>
            </div>
            {isDirty && (
              <div className="text-xs text-warn-500">Unsaved changes in this template</div>
            )}
          </div>
        </div>
      </div>


      {error && <div className="mt-3 text-sm text-danger-500">{error}</div>}
      {message && <div className="mt-3 text-sm text-ok-500">{message}</div>}
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save all templates"}
        </button>
      </div>
    </div>
  );
}

function ProfileSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [hrContact, setHrContact] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const c = await api<Company>("/admin/company");
        setName(c.name || "");
        setIndustry(c.industry || "");
        setDescription(c.description || "");
        setAdminEmail(c.admin_email || "");
        setHrContact(c.hr_contact || "");
      } catch (e: any) {
        setError(e.message || "Failed to load company");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api("/admin/company", {
        method: "PATCH",
        body: JSON.stringify({
          name,
          industry,
          description,
          admin_email: adminEmail,
          hr_contact: hrContact,
        }),
      });
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold">Profile</h2>
      <p className="mt-1 text-sm text-ink-500">
        Context Agora uses in interviews and alerts.
      </p>

      {loading ? (
        <div className="mt-4 text-sm text-ink-500">Loading…</div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Company name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Industry</label>
              <input
                className="input"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Admin email</label>
              <input
                className="input"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="label">What the company does</label>
              <textarea
                className="input min-h-[90px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="label">HR contact for sensitive escalations</label>
              <input
                className="input"
                value={hrContact}
                onChange={(e) => setHrContact(e.target.value)}
                placeholder="Sarah Chen (sarah@company.com)"
              />
            </div>
          </div>
          {error && <div className="mt-3 text-sm text-danger-500">{error}</div>}
          <div className="mt-4 flex items-center gap-3">
            <button
              className="btn-primary"
              disabled={saving || !name.trim()}
              onClick={save}
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
            {savedAt && !saving && (
              <span className="text-xs text-ok-500">Saved.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CadenceSection() {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cadence, setCadence] = useState(14);
  const [tz, setTz] = useState("UTC");
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);

  useEffect(() => {
    (async () => {
      try {
        const c = await api<Company>("/admin/company");
        setCadence(c.cadence_days ?? 14);
        setTz(
          c.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "UTC"
        );
        setStartHour(c.window_start_hour ?? 9);
        setEndHour(c.window_end_hour ?? 17);
        setWeekdays(
          Array.isArray(c.weekdays) && c.weekdays.length > 0
            ? c.weekdays
            : [0, 1, 2, 3, 4]
        );
      } catch (e: any) {
        setError(e.message || "Failed to load cadence");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
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
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (i: number) => {
    setWeekdays((prev) =>
      prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()
    );
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold">Cadence</h2>
      <p className="mt-1 text-sm text-ink-500">
        How often Agora interviews each person and when invites land.
      </p>

      {loading ? (
        <div className="mt-4 text-sm text-ink-500">Loading…</div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="label">Interview every</label>
              <select
                className="input"
                value={cadence}
                onChange={(e) => setCadence(Number(e.target.value))}
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={21}>21 days</option>
                <option value={28}>28 days</option>
              </select>
            </div>
            <div>
              <label className="label">Timezone</label>
              <input
                className="input"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Window start</label>
              <select
                className="input"
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={`start-hour-${i}`} value={i}>
                    {i}:00
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Window end</label>
              <select
                className="input"
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={`end-hour-${i + 1}`} value={i + 1}>
                    {i + 1}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Weekdays</label>
              <div className="flex flex-wrap gap-2">
                {labels.map((l, i) => (
                  <button
                    key={`weekday-${i}-${l}`}
                    type="button"
                    className={`btn ${
                      weekdays.includes(i)
                        ? "bg-lilac-700 text-white"
                        : "bg-surface-100"
                    }`}
                    onClick={() => toggleDay(i)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error && <div className="mt-3 text-sm text-danger-500">{error}</div>}
          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save cadence"}
            </button>
            {savedAt && !saving && (
              <span className="text-xs text-ok-500">Saved.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function pageTitle(p: NotionPage): string {
  return (
    p.title ||
    p.name ||
    p.page_title ||
    (typeof p.properties?.title === "string" ? p.properties.title : undefined) ||
    p.properties?.Name?.title?.[0]?.plain_text ||
    p.properties?.title?.title?.[0]?.plain_text ||
    `Page ${p.id}`
  );
}

function pageSubtitle(p: NotionPage): string | null {
  return p.path || p.workspace || p.parent_title || p.last_edited_time || null;
}

function IntegrationsSection() {
  const [status, setStatus] = useState<NotionStatus | null>(null);
  const [pages, setPages] = useState<NotionPage[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingPages, setLoadingPages] = useState(false);

  const loadStatus = async () => {
    try {
      const s = await api<NotionStatus>("/integrations/notion/status");
      setStatus(s);
      return s;
    } catch (e: any) {
      setError(e.message || "Failed to load Notion status");
      setStatus({ connected: false });
      return { connected: false };
    }
  };

  const loadPages = async () => {
    setLoadingPages(true);
    try {
      const data = await api<NotionPage[] | { pages: NotionPage[] }>(
        "/integrations/notion/pages"
      );
      const list: NotionPage[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.pages)
        ? (data as any).pages
        : [];
      setPages(list);
    } catch (e: any) {
      setError(e.message || "Failed to load Notion pages");
      setPages([]);
    } finally {
      setLoadingPages(false);
    }
  };

  useEffect(() => {
    (async () => {
      const s = await loadStatus();
      if (s.connected) await loadPages();
    })();
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    setMessage(null);
    try {
      const r = await api<{
        redirect_url?: string;
        connection_id?: string;
        error?: string;
      }>("/integrations/notion/connect", { method: "POST" });
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.redirect_url) {
        window.open(r.redirect_url, "_blank", "noopener,noreferrer");
        setMessage("Opened Notion in a new tab. Refresh after connecting.");
      } else {
        const s = await loadStatus();
        if (s.connected) {
          await loadPages();
          setMessage("Connected.");
        }
      }
    } catch (e: any) {
      setError(e.message || "Connect failed");
    } finally {
      setConnecting(false);
    }
  };

  const refresh = async () => {
    setError(null);
    setMessage(null);
    const s = await loadStatus();
    if (s.connected) await loadPages();
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sync = async () => {
    if (selected.size === 0) return;
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const r = await api<{ chunks_indexed: number }>(
        "/integrations/notion/sync",
        {
          method: "POST",
          body: JSON.stringify({ page_ids: Array.from(selected) }),
        }
      );
      setMessage(`Synced ${selected.size} page(s). ${r.chunks_indexed} chunks indexed.`);
    } catch (e: any) {
      setError(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold">Integrations</h2>
      <p className="mt-1 text-sm text-ink-500">
        Connect your Gmail so Agora sends invites from your admin email. Connect Notion so interviews and chat can reference company context.
      </p>

      <GmailCard />

      <div className="mt-4 rounded-md border border-surface-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Notion</div>
            <div className="mt-1 text-xs text-ink-500">
              {status === null
                ? "Checking…"
                : status.connected
                ? `Connected${
                    status.page_count != null
                      ? ` · ${status.page_count} page${
                          status.page_count === 1 ? "" : "s"
                        } available`
                      : ""
                  }`
                : "Not connected"}
            </div>
          </div>
          <div className="flex gap-2">
            {status?.connected ? (
              <button className="btn-secondary" onClick={refresh}>
                Refresh
              </button>
            ) : (
              <button
                className="btn-primary"
                disabled={connecting}
                onClick={connect}
              >
                {connecting ? "Connecting…" : "Connect Notion"}
              </button>
            )}
          </div>
        </div>

        {status?.connected && (
          <div className="mt-4 border-t border-surface-200 pt-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="font-medium">Pages to sync</div>
              {pages && pages.length > 0 && (
                <div className="text-xs text-ink-500">
                  {selected.size} selected
                </div>
              )}
            </div>

            {loadingPages ? (
              <div className="text-sm text-ink-500">Loading pages…</div>
            ) : !pages || pages.length === 0 ? (
              <div className="rounded-md border border-dashed border-surface-200 p-4 text-sm text-ink-500">
                No pages available. Share pages with the Notion integration and refresh.
              </div>
            ) : (
              <div className="max-h-[320px] space-y-1 overflow-auto rounded-md border border-surface-200 p-2">
                {pages.map((p, idx) => {
                  const id = String(p.id ?? p.page_id ?? idx);
                  const title = pageTitle(p);
                  const sub = pageSubtitle(p);
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-start gap-2 rounded p-2 text-sm hover:bg-surface-50"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selected.has(id)}
                        onChange={() => toggle(id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-ink-900">{title}</div>
                        {sub && (
                          <div className="truncate text-xs text-ink-500">{sub}</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mt-3">
              <button
                className="btn-primary"
                disabled={selected.size === 0 || syncing}
                onClick={sync}
              >
                {syncing
                  ? "Syncing…"
                  : `Sync ${selected.size || ""} page${
                      selected.size === 1 ? "" : "s"
                    }`.trim()}
              </button>
            </div>
          </div>
        )}

        {message && <div className="mt-3 text-sm text-ok-500">{message}</div>}
        {error && <div className="mt-3 text-sm text-danger-500">{error}</div>}
      </div>
    </div>
  );
}

function GmailCard() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const s = await api<GmailStatus>("/integrations/gmail/status");
      setStatus(s);
      return s;
    } catch (e: any) {
      setError(e.message || "Failed to load Gmail status");
      setStatus({ connected: false });
      return { connected: false };
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    setMessage(null);
    try {
      const r = await api<{ redirect_url?: string; connection_id?: string; error?: string }>(
        "/integrations/gmail/connect",
        { method: "POST" }
      );
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.redirect_url) {
        window.open(r.redirect_url, "_blank", "noopener,noreferrer");
        setMessage("Opened Google in a new tab. Refresh after connecting.");
      } else {
        await loadStatus();
        setMessage("Connected.");
      }
    } catch (e: any) {
      setError(e.message || "Connect failed");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Gmail? Invites will fall back to Loops/skip.")) return;
    setDisconnecting(true);
    try {
      await api("/integrations/gmail/disconnect", { method: "POST" });
      setMessage("Disconnected.");
      await loadStatus();
    } catch (e: any) {
      setError(e.message || "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="mt-4 rounded-md border border-surface-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Gmail</div>
          <div className="mt-1 text-xs text-ink-500">
            {status === null
              ? "Checking…"
              : status.connected
              ? `Connected${status.admin_email ? ` as ${status.admin_email}` : ""}${
                  status.active === false ? " (inactive — re-authorize)" : ""
                }`
              : "Not connected. Invites fall back to Loops if you've set LOOPS_API_KEY, otherwise they're skipped."}
          </div>
        </div>
        <div className="flex gap-2">
          {status?.connected ? (
            <>
              <button className="btn-secondary" onClick={loadStatus}>Refresh</button>
              <button className="btn-ghost text-danger-500" disabled={disconnecting} onClick={disconnect}>
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : (
            <button className="btn-primary" disabled={connecting} onClick={connect}>
              {connecting ? "Connecting…" : "Connect Gmail"}
            </button>
          )}
        </div>
      </div>
      {message && <div className="mt-3 text-sm text-ink-500">{message}</div>}
      {error && <div className="mt-3 text-sm text-danger-500">{error}</div>}
    </div>
  );
}
