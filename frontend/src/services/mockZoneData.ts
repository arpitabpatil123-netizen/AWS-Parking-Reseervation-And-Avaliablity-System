/**
 * Mock zone + reservation service.
 *
 * Why this exists:
 *   The frontend demo needs to render 40 zones with realistic, live
 *   availability changes — even when the Go backend is unreachable.
 *   This module owns an in-memory copy of the seed dataset and a
 *   rotation timer that flips availability on a 1-hour cadence.
 *
 * Rotation rules (per the product spec):
 *   - Exactly 60% of zones (24 of 40) must have `available_spots > 0`
 *   - 40% of zones (16 of 40) are full
 *   - At every rotation tick, ~half of the available zones flip to
 *     full and ~half of the full zones flip to available — so the
 *     visible state churns without breaking the 60/40 invariant
 *
 * Concurrency model:
 *   The rotation timer only ever runs in the browser (see `start*
 *   functions` which return early when `window === undefined`).
 *   Reservations decrement the in-memory `available_spots` and the
 *   next service call returns the updated value.
 *
 * Connection to the real backend:
 *   `useMockFallback` flag in `index.astro` (default `true`) decides
 *   whether the page renders the mock data or hits the Go API. When
 *   `false`, this module is unused.
 */

import type { ParkingZone } from "../types/zone";
import { SEED_ZONES } from "../data/zones";

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** Rotation interval in milliseconds. 1 hour = 3,600,000 ms. */
export const ROTATION_INTERVAL_MS = 60 * 60 * 1000;

/** Percentage of zones that must have at least one free spot. */
export const AVAILABLE_TARGET_PERCENT = 0.6;

/* -------------------------------------------------------------------------- */
/* Internal state                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The live, mutable copy of the zone dataset. Seeded from the frozen
 * `SEED_ZONES` array on first access. Kept as a module-level singleton
 * so the rotation timer, the service getters, and the reservation
 * mutator all see the same state.
 *
 * Each cloned zone also gets a freshly generated `spot_holds` bitmap so
 * the per-spot grid renders realistic per-zone availability from the
 * very first paint.
 */
let liveZones: ParkingZone[] = SEED_ZONES.map((zone) => ({
  ...zone,
  spot_holds: generateSpotHolds(zone.total_capacity),
}));

/** Track IDs that have been reserved (in-memory). */
const reservationLedger: Array<{
  id: number;
  zone_id: number;
  license_plate: string;
  cancelled: boolean;
}> = [];
let nextReservationId = 1;

/** Handle to the rotation interval so we can stop it on teardown. */
let rotationTimer: ReturnType<typeof setInterval> | null = null;

/** Last rotation timestamp for diagnostic UI/tests. */
let lastRotationAt: number = Date.now();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Build a per-spot holds bitmap of length totalCapacity initialised to all 0s (empty parking spaces).
 */
function generateSpotHolds(totalCapacity: number): number[] {
  if (totalCapacity <= 0) return [];
  return new Array(totalCapacity).fill(0);
}

/* -------------------------------------------------------------------------- */
/* Rotation logic (disabled so zones remain empty until reserved)             */
/* -------------------------------------------------------------------------- */

export function rotateAvailability(): ParkingZone[] {
  lastRotationAt = Date.now();
  // Return a defensive copy so callers can't mutate internal state.
  return liveZones.map((z) => ({ ...z }));
}

/**
 * Boot the rotation timer (disabled: availability only changes on reservation).
 */
export function startRotationTimer(_intervalMs: number = ROTATION_INTERVAL_MS): void {
  // Rotator disabled: parking zone availability is purely determined by
  // vehicle reservations and cannot be mutated by background timers.
}

/**
 * Stop the rotation timer. Useful for SPA-style navigations and tests.
 */
export function stopRotationTimer(): void {
  if (rotationTimer !== null) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
}

/**
 * Expose the last rotation timestamp so the UI can show "Last updated
 * 3 minutes ago" if it wants to.
 */
export function getLastRotationAt(): number {
  return lastRotationAt;
}

/* -------------------------------------------------------------------------- */
/* Service-shaped API                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Simulated network latency so the UI shows loading states for a
 * beat instead of flashing instantly. Helps demo the spinner UX.
 */
const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), SIMULATED_LATENCY_MS);
  });
}

/**
 * List all zones. Returns a defensive copy so callers can't mutate
 * the live array.
 */
export async function getMockZones(): Promise<ParkingZone[]> {
  return delay(liveZones.map((z) => ({ ...z })));
}

/**
 * Mock equivalent of `reservationService.createReservation`. Decrements
 * the zone's `available_spots` in-memory and records the booking in
 * the ledger.
 *
 * Throws an error shaped like `ApiError` (status: 409) when the zone
 * is full, mirroring the backend contract.
 */
export async function createMockReservation(
  zoneId: number,
  licensePlate: string,
): Promise<{ id: number; zone_id: number; license_plate: string }> {
  const zone = liveZones.find((z) => z.id === zoneId);
  if (!zone) {
    const err = new Error("Zone not found.") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  if (zone.emergency_closed) {
    const err = new Error(
      zone.emergency_closure_reason || "This zone is temporarily closed due to an emergency incident."
    ) as Error & { status: number };
    err.status = 409;
    throw err;
  }
  if (zone.available_spots <= 0) {
    const err = new Error("This zone is full. Please choose another.") as Error & {
      status: number;
    };
    err.status = 409;
    throw err;
  }

  // Atomic-ish decrement.
  zone.available_spots -= 1;
  if (Array.isArray(zone.spot_holds)) {
    const firstFree = zone.spot_holds.indexOf(0);
    if (firstFree !== -1) {
      zone.spot_holds[firstFree] = 1;
    }
  }

  const record = {
    id: nextReservationId++,
    zone_id: zoneId,
    license_plate: licensePlate,
  };
  reservationLedger.push({ ...record, cancelled: false });

  return delay(record);
}

/**
 * Mock equivalent of `reservationService.cancelReservation`. Reverses
 * the decrement and marks the ledger entry as cancelled.
 */
export async function cancelMockReservation(
  reservationId: number,
): Promise<{ ok: true }> {
  const entry = reservationLedger.find((r) => r.id === reservationId);
  if (!entry) {
    const err = new Error("Reservation not found.") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  if (entry.cancelled) {
    return delay({ ok: true });
  }

  entry.cancelled = true;
  const zone = liveZones.find((z) => z.id === entry.zone_id);
  if (zone && zone.available_spots < zone.total_capacity) {
    zone.available_spots += 1;
    if (Array.isArray(zone.spot_holds)) {
      const lastHeld = zone.spot_holds.lastIndexOf(1);
      if (lastHeld !== -1) {
        zone.spot_holds[lastHeld] = 0;
      }
    }
  }
  return delay({ ok: true });
}

/**
 * Mock equivalent of `reservationService.getMyReservations`.
 *
 * Returns the LEDGER with optional zone info joined in.
 */
export async function getMockMyReservations(): Promise<
  Array<{
    id: number;
    user_id: number;
    zone_id: number;
    license_plate: string;
    status: "active" | "cancelled";
    zone?: ParkingZone;
    created_at: string;
  }>
> {
  const rows = reservationLedger.map((entry) => {
    const zone = liveZones.find((z) => z.id === entry.zone_id);
    return {
      id: entry.id,
      user_id: 0,
      zone_id: entry.zone_id,
      license_plate: entry.license_plate,
      status: entry.cancelled ? ("cancelled" as const) : ("active" as const),
      zone: zone ? { ...zone } : undefined,
      created_at: new Date().toISOString(),
    };
  });
  return delay(rows);
}

/**
 * Test-only helper: reset the live state back to the seed snapshot.
 * Not used by the running app, but exported so tests can be hermetic.
 */
export function __resetMockState(): void {
  liveZones = SEED_ZONES.map((zone) => ({
    ...zone,
    spot_holds: generateSpotHolds(zone.total_capacity),
  }));
  reservationLedger.length = 0;
  nextReservationId = 1;
  lastRotationAt = Date.now();
}
