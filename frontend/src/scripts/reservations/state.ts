/**
 * Module-scoped state for the My Reservations page.
 *
 * Behavior preserved verbatim from the previous top-level `let` block
 * in `my-reservations.astro`. Centralized so the auth guard, the
 * loader, the filter toolbar, the renderer, and the cancel flow can
 * all share the same references without prop-drilling or globals.
 *
 * The state is exposed as a single mutable object rather than as a
 * flat list of `let` exports so other modules can both read and
 * reassign fields (e.g. `state.allReservations = await fetch(...)`)
 * without losing the original ES module binding semantics.
 */

import type { Reservation } from "../../types/reservation";

export type FilterValue = "all" | "active" | "cancelled";

export const state = {
  allReservations: [] as Reservation[],
  currentFilter: "all" as FilterValue,
  currentSearch: "",
  isLoading: false,
  /** Reservation id currently queued for cancellation (resolved from dialog). */
  pendingCancelId: null as number | null,
};