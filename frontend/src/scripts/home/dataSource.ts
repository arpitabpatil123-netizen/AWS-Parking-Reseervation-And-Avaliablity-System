/**
 * Data source / refetch helpers for the home page.
 *
 * Mirrors the original `USE_MOCK_DATA` flag + `refetchFromActiveSource`
 * helper from `index.astro`. The flag must remain in sync with the
 * server-side `USE_MOCK_DATA` constant in the page frontmatter so the
 * SSR-rendered initial state and the post-refetch client state agree.
 *
 * Reservation creation is NEVER routed through the mock service —
 * `createReservation` always hits the real backend so reservations
 * persist to the database and appear on the driver's My Reservations
 * page.
 */

import { getZones } from "../../services/zoneService";
import { getMockZones } from "../../services/mockZoneData";
import type { ParkingZone } from "../../types/zone";

/**
 * Mirrors the server-side `USE_MOCK_DATA` flag. When true we route
 * every client-side refetch through the mock service so the catalog
 * stays consistent across SSR + client refreshes.
 *
 * NOTE: even when this flag is true the *reservation create* call is
 * unconditionally routed to the real backend so reservations persist
 * to the DB (and appear on /my-reservations).
 */
export const USE_MOCK_DATA = false;

/**
 * Pulls the current zone list using whichever service the page is
 * configured to use. Centralised so the reservation success path,
 * the rotation handler, and any future "manual refresh" button all
 * share one code path.
 */
export async function refetchFromActiveSource(): Promise<ParkingZone[]> {
  if (USE_MOCK_DATA) return getMockZones();
  try {
    return await getZones();
  } catch {
    // Backend went down after the initial load — silently fall back.
    return getMockZones();
  }
}