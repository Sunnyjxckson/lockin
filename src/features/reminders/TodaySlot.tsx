"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, ChevronRight } from "lucide-react";
import { readDevice } from "./client";
import { LocalScheduler } from "./LocalScheduler";

/**
 * For Today. Runs the while-open reminder scheduler, and shows one quiet row
 * asking to turn notifications on until the user has answered the browser's
 * permission prompt either way. Renders nothing visible after that.
 */
export default function RemindersTodaySlot() {
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    const d = readDevice();
    // On an iPhone in a browser tab the row still shows: it leads to the install steps.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAsk(d.needsInstall || (d.supported && d.permission === "default"));
  }, []);

  return (
    <>
      <LocalScheduler />
      {ask ? (
        <Link
          href="/reminders"
          className="pressable mt-4 flex min-h-[56px] items-center gap-3 rounded-[20px] border border-line bg-surface px-4 active:bg-surface-2"
        >
          <BellRing size={20} className="shrink-0 text-ink-2" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium text-ink">Turn on reminders</span>
            <span className="block truncate text-[13px] text-ink-3">Wake, workout, delivery, check-in</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
        </Link>
      ) : null}
    </>
  );
}

export { LocalScheduler };
