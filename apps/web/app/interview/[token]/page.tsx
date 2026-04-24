"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";
import { Logo } from "@/components/Logo";
import CallView from "@/components/CallView";

type InterviewInfo = {
  employee_first_name: string;
  company_name: string;
  scheduled_at: string;
  link_token: string;
  is_first_interview: boolean;
};

type StartResponse = {
  access_token: string;
  call_id: string;
};

type TokenErrorKind = "notfound" | "expired" | "early" | "generic";

type TokenError = {
  kind: TokenErrorKind;
  scheduledAt?: string;
};

type Phase =
  | "loading-token"
  | "token-error"
  | "greeting"
  | "starting"
  | "mic-denied"
  | "active"
  | "done";

// Loosely typed Retell client — SDK is imported dynamically.
type RetellClient = {
  startCall: (opts: { accessToken: string }) => Promise<void>;
  stopCall: () => void;
  mute?: () => void;
  unmute?: () => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function parseHttpStatus(err: unknown): number | null {
  if (err instanceof Error) {
    const m = err.message.match(/^(\d{3}):/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

// The `api` helper stringifies the error body into the Error message.
// Try to recover a scheduled_at timestamp from a 425 response.
function extractScheduledAt(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const afterStatus = err.message.replace(/^\d{3}:\s*/, "");
  // First: maybe the whole thing is JSON
  try {
    const body = JSON.parse(afterStatus);
    const val =
      body?.scheduled_at ||
      body?.detail?.scheduled_at ||
      body?.data?.scheduled_at;
    if (typeof val === "string") return val;
  } catch {
    // not JSON — fall through
  }
  // Second: look for an ISO timestamp substring
  const iso = afterStatus.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?[^\s"']*/);
  if (iso) return iso[0];
  return undefined;
}

function formatScheduled(iso?: string): string {
  if (!iso) return "";
  try {
    return format(parseISO(iso), "EEEE, MMM d 'at' h:mm a");
  } catch {
    return iso;
  }
}

export default function InterviewPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [phase, setPhase] = useState<Phase>("loading-token");
  const [info, setInfo] = useState<InterviewInfo | null>(null);
  const [tokenError, setTokenError] = useState<TokenError | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [liveCaption, setLiveCaption] = useState<string>("");

  const clientRef = useRef<RetellClient | null>(null);
  const endedRef = useRef(false);

  // Load interview info
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api<InterviewInfo>(
          `/interviews/by-token/${encodeURIComponent(token)}`
        );
        if (cancelled) return;
        setInfo(data);
        setPhase("greeting");
      } catch (err) {
        if (cancelled) return;
        const status = parseHttpStatus(err);
        if (status === 404) {
          setTokenError({ kind: "notfound" });
        } else if (status === 410) {
          setTokenError({ kind: "expired" });
        } else if (status === 425) {
          // Too early — the API may embed scheduled_at in the response body.
          setTokenError({ kind: "early", scheduledAt: extractScheduledAt(err) });
        } else {
          setTokenError({ kind: "generic" });
        }
        setPhase("token-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const cleanupCall = useCallback(() => {
    const c = clientRef.current;
    if (c) {
      try {
        c.stopCall();
      } catch {
        // ignore
      }
      clientRef.current = null;
    }
  }, []);

  // Stop the call if the component unmounts or tab closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupCall();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
      cleanupCall();
    };
  }, [cleanupCall]);

  const handleStart = useCallback(async () => {
    if (!token || phase === "starting" || phase === "active") return;
    setStartError(null);
    setPhase("starting");
    endedRef.current = false;

    try {
      const started = await api<StartResponse>(
        `/interviews/by-token/${encodeURIComponent(token)}/start`,
        { method: "POST" }
      );

      // Dynamic import keeps the SDK out of the SSR build
      const mod = await import("retell-client-js-sdk");
      const RetellWebClient = (mod as { RetellWebClient: new () => RetellClient })
        .RetellWebClient;
      const client = new RetellWebClient();
      clientRef.current = client;

      client.on("call_started", () => {
        setPhase("active");
      });
      client.on("call_ended", () => {
        if (endedRef.current) return;
        endedRef.current = true;
        clientRef.current = null;
        setAgentSpeaking(false);
        setUserSpeaking(false);
        setPhase("done");
      });
      client.on("agent_start_talking", () => {
        setAgentSpeaking(true);
        setUserSpeaking(false);
      });
      client.on("agent_stop_talking", () => {
        setAgentSpeaking(false);
      });
      client.on("update", (...args: unknown[]) => {
        const update = args[0] as
          | {
              transcript?: Array<{ role?: string; content?: string }>;
            }
          | undefined;
        const transcript = update?.transcript;
        if (Array.isArray(transcript) && transcript.length > 0) {
          const last = transcript[transcript.length - 1];
          const role = last?.role;
          const content = last?.content ?? "";
          // Surface the most recent utterance as a caption
          if (content) setLiveCaption(content);
          // User-speaking indicator — heuristic: most recent turn is user
          if (role === "user") {
            setUserSpeaking(true);
            window.setTimeout(() => setUserSpeaking(false), 600);
          }
        }
      });
      client.on("error", (...args: unknown[]) => {
        const error = args[0];
        // Treat errors during an active call as an early end
        // eslint-disable-next-line no-console
        console.error("Retell error:", error);
        if (!endedRef.current) {
          endedRef.current = true;
          try {
            client.stopCall();
          } catch {
            // ignore
          }
          clientRef.current = null;
          setPhase("done");
        }
      });

      await client.startCall({ accessToken: started.access_token });
      // If call_started never fires for some reason, we still want to show the UI
      setPhase((p) => (p === "starting" ? "active" : p));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to start interview:", err);
      const name =
        err instanceof Error ? err.name : typeof err === "string" ? err : "";
      const msg = err instanceof Error ? err.message : "";
      const denied =
        name === "NotAllowedError" ||
        /permission|denied|NotAllowedError/i.test(msg);
      if (denied) {
        setPhase("mic-denied");
      } else {
        setStartError(
          msg ||
            "Something went wrong starting the call. Please try again in a moment."
        );
        setPhase("greeting");
      }
      cleanupCall();
    }
  }, [token, phase, cleanupCall]);

  const handleToggleMute = useCallback(() => {
    const c = clientRef.current;
    if (!c) return;
    setMuted((m) => {
      const next = !m;
      try {
        if (next && typeof c.mute === "function") c.mute();
        else if (!next && typeof c.unmute === "function") c.unmute();
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleEnd = useCallback(() => {
    const c = clientRef.current;
    if (!c) {
      setPhase("done");
      return;
    }
    try {
      c.stopCall();
    } catch {
      // ignore
    }
    // call_ended will transition us; as a safety net:
    window.setTimeout(() => {
      if (!endedRef.current) {
        endedRef.current = true;
        clientRef.current = null;
        setPhase("done");
      }
    }, 1200);
  }, []);

  // ---------- Render ----------

  return (
    <main className="min-h-screen bg-surface-50 text-ink-900">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
        <header className="mb-10 flex flex-col items-center gap-2">
          <Logo />
          {info?.company_name ? (
            <div className="text-xs uppercase tracking-wider text-ink-500">
              {info.company_name}
            </div>
          ) : null}
        </header>

        <section className="flex flex-1 items-center justify-center">
          {phase === "loading-token" && (
            <div className="text-sm text-ink-500">Loading…</div>
          )}

          {phase === "token-error" && tokenError && (
            <TokenErrorView error={tokenError} info={info} />
          )}

          {phase === "greeting" && info && (
            <GreetingView
              firstName={info.employee_first_name}
              companyName={info.company_name}
              onStart={handleStart}
              startError={startError}
            />
          )}

          {phase === "starting" && (
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 animate-pulse rounded-full bg-accent-400/40" />
              <div className="text-sm text-ink-500">
                Connecting — allow microphone access if prompted…
              </div>
            </div>
          )}

          {phase === "mic-denied" && (
            <div className="card w-full max-w-md text-center">
              <h2 className="mb-2 text-lg font-semibold">
                Microphone access is needed
              </h2>
              <p className="mb-4 text-sm text-ink-500">
                This is a voice chat, so Agora needs permission to use your
                microphone. Allow access in your browser’s address bar (usually
                a mic icon), then try again.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setStartError(null);
                  setPhase("greeting");
                }}
              >
                Try again
              </button>
            </div>
          )}

          {phase === "active" && (
            <CallView
              agentSpeaking={agentSpeaking}
              userSpeaking={userSpeaking}
              muted={muted}
              onToggleMute={handleToggleMute}
              onEnd={handleEnd}
              liveCaption={liveCaption}
            />
          )}

          {phase === "done" && <DoneView />}
        </section>
      </div>
    </main>
  );
}

function GreetingView({
  firstName,
  companyName,
  onStart,
  startError,
}: {
  firstName: string;
  companyName: string;
  onStart: () => void;
  startError: string | null;
}) {
  return (
    <div className="w-full max-w-lg text-center">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight text-ink-900">
        Hi {firstName}, this is a ~10 min voice chat with Agora, the AI
        colleague at {companyName}.
      </h1>
      <p className="mb-8 text-base text-ink-700">
        You’ll talk, it’ll ask thoughtful questions. Your words help leadership
        understand what to fix. Your mic permission will be requested when you
        hit Start.
      </p>

      <button
        type="button"
        onClick={onStart}
        className="btn-primary px-8 py-3 text-base"
        aria-label="Start the voice interview"
      >
        Start
      </button>

      {startError ? (
        <p className="mt-4 text-sm text-danger-500" role="alert">
          {startError}
        </p>
      ) : null}

      <p className="mt-10 text-xs text-ink-500">
        By starting, you agree this chat is attributed — leadership will see
        themes you raise, tied to you.
      </p>
    </div>
  );
}

function TokenErrorView({
  error,
  info,
}: {
  error: TokenError;
  info: InterviewInfo | null;
}) {
  if (error.kind === "notfound") {
    return (
      <div className="card w-full max-w-md text-center">
        <h2 className="mb-2 text-lg font-semibold">Link not found</h2>
        <p className="text-sm text-ink-500">
          We can’t find this interview link — double-check the email you got.
        </p>
      </div>
    );
  }

  if (error.kind === "expired") {
    return (
      <div className="card w-full max-w-md text-center">
        <h2 className="mb-2 text-lg font-semibold">Link expired</h2>
        <p className="text-sm text-ink-500">
          This link has expired. Ask your admin to resend.
        </p>
      </div>
    );
  }

  if (error.kind === "early") {
    const scheduled = info?.scheduled_at ?? error.scheduledAt;
    const pretty = formatScheduled(scheduled);
    return (
      <div className="card w-full max-w-md text-center">
        <h2 className="mb-2 text-lg font-semibold">Not quite yet</h2>
        {pretty ? (
          <p className="mb-1 text-sm text-ink-700">
            Your interview is scheduled for{" "}
            <span className="font-medium text-ink-900">{pretty}</span>.
          </p>
        ) : null}
        <p className="text-sm text-ink-500">
          Come back at that time — this link activates an hour before.
        </p>
      </div>
    );
  }

  return (
    <div className="card w-full max-w-md text-center">
      <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-ink-500">
        We couldn’t load this interview. Please try again in a moment.
      </p>
    </div>
  );
}

function DoneView() {
  return (
    <div className="w-full max-w-md text-center">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-ok-500/10 text-ok-500">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-semibold tracking-tight">Done.</h2>
      <p className="text-sm text-ink-700">
        Thanks — your next check-in is in about 2 weeks.
      </p>
    </div>
  );
}
