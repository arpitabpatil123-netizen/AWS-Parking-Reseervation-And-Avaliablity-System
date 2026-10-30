/**
 * Domain type contracts for parking zones.
 *
 * A ParkingZone represents a logical grouping of parking spots (e.g. an EV
 * charging bay, a covered garage floor, or an open-air general lot). The
 * `available_spots` field is the live, server-managed counter that powers
 * the dynamic capacity progress bars on the home page.
 *
 * `spot_holds` is a per-spot bitmap of length `total_capacity`: element i
 * is 1 when spot #i+1 is reserved (presentation-only) and 0 when it is
 * available. The home page renders this as a per-spot grid below the
 * aggregate progress bar.
 */

export type ZoneType = "general" | "ev_charging" | "covered";

/** Parking zone as returned by GET /zones and friends. */
export interface ParkingZone {
  id: number;
  name: string;
  location?: string;
  type: ZoneType;
  total_capacity: number;
  available_spots: number;
  emergency_closed?: boolean;
  emergency_closure_reason?: string;
  emergency_status?: "Emergency Active" | "Temporarily Unavailable" | "Blocked" | "Restored" | string;
  affected_spots?: number;
  /** Hourly price in Indian rupees (INR). */
  price_per_hour: number;
  /** Per-spot bitmap: 0 = available, 1 = reserved (held). */
  spot_holds: number[];
  created_at: string;
}

/** Payload used by POST /zones (admin-only endpoint). */
export interface CreateZonePayload {
  name: string;
  type: ZoneType;
  total_capacity: number;
  price_per_hour: number;
}
