import { getRequiredSession, hasManagementAccess } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { brandStyle } from "@/lib/branding";
import { getT } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { CounterMode } from "@/components/layout/CounterMode";
import { NavBar } from "@/components/layout/NavBar";
import { MobileNav } from "@/components/layout/MobileNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRequiredSession();
  const t = await getT();
  const store = await prisma.store.findUnique({
    where: { id: session.user.storeId },
    select: { name: true, code: true, brandColor: true, logoData: true },
  });

  return (
    // Chain branding: the store's color becomes the primary color for
    // everything inside — buttons, active pills, shelf blocks, focus rings.
    <I18nProvider messages={t}>
      <div className="min-h-svh bg-background" style={brandStyle(store?.brandColor ?? null)}>
        <CounterMode />
        <NavBar
          session={session}
          storeName={store ? `${store.name} (${store.code})` : "Unknown store"}
          storeLogo={store?.logoData ?? null}
          nav={t.nav}
        />
        {/* Bottom padding keeps content clear of the mobile tab bar. */}
        <main className="mx-auto max-w-5xl p-5 pb-24 sm:py-6">{children}</main>
        <MobileNav isAdmin={hasManagementAccess(session)} userName={session.user.name} />
      </div>
    </I18nProvider>
  );
}
