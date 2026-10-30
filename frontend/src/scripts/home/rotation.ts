/**
 * Live sync controller for the home page.
 *
 * Availability only changes when real vehicle registrations/reservations
 * occur. Listens for reservation lifecycle events to update the catalog.
 */

import { refetchZones } from "./catalogRefresh";

function bindRotationEvents(): void {
  if (typeof window === "undefined") return;

  // Re-sync catalog when reservations are created, cancelled, or updated
  window.addEventListener("spotsync:zones-rotated", () => {
    void refetchZones();
  });
  window.addEventListener("spotsync:reservation-changed", () => {
    void refetchZones();
  });
}

function bindSyncLabel(): void {
  const label = document.querySelector<HTMLElement>("[data-sync-label]");
  if (!label) return;
  label.textContent = "Live System Online";
}

export function bindRotation(): void {
  bindRotationEvents();
  bindSyncLabel();
}