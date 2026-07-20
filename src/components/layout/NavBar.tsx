import Link from "next/link";
import type { Session } from "next-auth";
import { logoutAction } from "@/actions/auth";
import { hasManagementAccess } from "@/lib/session";
import type { Messages } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const isAdmin = session.user.role === "ADMIN";
  // Administration (admins chain-wide, managers their own store) needs a
  // password session; hide the entry point for PIN sessions (the
  // server-side guards enforce it regardless).
  const showAdmin = hasManagementAccess(session);

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        {/* Chain branding: the store's own logo fronts the app. */}
        <Link href="/scan" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          {storeLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={storeLogo} alt={storeName} className="h-8 w-auto max-w-36 object-contain" />
          ) : (
            "Packscan"
          )}
        </Link>
        {/* Desktop nav; handhelds use the bottom tab bar instead. */}
        <nav className="hidden items-center gap-1 text-sm sm:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/scan">{nav.scan}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/packages">{nav.packages}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/expected">{nav.expected}</Link>
          </Button>
          {showAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">{nav.admin}</Link>
            </Button>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Badge variant="secondary" className="max-w-32 truncate sm:max-w-none">
            {storeName}
          </Badge>
          <div className="hidden items-center gap-2 sm:flex">
            <Button asChild variant="ghost" size="sm">
              <Link href="/profile">{session.user.name}</Link>
            </Button>
            {/* Role is metadata, not an alert: keep it out of the brand/danger
                palette so red stays reserved for things that need attention. */}
            <Badge variant={isAdmin ? "secondary" : "outline"}>
              {session.user.role}
            </Badge>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              {nav.signOut}
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
