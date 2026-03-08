/**
 * Shared time utility functions.
 */

/** Parse a zeit/ms-style duration string (e.g. '24h', '7d', '5m') to milliseconds. */
export function parseExpiresIn(val: string): number {
  const match = val.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error(`Invalid duration format: "${val}". Expected e.g. '24h', '7d', '5m'.`);
  const num = parseInt(match[1]!);
  switch (match[2]) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}
