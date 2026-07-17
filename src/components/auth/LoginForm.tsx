"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/actions/auth";
import type { Messages } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Two ways in: the counter PIN (default — fast on a shared handheld) or
 * the password. Administration requires a password session, so admins
 * managing stores/users sign in with the password.
 */
export function LoginForm({ t }: { t: Messages["auth"] }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [mode, setMode] = useState<"pin" | "password">("pin");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Packscan</CardTitle>
        <CardDescription>{t.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "pin" ? "default" : "outline"}
            onClick={() => setMode("pin")}
          >
            {t.pin}
          </Button>
          <Button
            type="button"
            variant={mode === "password" ? "default" : "outline"}
            onClick={() => setMode("password")}
          >
            {t.password}
          </Button>
        </div>

        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{t.email}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@store.example"
              required
            />
          </div>
          {mode === "pin" ? (
            <div className="grid gap-2">
              <Label htmlFor="pin">{t.pinLabel}</Label>
              <Input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                minLength={6}
                maxLength={6}
                autoComplete="off"
                placeholder="••••••"
                className="text-center text-xl tracking-[0.5em]"
                required
              />
              <p className="text-xs text-muted-foreground">{t.pinHint}</p>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="password">{t.password}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
          )}
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {t.invalid}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t.signingIn : t.signIn}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
