import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ToastProvider } from "@/components/ui";
import { ServiceWorker } from "@/components/app/ServiceWorker";
import { ThemeBoot } from "@/components/app/ThemeBoot";
import { BASE_THEMES, THEME_BOOT_SCRIPT } from "@/lib/logic/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lock In",
  description: "Stay consistent. One checklist, every day.",
  applicationName: "Lock In",
  appleWebApp: { capable: true, title: "Lock In", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  // The dark minimal base. The boot script below swaps it for the saved theme's background.
  themeColor: BASE_THEMES.dark.tokens.bg,
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets the theme's variables on this element before React
    // hydrates, so the attributes differ from what the server sent on purpose.
    <html lang="en" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Runs while the HTML is parsed, before first paint: no flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeBoot />
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
