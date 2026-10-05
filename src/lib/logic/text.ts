// Text rules shared by everything that shows words a model wrote.

/**
 * No em or en dashes, ever. A dash between two numbers becomes "to", any
 * other becomes a comma, and a minus sign becomes a plain hyphen.
 */
export function stripDashes(text: string): string {
  return text
    .replace(/(\d)\s*[\u2012\u2013\u2014\u2015\u2212]\s*(\d)/g, "$1 to $2")
    .replace(/\s*[\u2012\u2013\u2014\u2015]\s*/g, ", ")
    .replace(/\u2212/g, "-")
    .replace(/,\s*,/g, ",");
}

/** A short single line from a model: dashes out, whitespace folded, cut to `max`. */
export function cleanLine(text: unknown, max: number): string {
  if (typeof text !== "string") return "";
  return stripDashes(text).replace(/\s+/g, " ").trim().slice(0, max);
}
