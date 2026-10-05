"use client";

import { useEffect, useState } from "react";
import { resolvePhoto } from "./index";

/** A displayable URL for a stored photo reference. Null until it resolves. */
export function usePhoto(ref: string | null | undefined): string | null {
  const [state, setState] = useState<{ ref: string | null; url: string | null }>({ ref: null, url: null });
  useEffect(() => {
    let live = true;
    resolvePhoto(ref).then(
      (url) => live && setState({ ref: ref ?? null, url }),
      () => live && setState({ ref: ref ?? null, url: null }),
    );
    return () => {
      live = false;
    };
  }, [ref]);
  return state.ref === (ref ?? null) ? state.url : null;
}
