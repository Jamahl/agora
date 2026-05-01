"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

type Citation = {
  type: string;
  id: string | number;
  interview_id?: string | number;
  employee?: string;
  title?: string;
  source_label?: string;
  source_category?: "employee_signal" | "company_context" | string;
  source_url?: string | null;
  preview?: string;
  insight_type?: string;
  severity?: number;
};

type ChatMessage = {
  id: string | number;
  session_id?: number | null;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  created_at: string;
  needs_research?: boolean;
  proposed_research_request_id?: string | null;
};

type ChatReply = {
  reply: string;
  citations: Citation[];
  session_id?: number | null;
  needs_research: boolean;
  proposed_research_request_id?: string | null;
};

type ChatSession = {
  id: number;
  title: string;
  context_mode: ContextMode;
  scope_type?: Scope["scope_type"];
  scope_id?: string | null;
  last_message_at: string;
};

type ContextMode = "all" | "page" | "custom";

type Scope = {
  scope_type: "department" | "okr" | "employee" | null;
  scope_id: string | null;
  label: string;
};

function deriveScope(pathname: string): Scope {
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (segments[0] !== "dashboard") return { scope_type: null, scope_id: null, label: "Home" };
  const section = segments[1];
  const id = segments[2];
  if (!section) return { scope_type: null, scope_id: null, label: "Home" };
  if (section === "departments" && id) {
    const name = decodeURIComponent(id);
    return { scope_type: "department", scope_id: name, label: `Department: ${name}` };
  }
  if (section === "okrs" && id) return { scope_type: "okr", scope_id: id, label: `OKR #${id}` };
  if (section === "employees" && id) return { scope_type: "employee", scope_id: id, label: `Employee #${id}` };
  const title = section.charAt(0).toUpperCase() + section.slice(1);
  return { scope_type: null, scope_id: null, label: title };
}

function contextLabel(mode: ContextMode, scope: Scope): string {
  if (mode === "page" && scope.scope_type) return scope.label;
  if (mode === "custom" && scope.scope_type) return `Custom: ${scope.label}`;
  return "All company context";
}

function CitationPill({ citation }: { citation: Citation }) {
  const href = citation.source_url || (citation.interview_id ? `/dashboard/interviews/${citation.interview_id}` : null);
  const isDoc = citation.source_category === "company_context" || citation.type === "notion";
  const label = citation.title || citation.employee || `${citation.type} #${citation.id}`;
  const classes =
    "group relative inline-flex rounded-full border px-2 py-1 text-[11px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-lilac-400 " +
    (isDoc
      ? "border-lilac-200 bg-lilac-50 text-lilac-700 hover:bg-lilac-100"
      : "border-accent-200 bg-accent-50 text-accent-700 hover:bg-accent-100");
  const inner = (
    <>
      <span>{citation.source_label || (isDoc ? "Document" : "Signal")}</span>
      <span className="mx-1 text-current/40">·</span>
      <span className="max-w-[150px] truncate">{label}</span>
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-64 rounded-lg border border-surface-200 bg-white p-3 text-left text-xs text-ink-700 shadow-xl group-hover:block group-focus:block group-focus-within:block">
        <span className="mb-1 block font-semibold text-ink-900">{label}</span>
        {citation.insight_type && (
          <span className="mb-1 block uppercase tracking-wide text-ink-500">
            {citation.insight_type.replace(/_/g, " ")} · severity {citation.severity ?? "—"}
          </span>
        )}
        <span className="block leading-relaxed">{citation.preview || "No preview available."}</span>
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={classes}>
      {inner}
    </Link>
  ) : (
    <span tabIndex={0} className={classes}>
      {inner}
    </span>
  );
}

function SourceSummary({ citations }: { citations: Citation[] }) {
  const signals = citations.filter((c) => c.source_category !== "company_context" && c.type !== "notion").length;
  const docs = citations.filter((c) => c.source_category === "company_context" || c.type === "notion").length;
  if (!signals && !docs) return null;
  const parts = [];
  if (signals) parts.push(`${signals} employee signal${signals === 1 ? "" : "s"}`);
  if (docs) parts.push(`${docs} company doc${docs === 1 ? "" : "s"}`);
  return <div className="mt-2 text-[11px] text-ink-500">Based on {parts.join(" and ")}.</div>;
}

export function ChatDock() {
  const pathname = usePathname() || "/dashboard";
  const scope = useMemo(() => deriveScope(pathname), [pathname]);
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [showLegacyThread, setShowLegacyThread] = useState(false);
  const [contextMode, setContextMode] = useState<ContextMode>("all");
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadSessions = async () => {
    try {
      const data = await api<ChatSession[]>("/chat/sessions");
      setSessions(data);
      if (!sessionId && data[0]) {
        setSessionId(data[0].id);
        setShowLegacyThread(false);
        setContextMode(data[0].context_mode || "all");
      }
    } catch {
      setSessions([]);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (!sessionId && !showLegacyThread) {
        setMessages([]);
        setLoading(false);
        return;
      }
      const params = new URLSearchParams({ limit: "50" });
      params.set("session_id", showLegacyThread ? "-1" : String(sessionId));
      try {
        const data = await api<ChatMessage[]>(`/chat/history?${params.toString()}`);
        if (!cancelled) setMessages(data);
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, showLegacyThread]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  const startNewSession = () => {
    setSessionId(null);
    setShowLegacyThread(false);
    setMessages([]);
    setContextMode("all");
    setLoading(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const localUser: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, localUser]);
    setInput("");
    try {
      const body: Record<string, unknown> = { message: text, session_id: sessionId, context_mode: contextMode };
      if (contextMode !== "all" && scope.scope_type) body.scope_type = scope.scope_type;
      if (contextMode !== "all" && scope.scope_id) body.scope_id = scope.scope_id;
      const reply = await api<ChatReply>("/chat", { method: "POST", body: JSON.stringify(body) });
      if (reply.session_id) {
        setSessionId(reply.session_id);
        setShowLegacyThread(false);
      }
      const localAssistant: ChatMessage = {
        id: `local-a-${Date.now()}`,
        session_id: reply.session_id,
        role: "assistant",
        content: reply.reply,
        citations: reply.citations,
        needs_research: reply.needs_research,
        proposed_research_request_id: reply.proposed_research_request_id ?? null,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, localAssistant]);
      await loadSessions();
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: `local-err-${Date.now()}`,
          role: "assistant",
          content: e instanceof Error ? e.message : "Something went wrong.",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const researchLink = latestAssistant?.needs_research && latestAssistant?.proposed_research_request_id
    ? `/dashboard/research/${latestAssistant.proposed_research_request_id}`
    : null;

  if (!open) {
    return (
      <div className="sticky top-4 ml-auto mr-4 self-start">
        <button className="btn-secondary" onClick={() => setOpen(true)} aria-label="Open chat">Chat</button>
      </div>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[380px] shrink-0 flex-col border-l border-lilac-100 bg-white">
      <div className="border-b border-surface-200 px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-ink-500">Chat session</div>
            <select
              className="mt-1 w-full rounded-md border border-surface-200 bg-white px-2 py-1 text-sm font-semibold text-ink-900"
              value={showLegacyThread ? "legacy" : sessionId ?? "new"}
              onChange={(e) => {
                if (e.target.value === "new") startNewSession();
                else if (e.target.value === "legacy") {
                  setSessionId(null);
                  setShowLegacyThread(true);
                  setContextMode("all");
                }
                else {
                  const nextId = Number(e.target.value);
                  const found = sessions.find((s) => s.id === nextId);
                  setSessionId(nextId);
                  setShowLegacyThread(false);
                  setContextMode(found?.context_mode || "all");
                }
              }}
            >
              <option value="new">New thread</option>
              <option value="legacy">Previous conversation</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>{session.title}</option>
              ))}
            </select>
          </div>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(false)} aria-label="Collapse chat">Hide</button>
        </div>
        <div className="rounded-lg bg-lilac-50 p-2">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-lilac-700">Context: {contextLabel(contextMode, scope)}</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <button className={contextMode === "all" ? "btn-primary px-2 py-1 text-xs" : "btn-secondary px-2 py-1 text-xs"} onClick={() => setContextMode("all")}>All company</button>
            <button className={contextMode === "page" ? "btn-primary px-2 py-1 text-xs" : "btn-secondary px-2 py-1 text-xs"} disabled={!scope.scope_type} onClick={() => setContextMode("page")}>This page</button>
          </div>
          {scope.scope_type && contextMode === "all" && (
            <button className="mt-2 text-xs font-medium text-lilac-700 hover:underline" onClick={() => setContextMode("page")}>Suggested: narrow to {scope.label}</button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="text-sm text-ink-300">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-lilac-200 bg-lilac-50 p-4 text-sm text-ink-600">
            {sessionId
              ? "Ask a follow-up, or narrow the context to the current page when you need a focused answer."
              : showLegacyThread
              ? "This is the previous conversation from before named threads. Start a new thread when you want a clean conversation."
              : "Start a new thread. Your first message will name and save it in the thread list."}
          </div>
        ) : (
          <ul className="space-y-4">
            {messages.map((m) => (
              <li key={m.id} className={m.role === "user" ? "rounded-lg bg-lilac-50 px-3 py-2 text-sm text-ink-900" : "rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-900"}>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-500">{m.role === "user" ? "You" : "Agora"}</div>
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                {m.citations && m.citations.length > 0 && (
                  <>
                    <SourceSummary citations={m.citations} />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.citations.map((c, i) => <CitationPill key={`${m.id}-cite-${c.type}-${c.id}-${i}`} citation={c} />)}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {sending && <div className="mt-4 text-sm text-ink-300">Thinking…</div>}
      </div>

      {researchLink && (
        <div className="border-t border-surface-200 bg-lilac-50 px-4 py-2 text-sm">
          <Link href={researchLink} className="font-medium text-lilac-700 hover:underline">Open research brief</Link>
        </div>
      )}
      <div className="border-t border-surface-200 px-3 py-3">
        <textarea className="input resize-none" rows={2} placeholder="Ask Agora…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} disabled={sending} />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-ink-300">Enter to send · Shift+Enter newline</span>
          <button className="btn-primary" onClick={send} disabled={sending || !input.trim()}>{sending ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </aside>
  );
}
