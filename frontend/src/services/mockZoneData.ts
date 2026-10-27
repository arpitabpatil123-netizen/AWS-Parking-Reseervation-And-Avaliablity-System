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
import { SEED_ZONES, TOTAL_ZONE_COUNT } from "../data/zones";

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
 * Choose a random available_spots count in the band
 * `[floor(N/2), ceil(N*0.6)]` where N is the zone's total capacity.
 * This is the spec-mandated per-zone availability range — roughly
 * half to 60% available, leaving 40-50% reserved. For N=18 this
 * yields available ∈ [9, 11].
 */
function pickAvailableSpots(totalCapacity: number): number {
  if (totalCapacity <= 0) return 0;
  const lo = Math.floor(totalCapacity / 2);
  const hi = Math.ceil(totalCapacity * 0.6);
  if (hi < lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Build a per-spot holds bitmap of length totalCapacity with a random
 * number of held positions (1s). The held count lives in
 * `[floor(N*0.4), ceil(N*0.5)]` — equivalent to "available ∈
 * [floor(N/2), ceil(N*0.6)]" inverted — so the two halves of the
 * mock mirror each other and the spec invariant is preserved.
 *
 * Algorithm (matches the backend seeder exactly):
 *   1. Build []number of length N, all 1s (held).
 *   2. Fisher-Yates shuffle.
 *   3. Flip the first (N - holdCount) entries to 0 (available).
 *
 * Returns an empty array for N <= 0.
 */
function generateSpotHolds(totalCapacity: number): number[] {
  if (totalCapacity <= 0) return [];
  const n = totalCapacity;
  const lo = Math.floor(n * 0.4); // held lower bound
  const hi = Math.ceil(n * 0.5);  // held upper bound
  const hiClamped = Math.min(hi, n);
  const holdCount = lo + Math.floor(Math.random() * (hiClamped - lo + 1));

  const holds: number[] = new Array(n).fill(1);

  // Fisher-Yates in-place shuffle.
  for (let i = holds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [holds[i], holds[j]] = [holds[j], holds[i]];
  }

  // Flip the first (n - holdCount) entries to 0.
  const availableCount = Math.max(0, n - holdCount);
  for (let i = 0; i < availableCount; i++) {
    holds[i] = 0;
  }

  return holds;
}

/**
 * Fisher-Yates shuffle (in-place). Returns the same array.
 * We use this to randomise which zones are available/full each tick.
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* -------------------------------------------------------------------------- */
/* Rotation logic                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Rotate the live zone dataset, preserving the 60/40 invariant.
 *
 * Algorithm:
 *   1. Split zones into [available, full] by current availability.
 *   2. Compute the targets — we want ~60% available, ~40% full.
 *   3. If the current split already matches, just shuffle to move
 *      *which* zones are in each bucket (instant variety).
 *   4. If the split is off (e.g. after many reservations), move
 *      a few zones from the over-full bucket to the over-available
 *      one to restore the 60/40 balance.
 *   5. Pick a fresh `available_spots` count for each newly available zone.
 *
 * Returns the new live array (also mutates internal state).
 */
export function rotateAvailability(): ParkingZone[] {
  const availableTarget = Math.round(TOTAL_ZONE_COUNT * AVAILABLE_TARGET_PERCENT);
  const fullTarget = TOTAL_ZONE_COUNT - availableTarget;

  const available = liveZones.filter((z) => z.available_spots > 0);
  const full = liveZones.filter((z) => z.available_spots === 0);

  // Pick a random subset of full zones to flip -> available.
  const fullToFlip = Math.max(0, availableTarget - available.length);
  // Pick a random subset of currently-available zones to flip -> full.
  const availableToFlip = Math.max(0, available.length - availableTarget);

  shuffle(full);
  shuffle(available);

  // Flip a few zones back to available.
  for (let i = 0; i < fullToFlip && i < full.length; i++) {
    const zone = full[i];
    zone.available_spots = pickAvailableSpots(zone.total_capacity);
    zone.spot_holds = generateSpotHolds(zone.total_capacity);
  }

  // Flip a few zones to full.
  for (let i = 0; i < availableToFlip && i < available.length; i++) {
    const zone = available[i];
    zone.available_spots = 0;
    zone.spot_holds = generateSpotHolds(zone.total_capacity);
  }

  // Even when the targets match exactly, shuffle which zones are
  // in each bucket so the catalog visibly changes every hour.
  // (We trim or grow available[] to exactly hit the target.)
  if (available.length === availableTarget && fullToFlip === 0 && availableToFlip === 0) {
    const swapCount = Math.min(4, full.length, available.length);
    for (let i = 0; i < swapCount; i++) {
      // Move one from available to full...
      const a = available[i];
      a.available_spots = 0;
      a.spot_holds = generateSpotHolds(a.total_capacity);
      // ...and a different one from full to available.
      const f = full[i];
      f.available_spots = pickAvailableSpots(f.total_capacity);
      f.spot_holds = generateSpotHolds(f.total_capacity);
    }
  }

  lastRotationAt = Date.now();
  // Return a defensive copy so callers can't mutate internal state.
  return liveZones.map((z) => ({ ...z }));
}

/**
 * Boot the rotation timer. Safe to call on the server (no-op when
 * `window === undefined`).
 *
 * Returns the timer handle so tests can clear it; production callers
 * don't need it.
 */
export function startRotationTimer(intervalMs: number = ROTATION_INTERVAL_MS): void {
  if (typeof window === "undefined") return;
  if (rotationTimer !== null) return; // already running

  rotationTimer = setInterval(() => {
    rotateAvailability();
    // Fire a DOM event so the page can react without tight coupling.
    window.dispatchEvent(new CustomEvent("spotsync:zones-rotated"));
  }, intervalMs);
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
  if (zone.available_spots <= 0) {
    const err = new Error("This zone is full. Please choose another.") as Error & {
      status: number;
    };
    err.status = 409;
    throw err;
  }

  // Atomic-ish decrement.
  zone.available_spots -= 1;

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
