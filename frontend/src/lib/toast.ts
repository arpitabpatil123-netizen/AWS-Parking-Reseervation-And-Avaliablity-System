/**
 * Centralized toast notification helper.
 *
 * SpotSync surfaces all non-blocking feedback (success / error / info) through
 * a single API: `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`.
 *
 * Under the hood, this module is a thin facade that delegates to
 * `window.showToast`, which is exposed by the inline `<script>` in
 * `src/layouts/Layout.astro`. That script owns the DOM creation so the
 * layout stays framework-free and SSR-safe.
 *
 * The benefits of going through this module instead of calling
 * `window.showToast(...)` directly:
 *   1. Type-safe `ToastType` union — no magic strings.
 *   2. Consistent default `duration` per variant (errors stay a bit longer).
 *   3. SSR-safe: calls during server rendering are silently ignored.
 *   4. Easy mocking for tests / future refactors (e.g. swapping to
 *      `react-hot-toast` in Step 10+).
 */

export type ToastType = "success" | "error" | "info";

export interface ToastOptions {
  /** Milliseconds the toast stays on screen. Defaults to 3500. */
  duration?: number;
}

/** Default duration for success / info toasts. */
const DEFAULT_DURATION = 3500;

/** Errors stay a bit longer so the user can read the message. */
const ERROR_DURATION = 5000;

/**
 * Emit a toast. Internal — prefer the `toast.success / error / info`
 * helpers below. Falls back to `console.warn` in SSR / test contexts
 * where `window.showToast` is not available.
 */
function emit(type: ToastType, message: string, opts?: ToastOptions): void {
  if (typeof window === "undefined") {
    // SSR / tests: nothing to render. Still useful to log so dev notices.
    return;
  }

  const fn = window.showToast;
  if (typeof fn !== "function") {
    // Defensive: Layout.astro hasn't booted yet (very early call) or
    // the helper was stripped somehow. Don't crash the user flow.
    // eslint-disable-next-line no-console
    console.warn(`[toast] ${type}: ${message}`);
    return;
  }

  const duration = opts?.duration ?? (type === "error" ? ERROR_DURATION : DEFAULT_DURATION);
  fn(message, type, duration);
}

export const toast = {
  success(message: string, opts?: ToastOptions): void {
    emit("success", message, opts);
  },
  error(message: string, opts?: ToastOptions): void {
    emit("error", message, opts);
  },
  info(message: string, opts?: ToastOptions): void {
    emit("info", message, opts);
  },
};

export default toast;
