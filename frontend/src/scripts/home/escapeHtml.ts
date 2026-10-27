/**
 * Local HTML-escape helper used by the home-page client controller.
 *
 * Mirrors the inline `escapeHtml` implementation that lived inside
 * `index.astro`. Kept as a separate module so the `cardHtml` builder
 * (which assembles innerHTML for the zone grid after a refetch) and
 * any future caller share one canonical implementation.
 *
 * NOTE: identical to `lib/format.ts#escapeHtml` semantically, but kept
 * local so the home-page scripts remain a self-contained module
 * without depending on the shared admin helper.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}