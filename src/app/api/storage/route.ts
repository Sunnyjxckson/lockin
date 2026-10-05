// Photo upload and delete for Supabase mode. Files go to the public bucket
// named by SUPABASE_PHOTO_BUCKET (default "photos") under a random path.

import { requireAuth, serverPasscode } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

function bucket(): string {
  return process.env.SUPABASE_PHOTO_BUCKET || "photos";
}

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

async function guard(): Promise<Response | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return bad("Supabase is not configured. Photos stay on the device.", 404);
  }
  if (!serverPasscode()) return bad("Set LOCKIN_PASSCODE on the server before using Supabase.", 503);
  return requireAuth();
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return bad("No file.");
  if (file.size > MAX_BYTES) return bad("Photo is too large.", 413);
  if (file.type && !file.type.startsWith("image/")) return bad("Only images.");
  const folderRaw = String(form?.get("folder") ?? "misc");
  const folder = folderRaw.replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "misc";
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { serverSupabase } = await import("@/lib/db/supabase");
  const store = serverSupabase().storage.from(bucket());
  const { error } = await store.upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) return bad(`Upload failed: ${error.message}`, 500);
  return Response.json({ url: store.getPublicUrl(path).data.publicUrl });
}

export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  const marker = `/object/public/${bucket()}/`;
  const at = url.indexOf(marker);
  if (at === -1) return bad("Not a photo from this bucket.");
  const path = decodeURIComponent(url.slice(at + marker.length));
  const { serverSupabase } = await import("@/lib/db/supabase");
  const { error } = await serverSupabase().storage.from(bucket()).remove([path]);
  if (error) return bad(`Delete failed: ${error.message}`, 500);
  return Response.json({ ok: true });
}
