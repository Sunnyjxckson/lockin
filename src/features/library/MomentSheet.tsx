"use client";

import { useRouter } from "next/navigation";
import { Chip, Sheet } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { MOMENTS, momentLabel, readerLink } from "@/lib/logic/library";

/** How is it going: eight moments. One tap opens the reader on quotes for it you have not read. */
export function MomentSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  return (
    <Sheet open onClose={onClose} title="Rough day" subtitle="How is it going? You get quotes for it you have not read yet.">
      <div className="flex flex-wrap gap-2" role="group" aria-label="How it is going">
        {MOMENTS.map((m) => (
          <Chip
            key={m}
            on={false}
            onClick={() => {
              haptics.tap();
              router.push(readerLink({ kind: "moment", moment: m }));
            }}
          >
            {momentLabel(m)}
          </Chip>
        ))}
      </div>
    </Sheet>
  );
}
