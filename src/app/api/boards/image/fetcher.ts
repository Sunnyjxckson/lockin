// Fetches one image from the web for a mood board. Server only.
//
// The rules are in src/lib/logic/boardsFetch.ts. What this file adds is the
// network: every name is resolved here and the address it resolves to is
// checked at connect time, in the same lookup the socket uses, so a name that
// answers with a public address once and a private one the next time cannot
// get through. Redirects are followed by hand and each hop is checked again.

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import {
  FETCH_TIMEOUT_MS,
  MAX_HTML_BYTES,
  MAX_IMAGE_BYTES,
  MAX_REDIRECTS,
  checkImageUrl,
  imageTypeOf,
  isHtmlType,
  isPrivateAddress,
  pageImage,
  sniffImageType,
  type FetchProblem,
} from "@/lib/logic/boardsFetch";

export interface Resolved {
  address: string;
  family: number;
}

export interface FetchDeps {
  /** Name to addresses. Default: the system resolver. */
  resolve?: (host: string) => Promise<Resolved[]>;
  /** Addresses that must not be reached. Default: isPrivateAddress. */
  isBlocked?: (address: string) => boolean;
  /** Tests only: allow a port other than 80 and 443. */
  anyPort?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
}

export type FetchResult = { ok: true; bytes: Uint8Array; type: string; url: string } | { ok: false; problem: FetchProblem };

class Problem extends Error {
  constructor(readonly problem: FetchProblem) {
    super(problem);
  }
}

const systemResolve = (host: string): Promise<Resolved[]> =>
  new Promise((resolve, reject) => {
    dns.lookup(host, { all: true }, (err, list) => (err ? reject(err) : resolve(list.map((a) => ({ address: a.address, family: a.family })))));
  });

/** The lookup the socket uses. Refuses the whole name when any of its addresses is blocked. */
function guardedLookup(deps: FetchDeps): LookupFunction {
  const resolve = deps.resolve ?? systemResolve;
  const isBlocked = deps.isBlocked ?? isPrivateAddress;
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (list) => {
        if (list.length === 0) return callback(Object.assign(new Error("no address"), { code: "ENOTFOUND" }), "", 0);
        if (list.some((a) => isBlocked(a.address))) return callback(new Problem("private_address") as NodeJS.ErrnoException, "", 0);
        if (typeof options === "object" && options.all) (callback as unknown as (e: null, a: Resolved[]) => void)(null, list);
        else callback(null, list[0].address, list[0].family);
      },
      (e: NodeJS.ErrnoException) => callback(e, "", 0),
    );
  };
}

function get(url: URL, deps: FetchDeps, signal: AbortSignal): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        lookup: guardedLookup(deps),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; LockInBoards/1.0)",
          accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,text/html;q=0.8,*/*;q=0.5",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      resolve,
    );
    req.on("error", reject);
    req.end();
  });
}

/** The body, decoded, up to `max` bytes. Past that it throws too_large, or stops quietly when `truncate` is set. */
async function readBody(res: http.IncomingMessage, max: number, truncate: boolean): Promise<Uint8Array> {
  const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
  const stream =
    encoding === "gzip" || encoding === "x-gzip"
      ? res.pipe(zlib.createGunzip())
      : encoding === "br"
        ? res.pipe(zlib.createBrotliDecompress())
        : encoding === "deflate"
          ? res.pipe(zlib.createInflate())
          : res;
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      const buf = chunk as Buffer;
      if (size + buf.length > max) {
        if (!truncate) throw new Problem("too_large");
        chunks.push(buf.subarray(0, max - size));
        size = max;
        break;
      }
      chunks.push(buf);
      size += buf.length;
    }
  } finally {
    res.destroy();
  }
  return new Uint8Array(Buffer.concat(chunks, size));
}

export async function fetchWebImage(input: unknown, deps: FetchDeps = {}): Promise<FetchResult> {
  const maxBytes = deps.maxBytes ?? MAX_IMAGE_BYTES;
  const isBlocked = deps.isBlocked ?? isPrivateAddress;
  const check = (value: unknown, base?: string): URL => {
    const c = checkImageUrl(value, base, { anyPort: deps.anyPort, isBlocked });
    if (!c.ok) throw new Problem(c.problem);
    return c.url;
  };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    let url = check(input);
    let fromPage = false;
    for (let hop = 0; hop <= MAX_REDIRECTS + 1; hop++) {
      const res = await get(url, deps, abort.signal);
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.destroy();
        url = check(res.headers.location, url.href);
        continue;
      }
      if (status !== 200) {
        res.destroy();
        throw new Problem("not_found");
      }
      const contentType = res.headers["content-type"];
      if (isHtmlType(contentType)) {
        if (fromPage) {
          res.destroy();
          throw new Problem("not_image");
        }
        const html = Buffer.from(await readBody(res, MAX_HTML_BYTES, true)).toString("utf8");
        const image = pageImage(html);
        if (!image) throw new Problem("not_image");
        url = check(image, url.href);
        fromPage = true;
        continue;
      }
      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.destroy();
        throw new Problem("too_large");
      }
      const bytes = await readBody(res, maxBytes, false);
      // The bytes decide. A header that says image over something else is refused, and so is the reverse.
      const type = sniffImageType(bytes);
      if (!type || (imageTypeOf(contentType) === null && !/octet-stream|^$/.test(String(contentType ?? "")))) throw new Problem("not_image");
      return { ok: true, bytes, type, url: url.href };
    }
    throw new Problem("too_many_redirects");
  } catch (e) {
    if (e instanceof Problem) return { ok: false, problem: e.problem };
    const err = e as NodeJS.ErrnoException & { cause?: unknown };
    if (err.cause instanceof Problem) return { ok: false, problem: err.cause.problem };
    if (abort.signal.aborted || err.name === "AbortError") return { ok: false, problem: "timeout" };
    if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") return { ok: false, problem: "not_found" };
    return { ok: false, problem: "failed" };
  } finally {
    clearTimeout(timer);
  }
}
