"use client";

import { useId, type ReactNode } from "react";

/**
 * A hidden file input plus whatever opens it. On a phone the system sheet
 * offers both the photo library and the camera.
 */
export function ScreenshotPicker({ onFile, children }: { onFile: (file: File) => void; children: (pick: () => void) => ReactNode }) {
  const id = useId();
  return (
    <>
      <input
        id={id}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        data-testid="screenshot-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      {children(() => document.getElementById(id)?.click())}
    </>
  );
}
