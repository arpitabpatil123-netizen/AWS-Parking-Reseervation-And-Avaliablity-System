// Package seeder contains the catalog seeder that ensures the
// parking_zones table is populated with 40 diverse zones across the
// three supported types (EV Charging, General, Covered).
//
// The seeder is intentionally idempotent and safe to run on every
// server start: it localizes known legacy demo rows, then only inserts
// rows when the catalog has fewer than 40 zones. Admin-customized prices
// and capacities are preserved.
//
// Companion to this package is the `ZoneRotator` (in rotator.go)
// which keeps the 60% available / 40% full invariant maintained on
// a 1-hour rotation cadence.
package seeder

import (
	"fmt"
	"log"

	"gorm.io/gorm"

	"spotsync-backend/internal/models"
)

// TargetZoneCount is the canonical number of zones the catalog should
// have after seeding. Used by both the seeder (to know when to top up)
// and the rotator (to compute the 60/40 split).
const TargetZoneCount = 40

// SeedZoneSpec is the in-memory specification of a single seeded
// zone. We keep these as named values rather than raw GORM models so
// the catalog is easy to read and edit in one place.
type SeedZoneSpec struct {
	Name          string
	Type          string
	TotalCapacity int
	PricePerHour  float64
}

// FullCatalog is the canonical 40-zone source of truth. Counts:
//
//	EV Charging: 15 zones
//	General:     15 zones
//	Covered:     10 zones
//
// Capacity ranges from 12 to 60. Hourly prices are in INR and locations
// focus on Bengaluru, with one additional Karnataka destination.
var FullCatalog = []SeedZoneSpec{
	// ---------- EV Charging (15 zones) ----------
	{Name: "Kempegowda Airport T1 EV Charging Hub", Type: "ev_charging", TotalCapacity: 24, PricePerHour: 70},
	{Name: "Kempegowda Airport T2 EV Bay", Type: "ev_charging", TotalCapacity: 18, PricePerHour: 70},
	{Name: "Orion Mall Rajajinagar EV Charging", Type: "ev_charging", TotalCapacity: 32, PricePerHour: 35},
	{Name: "BIEC Tumakuru Road EV Stalls", Type: "ev_charging", TotalCapacity: 20, PricePerHour: 40},
	{Name: "Chinnaswamy Stadium EV Parking", Type: "ev_charging", TotalCapacity: 40, PricePerHour: 50},
	{Name: "Manyata Tech Park Nagawara EV Plaza", Type: "ev_charging", TotalCapacity: 28, PricePerHour: 35},
	{Name: "Bellandur EV Charge Point", Type: "ev_charging", TotalCapacity: 16, PricePerHour: 35},
	{Name: "Vidhana Soudha EV Priority Parking", Type: "ev_charging", TotalCapacity: 12, PricePerHour: 40},
	{Name: "Manipal Hospital Old Airport Road EV Bay", Type: "ev_charging", TotalCapacity: 14, PricePerHour: 80},
	{Name: "IISc Bengaluru EV Fast Charge", Type: "ev_charging", TotalCapacity: 22, PricePerHour: 30},
	{Name: "NICE Road Electronic City EV Station", Type: "ev_charging", TotalCapacity: 30, PricePerHour: 50},
	{Name: "UB City CBD EV Charging", Type: "ev_charging", TotalCapacity: 18, PricePerHour: 80},
	{Name: "Kanteerava Stadium EV Lot", Type: "ev_charging", TotalCapacity: 26, PricePerHour: 40},
	{Name: "Phoenix Marketcity Mahadevapura EV Corner", Type: "ev_charging", TotalCapacity: 20, PricePerHour: 45},
	{Name: "Forum South Bengaluru EV Charging", Type: "ev_charging", TotalCapacity: 16, PricePerHour: 40},

	// ---------- General (15 zones) ----------
	{Name: "Kempegowda Airport T1 General Parking", Type: "general", TotalCapacity: 60, PricePerHour: 100},
	{Name: "Kempegowda Airport T2 Open Parking", Type: "general", TotalCapacity: 48, PricePerHour: 100},
	{Name: "MG Road Street Parking", Type: "general", TotalCapacity: 36, PricePerHour: 50},
	{Name: "KR Market Parking Lot", Type: "general", TotalCapacity: 28, PricePerHour: 30},
	{Name: "KSR Bengaluru City Station North Lot", Type: "general", TotalCapacity: 45, PricePerHour: 50},
	{Name: "Majestic Bus Stand Long Stay Parking", Type: "general", TotalCapacity: 52, PricePerHour: 40},
	{Name: "Bengaluru Palace Grounds Event Parking", Type: "general", TotalCapacity: 60, PricePerHour: 60},
	{Name: "Sankey Tank Open Lot", Type: "general", TotalCapacity: 40, PricePerHour: 30},
	{Name: "Jayanagar 4th Block Community Parking", Type: "general", TotalCapacity: 32, PricePerHour: 30},
	{Name: "Brigade Road Parking", Type: "general", TotalCapacity: 38, PricePerHour: 50},
	{Name: "Orion Mall Rajajinagar General Parking", Type: "general", TotalCapacity: 44, PricePerHour: 40},
	{Name: "Cubbon Park Parking", Type: "general", TotalCapacity: 50, PricePerHour: 40},
	{Name: "Koramangala 5th Block Parking", Type: "general", TotalCapacity: 34, PricePerHour: 40},
	{Name: "Yelahanka Town Parking", Type: "general", TotalCapacity: 28, PricePerHour: 30},
	{Name: "Peenya Industrial Area Parking", Type: "general", TotalCapacity: 42, PricePerHour: 30},

	// ---------- Covered (10 zones) ----------
	{Name: "Brigade Road Covered Garage", Type: "covered", TotalCapacity: 50, PricePerHour: 80},
	{Name: "MG Road Metro Multi-Level Parking", Type: "covered", TotalCapacity: 50, PricePerHour: 60},
	{Name: "Orion Mall Rajajinagar Underground P-1", Type: "covered", TotalCapacity: 36, PricePerHour: 40},
	{Name: "Phoenix Marketcity Mahadevapura Underground P-2", Type: "covered", TotalCapacity: 36, PricePerHour: 45},
	{Name: "UB City Covered Garage", Type: "covered", TotalCapacity: 44, PricePerHour: 100},
	{Name: "Kempegowda Airport T1 Covered Deck", Type: "covered", TotalCapacity: 60, PricePerHour: 150},
	{Name: "Manipal Hospital Old Airport Road Covered Garage", Type: "covered", TotalCapacity: 32, PricePerHour: 80},
	{Name: "Chinnaswamy Stadium North Covered Parking", Type: "covered", TotalCapacity: 40, PricePerHour: 80},
	{Name: "BIEC Tumakuru Road Covered Parking", Type: "covered", TotalCapacity: 28, PricePerHour: 60},
	{Name: "Mysuru Palace Covered Parking", Type: "covered", TotalCapacity: 22, PricePerHour: 40},
}

var legacyCatalog = []struct {
	Name         string
	PricePerHour float64
}{
	{"Terminal 1 EV Charging Hub", 6.50},
	{"Airport North EV Bay", 7.00},
	{"Mall Central EV Charging", 5.50},
	{"Convention Center EV Stalls", 6.00},
	{"Stadium West EV Parking", 8.00},
	{"Tech Park EV Plaza", 5.00},
	{"Riverside EV Charge Point", 5.50},
	{"City Hall EV Priority", 4.50},
	{"Hospital EV Emergency Bay", 9.00},
	{"University EV Fast Charge", 4.00},
	{"Highway Rest EV Station", 7.50},
	{"Hotel District EV Valet", 8.50},
	{"Sports Arena EV Lot", 6.00},
	{"Outlet Mall EV Corner", 5.00},
	{"Beachfront EV Charging", 6.50},
	{"Terminal 1 General Parking", 4.50},
	{"Terminal 2 Open Lot", 4.00},
	{"Downtown Street Parking", 5.50},
	{"Market Square Lot", 3.50},
	{"Train Station North Lot", 4.00},
	{"Bus Depot Long Stay", 3.00},
	{"Festival Grounds Parking", 5.00},
	{"Riverside Open Lot", 3.50},
	{"Eastside Community Lot", 2.50},
	{"Westgate Plaza Parking", 4.50},
	{"Northgate Shopping Lot", 4.00},
	{"South Pier Parking", 5.50},
	{"Civic Center Open Lot", 3.50},
	{"Park & Walk General", 2.00},
	{"Industrial District Lot", 3.00},
	{"Garage Level 1 — Downtown", 6.00},
	{"Garage Level 2 — Downtown", 6.00},
	{"Underground P-1 — Mall", 5.50},
	{"Underground P-2 — Mall", 5.50},
	{"Covered Garage Central", 5.00},
	{"Airport Covered Deck", 7.50},
	{"Hospital Covered Garage", 6.50},
	{"Stadium North Covered", 7.00},
	{"Convention Center Garage", 6.50},
	{"Beachside Covered Deck", 7.50},
}

func migrateLegacyCatalog(db *gorm.DB) error {
	if len(legacyCatalog) != len(FullCatalog) {
		return fmt.Errorf("seeder: legacy catalog has %d entries but current catalog has %d",
			len(legacyCatalog), len(FullCatalog))
	}

	legacyNames := make([]string, len(legacyCatalog))
	for i, legacy := range legacyCatalog {
		legacyNames[i] = legacy.Name
	}
	var legacyCount int64
	if err := db.Model(&models.ParkingZone{}).
		Where("name IN ?", legacyNames).
		Count(&legacyCount).Error; err != nil {
		return fmt.Errorf("seeder: failed to find legacy catalog rows: %w", err)
	}
	if legacyCount == 0 {
		return nil
	}

	// Legacy default prices are rewritten only when they still match the
	// original seed value; administrator edits are preserved.
	var localizedNames, localizedPrices, preservedCustomPrices int64
	err := db.Transaction(func(tx *gorm.DB) error {
		for i, legacy := range legacyCatalog {
			current := FullCatalog[i]
			nameResult := tx.Model(&models.ParkingZone{}).
				Where("name = ?", legacy.Name).
				Update("name", current.Name)
			if nameResult.Error != nil {
				return fmt.Errorf("seeder: failed to localize zone %q: %w", legacy.Name, nameResult.Error)
			}
			localizedNames += nameResult.RowsAffected

			priceResult := tx.Model(&models.ParkingZone{}).
				Where("name = ? AND price_per_hour = ?", current.Name, legacy.PricePerHour).
				Update("price_per_hour", current.PricePerHour)
			if priceResult.Error != nil {
				return fmt.Errorf("seeder: failed to localize price for zone %q: %w", current.Name, priceResult.Error)
			}
			localizedPrices += priceResult.RowsAffected
			if nameResult.RowsAffected > priceResult.RowsAffected {
				preservedCustomPrices += nameResult.RowsAffected - priceResult.RowsAffected
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	if localizedNames > 0 || localizedPrices > 0 {
		log.Printf("[seeder] Localized %d existing zone names and %d default hourly prices to Bengaluru/Karnataka and INR.",
			localizedNames, localizedPrices)
	}
	if preservedCustomPrices > 0 {
		log.Printf("[seeder] Preserved %d customized legacy zone prices; verify their values are in INR.", preservedCustomPrices)
	}
	return nil
}

// SeedIfNeeded inspects the current parking_zones table and tops it up
// to TargetZoneCount zones when it is empty (or has fewer rows than
// the catalog). Legacy demo names are localized first; admin-edited
// prices and capacities are preserved.
//
// The function is safe to call concurrently with the HTTP server
// (it only INSERTs and only when the count is below target).
func SeedIfNeeded(db *gorm.DB) (int, error) {
	if err := migrateLegacyCatalog(db); err != nil {
		return 0, err
	}

	var existingCount int64
	if err := db.Model(&models.ParkingZone{}).Count(&existingCount).Error; err != nil {
		return 0, fmt.Errorf("seeder: failed to count existing zones: %w", err)
	}

	// Already at or above target — nothing to do.
	if int(existingCount) >= TargetZoneCount {
		log.Printf("[seeder] Catalog already has %d zones (target: %d). Skipping seed.",
			existingCount, TargetZoneCount)
		return 0, nil
	}

	// Build the list of zones we still need to insert. We pull existing
	// names so we never duplicate a row, even across restarts.
	existingNames, err := loadExistingZoneNames(db)
	if err != nil {
		return 0, err
	}

	var toInsert []models.ParkingZone
	for _, spec := range FullCatalog {
		if _, existing := existingNames[spec.Name]; existing {
			continue
		}
		toInsert = append(toInsert, models.ParkingZone{
			Name:          spec.Name,
			Type:          spec.Type,
			TotalCapacity: spec.TotalCapacity,
			PricePerHour:  spec.PricePerHour,
		})
	}

	if len(toInsert) == 0 {
		log.Printf("[seeder] No new zones to insert (existing: %d).", existingCount)
		return 0, nil
	}

	if len(toInsert) == 0 {
		log.Printf("[seeder] No new zones to insert (existing: %d).", existingCount)
		return 0, nil
	}

	if err := db.Create(&toInsert).Error; err != nil {
		return 0, fmt.Errorf("seeder: failed to insert zones: %w", err)
	}

	// Per spec §3.5: regenerate spot_holds for each newly seeded zone
	// so a fresh DB boots into realistic per-spot availability instead
	// of every spot appearing available.
	for i := range toInsert {
		if err := RegenerateSpotHolds(db, toInsert[i].ID); err != nil {
			log.Printf("[seeder] RegenerateSpotHolds(zone %d) failed: %v", toInsert[i].ID, err)
		}
	}

	log.Printf("[seeder] Inserted %d new zones. Catalog now has %d zones (target: %d).",
		len(toInsert), int(existingCount)+len(toInsert), TargetZoneCount)
	return len(toInsert), nil
}

// loadExistingZoneNames returns a set of zone names already present in
// the database so we can avoid duplicate inserts. Used internally by
// SeedIfNeeded.
func loadExistingZoneNames(db *gorm.DB) (map[string]struct{}, error) {
	var rows []struct {
		Name string `gorm:"column:name"`
	}
	if err := db.Model(&models.ParkingZone{}).
		Select("name").
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("seeder: failed to load zone names: %w", err)
	}
	set := make(map[string]struct{}, len(rows))
	for _, r := range rows {
		set[r.Name] = struct{}{}
	}
	return set, nil
}
