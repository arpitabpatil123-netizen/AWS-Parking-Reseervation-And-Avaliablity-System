import { API_ENDPOINTS } from "../lib/constants";
import type {
  AffectedReservation,
  CreateIncidentPayload,
  Incident,
  IncidentFilters,
  IncidentStatus,
  Notification,
} from "../types/incident";
import { apiFetch, apiSendJson } from "./api";

export async function listIncidents(filters: IncidentFilters = {}): Promise<Incident[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return apiFetch<Incident[]>(`${API_ENDPOINTS.INCIDENTS}${query ? `?${query}` : ""}`);
}

export async function createIncident(payload: CreateIncidentPayload): Promise<Incident> {
  return apiSendJson<Incident>(API_ENDPOINTS.INCIDENTS, "POST", payload);
}

export async function updateIncidentStatus(
  id: number,
  status: IncidentStatus,
  resolution_notes: string,
): Promise<Incident> {
  return apiSendJson<Incident>(API_ENDPOINTS.INCIDENT_STATUS(id), "PATCH", {
    status,
    resolution_notes,
  });
}

export async function getAffectedReservations(id: number): Promise<AffectedReservation[]> {
  return apiFetch<AffectedReservation[]>(API_ENDPOINTS.INCIDENT_AFFECTED_RESERVATIONS(id));
}

export async function getMyNotifications(): Promise<Notification[]> {
  return apiFetch<Notification[]>(API_ENDPOINTS.NOTIFICATIONS_MINE);
}

export async function markNotificationRead(id: number): Promise<Notification> {
  return apiSendJson<Notification>(API_ENDPOINTS.NOTIFICATION_READ(id), "PATCH", {});
}
