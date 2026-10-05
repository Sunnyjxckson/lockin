import { describe, expect, it } from "vitest";
import { checkImageUrl, imageTypeOf, isHtmlType, isPrivateAddress, pageImage, parseIPv6, sniffImageType } from "./boardsFetch";

describe("isPrivateAddress", () => {
  it("blocks loopback, private, link local and reserved IPv4", () => {
    for (const a of ["127.0.0.1", "127.9.9.9", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1"])
      expect(isPrivateAddress(a), a).toBe(true);
  });
  it("allows public IPv4", () => {
    for (const a of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "151.101.1.140", "100.63.0.1", "192.169.0.1"]) expect(isPrivateAddress(a), a).toBe(false);
  });
  it("blocks the IPv6 forms of the same", () => {
    for (const a of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2002:7f00:1::", "2001:db8::1", "[::1]", "fe80::1%eth0", "::127.0.0.1"])
      expect(isPrivateAddress(a), a).toBe(true);
  });
  it("allows public IPv6, and mapped public IPv4", () => {
    for (const a of ["2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "::ffff:8.8.8.8"]) expect(isPrivateAddress(a), a).toBe(false);
  });
  it("refuses anything that is not an address", () => {
    for (const a of ["", "example.com", "1.2.3", "999.1.1.1", "gggg::1", "1::2::3"]) expect(isPrivateAddress(a), a).toBe(true);
  });
  it("parses IPv6 groups", () => {
    expect(parseIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseIPv6("1:2:3:4:5:6:7")).toBeNull();
  });
});

describe("checkImageUrl", () => {
  const problem = (u: unknown) => {
    const c = checkImageUrl(u);
    return c.ok ? null : c.problem;
  };
  it("accepts ordinary image links", () => {
    expect(problem("https://images.example.com/a/b.jpg?w=1200")).toBeNull();
    expect(problem("http://example.com:80/x.png")).toBeNull();
    expect(problem("https://93.184.216.34/x.png")).toBeNull();
  });
  it("refuses other schemes", () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com/a.jpg", "data:image/png;base64,AAAA", "javascript:alert(1)", "gopher://example.com"]) expect(problem(u), u).toBe("bad_scheme");
  });
  it("refuses what is not a URL", () => {
    for (const u of ["", "   ", "not a url", null, 42, undefined, `https://example.com/${"a".repeat(3000)}`]) expect(problem(u)).toBe("bad_url");
  });
  it("refuses credentials and odd ports", () => {
    expect(problem("https://user:pass@example.com/a.jpg")).toBe("has_credentials");
    expect(problem("https://example.com:8443/a.jpg")).toBe("bad_port");
    expect(problem("http://example.com:22/")).toBe("bad_port");
  });
  it("refuses this machine and private networks, however they are spelled", () => {
    for (const u of [
      "http://localhost/a.png",
      "http://LOCALHOST./a.png",
      "http://foo.localhost/a.png",
      "http://127.0.0.1/a.png",
      "http://127.1/a.png",
      "http://2130706433/a.png",
      "http://0x7f000001/a.png",
      "http://017700000001/a.png",
      "http://[::1]/a.png",
      "http://[::ffff:127.0.0.1]/a.png",
      "http://10.0.0.5/a.png",
      "http://192.168.0.1/a.png",
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://printer.local/a.png",
      "http://intranet/a.png",
      "http://0.0.0.0/a.png",
    ])
      expect(problem(u), u).toBe("private_address");
  });
  it("resolves a relative link against the page it came from, and checks the result", () => {
    const c = checkImageUrl("/img/og.jpg", "https://shop.example.com/p/1");
    expect(c.ok && c.url.href).toBe("https://shop.example.com/img/og.jpg");
    expect(checkImageUrl("//127.0.0.1/x.png", "https://shop.example.com/").ok).toBe(false);
  });
});

describe("content types", () => {
  it("accepts raster images only", () => {
    expect(imageTypeOf("image/jpeg")).toBe("image/jpeg");
    expect(imageTypeOf("IMAGE/PNG; charset=binary")).toBe("image/png");
    expect(imageTypeOf("image/jpg")).toBe("image/jpeg");
    expect(imageTypeOf("image/svg+xml")).toBeNull();
    expect(imageTypeOf("text/html")).toBeNull();
    expect(imageTypeOf(null)).toBeNull();
    expect(isHtmlType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlType("image/png")).toBe(false);
  });
  it("reads the type from the first bytes", () => {
    const bytes = (...b: number[]) => new Uint8Array(b);
    const text = (s: string) => new TextEncoder().encode(s);
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe("image/png");
    expect(sniffImageType(text("GIF89a"))).toBe("image/gif");
    expect(sniffImageType(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(text("\0\0\0 ftypavif"))).toBe("image/avif");
    expect(sniffImageType(text("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(sniffImageType(text("<!doctype html>"))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
  });
});

describe("pageImage", () => {
  it("finds the page's share image", () => {
    expect(pageImage(`<head><meta property="og:image" content="https://cdn.example.com/a.jpg?x=1&amp;y=2"></head>`)).toBe("https://cdn.example.com/a.jpg?x=1&y=2");
    expect(pageImage(`<meta content='/img/b.png' name='twitter:image' />`)).toBe("/img/b.png");
    expect(pageImage(`<meta name="twitter:image" content="t.jpg"><meta property="og:image" content="o.jpg">`)).toBe("o.jpg");
  });
  it("returns null when the page names none", () => {
    expect(pageImage("<html><head><title>x</title></head></html>")).toBeNull();
    expect(pageImage(`<meta property="og:image" content="">`)).toBeNull();
  });
});
