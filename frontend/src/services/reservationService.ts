/**
 * Reservation API endpoints.
 *
 * Thin wrappers around `apiFetch` for the booking-related backend routes:
 *   - POST   /reservations           -> lock in a spot (driver action)
 *   - GET    /reservations/mine      -> list the current driver's bookings
 *   - GET    /reservations           -> admin: list every reservation
 *   - DELETE /reservations/:id       -> cancel a reservation
 *
 * Concurrency safety:
 *   The backend atomically decrements `available_spots` and returns
 *   HTTP 409 when a zone is sold out. The `createReservation` wrapper
 *   lets this `ApiError` bubble up to the caller so the UI can switch
 *   on the status code and show a friendly toast.
 */

import { API_ENDPOINTS, RESERVATION_STATUS } from "../lib/constants";
import type {
  CreateReservationPayload,
  Reservation,
} from "../types/reservation";
import { apiFetch, apiSendJson } from "./api";

/**
 * Lock in a spot inside a zone for the currently authenticated driver.
 *
 * `payload.license_plate` is the vehicle plate captured by the
 * `ReserveModal` form. The backend enforces a non-empty, sane plate
 * string and atomically reserves the spot.
 *
 * Throws `ApiError` with status 409 when the zone is full — the UI
 * turns this into a "Zone is full" toast.
 */
export async function createReservation(
  payload: CreateReservationPayload,
): Promise<Reservation> {
  return apiSendJson<Reservation>(API_ENDPOINTS.RESERVATIONS, "POST", payload);
}

/**
 * Fetch every reservation belonging to the currently authenticated
 * driver. Sorted newest-first by the backend so the dashboard can
 * render chronologically without recomputing.
 *
 * NOTE: the backend exposes this route as `/reservations/mine` (singular
 * "mine"), NOT `/reservations/me`. Hitting `/reservations/me` causes
 * Echo to fall through to the catch-all `GET /reservations/:id` route,
 * which then fails to parse "me" as a numeric id and returns
 * 400 "Invalid reservation id".
 */
export async function getMyReservations(): Promise<Reservation[]> {
  return apiFetch<Reservation[]>(API_ENDPOINTS.RESERVATIONS_MINE, {
    method: "GET",
  });
}

/**
 * Admin-only: fetch every reservation across the system.
 *
 * Used by the admin "global system monitor" table.
 */
export async function getAllReservations(): Promise<Reservation[]> {
  return apiFetch<Reservation[]>(API_ENDPOINTS.RESERVATIONS, {
    method: "GET",
  });
}

/**
 * Cancel a reservation by its numeric ID.
 *
 * Flips the row to `status: "cancelled"` (soft cancel) so the booking
 * remains in the audit trail. The backend accepts a status update via
 * PATCH and validates the transition from "active".
 */
export async function cancelReservation(id: number): Promise<Reservation> {
  return apiSendJson<Reservation>(
    API_ENDPOINTS.RESERVATION_STATUS(id),
    "PATCH",
    { status: RESERVATION_STATUS.CANCELLED },
  );
}

/**
 * Admin-only: hard-delete a reservation row by its numeric ID.
 *
 * Unlike `cancelReservation`, this removes the row entirely from the
 * database. Used by the admin dashboard's reservations table for the
 * "Delete" action in the destructive confirm dialog.
 */
export async function deleteReservation(id: number): Promise<void> {
  await apiFetch<void>(API_ENDPOINTS.RESERVATION_BY_ID(id), {
    method: "DELETE",
  });
}
