import { headers } from "next/headers";
import { getMessages, localeFromAcceptLanguage } from "@/lib/i18n";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage() {
  // No profile yet — pick the language from the browser's Accept-Language.
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  const t = getMessages(locale);

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <LoginForm t={t.auth} />
    </main>
  );
}
