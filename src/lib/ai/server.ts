// Shared by the three AI routes (coach, meal photo, earnings screenshot).
// Server only.

import Anthropic from "@anthropic-ai/sdk";

/**
 * The default model: a current Sonnet with vision, which all three routes
 * need or can use. Checked against https://docs.claude.com/en/docs/about-claude/models
 * on Oct 5, 2026.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

/** The model every AI route uses. Set ANTHROPIC_MODEL to change it without a code change. */
export function anthropicModel(): string {
  const m = process.env.ANTHROPIC_MODEL?.trim();
  return m && m.length > 0 ? m : DEFAULT_ANTHROPIC_MODEL;
}

/** Null when ANTHROPIC_API_KEY is not set: answer with aiFallback("no_key"). */
export function anthropicClient(options: { maxRetries?: number; timeout?: number } = {}): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return new Anthropic({ apiKey, maxRetries: options.maxRetries ?? 1, timeout: options.timeout ?? 40_000 });
}

/**
 * Why a route answered without the model.
 * no_key: ANTHROPIC_API_KEY is not set. no_read: the model answered but
 * nothing usable came back. error: the call failed. Others are route specific.
 */
export type FallbackReason = "no_key" | "no_read" | "error" | "bad_image" | "refused" | "empty" | "too_long" | "numbers_not_in_data";

/**
 * The one fallback shape: 200 { source: "fallback", reason, ...extra }.
 * A fallback is never an error status, so the screen can carry on.
 */
export function aiFallback(reason: FallbackReason, extra: Record<string, unknown> = {}): Response {
  return Response.json({ ...extra, source: "fallback", reason });
}

export const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];
const MAX_IMAGE_CHARS = 7_000_000;

/** Split an image data URL for the Messages API. On failure, the error response to return. */
export function readImageDataUrl(image: unknown): { mediaType: ImageMediaType; data: string } | { error: Response } {
  const text = typeof image === "string" ? image : "";
  const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(text);
  if (!match) return { error: Response.json({ error: "Send the photo as a data URL in image." }, { status: 400 }) };
  if (text.length > MAX_IMAGE_CHARS) return { error: Response.json({ error: "That photo is too large." }, { status: 413 }) };
  const mediaType = match[1].toLowerCase() as ImageMediaType;
  if (!IMAGE_MEDIA_TYPES.includes(mediaType)) return { error: aiFallback("bad_image") };
  return { mediaType, data: match[2] };
}
