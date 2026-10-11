"use client";

import { RotateCw } from "lucide-react";
import { Button, EmptyState, ProgressBar } from "@/components/ui";
import type { LibraryLoad } from "./data";

/** What shows while writer files are coming in, and when they could not. */
export function LibraryLoading({ load, retry }: { load: LibraryLoad; retry: () => void }) {
  if (load.status === "error") {
    return (
      <EmptyState
        title="Could not load the quotes"
        body={load.message}
        action={
          <Button variant="secondary" icon={<RotateCw size={18} strokeWidth={1.75} aria-hidden />} onClick={retry}>
            Try again
          </Button>
        }
      />
    );
  }
  const of = load.status === "loading" ? load.of : 0;
  const loaded = load.status === "loading" ? load.loaded : 0;
  return (
    <div className="animate-fade-in px-1 pt-24" role="status" aria-live="polite">
      <p className="t-label">Library</p>
      <p className="t-h1 mt-3">{of > 0 ? `Loading ${of} ${of === 1 ? "writer" : "writers"}` : "Loading"}</p>
      <ProgressBar className="mt-5" value={of > 0 ? loaded / of : 0} label="Loading the quotes" />
      {of > 0 ? <p className="t-sub tnum mt-3">{loaded} of {of}</p> : null}
    </div>
  );
}
