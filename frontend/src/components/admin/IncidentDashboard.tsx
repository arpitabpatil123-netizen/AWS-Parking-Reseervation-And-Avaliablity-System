import React from "react";

import { getZones } from "@/services/zoneService";
import {
  createIncident,
  getAffectedReservations,
  listIncidents,
  updateIncidentStatus,
} from "@/services/incidentService";
import { isAuthenticated, getUser } from "@/store/authStore";
import { toast } from "@/lib/toast";
import type { ParkingZone } from "@/types/zone";
import type {
  AffectedReservation,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from "@/types/incident";

const incidentTypes: { value: IncidentType; label: string }[] = [
  { value: "emergency_closure", label: "Emergency closure" },
  { value: "blocked_space", label: "Blocked parking space" },
  { value: "vehicle_obstruction", label: "Vehicle obstruction" },
  { value: "maintenance", label: "Maintenance" },
  { value: "safety", label: "Safety-related incident" },
  { value: "other", label: "Other" },
];

const statusLabels: Record<IncidentStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

const severityLabels: Record<IncidentSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const buttonClass =
  "inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50";

export function IncidentDashboard() {
  const [zones, setZones] = React.useState<ParkingZone[]>([]);
  const [incidents, setIncidents] = React.useState<Incident[]>([]);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [severityFilter, setSeverityFilter] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("");
  const [zoneFilter, setZoneFilter] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [updatingIncident, setUpdatingIncident] = React.useState<number | null>(null);
  const [error, setError] = React.useState("");
  const [zoneId, setZoneId] = React.useState("");
  const [type, setType] = React.useState<IncidentType>("emergency_closure");
  const [severity, setSeverity] = React.useState<IncidentSeverity>("high");
  const [description, setDescription] = React.useState("");
  const [closesZone, setClosesZone] = React.useState(false);
  const [notes, setNotes] = React.useState<Record<number, string>>({});
  const [nextStatus, setNextStatus] = React.useState<Record<number, IncidentStatus>>({});
  const [affected, setAffected] = React.useState<Record<number, AffectedReservation[]>>({});
  const pendingIdempotencyKey = React.useRef("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const filters = {
        ...(statusFilter ? { status: statusFilter as IncidentStatus } : {}),
        ...(severityFilter ? { severity: severityFilter as IncidentSeverity } : {}),
        ...(typeFilter ? { type: typeFilter as IncidentType } : {}),
        ...(zoneFilter ? { zone_id: Number(zoneFilter) } : {}),
      };
      const [incidentRows, zoneRows] = await Promise.all([
        listIncidents(filters),
        getZones(),
      ]);
      setIncidents(incidentRows);
      setZones(zoneRows);
      if (!zoneId && zoneRows.length > 0) setZoneId(String(zoneRows[0].id));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load incidents.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, typeFilter, zoneFilter, zoneId]);

  React.useEffect(() => {
    const user = getUser();
    if (!isAuthenticated()) {
      window.location.assign("/login");
      return;
    }
    if (user?.role !== "admin" && user?.role !== "staff") {
      setError("Only authorized staff can manage incidents.");
      return;
    }
    void load();
  }, [load]);

  async function submitIncident(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!zoneId) {
      setError("Create or select a parking zone before reporting an incident.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (!pendingIdempotencyKey.current) {
        pendingIdempotencyKey.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      await createIncident({
        zone_id: Number(zoneId),
        type,
        description: description.trim(),
        severity,
        closes_zone: closesZone || type === "emergency_closure",
        idempotency_key: pendingIdempotencyKey.current,
      });
      pendingIdempotencyKey.current = "";
      setDescription("");
      toast.success("Incident reported. Affected drivers have been notified.");
      await load();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Could not report incident.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function saveStatus(incident: Incident) {
    const status = nextStatus[incident.id] ?? incident.status;
    if (status === incident.status && (notes[incident.id] ?? incident.resolution_notes ?? "") === (incident.resolution_notes ?? "")) {
      return;
    }
    if (
      incident.closes_zone &&
      (status === "resolved" || status === "cancelled") &&
      !window.confirm("Resolve this incident and reopen the zone if no other active closure remains?")
    ) {
      return;
    }
    if (
      incident.closes_zone &&
      (incident.status === "resolved" || incident.status === "cancelled") &&
      (status === "open" || status === "in_progress") &&
      !window.confirm("Reopen this incident and temporarily close the zone again?")
    ) {
      return;
    }
    setUpdatingIncident(incident.id);
    try {
      await updateIncidentStatus(incident.id, status, notes[incident.id] ?? incident.resolution_notes ?? "");
      toast.success("Incident updated.");
      await load();
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Could not update incident.";
      setError(message);
      toast.error(message);
    } finally {
      setUpdatingIncident(null);
    }
  }

  async function toggleAffected(incidentID: number) {
    if (affected[incidentID]) {
      setAffected((current) => {
        const next = { ...current };
        delete next[incidentID];
        return next;
      });
      return;
    }
    try {
      const rows = await getAffectedReservations(incidentID);
      setAffected((current) => ({ ...current, [incidentID]: rows }));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load affected bookings.";
      setError(message);
    }
  }

  const activeClosures = incidents.filter(
    (incident) =>
      incident.closes_zone &&
      (incident.status === "open" || incident.status === "in_progress"),
  ).length;

  return (
    <div className="space-y-6">
      {!isAuthenticated() || (getUser()?.role !== "admin" && getUser()?.role !== "staff") ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-700 dark:text-red-200">
          {error || "You do not have permission to access incident management."}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">Active incidents</p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{incidents.filter((item) => item.status === "open" || item.status === "in_progress").length}</p>
            </section>
            <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 shadow-sm">
              <p className="text-sm text-red-700 dark:text-red-300">Active zone closures</p>
              <p className="mt-2 text-3xl font-bold text-red-800 dark:text-red-200">{activeClosures}</p>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Report an incident</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Affected drivers with active reservations in the zone will receive an in-app notification.</p>
            </div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={submitIncident}>
              <label className="space-y-1.5 text-sm font-medium">
                Parking zone
                <select className={inputClass} value={zoneId} onChange={(event) => setZoneId(event.target.value)} required>
                  {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} (#{zone.id})</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Incident type
                <select className={inputClass} value={type} onChange={(event) => setType(event.target.value as IncidentType)}>
                  {incidentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Severity
                <select className={inputClass} value={severity} onChange={(event) => setSeverity(event.target.value as IncidentSeverity)}>
                  {(["low", "medium", "high", "critical"] as IncidentSeverity[]).map((value) => <option key={value} value={value}>{severityLabels[value]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                <input type="checkbox" checked={closesZone || type === "emergency_closure"} disabled={type === "emergency_closure"} onChange={(event) => setClosesZone(event.target.checked)} />
                Temporarily close this zone
              </label>
              <label className="space-y-1.5 text-sm font-medium md:col-span-2">
                Description
                <textarea className={inputClass} rows={3} minLength={5} maxLength={2000} required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the incident and any action needed." />
              </label>
              {error && <p role="alert" className="text-sm text-red-600 md:col-span-2">{error}</p>}
              <div className="md:col-span-2">
                <button className={buttonClass} type="submit" disabled={saving || zones.length === 0}>
                  {saving ? "Reporting…" : "Report incident"}
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Incident history</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Review, filter, and update reported incidents.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <select aria-label="Filter by status" className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select aria-label="Filter by severity" className={inputClass} value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
                  <option value="">All severity</option>
                  {Object.entries(severityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select aria-label="Filter by type" className={`${inputClass} col-span-2 sm:col-span-1`} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="">All types</option>
                  {incidentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select aria-label="Filter by zone" className={`${inputClass} col-span-2 sm:col-span-1`} value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}>
                  <option value="">All zones</option>
                  {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                </select>
              </div>
            </div>
            {loading ? (
              <div className="rounded-2xl border border-slate-200 p-6 text-sm text-slate-500 dark:border-slate-800">Loading incident records…</div>
            ) : incidents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No incidents match these filters.</div>
            ) : incidents.map((incident) => (
              <article key={incident.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{incidentTypes.find((item) => item.value === incident.type)?.label ?? incident.type} · {incident.zone?.name ?? `Zone #${incident.zone_id}`}</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{incident.description}</p>
                    <p className="mt-2 text-xs text-slate-500">Reported by {incident.reporter?.name ?? `user #${incident.reported_by}`} · {new Date(incident.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{severityLabels[incident.severity]}</span>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-300">{statusLabels[incident.status]}</span>
                    {incident.closes_zone && <span className="rounded-full bg-red-500/10 px-2.5 py-1 font-medium text-red-700 dark:text-red-300">Zone closure</span>}
                  </div>
                </div>
                {incident.history && incident.history.length > 0 && (
                  <details className="mt-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                    <summary className="cursor-pointer font-medium">Incident history ({incident.history.length})</summary>
                    <ol className="mt-3 space-y-2">
                      {incident.history.map((entry) => (
                        <li key={entry.id} className="border-l-2 border-emerald-500/40 pl-3">
                          <p className="font-medium">{entry.action.replace(/_/g, " ")} · {entry.actor?.name ?? `Staff #${entry.actor_id}`}</p>
                          {entry.details && <p className="mt-0.5 text-slate-500">{entry.details}</p>}
                          <time className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleString()}</time>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.5fr_auto_auto]">
                  <select
                    aria-label={`Update status for incident ${incident.id}`}
                    className={inputClass}
                    value={nextStatus[incident.id] ?? incident.status}
                    onChange={(event) => setNextStatus((current) => ({ ...current, [incident.id]: event.target.value as IncidentStatus }))}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <input
                    className={inputClass}
                    maxLength={5000}
                    placeholder="Resolution or progress notes"
                    value={notes[incident.id] ?? incident.resolution_notes ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [incident.id]: event.target.value }))}
                  />
                  <button type="button" className={buttonClass} disabled={updatingIncident === incident.id} onClick={() => void saveStatus(incident)}>
                    {updatingIncident === incident.id ? "Saving…" : "Save update"}
                  </button>
                  <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-700" onClick={() => void toggleAffected(incident.id)}>
                    {affected[incident.id] ? "Hide bookings" : "Affected bookings"}
                  </button>
                </div>
                {affected[incident.id] && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
                    <h4 className="font-semibold">Active bookings in this zone</h4>
                    {affected[incident.id].length === 0 ? (
                      <p className="mt-2 text-slate-500">No active bookings are currently affected.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {affected[incident.id].map((reservation) => (
                          <li key={reservation.id} className="flex flex-wrap justify-between gap-2">
                            <span>Booking #{reservation.id} · {reservation.user?.name ?? "Driver"}</span>
                            <span className="text-slate-500">{reservation.license_plate}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
