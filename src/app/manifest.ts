import type { MetadataRoute } from "next";
import { BASE_THEMES } from "@/lib/logic/theme";

// The manifest is static, so it carries the dark minimal base. A custom theme
// colors the page itself, not the splash screen.
const BG = BASE_THEMES.dark.tokens.bg;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lock In",
    short_name: "Lock In",
    description: "Stay consistent. One checklist, every day.",
    id: "/",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BG,
    theme_color: BG,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today", url: "/today" },
      { name: "Money", url: "/money" },
    ],
  };
}
