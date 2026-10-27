# Summary: Per-Spot Availability with Random Reservation

## 1. Feature Overview

Currently every spot in a zone is shown as available because the codebase does **not model individual spots**. A `ParkingZone` only stores `total_capacity` and a derived `available_spots` integer. The frontend displays an aggregate progress bar (e.g. "X of Y spots available"), not per-spot status.

We want to introduce a per-spot concept so that, in a zone of 18 spots, only 9–11 are shown as available and the rest are reserved. The number of available spots must be **random per zone** and **persist across refreshes** until something explicitly changes it (a real reservation, a rotation tick, or an admin action).

---

## 2. Design Decisions to Lock Before Implementation

1. **Where the per-spot state lives** — two viable approaches, pick one:
   - **A. New `Spot` table** with `(id, zone_id, spot_number, status)` where `status ∈ {available, reserved}`. Cleanest for future expansion (assigning specific spots to reservations), but requires schema migration and a JOIN in the catalog query.
   - **B. Add a per-zone `spot_holds INTEGER[]` column** on `parking_zones`. Each element is `1` (held/reserved) or `0` (available). Simplest change, no new table, but loses queryability.
   - **Recommendation:** Start with **B** for shipping speed, but isolate it behind a repository function so it can be swapped for **A** later.

2. **How availability is computed**
   - `available_spots = total_capacity - SUM(spot_holds) - COUNT(active_reservations)` (reserved spots are *additional* to real reservations, not a replacement).
   - This keeps the math additive and matches the existing SQL pattern.

3. **Reserved spots are virtual** — they do **not** create reservation rows, do not consume license plates, do not show up in `/reservations/mine`. They are a presentation/simulation layer on top of real availability.

4. **Random range** — for a zone of `N` total spots, reserve a random integer in `[floor(N/2), ceil(N*0.6)]` (i.e. roughly half to 60% held, leaving 40–50% available). For N=18 this gives available ∈ [8, 11], which matches the requested "9–11" feel.

5. **When is randomization triggered?**
   - On zone creation (admin POST).
   - On zone update that changes `total_capacity`.
   - On every rotation tick (1h, alongside the existing 60/40 zone-level rotation). The per-spot shuffle re-randomizes which specific positions are held.
   - **Not** on every read — that would defeat persistence and cause flicker.

---

## 3. Backend Changes

### 3.1 Model — `backend/internal/models/parking_zone.go`

Add a `SpotHolds pq.Int64Array `gorm:"type:integer[];not null;default:'{}'" json:"spot_holds"` field to `ParkingZone`. Length must always equal `TotalCapacity`.

Use `pq.Int64Array` (from `github.com/lib/pq`) — already a dependency of GORM/pgx.

### 3.2 DTO — `backend/internal/dto/zone_dto.go`

Add to `ZoneResponse`:
```go
SpotHolds []int64 `json:"spot_holds"` // 0 = available, 1 = reserved
```
`AvailableSpots int json:"available_spots"` stays, but is now computed differently.

### 3.3 Repository — `backend/internal/repository/zone_repository.go`

- Update `FindAllWithAvailability` and `FindByIDWithAvailability` so availability is:
  ```
  available_spots = max(0, total_capacity - len(spot_holds) - active_reservations)
  ```
  Doing it post-SQL (in Go after SELECT) is cleaner than SQL array length math.

- Add `EnsureSpotHoldsLength(zoneID)` helper that runs on every read — guarantees `len(spot_holds) == total_capacity`. If not, regenerates the slice in place (with a fresh random hold count) and persists.

- Add `RegenerateSpotHolds(zoneID)` that:
  1. Reads `total_capacity`.
  2. Computes `holdCount = randInt(floor(N/2), ceil(N*0.6))`.
  3. Creates an `int64` slice of length N, randomizes it (Fisher-Yates using `*rand.Rand`), marks the first `holdCount` entries as `1`, rest `0`.
  4. Persists.

### 3.4 Service — `backend/internal/service/zone_service.go`

- On `Create()` and `Update()` (when `TotalCapacity` changes): call `RegenerateSpotHolds(zoneID)` before returning.
- On `ListWithAvailability` / `GetByIDWithAvailability`: call `EnsureSpotHoldsLength` for every returned zone. (Cheap if already correct.)

### 3.5 Seeder — `backend/internal/seeder/zone_seeder.go`

After inserting each zone in `SeedIfNeeded`, call `RegenerateSpotHolds` for that zone. Fresh DBs get random holds on first boot.

### 3.6 Rotator — `backend/internal/seeder/rotator.go`

Extend `RotateOnce()`:
- After the existing 60/40 zone-level flip, also call `RegenerateSpotHolds` on every zone. The specific reserved positions churn every hour even when zone-level availability didn't flip.

Reuse the existing `r.rng` and existing `shuffleLocked` pattern (Fisher-Yates), no new dependencies.

### 3.7 Reservation flow — `backend/internal/repository/reservation_repository.go`

No structural change. Reservations still consume against `available_spots`, which is now `= total_capacity - holds - active_reservations`. Update the existing capacity check in `CreateWithCapacityCheck`:
```go
if activeCount + holdCount >= total_capacity { return ErrZoneFull }
```

### 3.8 Migration

This codebase uses GORM auto-migration (no SQL files). Adding `SpotHolds pq.Int64Array `gorm:"type:integer[]"` will be applied automatically. Verify with `gorm.AutoMigrate`.

---

## 4. Frontend Changes

### 4.1 Types — `frontend/src/types/zone.ts`

Add to `ParkingZone`:
```ts
spot_holds: number[]; // length === total_capacity; 0 = available, 1 = reserved
```

### 4.2 Service — `frontend/src/services/zoneService.ts`

No URL changes. Extend the type and `getZones()` will receive the new field automatically.

### 4.3 Mock fallback — `frontend/src/services/mockZoneData.ts`

Update `pickAvailableSpots` to use the new range (`floor(N/2)` to `ceil(N*0.6)`), and add a sibling:
```ts
function generateSpotHolds(totalCapacity: number): number[]
```
that builds the array using the same Fisher-Yates pattern already present. Wire it into `buildSeedZones` and `rotateAvailability`.

### 4.4 ZoneCard — `frontend/src/components/ZoneCard.astro`

Currently the card shows only "X of Y spots available" + a progress bar. New behavior:

- Add a **per-spot grid** below the existing aggregate row:
  - Grid of `total_capacity` cells (configurable columns, e.g. `grid-cols-9`).
  - Each cell colored: green for available (0), gray/red for reserved (1).
  - Each cell has a tooltip with "Spot #N — Available/Reserved".
- Keep the existing aggregate row and progress bar — they remain the at-a-glance indicator.
- When `spot_holds` is missing (e.g. old data) or wrong length, gracefully fall back to the old all-available behavior for that one card.

### 4.5 Client refresh — `frontend/src/scripts/home/catalogRefresh.ts`

The `cardHtml()` function must mirror the new markup **byte-for-byte** to match `ZoneCard.astro`. Add the spot-grid rendering to both. Otherwise the client repaint after `spotsync:zones-rotated` will diverge from the SSR.

### 4.6 Catalog sort — `frontend/src/components/home/ZoneCatalogSection.astro`

Existing sort puts available zones first. Keep it; `available_spots` semantics unchanged.

### 4.7 Admin zones — `frontend/src/components/admin/ZonesGrid.tsx`

Optionally add a "Shuffle reserved spots" button per row that calls a new admin endpoint (`POST /api/v1/zones/:id/regenerate-spot-holds`). Skip in v1 if scope is tight.

---

## 5. API Behavior Changes

| Endpoint | Before | After |
|---|---|---|
| `GET /api/v1/zones` | `{id, name, total_capacity, available_spots, …}` | Same + `spot_holds: number[]` |
| `GET /api/v1/zones/:id` | Same | Same |
| `POST /api/v1/zones` | Returns zone, no holds | Returns zone with fresh randomized `spot_holds` |
| `PUT /api/v1/zones/:id` | Update fields | If `total_capacity` changes, regenerate `spot_holds`; otherwise leave existing holds in place |
| `POST /api/v1/reservations` | Fails if activeReservations == totalCapacity | Fails if activeReservations + holds >= totalCapacity |

---

## 6. Edge Cases to Handle

1. **`spot_holds` length mismatch with `total_capacity`** — backfill via `EnsureSpotHoldsLength` on read; never throw, just regenerate.
2. **`total_capacity = 0`** — `spot_holds` is empty array; grid renders nothing; `available_spots = 0`.
3. **All spots reserved** — `available_spots = 0`, grid is all gray, status pill shows "Full", reserve button disabled (existing behavior).
4. **Rotation tick while reservations are active** — reserved (held) spots and active reservations are independent layers; rotation regenerates holds but does not touch real reservations. Available count may dip below zero in edge math — clamp with `GREATEST(0, …)`.
5. **Backward compat** — existing DB rows have no `spot_holds`. First read triggers backfill for each row. Acceptable one-time cost.

---

## 7. Files to Touch

**Backend (Go):**
- `backend/internal/models/parking_zone.go`
- `backend/internal/dto/zone_dto.go`
- `backend/internal/repository/zone_repository.go`
- `backend/internal/repository/reservation_repository.go`
- `backend/internal/service/zone_service.go`
- `backend/internal/seeder/zone_seeder.go`
- `backend/internal/seeder/rotator.go`

**Frontend (Astro/React):**
- `frontend/src/types/zone.ts`
- `frontend/src/services/mockZoneData.ts`
- `frontend/src/data/zones.ts`
- `frontend/src/components/ZoneCard.astro`
- `frontend/src/scripts/home/catalogRefresh.ts`

**No new files required** unless you opt for the admin shuffle endpoint.

---

## 8. Open Questions for Reviewer

1. **Storage strategy (A vs B above)** — confirm B (`integer[]` column) is acceptable, or insist on A (new `Spot` table).
2. **Reserved range** — confirm `[floor(N/2), ceil(N*0.6)]` available spots is the right band, or specify another.
3. **Should reservation creation be allowed to "fill in" a held spot**, or are held spots truly off-limits? Current design: truly off-limits (capacity check subtracts both).
4. **Admin override** — do we need an admin endpoint to manually reshuffle `spot_holds`, or is auto-regeneration enough for v1?
5. **Frontend grid density** — confirm 9-column grid (or specify another) and confirm reserved spots should be visually distinct enough to be obvious without a tooltip.