/**
 * Reserve-modal controller for the home page.
 *
 * Behavior preserved verbatim from the previous inline
 * `openModal`/`closeModal`/`showError`/`hideError`/
 * `bindReserveTriggers`/`bindModalClose`/`bindReserveSubmit`
 * implementations in `index.astro`.
 *
 * The controller owns:
 *   - The currently-selected zone (for the modal chip rendering).
 *   - The 409/401/400/other error mapping (intentionally preserved
 *     exactly so the user-facing message is unchanged).
 *   - The 50ms autofocus timer (timing-sensitive; do not change).
 *
 * Selectors (`[data-reserve-modal]`, `[data-zone-name]`, etc.) match
 * the markup rendered by `ReserveModal.astro` and the surrounding
 * `ZoneCatalogSection`.
 */

import { ApiError } from "../../services/api";
import { createReservation } from "../../services/reservationService";
import { ROUTES, ZONE_TYPES, ZONE_TYPE_BADGE, ZONE_TYPE_LABELS } from "../../lib/constants";
import { toast } from "../../lib/toast";
import { formatPricePerHour } from "../../lib/utils";
import { $isAuthenticated } from "../../store/authStore";
import type { ParkingZone } from "../../types/zone";
import { refetchFromActiveSource } from "./dataSource";

/**
 * Submit a reservation. Always routed to the real backend so the
 * reservation lands in the database and shows up on the driver's
 * "My Reservations" page.
 *
 * The mock service (createMockReservation) is intentionally NOT used
 * here — it writes to an in-memory module-scope ledger that is lost
 * on page refresh and never reaches the Go API, so the driver would
 * always see 0 reservations on /my-reservations.
 */
async function submitReservation(payload: {
  zone_id: number;
  license_plate: string;
}): Promise<unknown> {
  return createReservation(payload);
}

// ---------- Utilities ----------

// We deliberately re-import the type labels so the modal chips update
// even after a refetch (the server-rendered HTML only has the initial set).
// Sourced from the centralized constants so the values stay in sync with
// `ZoneCard.astro` and `ReservationCard.astro`.
const TYPE_LABEL: Record<ParkingZone["type"], string> = ZONE_TYPE_LABELS;
const TYPE_BADGE: Record<ParkingZone["type"], string> = ZONE_TYPE_BADGE;

// Tracking the currently-selected zone so the modal can render chips.
let selectedZone: ParkingZone | null = null;

const VALID_ZONE_TYPES: ReadonlySet<ParkingZone["type"]> = new Set<
  ParkingZone["type"]
>([ZONE_TYPES.GENERAL, ZONE_TYPES.EV_CHARGING, ZONE_TYPES.COVERED]);

function parseZoneType(raw: string | undefined): ParkingZone["type"] {
  if (raw && VALID_ZONE_TYPES.has(raw as ParkingZone["type"])) {
    return raw as ParkingZone["type"];
  }
  return ZONE_TYPES.GENERAL;
}

/**
 * Re-render the zone grid + stats after a successful reservation.
 * Lives in this module because the success callback is wired from
 * the modal submit handler.
 */
async function refetchZones(): Promise<void> {
  try {
    const fresh = await refetchFromActiveSource();
    const { renderZones, renderStats } = await import("./catalogRefresh");
    renderZones(fresh);
    renderStats(fresh);
    const { reapplyFilters } = await import("./filterController");
    reapplyFilters();
  } catch (error) {
    // Soft-fail: keep the existing grid, just notify the user.
    toast.error("Could not refresh the catalog. Please reload the page.");
    console.error("refetchZones failed:", error);
  }
}

function getDialog(): HTMLDialogElement | null {
  return document.querySelector<HTMLDialogElement>("[data-reserve-modal]");
}

function openModal(zone: ParkingZone): void {
  selectedZone = zone;
  const dialog = getDialog();
  if (!dialog) return;

  // Update header text.
  const titleEl = dialog.querySelector<HTMLElement>("[data-zone-name]");
  if (titleEl) titleEl.textContent = `Reserve at ${zone.name}`;

  // Update type/price chips.
  const idChip = dialog.querySelector<HTMLElement>("[data-zone-id-chip]");
  if (idChip) idChip.textContent = `#${zone.id}`;

  const typeChip = dialog.querySelector<HTMLElement>("[data-zone-type-chip]");
  if (typeChip) {
    typeChip.textContent = TYPE_LABEL[zone.type] ?? zone.type;
    typeChip.className = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${TYPE_BADGE[zone.type] ?? "bg-slate-800/60 text-slate-200 border-slate-700/60"}`;
  }

  const priceChip = dialog.querySelector<HTMLElement>("[data-zone-price-chip]");
  if (priceChip) priceChip.textContent = formatPricePerHour(zone.price_per_hour);

  // Update hidden zone id.
  const idInput = dialog.querySelector<HTMLInputElement>(
    "[data-zone-id-input]",
  );
  if (idInput) idInput.value = String(zone.id);

  // Reset form state.
  const form = dialog.querySelector<HTMLFormElement>("[data-reserve-form]");
  if (form) form.reset();
  if (idInput) idInput.value = String(zone.id); // re-set after reset

  hideError();

  // Open the dialog.
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    // Autofocus the license plate field for fast entry.
    const plate =
      dialog.querySelector<HTMLInputElement>("[data-license-plate]");
    window.setTimeout(() => plate?.focus(), 50);
  } else {
    // Fallback for very old browsers — render as a simple overlay.
    dialog.setAttribute("open", "true");
  }
}

function closeModal(): void {
  const dialog = getDialog();
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
  selectedZone = null;
}

function showError(message: string): void {
  const dialog = getDialog();
  if (!dialog) return;
  const errorEl = dialog.querySelector<HTMLElement>("[data-reserve-error]");
  const textEl = dialog.querySelector<HTMLElement>(
    "[data-reserve-error-text]",
  );
  if (errorEl) errorEl.classList.remove("hidden");
  if (textEl) textEl.textContent = message;
}

function hideError(): void {
  const dialog = getDialog();
  if (!dialog) return;
  const errorEl = dialog.querySelector<HTMLElement>("[data-reserve-error]");
  if (errorEl) errorEl.classList.add("hidden");
}

function bindReserveTriggers(): void {
  const triggers = document.querySelectorAll<HTMLButtonElement>(
    "[data-reserve-trigger]",
  );
  triggers.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      if (btn.disabled) return;

      // Auth guard: prompt sign-in if no session.
      if (!$isAuthenticated.get()) {
        toast.info("Please sign in to reserve a spot.");
        window.location.href = ROUTES.LOGIN;
        return;
      }

      const zoneId = Number(btn.dataset.zoneId);
      if (!Number.isFinite(zoneId)) return;

      // Build the zone object from the card's data-* attributes so we
      // don't need an extra round-trip to /zones/:id.
      const card = btn.closest<HTMLElement>("[data-zone-card]");
      if (!card) return;

      const zone: ParkingZone = {
        id: zoneId,
        name: card.dataset.zoneName ?? "",
        type: parseZoneType(card.dataset.zoneType),
        total_capacity: Number(card.dataset.zoneTotal ?? 0),
        available_spots: Number(card.dataset.zoneAvailable ?? 0),
        price_per_hour: 0, // filled by the server card if needed; modal uses card data
        spot_holds: [], // reservation modal doesn't need per-spot state
        created_at: "",
      };

      openModal(zone);
    });
  });
}

function bindModalClose(): void {
  const dialog = getDialog();
  if (!dialog) return;
  const closeButtons = dialog.querySelectorAll<HTMLButtonElement>(
    "[data-reserve-close]",
  );
  closeButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      closeModal();
    });
  });

  // Click on backdrop closes the modal.
  dialog.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target === dialog) {
      closeModal();
    }
  });

  // ESC key is handled natively by <dialog>, but make sure we clear
  // selection so the next open is a fresh form.
  dialog.addEventListener("close", () => {
    selectedZone = null;
  });
}

function bindReserveSubmit(): void {
  const dialog = getDialog();
  if (!dialog) return;
  const form = dialog.querySelector<HTMLFormElement>("[data-reserve-form]");
  const submitBtn = dialog.querySelector<HTMLButtonElement>(
    "[data-reserve-submit]",
  );
  const submitLabel = dialog.querySelector<HTMLElement>(
    "[data-reserve-submit-label]",
  );
  if (!form || !submitBtn || !submitLabel) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedZone) {
      showError("No zone selected. Please close the dialog and try again.");
      return;
    }

    const formData = new FormData(form);
    const license_plate = String(formData.get("license_plate") ?? "").trim();
    if (license_plate.length < 2) {
      showError("Please enter a valid license plate (min 2 characters).");
      return;
    }

    // Disable button + show inline spinner.
    submitBtn.disabled = true;
    const originalLabel = submitLabel.textContent ?? "Confirm Reservation";
    submitLabel.textContent = "Reserving…";

    try {
      await submitReservation({
        zone_id: selectedZone.id,
        license_plate,
      });

      toast.success(
        `Spot reserved at ${selectedZone.name} for plate ${license_plate.toUpperCase()}.`,
      );
      closeModal();

      // Refetch the catalog so the capacity bar updates immediately.
      await refetchZones();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          showError(
            "This zone is full. Another driver reserved the last spot — please pick a different zone.",
          );
        } else if (error.status === 401) {
          showError("Your session has expired. Please sign in again.");
          window.setTimeout(() => {
            window.location.href = ROUTES.LOGIN;
          }, 1500);
        } else if (error.status === 400) {
          showError(error.message || "Invalid license plate. Please try again.");
        } else {
          showError(error.message || "Could not create reservation. Please try again.");
        }
      } else if (error instanceof Error) {
        showError(error.message);
      } else {
        showError("Could not create reservation. Please try again.");
      }
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = originalLabel;
    }
  });
}

/**
 * Bind reserve-trigger buttons (the "Reserve Spot" buttons in each
 * zone card). Called once on initial load and again after every
 * `renderZones` repaint, because the new cards introduce new button
 * nodes.
 */
export function bindReserveTriggersOnce(): void {
  bindReserveTriggers();
}

/**
 * Bind the modal-level wiring (close affordances + form submit).
 * Called once on initial load only — the dialog DOM is never
 * recreated, so re-binding would attach duplicate listeners.
 */
export function bindReserveModal(): void {
  bindModalClose();
  bindReserveSubmit();
}