/**
 * Cancel-reservation flow for the My Reservations page.
 *
 * Behavior preserved verbatim from the previous inline
 * `openCancelDialog` / `closeCancelDialog` / `bindCancelDelegation` /
 * `bindCancelDialog` / `performCancel` functions in
 * `my-reservations.astro`.
 *
 * The optimistic update + rollback sequence is intentionally preserved
 * exactly:
 *   1. Spin the confirm button.
 *   2. Mutate `targetReservation.status = CANCELLED` and repaint.
 *   3. Call `cancelReservation`.
 *   4. If success, replace the reservation with the server payload.
 *   5. If failure, roll back to `"active"` and repaint.
 *
 * Selectors (`[data-cancel-dialog]`, `[data-cancel-overlay]`,
 * `[data-cancel-dialog-confirm]`, etc.) match the markup rendered by
 * `CancelReservationDialog.astro`.
 */

import { ApiError } from "../../services/api";
import { cancelReservation } from "../../services/reservationService";
import { RESERVATION_STATUS } from "../../lib/constants";
import { toast } from "../../lib/toast";
import { paintAll } from "./painter";
import { state } from "./state";

function openCancelDialog(
  id: number,
  zoneName: string,
  plate: string,
): void {
  state.pendingCancelId = id;
  const dialog = document.querySelector<HTMLElement>("[data-cancel-dialog]");
  const zoneEl = document.querySelector<HTMLElement>(
    "[data-cancel-dialog-zone]",
  );
  const plateEl = document.querySelector<HTMLElement>(
    "[data-cancel-dialog-plate]",
  );
  const msgEl = document.querySelector<HTMLElement>(
    "[data-cancel-dialog-message]",
  );
  if (!dialog) return;
  if (zoneEl) zoneEl.textContent = zoneName;
  if (plateEl) plateEl.textContent = plate;
  if (msgEl) {
    msgEl.textContent = `This will free the spot at ${zoneName} for plate ${plate}. You can re-book it later if it's still available.`;
  }
  dialog.classList.remove("hidden");
  dialog.classList.add("flex");
  // Trap focus on the confirm button for keyboard accessibility.
  window.setTimeout(() => {
    const confirm = document.querySelector<HTMLButtonElement>(
      "[data-cancel-dialog-confirm]",
    );
    confirm?.focus();
  }, 50);
}

function closeCancelDialog(): void {
  state.pendingCancelId = null;
  const dialog = document.querySelector<HTMLElement>("[data-cancel-dialog]");
  if (!dialog) return;
  dialog.classList.add("hidden");
  dialog.classList.remove("flex");
}

function bindCancelDelegation(): void {
  const grid = document.querySelector<HTMLElement>("[data-reservation-grid]");
  if (!grid) return;
  grid.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest<HTMLButtonElement>(
      "[data-cancel-reservation]",
    );
    if (!button) return;
    event.preventDefault();
    if (button.disabled) return;
    const id = Number(button.dataset.reservationId);
    const zoneName = button.dataset.zoneName ?? "";
    const plate = button.dataset.licensePlate ?? "";
    if (!Number.isFinite(id) || id <= 0) {
      toast.error("Invalid reservation ID.");
      return;
    }
    openCancelDialog(id, zoneName, plate);
  });
}

function bindCancelDialog(): void {
  const dismiss = document.querySelector<HTMLButtonElement>(
    "[data-cancel-dialog-dismiss]",
  );
  const overlay = document.querySelector<HTMLElement>("[data-cancel-overlay]");
  const confirm = document.querySelector<HTMLButtonElement>(
    "[data-cancel-dialog-confirm]",
  );
  const dialog = document.querySelector<HTMLElement>("[data-cancel-dialog]");

  dismiss?.addEventListener("click", () => closeCancelDialog());
  overlay?.addEventListener("click", () => closeCancelDialog());
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) closeCancelDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCancelDialog();
  });

  confirm?.addEventListener("click", () => {
    if (state.pendingCancelId === null) return;
    void performCancel(state.pendingCancelId);
  });
}

async function performCancel(id: number): Promise<void> {
  const confirmBtn = document.querySelector<HTMLButtonElement>(
    "[data-cancel-dialog-confirm]",
  );
  const originalHtml = confirmBtn?.innerHTML ?? "";
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 animate-spin">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        Cancelling...
      `;
  }

  // Optimistic update.
  const targetReservation = state.allReservations.find((r) => r.id === id);
  if (targetReservation) {
    targetReservation.status = RESERVATION_STATUS.CANCELLED;
    paintAll();
  }

  try {
    const updated = await cancelReservation(id);
    const idx = state.allReservations.findIndex((r) => r.id === id);
    if (idx >= 0) {
      state.allReservations[idx] = updated;
    }
    paintAll();
    closeCancelDialog();
    toast.success(`Reservation #${id} cancelled. The spot is now free.`);
  } catch (error) {
    // Roll back.
    if (targetReservation) {
      targetReservation.status = RESERVATION_STATUS.ACTIVE;
    }
    paintAll();
    const message =
      error instanceof ApiError
        ? error.message
        : "Failed to cancel reservation. Please try again.";
    toast.error(message);
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalHtml;
    }
  }
}

export function bindCancelFlow(): void {
  bindCancelDelegation();
  bindCancelDialog();
}