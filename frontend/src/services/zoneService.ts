/**
 * Parking Zone API endpoints.
 *
 * Thin wrappers around `apiFetch` for the zone-related backend routes:
 *   - GET    /zones         -> list all parking zones for the public catalog
 *   - GET    /zones/:id     -> fetch a single zone (used by detail views)
 *   - POST   /zones         -> admin-only: create a new parking zone
 *
 * All HTTP plumbing (URL composition, JSON encoding, Bearer token injection,
 * error translation) lives in `api.ts`. This file is purely contract.
 */

import { API_ENDPOINTS } from "../lib/constants";
import type {
  CreateZonePayload,
  ParkingZone,
} from "../types/zone";
import { ApiError, apiFetch, apiSendJson } from "./api";

/**
 * Fetch the full list of parking zones for the home-page catalog.
 *
 * Returns `ParkingZone[]` already unwrapped from the API envelope. The
 * backend keeps the `available_spots` counter up-to-date so the UI can
 * render dynamic capacity bars without any extra requests.
 */
export async function getZones(): Promise<ParkingZone[]> {
  return apiFetch<ParkingZone[]>(API_ENDPOINTS.ZONES, {
    method: "GET",
  });
}

/**
 * Fetch a single parking zone by its numeric ID.
 *
 * Returns `null` when the backend responds with 404 (rather than throwing),
 * so the UI can render a friendly "zone not found" state without a try/catch.
 */
export async function getZoneById(id: number): Promise<ParkingZone | null> {
  try {
    return await apiFetch<ParkingZone>(API_ENDPOINTS.ZONE_BY_ID(id), {
      method: "GET",
    });
  } catch (error) {
    // 404 -> "not found" is a normal flow for stale links; surface as null.
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Admin-only: create a brand-new parking zone.
 *
 * Sends the typed `CreateZonePayload` to the backend, which enforces
 * the role-checked contract (caller must have a valid admin JWT).
 * Returns the freshly-created `ParkingZone` row including its assigned
 * `id` and the initial `available_spots = total_capacity`.
 */
export async function createZone(
  payload: CreateZonePayload,
): Promise<ParkingZone> {
  return apiSendJson<ParkingZone>(API_ENDPOINTS.ZONES, "POST", payload);
}

/**
 * Admin-only: delete a parking zone by ID. Used by the admin dashboard
 * to permanently remove a zone from the catalog. The backend returns 404
 * if the zone does not exist (translated to ApiError by api.ts).
 */
export async function deleteZone(id: number): Promise<void> {
  await apiFetch<void>(API_ENDPOINTS.ZONE_BY_ID(id), {
    method: "DELETE",
  });
}

/**
 * Admin-only: update an existing parking zone. The backend enforces the
 * admin role and returns the refreshed zone record.
 */
export async function updateZone(
  id: number,
  payload: CreateZonePayload,
): Promise<ParkingZone> {
  return apiSendJson<ParkingZone>(API_ENDPOINTS.ZONE_BY_ID(id), "PUT", payload);
}
