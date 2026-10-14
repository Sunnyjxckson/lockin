"use client";

import { useState } from "react";
import { Button, Sheet, TextField, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { MAX_BY_CHARS, MAX_QUOTE_CHARS } from "@/lib/logic/lockscreen";
import { pinProblem, pinQuote } from "./pin";

/** Write your own line for the lock screen. It is not saved to the library. */
export function WriteSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const r = await pinQuote({ text, by, quote_id: null });
      if (r.ok) {
        haptics.done();
        onClose();
      } else {
        haptics.error();
        toast(pinProblem(r.reason), { kind: "error" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Write your own"
      footer={
        <Button full size="lg" loading={busy} disabled={!text.trim()} onClick={() => void save()}>
          Put on lock screen
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Your line" value={text} onChange={setText} rows={4} maxLength={MAX_QUOTE_CHARS} placeholder="Pain is inevitable, suffering is optional" autoFocus />
        <TextField label="Who said it" hint="Leave empty for your own words." value={by} onChange={setBy} maxLength={MAX_BY_CHARS} />
      </div>
    </Sheet>
  );
}
