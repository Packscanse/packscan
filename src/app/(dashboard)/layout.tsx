import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NavBar } from "@/components/layout/NavBar";
import { MobileNav } from "@/components/layout/MobileNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRequiredSession();
  const store = await prisma.store.findUnique({
    where: { id: session.user.storeId },
    select: { name: true, code: true },
  });

  return (
    <div className="min-h-svh bg-muted/20">
      <NavBar session={session} storeName={store ? `${store.name} (${store.code})` : "Unknown store"} />
      {/* Bottom padding keeps content clear of the mobile tab bar. */}
      <main className="mx-auto max-w-5xl p-4 pb-24 sm:pb-4">{children}</main>
      <MobileNav isAdmin={session.user.role === "ADMIN"} />
    </div>
  );
}
