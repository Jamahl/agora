"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

type Citation = {
  type: string;
  id: string;
  interview_id?: string;
  employee?: string;
  title?: string;
};

type ChatMessage = {
  id: string;
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
  needs_research: boolean;
  proposed_research_request_id?: string | null;
};

type Scope = {
  scope_type: "department" | "okr" | "employee" | null;
  scope_id: string | null;
  label: string;
};

function deriveScope(pathname: string): Scope {
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/");
  // segments[0] === "dashboard"
  if (segments[0] !== "dashboard") {
    return { scope_type: null, scope_id: null, label: "Home" };
  }
  const section = segments[1];
  const id = segments[2];
  if (!section) return { scope_type: null, scope_id: null, label: "Home" };
  if (section === "departments" && id) {
    const name = decodeURIComponent(id);
    return { scope_type: "department", scope_id: name, label: `Department: ${name}` };
  }
  if (section === "okrs" && id) {
    return { scope_type: "okr", scope_id: id, label: `OKR #${id}` };
  }
  if (section === "employees" && id) {
    return { scope_type: "employee", scope_id: id, label: `Employee #${id}` };
  }
  const title = section.charAt(0).toUpperCase() + section.slice(1);
  return { scope_type: null, scope_id: null, label: title };
}

export function ChatDock() {
  const pathname = usePathname() || "/dashboard";
  const scope = useMemo(() => deriveScope(pathname), [pathname]);
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    (async () => {
      const params = new URLSearchParams();
      if (scope.scope_type) params.set("scope_type", scope.scope_type);
      if (scope.scope_id) params.set("scope_id", scope.scope_id);
      params.set("limit", "50");
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
  }, [scope.scope_type, scope.scope_id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

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
      const body: Record<string, unknown> = { message: text };
      if (scope.scope_type) body.scope_type = scope.scope_type;
      if (scope.scope_id) body.scope_id = scope.scope_id;
      const reply = await api<ChatReply>("/chat", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const localAssistant: ChatMessage = {
        id: `local-a-${Date.now()}`,
        role: "assistant",
        content: reply.reply,
        citations: reply.citations,
        needs_research: reply.needs_research,
        proposed_research_request_id: reply.proposed_research_request_id ?? null,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, localAssistant]);
    } catch (e) {
      const errMsg: ChatMessage = {
        id: `local-err-${Date.now()}`,
        role: "assistant",
        content: e instanceof Error ? e.message : "Something went wrong.",
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, errMsg]);
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
  const researchLink =
    latestAssistant?.needs_research && latestAssistant?.proposed_research_request_id
      ? `/dashboard/research/${latestAssistant.proposed_research_request_id}`
      : null;

  if (!open) {
    return (
      <div className="sticky top-4 ml-auto mr-4 self-start">
        <button
          className="btn-secondary"
          onClick={() => setOpen(true)}
          aria-label="Open chat"
        >
          Chat
        </button>
      </div>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[360px] shrink-0 flex-col border-l border-surface-200 bg-white">
      <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink-500">Asking about</div>
          <div className="truncate text-sm font-semibold text-ink-900">{scope.label}</div>
        </div>
        <button
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => setOpen(false)}
          aria-label="Collapse chat"
        >
          Hide
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="text-sm text-ink-300">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-ink-500">
            Ask a question about this view. Chat is scoped to{" "}
            <span className="font-medium text-ink-900">{scope.label}</span>.
          </div>
        ) : (
          <ul className="space-y-4">
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.role === "user"
                    ? "rounded-lg bg-surface-100 px-3 py-2 text-sm text-ink-900"
                    : "rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-900"
                }
              >
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-500">
                  {m.role === "user" ? "You" : "Agora"}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.citations.map((c, i) => (
                      <span
                        key={`${m.id}-cite-${i}`}
                        className="badge bg-surface-100 text-ink-500"
                      >
                        {c.title || c.employee || `${c.type}#${c.id}`}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {sending && (
          <div className="mt-4 text-sm text-ink-300">Thinking…</div>
        )}
      </div>
      {researchLink && (
        <div className="border-t border-surface-200 bg-surface-50 px-4 py-2 text-sm">
          <Link href={researchLink} className="font-medium text-accent-500 hover:underline">
            Review research plan
          </Link>
        </div>
      )}
      <div className="border-t border-surface-200 px-3 py-3">
        <textarea
          className="input resize-none"
          rows={2}
          placeholder="Ask Agora…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-ink-300">Enter to send · Shift+Enter newline</span>
          <button
            className="btn-primary"
            onClick={send}
            disabled={sending || !input.trim()}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </aside>
  );
}
