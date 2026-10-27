/**
 * Data loader + relative-time refresher for the My Reservations page.
 *
 * Behavior preserved verbatim from the previous inline `bindRefresh`,
 * `bindErrorRetry`, `loadReservations`, and `refreshRelativeTimes`
 * functions in `my-reservations.astro`.
 *
 * The relative-time tick continues to fire on a 60-second interval
 * after the initial load (matching the original implementation).
 */

import { ApiError } from "../../services/api";
import { ROUTES } from "../../lib/constants";
import { getMyReservations } from "../../services/reservationService";
import { paintAll } from "./painter";
import { showSection } from "./auth";
import { state } from "./state";
import { relativeTime } from "./helpers";

function refreshRelativeTimes(): void {
  document
    .querySelectorAll<HTMLElement>("[data-relative-time]")
    .forEach((el) => {
      const iso = el.dataset.relativeTime;
      if (!iso) return;
      el.textContent = relativeTime(iso);
    });
}

async function loadReservations(triggerButton?: HTMLButtonElement): Promise<void> {
  if (state.isLoading) return;
  state.isLoading = true;

  const icon = triggerButton?.querySelector<HTMLElement>("[data-refresh-icon]");
  if (icon) icon.classList.add("animate-spin");

  if (state.allReservations.length === 0) {
    showSection("skeleton");
  }

  try {
    const list = await getMyReservations();
    state.allReservations = Array.isArray(list) ? list : [];
    paintAll();
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 401
        ? "Your session has expired. Please sign in again."
        : error instanceof ApiError
        ? error.message
        : "We couldn't reach the SpotSync server. Please check your connection.";
    const errEl = document.querySelector<HTMLElement>("[data-error-message]");
    if (errEl) {
      errEl.textContent = message;
    }
    showSection("error");

    if (error instanceof ApiError && error.status === 401) {
      window.setTimeout(() => {
        window.location.href = ROUTES.LOGIN;
      }, 1200);
    }
  } finally {
    state.isLoading = false;
    if (icon) icon.classList.remove("animate-spin");
  }
}

function bindRefresh(): void {
  const button = document.querySelector<HTMLButtonElement>(
    "[data-action='refresh']",
  );
  if (!button) return;
  button.addEventListener("click", () => {
    void loadReservations(button);
  });
}

function bindErrorRetry(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest<HTMLButtonElement>(
      "[data-action='retry']",
    );
    if (!button) return;
    event.preventDefault();
    void loadReservations();
  });
}

export function bindLoader(): void {
  bindRefresh();
  bindErrorRetry();
}

export function startInitialLoad(): void {
  void loadReservations();
  window.setInterval(refreshRelativeTimes, 60_000);
}