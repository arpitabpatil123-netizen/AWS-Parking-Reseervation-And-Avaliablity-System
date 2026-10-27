/**
 * Mock dataset of 40 parking zones used for the frontend demo.
 *
 * The dataset is split across the three supported zone types and is
 * long-lived enough to exercise the catalog's filter / search / scroll
 * behavior end-to-end without touching the backend.
 *
 * Naming convention:
 *   - EV Charging zones: Bengaluru airport, malls, hospitals, and tech parks
 *   - General zones: Bengaluru transit hubs, business districts, and parking lots
 *   - Covered zones: Bengaluru garages and Karnataka landmarks
 *
 * Prices are in INR per hour. Capacities range from 12 to 60 spots per zone.
 *
 * Each zone's `available_spots` is mutated at runtime by the
 * `availabilityRotator` in `src/services/mockZoneData.ts` so the
 * catalog stays fresh on a 1-hour rotation cadence.
 */

import type { ParkingZone, ZoneType } from "../types/zone";

/**
 * Build a stable Unix timestamp for the seed moment. Using `Date.now()`
 * at module load time is fine — the seed itself doesn't need to be
 * deterministic across builds, only the zone IDs and capacities.
 */
const SEED_TIMESTAMP = new Date("2026-01-15T08:00:00Z").toISOString();

interface ZoneSpec {
  name: string;
  type: ZoneType;
  total_capacity: number;
  price_per_hour: number;
}

/**
 * The 40 source-of-truth zone specifications. The numeric `id` and
 * initial `available_spots` are assigned below by `buildSeedZones()`
 * so we don't have to hand-author them.
 */
const ZONE_SPECS: ZoneSpec[] = [
  // ---------- EV Charging (15 zones) ----------
  { name: "Kempegowda Airport T1 EV Charging Hub", type: "ev_charging", total_capacity: 24, price_per_hour: 70 },
  { name: "Kempegowda Airport T2 EV Bay", type: "ev_charging", total_capacity: 18, price_per_hour: 70 },
  { name: "Orion Mall Rajajinagar EV Charging", type: "ev_charging", total_capacity: 32, price_per_hour: 35 },
  { name: "BIEC Tumakuru Road EV Stalls", type: "ev_charging", total_capacity: 20, price_per_hour: 40 },
  { name: "Chinnaswamy Stadium EV Parking", type: "ev_charging", total_capacity: 40, price_per_hour: 50 },
  { name: "Manyata Tech Park Nagawara EV Plaza", type: "ev_charging", total_capacity: 28, price_per_hour: 35 },
  { name: "Bellandur EV Charge Point", type: "ev_charging", total_capacity: 16, price_per_hour: 35 },
  { name: "Vidhana Soudha EV Priority Parking", type: "ev_charging", total_capacity: 12, price_per_hour: 40 },
  { name: "Manipal Hospital Old Airport Road EV Bay", type: "ev_charging", total_capacity: 14, price_per_hour: 80 },
  { name: "IISc Bengaluru EV Fast Charge", type: "ev_charging", total_capacity: 22, price_per_hour: 30 },
  { name: "NICE Road Electronic City EV Station", type: "ev_charging", total_capacity: 30, price_per_hour: 50 },
  { name: "UB City CBD EV Charging", type: "ev_charging", total_capacity: 18, price_per_hour: 80 },
  { name: "Kanteerava Stadium EV Lot", type: "ev_charging", total_capacity: 26, price_per_hour: 40 },
  { name: "Phoenix Marketcity Mahadevapura EV Corner", type: "ev_charging", total_capacity: 20, price_per_hour: 45 },
  { name: "Forum South Bengaluru EV Charging", type: "ev_charging", total_capacity: 16, price_per_hour: 40 },

  // ---------- General (15 zones) ----------
  { name: "Kempegowda Airport T1 General Parking", type: "general", total_capacity: 60, price_per_hour: 100 },
  { name: "Kempegowda Airport T2 Open Parking", type: "general", total_capacity: 48, price_per_hour: 100 },
  { name: "MG Road Street Parking", type: "general", total_capacity: 36, price_per_hour: 50 },
  { name: "KR Market Parking Lot", type: "general", total_capacity: 28, price_per_hour: 30 },
  { name: "KSR Bengaluru City Station North Lot", type: "general", total_capacity: 45, price_per_hour: 50 },
  { name: "Majestic Bus Stand Long Stay Parking", type: "general", total_capacity: 52, price_per_hour: 40 },
  { name: "Bengaluru Palace Grounds Event Parking", type: "general", total_capacity: 60, price_per_hour: 60 },
  { name: "Sankey Tank Open Lot", type: "general", total_capacity: 40, price_per_hour: 30 },
  { name: "Jayanagar 4th Block Community Parking", type: "general", total_capacity: 32, price_per_hour: 30 },
  { name: "Brigade Road Parking", type: "general", total_capacity: 38, price_per_hour: 50 },
  { name: "Orion Mall Rajajinagar General Parking", type: "general", total_capacity: 44, price_per_hour: 40 },
  { name: "Cubbon Park Parking", type: "general", total_capacity: 50, price_per_hour: 40 },
  { name: "Koramangala 5th Block Parking", type: "general", total_capacity: 34, price_per_hour: 40 },
  { name: "Yelahanka Town Parking", type: "general", total_capacity: 28, price_per_hour: 30 },
  { name: "Peenya Industrial Area Parking", type: "general", total_capacity: 42, price_per_hour: 30 },

  // ---------- Covered (10 zones) ----------
  { name: "Brigade Road Covered Garage", type: "covered", total_capacity: 50, price_per_hour: 80 },
  { name: "MG Road Metro Multi-Level Parking", type: "covered", total_capacity: 50, price_per_hour: 60 },
  { name: "Orion Mall Rajajinagar Underground P-1", type: "covered", total_capacity: 36, price_per_hour: 40 },
  { name: "Phoenix Marketcity Mahadevapura Underground P-2", type: "covered", total_capacity: 36, price_per_hour: 45 },
  { name: "UB City Covered Garage", type: "covered", total_capacity: 44, price_per_hour: 100 },
  { name: "Kempegowda Airport T1 Covered Deck", type: "covered", total_capacity: 60, price_per_hour: 150 },
  { name: "Manipal Hospital Old Airport Road Covered Garage", type: "covered", total_capacity: 32, price_per_hour: 80 },
  { name: "Chinnaswamy Stadium North Covered Parking", type: "covered", total_capacity: 40, price_per_hour: 80 },
  { name: "BIEC Tumakuru Road Covered Parking", type: "covered", total_capacity: 28, price_per_hour: 60 },
  { name: "Mysuru Palace Covered Parking", type: "covered", total_capacity: 22, price_per_hour: 40 },
];

/**
 * Build the seed zones with IDs and an initial "60% available" config:
 *   - 24 zones (60%) start with available_spots between 50% and 100% of capacity
 *   - 16 zones (40%) start full (available_spots = 0)
 *
 * The actual rotation behaviour is owned by `availabilityRotator`; this
 * seed is just the first paint.
 */
export function buildSeedZones(): ParkingZone[] {
  const total = ZONE_SPECS.length;
  const availableCount = Math.round(total * 0.6); // 24 zones available

  return ZONE_SPECS.map((spec, index) => {
    const isAvailable = index < availableCount;
    const available_spots = isAvailable
      ? Math.max(1, Math.round(spec.total_capacity * (0.5 + Math.random() * 0.5)))
      : 0;
    // Build a placeholder spot_holds array that matches total_capacity
    // so the type satisfies ParkingZone. The runtime layer
    // (mockZoneData.ts) regenerates spot_holds on first read so the
    // first paint shows realistic per-spot availability rather than
    // whatever we put here.
    const spot_holds: number[] = new Array(spec.total_capacity).fill(0);
    const zone: ParkingZone = {
      id: index + 1,
      name: spec.name,
      type: spec.type,
      total_capacity: spec.total_capacity,
      available_spots,
      price_per_hour: spec.price_per_hour,
      spot_holds,
      created_at: SEED_TIMESTAMP,
    };
    return zone;
  });
}

/**
 * The complete seed dataset. Exported as a frozen array so callers
 * can't accidentally mutate it — the live, mutable copy lives in
 * `mockZoneData.ts`.
 */
export const SEED_ZONES: readonly ParkingZone[] = Object.freeze(buildSeedZones());

/**
 * Number of zones in the seed dataset. Exported so the rotator can
 * compute the 60% / 40% split without hard-coding 40.
 */
export const TOTAL_ZONE_COUNT: number = SEED_ZONES.length;
