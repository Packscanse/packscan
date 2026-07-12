import Link from "next/link";
import type { Session } from "next-auth";
import { logoutAction } from "@/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function NavBar({
  session,
  storeName,
  storeLogo,
}: {
  session: Session;
  storeName: string;
  storeLogo: string | null;
}) {
  const isAdmin = session.user.role === "ADMIN";
  // Administration needs a password session; hide the entry point for PIN
  // sessions (the server-side guards enforce it regardless).
  const showAdmin = isAdmin && session.user.authMethod === "PASSWORD";

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
            <Link href="/scan">Scan</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/packages">Packages</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/expected">Expected</Link>
          </Button>
          {showAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">Admin</Link>
            </Button>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Badge variant="secondary" className="max-w-32 truncate sm:max-w-none">
            {storeName}
          </Badge>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-sm text-muted-foreground">
              {session.user.name}
            </span>
            <Badge variant={isAdmin ? "default" : "outline"}>
              {session.user.role}
            </Badge>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
