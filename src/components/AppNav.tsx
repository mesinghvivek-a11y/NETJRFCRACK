"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BookOpen, Timer, TrendingUp } from "lucide-react";

const items = [
  { href: "/pyq", label: "PYQs", icon: BookOpen },
  { href: "/test", label: "Tests", icon: Timer },
  { href: "/analysis", label: "My analysis", icon: Activity },
  { href: "/trends", label: "Trends", icon: TrendingUp },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

export function SideNav() {
  const isActive = useActive();
  return (
    <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium ${
            isActive(href) ? "bg-primary-wash text-primary-ink" : "text-muted hover:bg-page hover:text-ink"
          }`}
        >
          <Icon size={19} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium ${isActive(href) ? "text-primary-ink" : "text-muted"}`}
        >
          <Icon size={22} aria-hidden="true" strokeWidth={isActive(href) ? 2.4 : 1.8} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
