"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MessageSquareText, NotebookText, SlidersHorizontal } from "lucide-react";
import { EmptyState, IconButton, IconLink, Notice, PageHeader, Screen } from "@/components/ui";
import { Composer, Thread } from "@/features/coach/Chat";
import { useChat, useCoachSettings } from "@/features/coach/useChat";
import { isSupabaseMode } from "@/lib/db";
import { useList, useMode } from "@/lib/db/hooks";
import { activeFlagNotes } from "@/lib/logic/coach";
import { VOICE_LABEL } from "@/lib/logic/coachChat";
import { formatDateLong } from "@/lib/logic/dates";

const CoachSettingsSheet = dynamic(() => import("@/features/coach/CoachSettingsSheet").then((m) => m.CoachSettingsSheet), { ssr: false });

const FLAG_NOTES = { eq: { kind: "flag" } } as const;

export default function CoachPage() {
  const chat = useChat();
  const mode = useMode();
  const { voice } = useCoachSettings();
  const flagNotes = useList("coach_note", FLAG_NOTES);
  const flags = activeFlagNotes(flagNotes.data).length;
  const [settings, setSettings] = useState(false);

  const day = mode.challenge && mode.day !== null ? `Day ${mode.day} of ${mode.length}` : formatDateLong(mode.today);
  const header = (
    <PageHeader
      title="Coach"
      back="/today"
      subtitle={`${VOICE_LABEL[voice]} voice · ${day}`}
      right={
        <>
          <IconLink href="/coach/notes" label={flags > 0 ? `Brief, flags and reviews, ${flags} flagged` : "Brief, flags and reviews"} className="relative">
            <NotebookText size={20} strokeWidth={1.75} aria-hidden />
            {flags > 0 ? <span className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-warn" aria-hidden /> : null}
          </IconLink>
          <IconButton label="Voice and check-ins" onClick={() => setSettings(true)}>
            <SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden />
          </IconButton>
        </>
      }
    />
  );

  if (chat.loading || mode.loading) {
    return <Screen aria-busy="true">{header}</Screen>;
  }

  return (
    <Screen>
      {header}

      {chat.missing ? (
        <Notice tone="warn" title="The chat is not set up yet" role="alert">
          {isSupabaseMode() ? "Run supabase/migrations/0014_coach_chat.sql in the Supabase SQL editor, then reload." : "The messages could not be read on this device. Reload to try again."}
        </Notice>
      ) : chat.messages.length === 0 && !chat.thinking ? (
        <EmptyState
          icon={<MessageSquareText size={22} strokeWidth={1.75} aria-hidden />}
          title="Say what is in the way"
          body="Sore, tempted, tired, not feeling it. One idea back, and one thing to do now."
        />
      ) : null}

      {chat.missing ? null : (
        <>
          <Thread messages={chat.messages} thinking={chat.thinking} today={mode.today} />
          <Composer onSend={chat.send} busy={chat.thinking} starters={chat.messages.length < 4} />
        </>
      )}

      {settings ? <CoachSettingsSheet open onClose={() => setSettings(false)} /> : null}
    </Screen>
  );
}
