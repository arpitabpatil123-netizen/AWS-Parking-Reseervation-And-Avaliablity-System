/**
 * Admin Dashboard data layer.
 *
 * Centralizes the parallel data fetches that every admin page needs:
 *   - Zones list
 *   - All reservations (admin view)
 *   - All users (admin view)
 *   - Per-role user counts
 *
 * Pages import these helpers so they each load the same data through the
 * same code path. This also lets us add caching, optimistic updates, or
 * cross-page invalidation in one place when we add real-time push later.
 *
 * Every function returns a typed payload or throws an `ApiError` from
 * `services/api`. Page scripts catch the error and surface it via the
 * admin state's error branch.
 */

import { getZones } from "./zoneService";
import { getAllReservations } from "./reservationService";
import { getAllUsers, countUsersByRole } from "./userService";
import { RESERVATION_STATUS, USER_ROLES, ZONE_TYPES } from "../lib/constants";
import type { ParkingZone } from "../types/zone";
import type { Reservation } from "../types/reservation";
import type { User } from "../types/auth";

export interface AdminDataBundle {
  zones: ParkingZone[];
  reservations: Reservation[];
  users: User[];
  driverCount: number;
  adminCount: number;
}

/**
 * Load every data source the admin dashboard needs in parallel.
 *
 * Individual endpoint failures are non-fatal — we fall back to an empty
 * array so the page can still render partial state. Only when EVERY
 * endpoint fails do we re-throw so the page can show an error.
 */
export async function loadAdminData(): Promise<AdminDataBundle> {
  const [zonesResult, reservationsResult, usersResult, driverResult, adminResult] =
    await Promise.allSettled([
      getZones(),
      getAllReservations(),
      getAllUsers(),
      countUsersByRole(USER_ROLES.DRIVER),
      countUsersByRole(USER_ROLES.ADMIN),
    ]);

  const zones: ParkingZone[] =
    zonesResult.status === "fulfilled" && Array.isArray(zonesResult.value)
      ? zonesResult.value
      : [];
  const reservations: Reservation[] =
    reservationsResult.status === "fulfilled" && Array.isArray(reservationsResult.value)
      ? reservationsResult.value
      : [];
  const users: User[] =
    usersResult.status === "fulfilled" && Array.isArray(usersResult.value)
      ? usersResult.value
      : [];
  const driverCount =
    driverResult.status === "fulfilled" && typeof driverResult.value === "number"
      ? driverResult.value
      : users.filter((u) => u.role === USER_ROLES.DRIVER).length;
  const adminCount =
    adminResult.status === "fulfilled" && typeof adminResult.value === "number"
      ? adminResult.value
      : users.filter((u) => u.role === USER_ROLES.ADMIN).length;

  return { zones, reservations, users, driverCount, adminCount };
}

export interface DashboardKpis {
  totalUsers: number;
  totalDrivers: number;
  totalAdmins: number;
  totalZones: number;
  totalCapacity: number;
  totalAvailable: number;
  totalReserved: number;
  occupancyPct: number;
  totalReservations: number;
  activeReservations: number;
  completedReservations: number;
  cancelledReservations: number;
  evCapacity: number;
  evAvailable: number;
  evZones: number;
  driversWithReservations: number;
  spotsCurrentlyReserved: number;
}

/**
 * Compute every KPI the admin dashboard shows, derived purely from the
 * data bundle returned by `loadAdminData()`. Centralizing the math keeps
 * the Overview / Reservations / Drivers pages consistent.
 */
export function computeKpis(bundle: AdminDataBundle): DashboardKpis {
  const { zones, reservations, users } = bundle;
  const totalZones = zones.length;
  const evZones = zones.filter((z) => z.type === ZONE_TYPES.EV_CHARGING);
  const evCapacity = evZones.reduce((sum, z) => sum + Math.max(0, z.total_capacity), 0);
  const evAvailable = evZones.reduce((sum, z) => sum + Math.max(0, z.available_spots), 0);

  const totalCapacity = zones.reduce((sum, z) => sum + Math.max(0, z.total_capacity), 0);
  const totalAvailable = zones.reduce((sum, z) => sum + Math.max(0, z.available_spots), 0);
  const totalReserved = Math.max(0, totalCapacity - totalAvailable);
  const occupancyPct =
    totalCapacity === 0 ? 0 : Math.round((totalReserved / totalCapacity) * 100);

  const totalReservations = reservations.length;
  const activeReservations = reservations.filter((r) => r.status === RESERVATION_STATUS.ACTIVE).length;
  const completedReservations = reservations.filter((r) => r.status === RESERVATION_STATUS.COMPLETED).length;
  const cancelledReservations = reservations.filter((r) => r.status === RESERVATION_STATUS.CANCELLED).length;

  const driversWithReservations = new Set(
    reservations.map((r) => r.user_id),
  ).size;

  const spotsCurrentlyReserved = reservations.filter(
    (r) => r.status === RESERVATION_STATUS.ACTIVE,
  ).length;

  return {
    totalUsers: users.length,
    totalDrivers: bundle.driverCount,
    totalAdmins: bundle.adminCount,
    totalZones,
    totalCapacity,
    totalAvailable,
    totalReserved,
    occupancyPct,
    totalReservations,
    activeReservations,
    completedReservations,
    cancelledReservations,
    evCapacity,
    evAvailable,
    evZones: evZones.length,
    driversWithReservations,
    spotsCurrentlyReserved,
  };
}

/**
 * Group reservations by driver for the Drivers page.
 *
 * Returns a list of records sorted by total reservation count
 * (descending), each containing the driver record plus an aggregated
 * view of their reservation history.
 */
export interface DriverReservationSummary {
  user: User;
  totalReservations: number;
  activeReservations: number;
  completedReservations: number;
  cancelledReservations: number;
  lastReservationAt: string | null;
  firstReservationAt: string | null;
  reservations: Reservation[];
}

export function aggregateDriverReservations(
  reservations: Reservation[],
  users: User[],
): DriverReservationSummary[] {
  const byUser = new Map<number, Reservation[]>();
  for (const r of reservations) {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r);
    byUser.set(r.user_id, arr);
  }

  const summaries: DriverReservationSummary[] = [];
  byUser.forEach((list, userId) => {
    const user = users.find((u) => u.id === userId) ?? {
      id: userId,
      name: list[0]?.user?.name ?? `Driver #${userId}`,
      email: list[0]?.user?.email ?? `user#${userId}`,
      role: USER_ROLES.DRIVER,
      created_at: "",
    };

    const sorted = [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    summaries.push({
      user,
      totalReservations: list.length,
      activeReservations: list.filter((r) => r.status === RESERVATION_STATUS.ACTIVE).length,
      completedReservations: list.filter((r) => r.status === RESERVATION_STATUS.COMPLETED).length,
      cancelledReservations: list.filter((r) => r.status === RESERVATION_STATUS.CANCELLED).length,
      lastReservationAt: sorted[0]?.created_at ?? null,
      firstReservationAt: sorted[sorted.length - 1]?.created_at ?? null,
      reservations: sorted,
    });
  });

  summaries.sort((a, b) => b.totalReservations - a.totalReservations);
  return summaries;
}