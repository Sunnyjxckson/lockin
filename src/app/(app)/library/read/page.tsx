"use client";

import { Suspense } from "react";
import { Screen } from "@/components/ui";
import { ReaderGate } from "@/features/library/ReaderGate";

// The scope and the quote are in the address: see parseScope in logic/library.
export default function ReadPage() {
  return (
    <Suspense fallback={<Screen aria-busy="true"><span /></Screen>}>
      <ReaderGate />
    </Suspense>
  );
}
