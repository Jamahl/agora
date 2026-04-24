import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Agora", description: "Company intelligence from voice interviews" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
