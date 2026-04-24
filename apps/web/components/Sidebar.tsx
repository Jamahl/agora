"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/departments", label: "Departments" },
  { href: "/dashboard/okrs", label: "OKRs" },
  { href: "/dashboard/employees", label: "Employees" },
  { href: "/dashboard/themes", label: "Themes" },
  { href: "/dashboard/research", label: "Research" },
  { href: "/dashboard/review", label: "Review" },
  { href: "/dashboard/settings", label: "Settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname() || "/dashboard";
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[240px] flex-col border-r border-surface-200 bg-white">
      <div className="flex h-16 items-center border-b border-surface-200 px-5">
        <Link href="/dashboard" className="block">
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    "block rounded-md px-3 py-2 text-sm font-medium transition-colors " +
                    (active
                      ? "bg-surface-100 text-ink-900"
                      : "text-ink-500 hover:bg-surface-50")
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
