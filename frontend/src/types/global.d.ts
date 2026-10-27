/**
 * Global ambient type declarations for SpotSync.
 *
 * - `window.showToast` is installed by the layout's inline `<script>` so
 *   any React component or Astro page can call into it without going
 *   through imports. The recommended way to fire toasts in app code is
 *   to import the `toast` helper from `@/lib/toast` instead — this
 *   declaration exists so TypeScript knows the function exists on
 *   `window` and the layout's inline script can assign it without an
 *   unsafe cast.
 * - `window.__SPOTSYNC_ROTATION_MS__` is an optional test-only override
 *   for the home-page zone rotation interval (positive number = ms).
 *   Declared here so consumers can read it without `as unknown as T`.
 */

import type { ToastType } from "../lib/toast";

export {};

declare global {
  interface Window {
    /**
     * Toast helper installed by the layout's inline script. Always
     * present in browser contexts; the `?` is kept so SSR/build-time
     * typing remains permissive (the assignment runs only in the
     * browser).
     */
    showToast?: (
      message: string,
      type?: ToastType,
      duration?: number,
    ) => void;
    /**
     * Test-only override for the home-page zone rotation interval
     * (positive number, in milliseconds). Read by
     * `scripts/home/rotation.ts`.
     */
    __SPOTSYNC_ROTATION_MS__?: number;
  }
}
