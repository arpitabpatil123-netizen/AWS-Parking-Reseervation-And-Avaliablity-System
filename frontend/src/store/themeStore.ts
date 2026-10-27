/**
 * Client-side theme (dark / light) state powered by Nano Stores.
 *
 * Architecture:
 *   - The `theme` enum captures the persisted preference. The browser may
 *     also expose a system preference (`prefers-color-scheme: dark`) which
 *     is used as the *initial* value when the user has never toggled.
 *   - The store is *persistent* via @nanostores/persistent so the choice
 *     survives refreshes and revisits.
 *   - The class `dark` on `<html>` is the canonical source of truth for
 *     styling, courtesy of Tailwind's `darkMode: ['class']` config and
 *     the CSS variables in `global.css`.
 *   - A pre-paint `<script>` in `Layout.astro` reads the same key on
 *     first paint and adds `.dark` to `<html>` BEFORE the body renders,
 *     avoiding the dreaded flash of wrong theme (FOWT).
 */

import { persistentAtom } from "@nanostores/persistent";
import { computed, type ReadableAtom } from "nanostores";

/** The two themes the application supports. */
export type Theme = "light" | "dark";

/** LocalStorage key for the persisted user preference. */
export const THEME_STORAGE_KEY = "spotsync_theme";

const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark";

/**
 * Resolve the initial theme.
 * 1. If we have a persisted pick, use it.
 * 2. Otherwise, honor the user's OS preference.
 * 3. Fall back to dark (SpotSync's signature theme).
 */
function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") {
    // Default for SSR — `dark` so the server-rendered HTML matches what
    // most users will see after the pre-paint script runs.
    return "dark";
  }
  const persisted = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isTheme(persisted)) {
    return persisted;
  }
  try {
    const prefersDark = window.matchMedia?.(
      "(prefers-color-scheme: dark)",
    ).matches;
    return prefersDark ? "dark" : "light";
  } catch {
    return "dark";
  }
}

/**
 * Persistent theme atom. Encoded as the raw string so the localStorage
 * entry is human-readable (`spotsync_theme=light`).
 *
 * The decoder falls back to the resolved initial theme (which honors the
 * OS preference) when localStorage holds an unexpected value — this
 * keeps the decoder's return type as `Theme` (required by the
 * `@nanostores/persistent` overloads) while still being safe.
 */
export const $theme = persistentAtom(
  THEME_STORAGE_KEY,
  resolveInitialTheme(),
  {
    encode: (value: Theme): string => value,
    decode: (raw: string): Theme =>
      isTheme(raw) ? raw : resolveInitialTheme(),
  },
);

/** Computed atom: `true` iff the active theme is dark. */
export const $isDark: ReadableAtom<boolean> = computed(
  $theme,
  (theme) => theme === "dark",
);

/**
 * Apply the current theme to the document root. Safe to call before
 * page rendering (sets the `dark` class on `<html>` directly).
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  // Keep the browser's UA controls (form inputs, scrollbars) in sync.
  root.style.colorScheme = theme;
}

/**
 * Toggle to the opposite theme and persist the choice.
 * Returns the new resolved theme.
 */
export function toggleTheme(): Theme {
  const next: Theme = $theme.get() === "dark" ? "light" : "dark";
  $theme.set(next);
  return next;
}

/**
 * Explicitly set a theme. Persists and applies to the DOM.
 */
export function setTheme(theme: Theme): void {
  $theme.set(theme);
}

/**
 * Imperative read of the current theme (sync).
 */
export function getTheme(): Theme {
  return $theme.get();
}

/** Compatibility alias for the computed boolean. */
export function isDarkMode(): boolean {
  return $theme.get() === "dark";
}
