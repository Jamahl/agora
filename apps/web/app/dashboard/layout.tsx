"use client";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatDock } from "@/components/ChatDock";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-50">
      <Sidebar />
      <div className="flex pl-[240px]">
        <main className="min-h-screen flex-1 px-8 py-8">
          {children}
        </main>
        <ChatDock />
      </div>
    </div>
  );
}
