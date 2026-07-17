import { getRequiredSession, hasManagementAccess } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { brandStyle } from "@/lib/branding";
import { getT } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/i18n/I18nProvider";
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
    // everything inside — buttons, active tabs, focus rings.
    <I18nProvider messages={t}>
      <div className="min-h-svh bg-muted/20" style={brandStyle(store?.brandColor ?? null)}>
        <NavBar
          session={session}
          storeName={store ? `${store.name} (${store.code})` : "Unknown store"}
          storeLogo={store?.logoData ?? null}
          nav={t.nav}
        />
        {/* Bottom padding keeps content clear of the mobile tab bar. */}
        <main className="mx-auto max-w-5xl p-4 pb-24 sm:pb-4">{children}</main>
        <MobileNav isAdmin={hasManagementAccess(session)} />
      </div>
    </I18nProvider>
  );
}
