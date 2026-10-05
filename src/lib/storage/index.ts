// Photo storage. Same split as the data layer.
// - NEXT_PUBLIC_SUPABASE_URL unset: the photo is kept as a data URL in
//   IndexedDB on this device, and the stored reference is "idb:<id>".
// - Set: the photo goes to Supabase Storage through /api/storage and the
//   stored reference is its public URL.
//
// Save the reference returned by uploadPhoto() in a *_url column, and turn it
// back into something an <img> can show with resolvePhoto() or usePhoto().

import { isSupabaseMode } from "../db";

const IDB_PREFIX = "idb:";
const DB_NAME = "lockin-photos";
const STORE = "photos";

export interface UploadOptions {
  /** Folder in the bucket: "meals", "body", "earnings". */
  folder?: string;
  /** Longest side in pixels after downscaling. Default 1600. 0 keeps the original. */
  maxSize?: number;
  /** JPEG quality 0 to 1. Default 0.82. */
  quality?: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open photo storage"));
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("Photo storage failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Photo storage failed"));
    });
  } finally {
    database.close();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the photo"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Downscale an image so its longest side is at most `maxSize`, as a JPEG.
 * Returns the original when it cannot be decoded or is already small.
 */
export async function resizeImage(file: Blob, maxSize = 1600, quality = 0.82): Promise<Blob> {
  if (maxSize <= 0 || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 600_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return out ?? file;
  } catch {
    return file;
  }
}

/** Store a photo and return the reference to save in the database. */
export async function uploadPhoto(file: Blob, options: UploadOptions = {}): Promise<string> {
  const blob = await resizeImage(file, options.maxSize ?? 1600, options.quality ?? 0.82);
  if (isSupabaseMode()) {
    const form = new FormData();
    form.set("file", blob, "photo.jpg");
    form.set("folder", options.folder ?? "misc");
    const res = await fetch("/api/storage", { method: "POST", body: form, credentials: "same-origin" });
    const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!res.ok || !json?.url) throw new Error(json?.error ?? "Upload failed");
    return json.url;
  }
  const id = globalThis.crypto.randomUUID();
  const dataUrl = await blobToDataUrl(blob);
  await idb("readwrite", (s) => s.put(dataUrl, id));
  return IDB_PREFIX + id;
}

/** Turn a stored reference into a URL an <img> can load. Null when missing. */
export async function resolvePhoto(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null;
  if (!ref.startsWith(IDB_PREFIX)) return ref;
  if (typeof indexedDB === "undefined") return null;
  const value = await idb<unknown>("readonly", (s) => s.get(ref.slice(IDB_PREFIX.length)));
  return typeof value === "string" ? value : null;
}

/** The photo as a data URL, for sending to an AI route. Null when missing. */
export async function photoAsDataUrl(ref: string | null | undefined): Promise<string | null> {
  const url = await resolvePhoto(ref);
  if (!url || url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) return null;
  return blobToDataUrl(await res.blob());
}

export async function removePhoto(ref: string | null | undefined): Promise<void> {
  if (!ref) return;
  if (ref.startsWith(IDB_PREFIX)) {
    await idb("readwrite", (s) => s.delete(ref.slice(IDB_PREFIX.length)));
    return;
  }
  await fetch("/api/storage", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ url: ref }),
  });
}

export function isLocalPhoto(ref: string | null | undefined): boolean {
  return !!ref && ref.startsWith(IDB_PREFIX);
}
