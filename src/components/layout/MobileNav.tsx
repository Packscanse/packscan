"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, PackageSearch, ScanLine, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/packages", label: "Packages", icon: PackageSearch },
  { href: "/expected", label: "Expected", icon: Inbox },
] as const;

/**
 * Thumb-reach navigation for handhelds: fixed bottom tab bar, hidden on
 * desktop where the top NavBar carries the same links.
 */
export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin
    ? [...TABS, { href: "/admin", label: "Admin", icon: ShieldCheck } as const]
    : TABS;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
      aria-label="Primary"
    >
      <div className="grid auto-cols-fr grid-flow-col">
        {tabs.map((tab) => {
          const active =
            pathname === tab.href || (tab.href !== "/scan" && pathname.startsWith(tab.href));
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs",
                active ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("size-5", active && "stroke-[2.5]")} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
