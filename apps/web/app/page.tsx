"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      try {
        const me = await api<{ has_session: boolean; onboarding_complete: boolean }>("/admin/session/me");
        if (!me.has_session) {
          await api("/admin/session/bootstrap", { method: "POST", body: JSON.stringify({}) });
          router.replace("/onboarding");
          return;
        }
        if (!me.onboarding_complete) router.replace("/onboarding");
        else router.replace("/dashboard");
      } catch {
        await api("/admin/session/bootstrap", { method: "POST", body: JSON.stringify({}) });
        router.replace("/onboarding");
      }
    })();
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-ink-500">Loading Agora…</div>
    </main>
  );
}
