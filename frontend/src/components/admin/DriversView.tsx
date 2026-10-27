import * as React from "react";
import {
  Search as SearchIcon,
  RefreshCw as RefreshIcon,
  Trash2 as TrashIcon,
  Car as CarIcon,
  ChevronRight,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import { ApiError } from "@/services/api";
import {
  loadAdminData,
  aggregateDriverReservations,
  type AdminDataBundle,
  type DriverReservationSummary,
} from "@/services/adminData";
import { deleteUser } from "@/services/userService";
import { formatDateTime, initialsOf } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Reservation, ReservationStatus } from "@/types/reservation";
import { ConfirmDialog } from "./ConfirmDialog";

const statusVariant = (status: ReservationStatus) =>
  status === "active" ? "green" : status === "completed" ? "blue" : "ghost";

export function DriversView() {
  const [bundle, setBundle] = React.useState<AdminDataBundle | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [summaries, setSummaries] = React.useState<DriverReservationSummary[]>([]);
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<number | null>(null);

  const [pending, setPending] = React.useState<DriverReservationSummary | null>(null);
  const [busy, setBusy] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    try {
      const data = await loadAdminData();
      setBundle(data);
      setSummaries(aggregateDriverReservations(data.reservations, data.users));
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
  }, []);

  React.useEffect(() => {
    void fetchData();
    const interval = window.setInterval(() => void fetchData(), 30_000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter((s) => {
      const name = (s.user.name ?? "").toLowerCase();
      const email = (s.user.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [summaries, search]);

  const selected = summaries.find((s) => s.user.id === selectedId) ?? null;

  const totalRes = bundle?.reservations.length ?? 0;
  const activeRes =
    bundle?.reservations.filter((r) => r.status === "active").length ?? 0;
  const latest =
    bundle && bundle.reservations.length > 0
      ? [...bundle.reservations].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0]?.created_at
      : null;

  const handleDelete = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await deleteUser(pending.user.id);
      toast.success(`Driver ${pending.user.email} removed.`);
      setPending(null);
      if (selectedId === pending.user.id) setSelectedId(null);
      await fetchData();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to delete driver.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Drivers with bookings"
          value={summaries.length}
          accent="emerald"
        />
        <Kpi label="Total reservations" value={totalRes} accent="blue" />
        <Kpi label="Active reservations" value={activeRes} accent="purple" />
        <Kpi
          label="Last booking"
          value={latest ? formatDateTime(latest) : "—"}
          accent="amber"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Drivers</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                Click a driver to inspect their reservation history.
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
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-800/70 bg-slate-900/40">
              <div className="relative flex-1 min-w-[200px]">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search driver name or email…"
                  className="pl-9"
                />
              </div>
            </div>

            {loading && filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Loading drivers…
              </div>
            ) : error && !bundle ? (
              <div className="p-8 text-center text-slate-300">
                <p className="font-semibold">Couldn't load drivers.</p>
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
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <p className="font-semibold text-slate-200">
                  No drivers with reservations
                </p>
                <p className="text-sm mt-1">
                  Drivers will appear here once they book a spot.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {filtered.map((s) => {
                  const initials = initialsOf(s.user.name, s.user.email);
                  const isSelected = selectedId === s.user.id;
                  const last = s.lastReservationAt
                    ? formatDateTime(s.lastReservationAt)
                    : "—";
                  return (
                    <li
                      key={s.user.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-emerald-500/10"
                          : "hover:bg-slate-800/40"
                      }`}
                      onClick={() => setSelectedId(s.user.id)}
                    >
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 text-white font-semibold text-xs">
                        {initials}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">
                          {s.user.name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {s.user.email}
                        </p>
                      </div>
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-slate-400">
                          {s.totalReservations} booking
                          {s.totalReservations === 1 ? "" : "s"}
                        </p>
                        <p className="text-xs text-slate-500">{last}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPending(s);
                        }}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-800/70 bg-slate-900/40 flex-wrap">
              <span className="text-sm text-slate-400">
                {filtered.length} driver{filtered.length === 1 ? "" : "s"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Driver details</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Select a driver on the left to inspect their reservation history.
            </p>
          </CardHeader>
          <CardContent className="pt-2">
            {!selected ? (
              <div className="flex flex-col items-center justify-center text-center gap-2 py-12 text-slate-400">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/60 border border-slate-800 text-slate-500">
                  <CarIcon className="h-6 w-6" />
                </span>
                <p className="text-sm">Pick a driver to see their full history.</p>
              </div>
            ) : (
              <DriverDetail summary={selected} />
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        busy={busy}
        onConfirm={handleDelete}
        title="Remove this driver?"
        description={
          pending ? (
            <>
              The driver <strong>{pending.user.name}</strong> (
              {pending.user.email}) and their account will be permanently
              removed. Their reservation history will be orphaned. This action
              cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete driver"
        variant="danger"
      />
    </div>
  );
}

function DriverDetail({ summary }: { summary: DriverReservationSummary }) {
  const initials = initialsOf(summary.user.name, summary.user.email);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 text-white font-semibold">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-slate-50 truncate">
            {summary.user.name}
          </p>
          <p className="text-xs text-slate-400 truncate">{summary.user.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Total" value={summary.totalReservations} />
        <Stat
          label="Active"
          value={summary.activeReservations}
          accent="emerald"
        />
        <Stat
          label="Completed"
          value={summary.completedReservations}
          accent="blue"
        />
        <Stat
          label="Cancelled"
          value={summary.cancelledReservations}
          accent="ghost"
        />
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <p className="text-xs text-slate-400">Last booking</p>
        <p className="text-sm font-semibold text-slate-100 mt-1">
          {summary.lastReservationAt
            ? formatDateTime(summary.lastReservationAt)
            : "—"}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Reservation history
        </p>
        <ul className="space-y-2 max-h-80 overflow-y-auto pr-2">
          {summary.reservations.length === 0 ? (
            <p className="text-sm text-slate-400">No reservations yet.</p>
          ) : (
            summary.reservations.map((r) => (
              <ReservationRow key={r.id} r={r} />
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "blue" | "ghost";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "blue"
        ? "text-blue-300"
        : accent === "ghost"
          ? "text-slate-400"
          : "text-slate-100";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`font-display text-2xl font-bold tabular-nums ${color}`}>
        {value}
      </p>
    </div>
  );
}

function ReservationRow({ r }: { r: Reservation }) {
  const zone = r.zone?.name ?? `Zone #${r.zone_id}`;
  const plate = (r.license_plate ?? "").trim() || "—";
  const pct =
    r.zone && r.zone.total_capacity > 0
      ? Math.round(
          ((r.zone.total_capacity - r.zone.available_spots) /
            r.zone.total_capacity) *
            100,
        )
      : 0;
  return (
    <li className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">
            {zone}
          </p>
          <p className="text-xs text-slate-400">
            Plate{" "}
            <span className="font-mono text-slate-300">{plate}</span> · #
            {r.id}
          </p>
        </div>
        <Badge variant={statusVariant(r.status)} className="capitalize">
          {r.status}
        </Badge>
      </div>
      <div className="mt-2">
        <Progress
          value={pct}
          className="h-1.5"
          indicatorClassName={
            pct > 80
              ? "bg-gradient-to-r from-amber-400 to-rose-500"
              : "capacity-bar-green"
          }
        />
        <p className="text-xs text-slate-500 mt-1">
          {formatDateTime(r.created_at)}
        </p>
      </div>
    </li>
  );
}

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
