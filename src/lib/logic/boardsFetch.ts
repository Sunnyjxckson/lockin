// Rules for fetching an image from the web on the user's behalf. Pure: no
// network here. The route in src/app/api/boards/image applies them.
//
// The server will fetch whatever URL it is handed, so the rules are strict:
// http or https only, no credentials in the URL, standard ports, never an
// address on this machine or a private network, a real raster image type, and
// a size cap.

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_HTML_BYTES = 600 * 1024;
export const MAX_REDIRECTS = 4;
export const FETCH_TIMEOUT_MS = 12_000;

/** Raster types a canvas can decode. SVG is left out on purpose: it can carry script. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const;

export type FetchProblem =
  | "bad_url"
  | "bad_scheme"
  | "has_credentials"
  | "bad_port"
  | "private_address"
  | "not_found"
  | "not_image"
  | "too_large"
  | "too_many_redirects"
  | "timeout"
  | "failed";

export const FETCH_MESSAGE: Record<FetchProblem, string> = {
  bad_url: "That does not look like a link.",
  bad_scheme: "Only http and https links work.",
  has_credentials: "Links with a username or password in them are not fetched.",
  bad_port: "That link uses a port this app does not fetch from.",
  private_address: "That address is on a private network, so it is not fetched.",
  not_found: "Nothing came back from that link.",
  not_image: "That link is not an image, and the page does not name one.",
  too_large: "That image is too large. The limit is 12 MB.",
  too_many_redirects: "That link redirects too many times.",
  timeout: "That site took too long to answer.",
  failed: "Could not fetch that image.",
};

export function parseIPv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts as [number, number, number, number];
}

function privateV4(p: readonly number[]): boolean {
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true; // this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier grade NAT
  if (a === 169 && b === 254) return true; // link local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true; // protocol assignments and documentation
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** The 16 bit groups of an IPv6 address, or null. Handles "::" and a dotted IPv4 tail. */
export function parseIPv6(input: string): number[] | null {
  let host = input.replace(/^\[|\]$/g, "");
  const zone = host.indexOf("%");
  if (zone >= 0) host = host.slice(0, zone);
  if (!host.includes(":")) return null;
  const tail = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (tail) {
    const v4 = parseIPv4(tail[2]);
    if (!v4) return null;
    host = `${tail[1]}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const read = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const g of s.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = read(halves[0]);
  const rest = halves.length === 2 ? read(halves[1]) : [];
  if (!head || !rest) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - rest.length;
  if (fill < 1) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...rest];
}

/**
 * True for any address the server must not fetch from: loopback, private,
 * link local, carrier NAT, multicast, reserved, and the IPv6 forms of the
 * same (including IPv4 mapped and NAT64 addresses). Anything that is not a
 * valid IP address is also refused, so a caller cannot slip a name through.
 */
export function isPrivateAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return privateV4(v4);
  const g = parseIPv6(address);
  if (!g) return true;
  const embedded = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
  if (g.slice(0, 6).every((x) => x === 0)) return true; // ::, ::1 and the old IPv4 compatible form
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return privateV4(embedded); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateV4(embedded); // NAT64
  if (g[0] === 0x2002) return privateV4([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255]); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  return false;
}

const BLOCKED_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/i;

export type UrlCheck = { ok: true; url: URL } | { ok: false; problem: FetchProblem };

/** Check a URL before any network call. A host given as an IP address is checked here, a name is checked again when it resolves. */
export function checkImageUrl(
  input: unknown,
  base?: string,
  options: { anyPort?: boolean; isBlocked?: (address: string) => boolean } = {},
): UrlCheck {
  const blocked = options.isBlocked ?? isPrivateAddress;
  if (typeof input !== "string" || input.trim() === "" || input.length > 2048) return { ok: false, problem: "bad_url" };
  let url: URL;
  try {
    url = base ? new URL(input.trim(), base) : new URL(input.trim());
  } catch {
    return { ok: false, problem: "bad_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, problem: "bad_scheme" };
  if (url.username || url.password) return { ok: false, problem: "has_credentials" };
  if (!options.anyPort && url.port && url.port !== "80" && url.port !== "443") return { ok: false, problem: "bad_port" };
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return { ok: false, problem: "bad_url" };
  const literal = parseIPv4(host) !== null || host.includes(":");
  if (literal) {
    if (blocked(host)) return { ok: false, problem: "private_address" };
  } else {
    if (BLOCKED_NAMES.test(host) || !host.includes(".")) return { ok: false, problem: "private_address" };
    // All digits and dots but not a valid dotted quad (for example a decimal or octal IP). Refuse rather than guess.
    if (/^[0-9.]+$/.test(host) || /^0x/i.test(host)) return { ok: false, problem: "private_address" };
  }
  return { ok: true, url };
}

/** The allowed image type in a Content-Type header, or null. */
export function imageTypeOf(contentType: string | null | undefined): string | null {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const fixed = type === "image/jpg" ? "image/jpeg" : type;
  return (IMAGE_TYPES as readonly string[]).includes(fixed) ? fixed : null;
}

/** The image type from the first bytes of a file, or null. The header is not trusted on its own. */
export function sniffImageType(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i] ?? -1;
  const ascii = (from: number, text: string) => [...text].every((ch, i) => at(from + i) === ch.charCodeAt(0));
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && ascii(1, "PNG")) return "image/png";
  if (ascii(0, "GIF8")) return "image/gif";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis"))) return "image/avif";
  return null;
}

export function isHtmlType(contentType: string | null | undefined): boolean {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return type === "text/html" || type === "application/xhtml+xml";
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * The picture a web page offers for itself (og:image, then twitter:image),
 * so a link to a page, for example a product or a pin, still gives an image.
 */
export function pageImage(html: string): string | null {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const found = new Map<string, string>();
  for (const tag of metas) {
    const attr = (name: string) => {
      const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
      return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
    };
    const key = (attr("property") ?? attr("name") ?? "").toLowerCase();
    const content = attr("content");
    if (key && content && !found.has(key)) found.set(key, decodeEntities(content.trim()));
  }
  for (const key of ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
    const v = found.get(key);
    if (v) return v;
  }
  return null;
}
