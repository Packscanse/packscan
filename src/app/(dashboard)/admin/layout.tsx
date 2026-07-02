import { notFound } from "next/navigation";
import Link from "next/link";
import { getRequiredSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRequiredSession();
  if (session.user.role !== "ADMIN") notFound();

  return (
    <div className="grid gap-4">
      <nav className="flex gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">Overview</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/stores">Stores</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/users">Users</Link>
        </Button>
      </nav>
      {children}
    </div>
  );
}
