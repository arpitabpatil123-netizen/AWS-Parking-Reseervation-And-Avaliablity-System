import * as React from "react";
import {
  Search as SearchIcon,
  RefreshCw as RefreshIcon,
  Ban as BanIcon,
  Trash2 as TrashIcon,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ApiError } from "@/services/api";
import {
  loadAdminData,
  computeKpis,
  type AdminDataBundle,
} from "@/services/adminData";
import {
  cancelReservation,
  deleteReservation,
} from "@/services/reservationService";
import { formatDate, formatTime, initialsOf } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Reservation, ReservationStatus } from "@/types/reservation";
import type { ZoneType } from "@/types/zone";
import { ConfirmDialog } from "./ConfirmDialog";

type SortKey =
  | "id"
  | "driver"
  | "zone"
  | "plate"
  | "status"
  | "created_at";

const ZONE_LABEL: Record<ZoneType, string> = {
  ev_charging: "EV Charging",
  general: "General",
  covered: "Covered",
};

const STATUS_FILTERS: Array<{ key: ReservationStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const statusVariant = (status: ReservationStatus) =>
  status === "active" ? "green" : status === "completed" ? "blue" : "ghost";

export function ReservationsTable() {
  const [bundle, setBundle] = React.useState<AdminDataBundle | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<ReservationStatus | "all">(
    "all",
  );
  const [sortKey, setSortKey] = React.useState<SortKey>("created_at");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const [busyAction, setBusyAction] = React.useState<{
    type: "cancel" | "delete";
    id: number;
  } | null>(null);
  const [pendingAction, setPendingAction] = React.useState<{
    type: "cancel" | "delete";
    reservation: Reservation;
  } | null>(null);

  const fetchData = React.useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        const data = await loadAdminData();
        setBundle(data);
        setError(null);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "We couldn't reach the SpotSync server.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchData();
    const interval = window.setInterval(() => void fetchData({ silent: true }), 30_000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  /* ----------------------------- filter + sort ---------------------------- */
  const reservations = bundle?.reservations ?? [];

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return reservations.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const driverName = (r.user?.name ?? "").toLowerCase();
      const driverEmail = (r.user?.email ?? "").toLowerCase();
      const zoneName = (r.zone?.name ?? "").toLowerCase();
      const plate = (r.license_plate ?? "").toLowerCase();
      return (
        driverName.includes(q) ||
        driverEmail.includes(q) ||
        zoneName.includes(q) ||
        plate.includes(q)
      );
    });
  }, [reservations, search, statusFilter]);

  const sorted = React.useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "id":
          return (a.id - b.id) * dir;
        case "driver":
          return (
            (a.user?.name ?? a.user?.email ?? "").localeCompare(
              b.user?.name ?? b.user?.email ?? "",
            ) * dir
          );
        case "zone":
          return (
            (a.zone?.name ?? "").localeCompare(b.zone?.name ?? "") * dir
          );
        case "plate":
          return a.license_plate.localeCompare(b.license_plate) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "created_at":
        default:
          return (
            (new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()) *
            dir
          );
      }
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  /* ------------------------------- actions ------------------------------- */
  const handleAction = async () => {
    if (!pendingAction) return;
    const { type, reservation } = pendingAction;
    setBusyAction({ type, id: reservation.id });
    try {
      if (type === "cancel") {
        await cancelReservation(reservation.id);
        toast.success("Reservation cancelled.");
      } else {
        await deleteReservation(reservation.id);
        toast.success("Reservation deleted.");
      }
      setPendingAction(null);
      await fetchData({ silent: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Action failed. Please try again.";
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  /* ------------------------------ KPI strip ------------------------------ */
  const kpis = bundle ? computeKpis(bundle) : null;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" || key === "id" ? "desc" : "asc");
    }
  };

  const SortableHead = ({
    sortId,
    children,
    className,
  }: {
    sortId: SortKey;
    children: React.ReactNode;
    className?: string;
  }) => {
    const active = sortKey === sortId;
    return (
      <TableHead
        className={`cursor-pointer select-none ${className ?? ""}`}
        onClick={() => handleSort(sortId)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active ? (
            sortDir === "asc" ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
          )}
        </span>
      </TableHead>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total" value={kpis?.totalReservations ?? 0} accent="purple" />
        <Kpi label="Active" value={kpis?.activeReservations ?? 0} accent="emerald" />
        <Kpi label="Completed" value={kpis?.completedReservations ?? 0} accent="blue" />
        <Kpi label="Cancelled" value={kpis?.cancelledReservations ?? 0} accent="rose" />
        <Kpi label="Drivers" value={kpis?.driversWithReservations ?? 0} accent="amber" />
        <Kpi label="Spots booked" value={kpis?.spotsCurrentlyReserved ?? 0} accent="emerald" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">All reservations</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Search, filter, cancel, or delete any booking.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchData()}
          >
            <RefreshIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-800/70 bg-slate-900/40">
            <div className="relative flex-1 min-w-[200px]">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search driver, email, zone, plate…"
                className="pl-9"
              />
            </div>
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(f.key);
                    setPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    statusFilter === f.key
                      ? "bg-slate-800 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-400">
              Rows
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) || 10);
                  setPage(1);
                }}
                className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 text-sm text-slate-100"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>

          {/* Table */}
          {loading && sorted.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              Loading reservations…
            </div>
          ) : error && !bundle ? (
            <div className="p-8 text-center text-slate-300">
              <p className="font-semibold">Couldn't load reservations.</p>
              <p className="text-sm text-slate-400 mt-1">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void fetchData()}
              >
                Try again
              </Button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="font-semibold text-slate-200">No reservations match</p>
              <p className="text-sm mt-1">
                Try adjusting the search or status filter.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortId="id" className="w-16">#</SortableHead>
                  <SortableHead sortId="driver">Driver</SortableHead>
                  <SortableHead sortId="zone">Reserved spot</SortableHead>
                  <SortableHead sortId="plate">Plate</SortableHead>
                  <SortableHead sortId="status">Status</SortableHead>
                  <SortableHead sortId="created_at">Booked at</SortableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((r) => {
                  const driverName = r.user?.name ?? "";
                  const driverEmail = r.user?.email ?? `user#${r.user_id}`;
                  const initials = initialsOf(driverName, driverEmail);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs text-slate-400">
                        #{r.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 text-white font-semibold text-xs">
                            {initials}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-100 truncate">
                              {driverName || driverEmail}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {driverEmail}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-100">
                            {r.zone?.name ?? `Zone #${r.zone_id}`}
                          </span>
                          <span className="text-xs text-slate-400">
                            {r.zone?.type
                              ? ZONE_LABEL[r.zone.type]
                              : "General"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-900/60 text-slate-100">
                          {r.license_plate || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status)} className="capitalize">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-slate-100">
                            {formatDate(r.created_at)}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            {formatTime(r.created_at)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {r.status === "active" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setPendingAction({
                                  type: "cancel",
                                  reservation: r,
                                })
                              }
                            >
                              <BanIcon className="h-4 w-4" />
                              Cancel
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() =>
                              setPendingAction({
                                type: "delete",
                                reservation: r,
                              })
                            }
                          >
                            <TrashIcon className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-800/70 bg-slate-900/40 flex-wrap">
            <span className="text-sm text-slate-400">
              {sorted.length} reservation{sorted.length === 1 ? "" : "s"}
            </span>
            {totalPages > 1 ? (
              <div className="inline-flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-slate-300 px-2">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        busy={busyAction !== null}
        onConfirm={handleAction}
        title={
          pendingAction?.type === "cancel"
            ? "Cancel this reservation?"
            : "Delete this reservation?"
        }
        description={
          pendingAction?.type === "cancel" ? (
            <>
              The spot will be freed back to{" "}
              <strong>
                {pendingAction.reservation.zone?.name ??
                  `Zone #${pendingAction.reservation.zone_id}`}
              </strong>{" "}
              and the booking will be marked as cancelled. This action cannot
              be undone.
            </>
          ) : (
            <>
              Reservation{" "}
              <strong>#{pendingAction?.reservation.id}</strong> will be
              permanently removed from the database. This action cannot be
              undone.
            </>
          )
        }
        confirmLabel={
          pendingAction?.type === "cancel"
            ? "Cancel reservation"
            : "Delete reservation"
        }
        variant="danger"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI tile                                                                    */
/* -------------------------------------------------------------------------- */

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: "emerald" | "blue" | "purple" | "amber" | "rose";
}) {
  const ring: Record<typeof accent, string> = {
    emerald: "border-emerald-500/30 text-emerald-300",
    blue: "border-blue-500/30 text-blue-300",
    purple: "border-purple-500/30 text-purple-300",
    amber: "border-amber-500/30 text-amber-300",
    rose: "border-rose-500/30 text-rose-300",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${ring[accent]}`}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {label}
            </p>
            <p className="font-display text-2xl font-bold text-slate-50 tabular-nums">
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
