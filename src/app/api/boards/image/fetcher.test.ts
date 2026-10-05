import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchWebImage, type FetchDeps } from "./fetcher";

// A real server on this machine, reached through a made up public name. The
// default rules would refuse it, which is the point of the last tests.

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
let server: http.Server;
let port = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const path = req.url ?? "/";
    if (path === "/a.png") return void res.writeHead(200, { "content-type": "image/png" }).end(PNG);
    if (path === "/loop") return void res.writeHead(302, { location: "/loop" }).end();
    if (path === "/hop") return void res.writeHead(301, { location: "/a.png" }).end();
    if (path === "/to-private") return void res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
    if (path === "/page") return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<html><head><meta property="og:image" content="/a.png"></head></html>`);
    if (path === "/page-none") return void res.writeHead(200, { "content-type": "text/html" }).end("<html></html>");
    if (path === "/page-private") return void res.writeHead(200, { "content-type": "text/html" }).end(`<meta property="og:image" content="http://10.0.0.1/a.png">`);
    if (path === "/liar.png") return void res.writeHead(200, { "content-type": "image/png" }).end("<script>alert(1)</script>");
    if (path === "/svg") return void res.writeHead(200, { "content-type": "image/svg+xml" }).end("<svg/>");
    if (path === "/big") return void res.writeHead(200, { "content-type": "image/png", "content-length": "99999999" }).end(PNG);
    if (path === "/big-stream") {
      res.writeHead(200, { "content-type": "image/png" });
      res.write(PNG);
      return void res.end(Buffer.alloc(5000, 1));
    }
    if (path === "/slow") return; // never answers
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const open: FetchDeps = { anyPort: true, isBlocked: () => false, resolve: async () => [{ address: "127.0.0.1", family: 4 }] };
const at = (path: string) => `http://pictures.example.com:${port}${path}`;
const problemOf = async (path: string, deps: FetchDeps = open) => {
  const r = await fetchWebImage(at(path), deps);
  return r.ok ? null : r.problem;
};

describe("fetchWebImage", () => {
  it("returns the image and its real type", async () => {
    const r = await fetchWebImage(at("/a.png"), open);
    expect(r.ok && r.type).toBe("image/png");
    expect(r.ok && Array.from(r.bytes)).toEqual(Array.from(PNG));
  });

  it("follows a redirect, and stops a loop", async () => {
    expect((await fetchWebImage(at("/hop"), open)).ok).toBe(true);
    expect(await problemOf("/loop")).toBe("too_many_redirects");
  });

  it("uses a page's share image", async () => {
    const r = await fetchWebImage(at("/page"), open);
    expect(r.ok && r.url).toBe(at("/a.png"));
    expect(await problemOf("/page-none")).toBe("not_image");
  });

  it("refuses what is not a raster image, whatever the header says", async () => {
    expect(await problemOf("/liar.png")).toBe("not_image");
    expect(await problemOf("/svg")).toBe("not_image");
    expect(await problemOf("/missing")).toBe("not_found");
  });

  it("holds the size cap, declared or not", async () => {
    expect(await problemOf("/big", { ...open, maxBytes: 1000 })).toBe("too_large");
    expect(await problemOf("/big-stream", { ...open, maxBytes: 1000 })).toBe("too_large");
  });

  it("gives up on a site that does not answer", async () => {
    expect(await problemOf("/slow", { ...open, timeoutMs: 150 })).toBe("timeout");
  });

  it("refuses a redirect or a share image that points at a private address", async () => {
    const realRules: FetchDeps = { anyPort: true, resolve: open.resolve, isBlocked: (a) => a !== "127.0.0.1" && a.startsWith("1") };
    expect(await problemOf("/to-private", realRules)).toBe("private_address");
    expect(await problemOf("/page-private", realRules)).toBe("private_address");
  });

  it("refuses a public name that resolves to this machine", async () => {
    const r = await fetchWebImage(at("/a.png"), { anyPort: true, resolve: open.resolve });
    expect(r).toEqual({ ok: false, problem: "private_address" });
  });

  it("refuses the whole name when any one of its addresses is private", async () => {
    const r = await fetchWebImage(at("/a.png"), {
      anyPort: true,
      resolve: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.7", family: 4 },
      ],
    });
    expect(r).toEqual({ ok: false, problem: "private_address" });
  });

  it("refuses bad links before any network call", async () => {
    expect(await fetchWebImage("file:///etc/passwd")).toEqual({ ok: false, problem: "bad_scheme" });
    expect(await fetchWebImage("http://localhost:3000/")).toEqual({ ok: false, problem: "bad_port" });
    expect(await fetchWebImage("http://127.0.0.1/")).toEqual({ ok: false, problem: "private_address" });
  });
});
