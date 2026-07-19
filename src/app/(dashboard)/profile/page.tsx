import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getT, getUserLocale } from "@/lib/i18n/server";
import { LanguageForm } from "@/components/profile/LanguageForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProfilePage() {
  const session = await getRequiredSession();
  const [t, locale] = await Promise.all([getT(), getUserLocale()]);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { store: { select: { name: true, code: true } } },
  });

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">{t.profile.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.profile.account}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">{t.profile.name}: </span>
            {session.user.name}
          </p>
          <p>
            <span className="text-muted-foreground">{t.profile.email}: </span>
            {user?.email}
          </p>
          <p>
            <span className="text-muted-foreground">{t.profile.role}: </span>
            {session.user.role}
          </p>
          <p>
            <span className="text-muted-foreground">{t.profile.store}: </span>
            {user ? `${user.store.name} (${user.store.code})` : "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.profile.language}</CardTitle>
        </CardHeader>
        <CardContent>
          <LanguageForm current={locale} />
        </CardContent>
      </Card>
    </div>
  );
}
