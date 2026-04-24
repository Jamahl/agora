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

type NotionStatus = { connected: boolean; page_count?: number };
type NotionPage = Record<string, any>;

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-ink-500">
          Company profile, interview cadence, and integrations.
        </p>
      </div>
      <ProfileSection />
      <CadenceSection />
      <IntegrationsSection />
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
                  <option key={i} value={i}>
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
                  <option key={i + 1} value={i + 1}>
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
                    key={l}
                    type="button"
                    className={`btn ${
                      weekdays.includes(i)
                        ? "bg-ink-900 text-white"
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
        Connect a source of context so interviews can reference the right pages.
      </p>

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
