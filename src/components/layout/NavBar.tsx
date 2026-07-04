import Link from "next/link";
import type { Session } from "next-auth";
import { logoutAction } from "@/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoleGate } from "./RoleGate";

export function NavBar({
  session,
  storeName,
}: {
  session: Session;
  storeName: string;
}) {
  const isAdmin = session.user.role === "ADMIN";

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/scan" className="font-semibold tracking-tight">
          Packscan
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link href="/scan">Scan</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/packages">Packages</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/expected">Expected</Link>
          </Button>
          <RoleGate role="ADMIN">
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">Admin</Link>
            </Button>
          </RoleGate>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <Badge variant="secondary">{storeName}</Badge>
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
