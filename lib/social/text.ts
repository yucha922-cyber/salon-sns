/** Text helpers shared by provider validators (pure, client-safe). */

export function normalizeHashtags(tags: string[]): string[] {
  return tags
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
}

/** caption + CTA + hashtags, the way it will be posted. */
export function composePostText(parts: { caption: string; cta: string; hashtags: string[] }, options: { maxHashtags?: number } = {}): string {
  const tags = normalizeHashtags(parts.hashtags).slice(0, options.maxHashtags ?? Infinity);
  const body = parts.caption.trim();
  const cta = parts.cta.trim();
  return [body, cta && !body.includes(cta) ? cta : "", tags.join(" ")].filter(Boolean).join("\n\n");
}

export function countHashtags(text: string): number {
  return (text.match(/(^|\s)#[^\s#]+/gu) ?? []).length;
}

export function countMentions(text: string): number {
  return (text.match(/(^|\s)@[A-Za-z0-9._]+/g) ?? []).length;
}

export function uniqueLinks(text: string): string[] {
  return [...new Set(text.match(/https?:\/\/[^\s]+/g) ?? [])];
}

const encoder = new TextEncoder();

/**
 * Threads counts emojis as their UTF-8 byte length (official docs). Other
 * characters (incl. Japanese) are counted as 1 here; this is conservative for
 * emojis and documented as approximate for CJK in the README.
 */
export function threadsLength(text: string): number {
  let n = 0;
  for (const ch of text) n += /\p{Extended_Pictographic}/u.test(ch) ? encoder.encode(ch).length : 1;
  return n;
}

export function charLength(text: string): number {
  return [...text].length;
}
