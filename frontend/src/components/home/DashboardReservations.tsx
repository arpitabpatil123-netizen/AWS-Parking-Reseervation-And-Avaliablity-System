import React from "react";
import { $user } from "../../store/authStore";
import { getMyReservations, cancelReservation } from "../../services/reservationService";
import { getMockMyReservations, cancelMockReservation } from "../../services/mockZoneData";
import { USE_MOCK_DATA } from "../../scripts/home/dataSource";
import { toast } from "../../lib/toast";
import { formatPricePerHour, getZoneLocation } from "../../lib/utils";
import { ROUTES } from "../../lib/constants";
import type { Reservation } from "../../types/reservation";
import type { User } from "../../types/auth";

export function DashboardReservations() {
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    setUser($user.get());
    return $user.listen((next) => setUser(next));
  }, []);

  const isAuthenticated = user !== null;

  const [reservations, setReservations] = React.useState<Reservation[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [cancellingId, setCancellingId] = React.useState<number | null>(null);
  const [confirmCancelId, setConfirmCancelId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fetchReservations = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      if (USE_MOCK_DATA) {
        const mockRows = await getMockMyReservations();
        setReservations(mockRows as unknown as Reservation[]);
      } else {
        const rows = await getMyReservations();
        setReservations(rows);
      }
    } catch (err) {
      console.warn("Could not load user reservations:", err);
      // Fallback to mock if network issue
      try {
        const mockRows = await getMockMyReservations();
        setReservations(mockRows as unknown as Reservation[]);
      } catch {
        setError("Could not load your reservations.");
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    if (isAuthenticated) {
      void fetchReservations();
    }
  }, [isAuthenticated, fetchReservations]);

  // Listen for reservation creations or changes from other components
  React.useEffect(() => {
    const handleUpdate = () => {
      void fetchReservations();
    };
    window.addEventListener("spotsync:reservation-changed", handleUpdate);
    return () => {
      window.removeEventListener("spotsync:reservation-changed", handleUpdate);
    };
  }, [fetchReservations]);

  const activeReservations = reservations.filter((r) => r.status === "active");

  const handleCancel = async (id: number) => {
    setCancellingId(id);
    try {
      if (USE_MOCK_DATA) {
        await cancelMockReservation(id);
      } else {
        await cancelReservation(id);
      }
      toast.success("Reservation cancelled successfully.");
      setConfirmCancelId(null);
      // Optimistic update
      setReservations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r))
      );
      // Dispatch event to refresh the zone catalog
      window.dispatchEvent(new CustomEvent("spotsync:zones-rotated"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not cancel reservation.";
      toast.error(msg);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section id="my-reservations" className="mb-10 scroll-mt-20" aria-label="My Active Reservations">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" className="w-4 h-4">
                <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                <path d="M7 7h10"></path>
                <path d="M7 12h10"></path>
                <path d="M7 17h10"></path>
              </svg>
            </span>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-100">
              My Active Reservations
            </h2>
            {isAuthenticated && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                {activeReservations.length} Active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manage your guaranteed parking spaces, check-in status, and active tickets.
          </p>
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-2 self-start sm:self-center">
            <a
              href={ROUTES.MY_RESERVATIONS}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-700/60 bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 transition-all"
            >
              <span>View Full History</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className="w-3.5 h-3.5">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </a>
          </div>
        )}
      </div>

      {/* Unauthenticated View */}
      {!isAuthenticated && (
        <div className="glass-card p-6 sm:p-8 rounded-2xl border-slate-700/60 bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-emerald-950/20 text-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-3 text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className="w-6 h-6">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <h3 className="font-display text-base font-bold text-slate-100">
            Sign in to access your reservations
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
            Signed-in drivers can view active parking bookings, gate barcodes, and perform one-click cancellations anytime.
          </p>
          <div className="flex items-center justify-center gap-3">
            <a
              href={ROUTES.LOGIN}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-md shadow-emerald-500/20 transition-all"
            >
              Sign In to SpotSync
            </a>
            <a
              href={ROUTES.REGISTER}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 border border-slate-700 hover:bg-slate-700/80 transition-all"
            >
              Create Account
            </a>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isAuthenticated && loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="glass-card p-4 rounded-2xl border-slate-700/60 animate-pulse space-y-3">
              <div className="h-4 bg-slate-800 rounded w-1/2"></div>
              <div className="h-3 bg-slate-800 rounded w-1/3"></div>
              <div className="h-8 bg-slate-800 rounded"></div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {isAuthenticated && !loading && error && (
        <div className="glass-card p-4 rounded-2xl border-red-500/40 bg-red-500/10 text-xs text-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchReservations()}
            className="px-3 py-1 rounded-lg bg-red-500/20 border border-red-500/40 font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {isAuthenticated && !loading && !error && activeReservations.length === 0 && (
        <div className="glass-card p-6 sm:p-8 rounded-2xl border-slate-700/60 bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-transparent text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className="w-6 h-6">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path>
              <circle cx="7" cy="17" r="2"></circle>
              <path d="M9 17h6"></path>
              <circle cx="17" cy="17" r="2"></circle>
            </svg>
          </div>
          <h3 className="font-display text-base font-bold text-slate-100">
            No active reservations
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-3">
            You do not have any active bookings right now. Select an available parking zone above and click "Reserve Spot" to guarantee your parking space.
          </p>
          <a
            href="#all-zones"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all"
          >
            Browse Available Zones
          </a>
        </div>
      )}

      {/* Active reservations grid */}
      {isAuthenticated && !loading && activeReservations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeReservations.map((res) => {
            const zoneName = res.zone?.name || `Zone #${res.zone_id}`;
            const location = getZoneLocation(res.zone || { name: zoneName });
            const price = res.zone?.price_per_hour ? formatPricePerHour(res.zone.price_per_hour) : "Standard Rate";
            const isConfirming = confirmCancelId === res.id;
            const isCancelling = cancellingId === res.id;

            return (
              <article
                key={res.id}
                className="glass-card p-4 sm:p-5 rounded-2xl border-slate-700/60 hover:border-blue-500/40 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-blue-950/10 flex flex-col justify-between gap-3 shadow-md transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-base font-bold text-slate-100 truncate">
                          {zoneName}
                        </h3>
                        <span className="text-[11px] font-mono text-slate-400">#{res.id}</span>
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate" title={location}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className="w-3.5 h-3.5 text-blue-400 flex-shrink-0">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                          <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <span className="truncate">{location}</span>
                      </p>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Active</span>
                    </span>
                  </div>

                  {/* License Plate & Rate */}
                  <div className="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">Vehicle Plate:</span>
                      <span className="font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-100">
                        {res.license_plate?.toUpperCase()}
                      </span>
                    </div>
                    <span className="font-semibold text-slate-300">{price}</span>
                  </div>

                  {/* Created timestamp */}
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className="w-3 h-3 text-slate-500">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>Reserved: {new Date(res.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </p>
                </div>

                {/* Cancellation trigger & inline confirmation */}
                <div className="pt-2 border-t border-slate-800">
                  {isConfirming ? (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-red-950/40 border border-red-500/30">
                      <span className="text-xs text-red-200 font-medium">Confirm cancellation?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmCancelId(null)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          disabled={isCancelling}
                          onClick={() => void handleCancel(res.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-all disabled:opacity-50"
                        >
                          {isCancelling ? "Cancelling…" : "Yes, Cancel"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelId(res.id)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-xs text-slate-400 hover:text-red-300 hover:bg-red-500/10 border border-slate-800 hover:border-red-500/30 transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className="w-3.5 h-3.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                      </svg>
                      <span>Cancel This Reservation</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
