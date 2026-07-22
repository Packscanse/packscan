import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LOCALE_TAGS } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Packscan",
  description: "Unified parcel scanning for multi-carrier pickup points",
  // Add-to-home-screen runs full-screen like a native counter app.
  appleWebApp: { capable: true, title: "Packscan", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Content may extend under the iPhone home indicator; the bottom nav
  // pads itself with safe-area insets.
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The signed-in user's language drives the document lang; without a
  // session this resolves to the default (English).
  const lang = LOCALE_TAGS[await getUserLocale()];

  return (
    // Font variables live on <html>: the base layer applies font-sans there,
    // and a variable defined further down (body) would never reach it.
    // suppressHydrationWarning: CounterMode flips the `dark` class on <html>
    // before hydration on handhelds (counter mode).
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
