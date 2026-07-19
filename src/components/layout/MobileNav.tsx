"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, PackageSearch, ScanLine, ShieldCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/I18nProvider";

/**
 * Thumb-reach navigation for handhelds: fixed bottom tab bar, hidden on
 * desktop where the top NavBar carries the same links.
 */
export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const tabs = [
    { href: "/scan", label: t.nav.scan, icon: ScanLine },
    { href: "/packages", label: t.nav.packages, icon: PackageSearch },
    { href: "/expected", label: t.nav.expected, icon: Inbox },
    ...(isAdmin ? [{ href: "/admin", label: t.nav.admin, icon: ShieldCheck }] : []),
    { href: "/profile", label: t.nav.profile, icon: User },
  ];

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
                active ? "font-semibold text-primary" : "text-muted-foreground"
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
