/**
 * Auth guard + section visibility for the My Reservations page.
 *
 * Behavior preserved verbatim from the previous inline `guardAuth`
 * and `showSection` functions in `my-reservations.astro`.
 *
 * The auth guard redirects unauthenticated visitors to `/login` and
 * returns the current user (or null if redirected). Callers should
 * check the return value before binding any data-dependent controls.
 */

import { ROUTES } from "../../lib/constants";
import { getUser, isAuthenticated } from "../../store/authStore";
import type { User } from "../../types/auth";

export function guardAuth(): User | null {
  if (!isAuthenticated()) {
    window.location.replace(ROUTES.LOGIN);
    return null;
  }
  const user = getUser();
  if (!user) {
    window.location.replace(ROUTES.LOGIN);
    return null;
  }
  return user;
}

export type SectionName = "skeleton" | "grid" | "filter-empty" | "empty" | "error";

export function showSection(name: SectionName): void {
  const map: Record<SectionName, HTMLElement | null> = {
    skeleton: document.querySelector<HTMLElement>("[data-skeleton]"),
    grid: document.querySelector<HTMLElement>("[data-reservation-grid]"),
    "filter-empty": document.querySelector<HTMLElement>("[data-filter-empty]"),
    empty: document.querySelector<HTMLElement>("[data-empty-state]"),
    error: document.querySelector<HTMLElement>("[data-error-state]"),
  };
  for (const [key, el] of Object.entries(map) as [SectionName, HTMLElement | null][]) {
    if (!el) continue;
    el.classList.toggle("hidden", key !== name);
  }
}