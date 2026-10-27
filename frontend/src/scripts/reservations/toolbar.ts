/**
 * Filter + search toolbar wiring for the My Reservations page.
 *
 * Behavior preserved verbatim from the previous inline `bindFilterTabs`
 * and `bindSearch` functions in `my-reservations.astro`.
 *
 * Selectors (`[data-filter-tabs]`, `[data-filter]`,
 * `[id="plate-search"]`) match the markup rendered by
 * `ReservationToolbar.astro`.
 */

import { paintGrid } from "./painter";
import { state, type FilterValue } from "./state";

function bindFilterTabs(): void {
  const container = document.querySelector<HTMLElement>("[data-filter-tabs]");
  if (!container) return;

  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest<HTMLButtonElement>("[data-filter]");
    if (!button) return;
    const value = button.dataset.filter as FilterValue | undefined;
    if (!value) return;

    state.currentFilter = value;

    container.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((btn) => {
      const selected = btn.dataset.filter === value;
      btn.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected) {
        btn.classList.add(
          "bg-gradient-to-r",
          "from-emerald-500",
          "to-emerald-600",
          "text-white",
          "shadow-lg",
          "shadow-emerald-500/30",
        );
        btn.classList.remove(
          "text-slate-300",
          "hover:text-slate-100",
          "hover:bg-slate-800/60",
        );
      } else {
        btn.classList.remove(
          "bg-gradient-to-r",
          "from-emerald-500",
          "to-emerald-600",
          "text-white",
          "shadow-lg",
          "shadow-emerald-500/30",
        );
        btn.classList.add(
          "text-slate-300",
          "hover:text-slate-100",
          "hover:bg-slate-800/60",
        );
      }
    });

    paintGrid();
  });
}

function bindSearch(): void {
  const input = document.querySelector<HTMLInputElement>("#plate-search");
  if (!input) return;
  input.addEventListener("input", () => {
    state.currentSearch = input.value.trim();
    paintGrid();
  });
}

export function bindToolbar(): void {
  bindFilterTabs();
  bindSearch();
}