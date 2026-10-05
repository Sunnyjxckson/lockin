"use client";

import { useEffect, useState } from "react";
import { resolvePhoto } from "./index";

/** An object URL for a file picked on this device. Revoked when the file changes or the component goes away. */
export function useObjectUrl(file: Blob | null | undefined): string | null {
  const [state, setState] = useState<{ file: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // The URL has to be made and revoked in step with the effect, so the state is set here on purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return file && state?.file === file ? state.url : null;
}

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
