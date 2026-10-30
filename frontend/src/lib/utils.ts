import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { INDIA_CURRENCY, INDIA_LOCALE } from "./constants";

/**
 * Shadcn-style classnames helper.
 *
 * Combines `clsx` (conditional classes) with `tailwind-merge` (resolves
 * conflicting Tailwind utilities so the LAST one wins). Used by every
 * UI primitive in `src/components/ui/`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* -------------------------------------------------------------------------- */
/* Currency formatting                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Format a numeric INR price as `₹5.50/hr`.
 *
 * Renders exactly two decimal places and appends `/hr`. Behaviour
 * Uses Indian number grouping and keeps two decimal places for paise.
 */
const hourlyPriceFormatter = new Intl.NumberFormat(INDIA_LOCALE, {
  style: "currency",
  currency: INDIA_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPricePerHour(value: number): string {
  return `${hourlyPriceFormatter.format(value)}/hr`;
}

/* -------------------------------------------------------------------------- */
/* Capacity calculations                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Compute the fill percentage of a parking zone as a number in `[0, 100]`.
 *
 * Behaviour:
 *   - Negative `total` is coerced to 0 (defensive — backend always
 *     sends non-negative integers, but TypeScript can't enforce that).
 *   - When `total` is 0 the function returns 0 (avoids `NaN`).
 *   - When `available` exceeds `total` (corrupt payload), the result is
 *     capped at 100 so the progress bar never overflows.
 *
 * Used by `ZoneCard.astro` (full-fraction) and `OverviewDashboard.tsx`
 * (occupied-fraction — see `capacityOccupancyPercent` below).
 */
export function capacityFillPercent(
  total: number,
  available: number,
): number {
  const safeTotal = Math.max(0, total);
  if (safeTotal === 0) return 0;
  const safeAvailable = Math.max(0, Math.min(available, safeTotal));
  return Math.min(100, (safeAvailable / safeTotal) * 100);
}

/**
 * Compute the OCCUPIED percentage of a parking zone as a number in `[0, 100]`.
 *
 * This is the complement of `capacityFillPercent` — used by the admin
 * "Top Zones" leaderboard (`OverviewDashboard.tsx`) which ranks zones by
 * occupancy rather than availability.
 */
export function capacityOccupancyPercent(
  total: number,
  available: number,
): number {
  const safeTotal = Math.max(0, total);
  if (safeTotal === 0) return 0;
  const used = Math.max(0, safeTotal - Math.max(0, available));
  return Math.min(100, Math.round((used / safeTotal) * 100));
}

/* -------------------------------------------------------------------------- */
/* Reservation status helpers                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Type guard that returns true when the given status corresponds to a
 * booking the driver can still cancel (`active`). Centralized so the
 * Cancel button visibility check stays consistent across cards, tables,
 * and dashboards.
 */
export function isActiveReservationStatus(
  status: string | null | undefined,
): boolean {
  return status === "active";
}

/* -------------------------------------------------------------------------- */
/* Zone location helper                                                       */
/* -------------------------------------------------------------------------- */

const KNOWN_LOCATIONS: Record<string, string> = {
  "Kempegowda Airport T1 EV Charging Hub": "Kempegowda Airport Terminal 1, Devanahalli",
  "Kempegowda Airport T1 General Parking": "Kempegowda Airport Terminal 1, Devanahalli",
  "Kempegowda Airport T1 Covered Deck": "Kempegowda Airport Terminal 1, Devanahalli",
  "Kempegowda Airport T2 EV Bay": "Kempegowda Airport Terminal 2, Devanahalli",
  "Kempegowda Airport T2 Open Parking": "Kempegowda Airport Terminal 2, Devanahalli",
  "Orion Mall Rajajinagar EV Charging": "Orion Mall, Rajajinagar",
  "Orion Mall Rajajinagar General Parking": "Orion Mall, Rajajinagar",
  "Orion Mall Rajajinagar Underground P-1": "Orion Mall, Rajajinagar",
  "BIEC Tumakuru Road EV Stalls": "BIEC, Tumakuru Road",
  "BIEC Tumakuru Road Covered Parking": "BIEC, Tumakuru Road",
  "Chinnaswamy Stadium EV Parking": "Chinnaswamy Stadium, MG Road",
  "Chinnaswamy Stadium North Covered Parking": "Chinnaswamy Stadium, MG Road",
  "Manyata Tech Park Nagawara EV Plaza": "Manyata Tech Park, Nagawara",
  "Bellandur EV Charge Point": "Outer Ring Road, Bellandur",
  "Vidhana Soudha EV Priority Parking": "Ambedkar Veedhi, Central Bengaluru",
  "Manipal Hospital Old Airport Road EV Bay": "Old Airport Road, Kodihalli",
  "Manipal Hospital Old Airport Road Covered Garage": "Old Airport Road, Kodihalli",
  "IISc Bengaluru EV Fast Charge": "CV Raman Road, Mathikere",
  "NICE Road Electronic City EV Station": "NICE Road, Electronic City Phase 1",
  "UB City CBD EV Charging": "UB City, Vittal Mallya Road",
  "UB City Covered Garage": "UB City, Vittal Mallya Road",
  "Kanteerava Stadium EV Lot": "Kasturba Road, Sampangi Rama Nagar",
  "Phoenix Marketcity Mahadevapura EV Corner": "Phoenix Marketcity, Mahadevapura",
  "Phoenix Marketcity Mahadevapura Underground P-2": "Phoenix Marketcity, Mahadevapura",
  "Forum South Bengaluru EV Charging": "Forum South Mall, Kanakapura Road",
  "MG Road Street Parking": "MG Road Boulevard",
  "MG Road Metro Multi-Level Parking": "MG Road Metro Station",
  "KR Market Parking Lot": "KR Market, Kalasipalya",
  "KSR Bengaluru City Station North Lot": "KSR Railway Station, Majestic",
  "Majestic Bus Stand Long Stay Parking": "Kempegowda Bus Station, Majestic",
  "Bengaluru Palace Grounds Event Parking": "Palace Grounds, Jayamahal",
  "Sankey Tank Open Lot": "Sankey Tank, Sadashivanagar",
  "Jayanagar 4th Block Community Parking": "4th Block, Jayanagar",
  "Brigade Road Parking": "Brigade Road Commercial Hub",
  "Brigade Road Covered Garage": "Brigade Road Commercial Hub",
  "Cubbon Park Parking": "Cubbon Park, Kasturba Road",
  "Koramangala 5th Block Parking": "5th Block, Koramangala",
  "Yelahanka Town Parking": "Yelahanka Old Town",
  "Peenya Industrial Area Parking": "Peenya Industrial Area Phase 1",
  "Mysuru Palace Covered Parking": "Mysuru Palace, Varaha Gate",
};

const LOCATION_SUFFIXES = [
  " EV Charging Hub", " EV Charging", " EV Stalls", " EV Bay", " EV Parking", " EV Plaza",
  " EV Charge Point", " EV Priority Parking", " EV Fast Charge", " EV Station", " EV Lot",
  " EV Corner", " General Parking", " Open Parking", " Street Parking", " Parking Lot",
  " North Lot", " Long Stay Parking", " Event Parking", " Open Lot", " Community Parking",
  " Parking", " Covered Garage", " Multi-Level Parking", " Underground P-1", " Underground P-2",
  " Covered Deck", " Covered Parking",
];

export function getZoneLocation(zone: { name?: string; location?: string } | null | undefined): string {
  if (!zone) return "Bengaluru, Karnataka";
  if (zone.location && zone.location.trim().length > 0) {
    return zone.location;
  }
  const name = zone.name ?? "";
  if (KNOWN_LOCATIONS[name]) {
    return KNOWN_LOCATIONS[name];
  }
  let clean = name;
  for (const suffix of LOCATION_SUFFIXES) {
    if (clean.endsWith(suffix)) {
      clean = clean.slice(0, -suffix.length);
      break;
    }
  }
  if (clean.trim()) {
    return `${clean.trim()}, Bengaluru`;
  }
  return "Bengaluru, Karnataka";
}
