import type { ParkingZone } from "./zone";
import type { User } from "./auth";
import type { Reservation } from "./reservation";

export type IncidentType =
  | "emergency_closure"
  | "blocked_space"
  | "vehicle_obstruction"
  | "maintenance"
  | "safety"
  | "other";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "in_progress" | "resolved" | "cancelled";

export interface Incident {
  id: number;
  zone_id: number;
  zone: ParkingZone;
  type: IncidentType;
  description: string;
  severity: IncidentSeverity;
  reported_by: number;
  reporter: User;
  status: IncidentStatus;
  closes_zone: boolean;
  resolution_notes?: string;
  resolved_at?: string;
  history?: IncidentHistoryEvent[];
  created_at: string;
  updated_at: string;
}

export interface IncidentHistoryEvent {
  id: number;
  incident_id: number;
  actor_id: number;
  actor?: User;
  action: string;
  details?: string;
  created_at: string;
}

export interface CreateIncidentPayload {
  zone_id: number;
  type: IncidentType;
  description: string;
  severity: IncidentSeverity;
  closes_zone: boolean;
  idempotency_key: string;
}

export interface Notification {
  id: number;
  user_id: number;
  incident_id: number;
  reservation_id?: number;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface IncidentFilters {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  type?: IncidentType;
  zone_id?: number;
}

export type AffectedReservation = Reservation;
