/**
 * Home page client controller — entry point.
 *
 * Boot order:
 *   1. Zone navigation controls (category tabs + zone switcher pills).
 *   2. Filter controls (search + status & type tabs).
 *   3. Reserve modal-level wiring (close affordances + submit).
 *   4. Reserve trigger buttons (initial-bind).
 *   5. Emergency zone blocked alert bindings.
 *   6. Rotation timer + live sync.
 *   7. Auto-refresh polling (30s cadence + tab focus) for live staff status updates.
 */

import { bindZoneNavControls } from "./zoneNavController";
import { bindFilterControls } from "./filterController";
import { bindReserveModal, bindReserveTriggersOnce } from "./reserveModalController";
import { bindEmergencyBlockedButtons, refetchZones } from "./catalogRefresh";
import { bindRotation } from "./rotation";

const LIVE_POLL_INTERVAL_MS = 30_000; // 30s auto-refresh for dynamic updates

function startLiveUpdates(): void {
  if (typeof window === "undefined") return;

  // Periodic poll to catch emergency status changes made by staff
  setInterval(() => {
    if (document.visibilityState === "visible") {
      void refetchZones();
    }
  }, LIVE_POLL_INTERVAL_MS);

  // Immediate refresh when tab becomes visible
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void refetchZones();
    }
  });
}

function init(): void {
  bindZoneNavControls();
  bindFilterControls();
  bindReserveModal();
  bindReserveTriggersOnce();
  bindEmergencyBlockedButtons();
  bindRotation();
  startLiveUpdates();
}

init();
