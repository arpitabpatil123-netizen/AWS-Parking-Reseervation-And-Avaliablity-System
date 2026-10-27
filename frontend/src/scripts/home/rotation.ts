/**
 * Live rotation controller for the home page.
 *
 * Behavior preserved verbatim from the previous inline
 * `bootRotationTimer` / `bindRotationEvents` / `bindSyncLabel` /
 * `formatInterval` implementations in `index.astro`.
 *
 * Listens for the `spotsync:zones-rotated` custom event dispatched by
 * `services/mockZoneData.ts` and refetches + repaints the catalog on
 * every fire. The interval is overridable for tests via
 * `window.__SPOTSYNC_ROTATION_MS__` (positive number = ms).
 */

import { ROTATION_INTERVAL_MS } from "../../services/mockZoneData";
import { refetchZones } from "./catalogRefresh";
import { toast } from "../../lib/toast";

function bootRotationTimer(): void {
  const override = window.__SPOTSYNC_ROTATION_MS__;
  const intervalMs =
    typeof override === "number" && override > 0
      ? override
      : ROTATION_INTERVAL_MS;
  // The mock service exposes `startRotationTimer(ms)`; calling it with
  // a positive value (re-)arms the timer. We import lazily because the
  // mock module is optional at runtime.
  void import("../../services/mockZoneData").then((m) =>
    m.startRotationTimer(intervalMs),
  );
}

function bindRotationEvents(): void {
  if (typeof window === "undefined") return;
  bootRotationTimer();

  window.addEventListener("spotsync:zones-rotated", () => {
    void refetchZones().then(() => {
      toast.info("Zone availability updated.", { duration: 2500 });
    });
  });
}

function formatInterval(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} seconds`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} minutes`;
  return `${Math.round(ms / 3_600_000)} hour${
    Math.round(ms / 3_600_000) === 1 ? "" : "s"
  }`;
}

function bindSyncLabel(): void {
  const label = document.querySelector<HTMLElement>("[data-sync-label]");
  if (!label) return;

  const override = window.__SPOTSYNC_ROTATION_MS__;
  const intervalMs =
    typeof override === "number" && override > 0
      ? override
      : ROTATION_INTERVAL_MS;

  label.textContent = `Auto-syncing — refreshes every ${formatInterval(
    intervalMs,
  )}`;
}

export function bindRotation(): void {
  bindRotationEvents();
  bindSyncLabel();
}