"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/actions/auth";
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
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [mode, setMode] = useState<"pin" | "password">("pin");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Packscan</CardTitle>
        <CardDescription>Sign in with your staff account</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "pin" ? "default" : "outline"}
            onClick={() => setMode("pin")}
          >
            PIN
          </Button>
          <Button
            type="button"
            variant={mode === "password" ? "default" : "outline"}
            onClick={() => setMode("password")}
          >
            Password
          </Button>
        </div>

        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="pin">6-digit PIN</Label>
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
              <p className="text-xs text-muted-foreground">
                Scanning only — store and user administration needs a password sign-in.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
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
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
