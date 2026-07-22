import Link from "next/link";
import { LogOut } from "lucide-react";
import type { Session } from "next-auth";
import { logoutAction } from "@/actions/auth";
import { hasManagementAccess } from "@/lib/session";
import type { Messages } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { NavPills } from "./NavPills";

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((part) => part[0]!.toUpperCase()).join("");
}

export function NavBar({
  session,
  storeName,
  storeLogo,
  nav,
}: {
  session: Session;
  storeName: string;
  storeLogo: string | null;
  nav: Messages["nav"];
}) {
  // Administration (admins chain-wide, managers their own store) needs a
  // password session; hide the entry point for PIN sessions (the
  // server-side guards enforce it regardless).
  const showAdmin = hasManagementAccess(session);
  const items = [
    { href: "/scan", label: nav.scan },
    { href: "/packages", label: nav.packages },
    { href: "/expected", label: nav.expected },
    ...(showAdmin ? [{ href: "/admin", label: nav.admin }] : []),
  ];

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-15 max-w-5xl items-center gap-4 px-5">
        {/* Chain branding: the store's own logo fronts the app. */}
        <Link href="/scan" className="flex shrink-0 items-center gap-2">
          {storeLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={storeLogo} alt={storeName} className="h-8 w-auto max-w-36 object-contain" />
          ) : (
            <span className="text-[17px] font-extrabold tracking-tight">Packscan</span>
          )}
        </Link>
        {/* Desktop pill nav; handhelds use the bottom tab bar instead. */}
        <NavPills items={items} />
        <div className="ml-auto flex items-center gap-3">
          <span className="max-w-32 truncate text-xs text-muted-foreground sm:max-w-48 sm:text-[13px]">
            {storeName}
          </span>
          {/* Who's signed in, as a brand avatar — role stays visible on the
              profile page rather than as a badge in the bar. */}
          <Link
            href="/profile"
            title={`${session.user.name ?? ""} · ${session.user.role}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          >
            {initials(session.user.name ?? "")}
          </Link>
          <form action={logoutAction}>
            {/* Icon-only on handhelds — the text button doesn't fit next to
                logo + store + avatar on 375px. */}
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="text-muted-foreground sm:hidden"
              aria-label={nav.signOut}
              title={nav.signOut}
            >
              <LogOut />
            </Button>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="hidden text-muted-foreground sm:inline-flex"
            >
              {nav.signOut}
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
