"use client";

import { createContext, useContext } from "react";
import type { Messages } from "@/lib/i18n";

const I18nContext = createContext<Messages | null>(null);

/** Makes the resolved dictionary available to client components under it. */
export function I18nProvider({
  messages,
  children,
}: {
  messages: Messages;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={messages}>{children}</I18nContext.Provider>;
}

/** Client-side translations. `const t = useT(); t.nav.scan`. */
export function useT(): Messages {
  const messages = useContext(I18nContext);
  if (!messages) throw new Error("useT must be used within an I18nProvider");
  return messages;
}
