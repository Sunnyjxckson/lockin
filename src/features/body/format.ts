export function fmt(n: number, maxDecimals = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

/** "+1.2" or "-3" with a real minus sign key, never a dash character. */
export function signed(n: number, maxDecimals = 1): string {
  const body = fmt(Math.abs(n), maxDecimals);
  if (n > 0) return `+${body}`;
  if (n < 0) return `-${body}`;
  return body;
}
