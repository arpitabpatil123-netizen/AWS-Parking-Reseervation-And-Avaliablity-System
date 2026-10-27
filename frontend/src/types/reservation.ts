/**
 * Domain type contracts for reservations (a.k.a. bookings).
 *
 * A Reservation is the link between a User and a ParkingZone and represents
 * a locked-in spot. The backend enforces concurrency safety — if the zone is
 * full at the moment of creation the API returns HTTP 409, which the
 * reservationService surfaces as a typed error so the UI can render a
 * friendly toast.
 */

import type { ParkingZone } from "./zone";
import type { User } from "./auth";

export type ReservationStatus = "active" | "completed" | "cancelled";

/** Full reservation record as returned by GET /reservations/me and GET /reservations. */
export interface Reservation {
  id: number;
  user_id: number;
  zone_id: number;
  license_plate: string;
  status: ReservationStatus;
  zone?: ParkingZone;
  user?: User;
  created_at: string;
}

/** Payload used by POST /reservations to lock in a spot. */
export interface CreateReservationPayload {
  zone_id: number;
  license_plate: string;
}
