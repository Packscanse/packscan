"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { Delete } from "lucide-react";
import { loginAction } from "@/actions/auth";
import type { Messages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PIN_LENGTH = 6;

/** Shift-start greeting: the copy talks like a colleague, not a system. */
function greetingKey(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return "morning";
  if (hour >= 10 && hour < 17) return "afternoon";
  return "evening";
}

/**
 * Two ways in: the counter PIN (default — fast on a shared handheld, with
 * an on-screen keypad and auto-submit on the 6th digit) or the password.
 * Administration requires a password session, so admins managing
 * stores/users sign in with the password.
 */
export function LoginForm({ t }: { t: Messages["auth"] }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const lastError = useRef<typeof state>(undefined);

  // Correct 6th digit signs in immediately — no submit tap. requestSubmit
  // runs constraint validation, so an empty email still stops it visibly.
  useEffect(() => {
    if (mode === "pin" && pin.length === PIN_LENGTH && !pending) {
      formRef.current?.requestSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // Wrong PIN: shake the dots, clear, stay.
  useEffect(() => {
    if (state?.error && state !== lastError.current) {
      lastError.current = state;
      setPin("");
      setShake(true);
      const timer = window.setTimeout(() => setShake(false), 450);
      return () => window.clearTimeout(timer);
    }
  }, [state]);

  function pressKey(digit: string) {
    setPin((prev) => (prev.length < PIN_LENGTH ? prev + digit : prev));
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl leading-snug font-extrabold tracking-tight">
          {/* Computed from the device clock — the server may render another
              hour, so hydration is allowed to disagree. */}
          <span suppressHydrationWarning className="block">
            {t[greetingKey()]}
          </span>
          Packscan
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary/60 p-1">
          {(["pin", "password"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                "h-11 rounded-full text-sm font-semibold transition-colors",
                mode === option
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              )}
            >
              {option === "pin" ? t.pin : t.password}
            </button>
          ))}
        </div>

        <form ref={formRef} action={formAction} className="grid gap-4">
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
            <div className="grid gap-3">
              <input type="hidden" name="pin" value={pin} />
              {/* The six dots fill in brand as digits arrive. */}
              <div
                aria-hidden
                className={cn(
                  "flex justify-center gap-3 py-1",
                  shake && "animate-[ps-shake_0.45s_ease-in-out]"
                )}
              >
                {Array.from({ length: PIN_LENGTH }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "size-3.5 rounded-full transition-colors",
                      i < pin.length ? "bg-primary" : "bg-secondary"
                    )}
                  />
                ))}
              </div>
              {/* Desktop types; handhelds get the keypad below. */}
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t.pinLabel}
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
                }
                className="hidden text-center text-xl tracking-[0.5em] sm:block"
                aria-label={t.pinLabel}
              />
              <div className="grid grid-cols-3 gap-2 sm:hidden">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => pressKey(digit)}
                    className="h-[58px] rounded-[16px] bg-secondary/60 text-[22px] font-semibold transition-colors active:bg-secondary"
                  >
                    {digit}
                  </button>
                ))}
                <span aria-hidden />
                <button
                  type="button"
                  onClick={() => pressKey("0")}
                  className="h-[58px] rounded-[16px] bg-secondary/60 text-[22px] font-semibold transition-colors active:bg-secondary"
                >
                  0
                </button>
                <button
                  type="button"
                  aria-label="⌫"
                  onClick={() => setPin((prev) => prev.slice(0, -1))}
                  className="grid h-[58px] place-items-center rounded-[16px] bg-secondary/60 transition-colors active:bg-secondary"
                >
                  <Delete className="size-6" />
                </button>
              </div>
              <p className="text-center text-xs text-faint">{t.pinHint}</p>
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
            <p className="text-center text-sm text-destructive" role="alert">
              {t.invalid}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending}
            size="xl"
            className={cn("w-full", mode === "pin" && "sm:h-11 sm:text-sm")}
          >
            {pending ? t.signingIn : t.signIn}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
