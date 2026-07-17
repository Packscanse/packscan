/**
 * English is the source dictionary — its shape is the `Messages` type that
 * every other locale must satisfy. Add a key here first, then translate.
 * Only the auth / nav / profile slice is translated so far; the rest of the
 * app follows this same pattern namespace by namespace.
 */
export const en = {
  nav: {
    scan: "Scan",
    packages: "Packages",
    expected: "Expected",
    admin: "Admin",
    profile: "Profile",
    signOut: "Sign out",
  },
  auth: {
    subtitle: "Sign in with your staff account",
    pin: "PIN",
    password: "Password",
    email: "Email",
    pinLabel: "6-digit PIN",
    pinHint: "Scanning only — store and user administration needs a password sign-in.",
    signIn: "Sign in",
    signingIn: "Signing in…",
    invalid: "Invalid credentials.",
  },
  profile: {
    title: "Profile",
    account: "Account",
    name: "Name",
    email: "Email",
    role: "Role",
    store: "Store",
    language: "Language",
    languageHint: "The language of the app for your account.",
    save: "Save",
    saving: "Saving…",
    saved: "Language updated.",
  },
};

// No `as const`: leaf values widen to `string`, so each translation only
// has to match the key shape, not the English text.
export type Messages = typeof en;
