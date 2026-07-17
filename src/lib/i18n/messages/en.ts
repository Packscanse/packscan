/**
 * English is the source dictionary — its shape is the `Messages` type that
 * every other locale must satisfy. Add a key here first, then translate.
 * Translated so far: auth, nav, profile, and the scan flow (flow / status /
 * scan). The rest of the app follows this same pattern namespace by
 * namespace.
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
  flow: {
    INBOUND_LOG: "Inbound: log only",
    INBOUND_PICKUP: "Inbound: customer pickup",
    OUTBOUND_HANDOFF: "Outbound: carrier handoff",
  },
  flowShort: {
    INBOUND_LOG: "Log",
    INBOUND_PICKUP: "Pickup",
    OUTBOUND_HANDOFF: "Drop-off",
  },
  status: {
    LOGGED: "Logged",
    AWAITING_PICKUP: "Awaiting pickup",
    PICKED_UP: "Picked up",
    PENDING_HANDOFF: "Pending handoff",
    HANDED_OFF: "Handed off",
    RETURN_PENDING: "Return pending",
    RETURNED_TO_CARRIER: "Returned to carrier",
    CANCELLED: "Cancelled",
  },
  scan: {
    title: "Scan",
    rapidIntake: "Rapid intake",
    rapidHint:
      "Announced (pre-advised) parcels register on scan — no confirm tap. Log-only mode also auto-confirms unambiguous labels. Everything else shows the confirm card.",
    batchShelf: "Batch shelf (e.g. A3)",
    scanTitlePrefix: "Scan a package —",
    scannerReady: "Hardware scanner ready — just scan a label. Or:",
    scanWithCamera: "Scan with camera",
    stopCamera: "Stop camera",
    manualPlaceholder: "Enter tracking number manually",
    use: "Use",
    confirmScan: "Confirm scan",
    discard: "Discard",
    saving: "Saving…",
    preAdviceMatched: "Announced by the carrier — details pre-filled from pre-advice.",
    customerName: "Customer name",
    senderName: "Sender name",
    customerPhone: "Phone (SMS notification)",
    senderPhone: "Sender phone",
    customerEmail: "Email (fallback notification)",
    senderEmail: "Sender email",
    notes: "Notes",
    shelfLocation: "Shelf location",
    offlineBanner: "{count} scan(s) saved offline — syncing automatically when the connection returns.",
    syncTitle: "Synced scans that need attention:",
    dismiss: "Dismiss",
    registered: "Registered",
    scanNext: "Scan next",
    viewPackage: "View package",
    printReceipt: "Print drop-off receipt",
    scanAgain: "Scan again",
  },
};

// No `as const`: leaf values widen to `string`, so each translation only
// has to match the key shape, not the English text.
export type Messages = typeof en;
