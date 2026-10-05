"use client";

// Placeholder. The boards agent fills this in: mood boards (feature 14) and
// turning a board's palette into the app's theme (feature 15). The data and
// theme API are ready: tables board, board_item, theme, mood_log, motivation,
// and setThemeFromPalette / previewTheme / resetTheme / useTheme from "@/lib/theme".

import { Images } from "lucide-react";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function BoardsPage() {
  return (
    <Screen>
      <PageHeader title="Boards" back="/today" />
      <EmptyState
        icon={<Images size={24} aria-hidden />}
        title="No boards yet"
        body="Boards are coming: images, colors and references for the world you are locking in toward, and a palette that becomes the look of the app."
      />
    </Screen>
  );
}
