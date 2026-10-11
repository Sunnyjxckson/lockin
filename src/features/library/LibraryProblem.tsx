"use client";

import { Database, RotateCw } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import type { MarksProblem } from "./state";

/**
 * Shown in place of a Library screen when what you have read cannot be
 * loaded. One plain line: either the migration has not been run yet, or the
 * connection failed. Nothing is counted while it shows, so no reading is lost.
 */
export function LibraryProblem({ problem, retry }: { problem: MarksProblem; retry: () => void }) {
  if (problem === "setup") {
    return (
      <EmptyState
        icon={<Database size={22} strokeWidth={1.75} aria-hidden />}
        title="One step left"
        body="Run supabase/migrations/0015_library.sql in the Supabase SQL editor, then open the Library again."
        action={
          <Button variant="secondary" icon={<RotateCw size={18} strokeWidth={1.75} aria-hidden />} onClick={retry}>
            Check again
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      title="Could not load your reading"
      body="Check the connection and try again."
      action={
        <Button variant="secondary" icon={<RotateCw size={18} strokeWidth={1.75} aria-hidden />} onClick={retry}>
          Try again
        </Button>
      }
    />
  );
}
