"use client";

// Works out what the reader should open on: the scope in the address, the
// writer of a quote linked on its own, or where it was last left. Then loads
// the writers that scope needs and hands over to the reader.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ButtonLink, Screen } from "@/components/ui";
import { useSettings } from "@/lib/db/hooks";
import { parseScope, readerLink, scopeFromQuery, type Scope } from "@/lib/logic/library";
import { newSeed } from "@/lib/logic/libraryQueue";
import { ALL_WRITERS, findQuote, useLibraryData } from "./data";
import { LibraryLoading } from "./LibraryLoading";
import { Reader } from "./Reader";
import { LibraryProblem } from "./LibraryProblem";
import { useMarks } from "./state";

type Target = { status: "loading" } | { status: "missing" } | { status: "ok"; scope: Scope; startAt: string | null };

export function ReaderGate() {
  const params = useSearchParams();
  const router = useRouter();
  const settings = useSettings();
  const { marks, ready, problem, retry } = useMarks();
  const scopeParam = useMemo(() => parseScope(params), [params]);
  const q = params.get("q");
  const scopeKey = params.toString();
  const [resolved, setResolved] = useState<{ key: string; scope: Scope | null; missing: boolean } | null>(null);

  // A quote linked without a scope goes on through its own writer.
  useEffect(() => {
    if (scopeParam || !q) return;
    let live = true;
    void findQuote(q, params.get("w")).then((hit) => live && setResolved({ key: scopeKey, scope: hit ? { kind: "writer", writer: hit.writer } : null, missing: !hit }));
    return () => {
      live = false;
    };
  }, [scopeParam, q, params, scopeKey]);

  // No scope and no quote: pick up where it was left, or shuffle.
  const position = settings.data?.library_position ?? null;
  useEffect(() => {
    if (scopeParam || q || settings.loading) return;
    const last = position ? scopeFromQuery(position.scope) : null;
    router.replace(readerLink(last ?? { kind: "shuffle", seed: position?.seed ?? newSeed() }));
  }, [scopeParam, q, settings.loading, position, router]);

  const target: Target = scopeParam
    ? { status: "ok", scope: scopeParam, startAt: q }
    : q
      ? resolved?.key === scopeKey
        ? resolved.scope
          ? { status: "ok", scope: resolved.scope, startAt: q }
          : { status: "missing" }
        : { status: "loading" }
      : { status: "loading" };

  const scope = target.status === "ok" ? target.scope : null;
  // The collection is read from the writers it holds when the reader opens, and not changed while you are in it.
  const [savedNeed, setSavedNeed] = useState<string[] | null>(null);
  if (scope?.kind === "saved" && ready && savedNeed === null) {
    setSavedNeed(Array.from(new Set(Array.from(marks.values()).filter((m) => m.saved_at).map((m) => m.writer))).filter((w) => ALL_WRITERS.includes(w)));
  }
  const need: string[] | "all" | null = !scope ? null : scope.kind === "writer" ? [scope.writer] : scope.kind === "saved" ? savedNeed : "all";
  const load = useLibraryData(need);

  if (problem) {
    return (
      <Screen>
        <LibraryProblem problem={problem} retry={retry} />
      </Screen>
    );
  }
  if (target.status === "missing") {
    return (
      <Screen>
        <EmptyState title="That quote is not here" body="The link may be old." action={<ButtonLink href="/library" variant="secondary">Back to the library</ButtonLink>} />
      </Screen>
    );
  }
  if (target.status !== "ok" || load.status !== "ready" || !ready || settings.loading) {
    return (
      <Screen>
        <LibraryLoading load={load.status === "idle" ? { status: "loading", loaded: 0, of: 0 } : load} retry={load.retry} />
      </Screen>
    );
  }
  return <Reader key={`${scopeKey}`} scope={target.scope} startAt={target.startAt} library={load.library} marks={marks} position={position} />;
}
