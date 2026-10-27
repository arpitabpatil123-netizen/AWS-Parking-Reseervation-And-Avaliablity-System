import * as React from "react";
import {
  RefreshCw as RefreshIcon,
  Trash2 as TrashIcon,
  Zap as ZapIcon,
  Sun as SunIcon,
  Warehouse as WarehouseIcon,
  Plus,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import { ApiError } from "@/services/api";
import { getZones, deleteZone } from "@/services/zoneService";
import { formatDateTime } from "@/lib/format";
import { formatPricePerHour } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { ParkingZone, ZoneType } from "@/types/zone";
import { ConfirmDialog } from "./ConfirmDialog";

const TYPE_LABEL: Record<ZoneType, string> = {
  ev_charging: "EV Charging",
  general: "General",
  covered: "Covered",
};

const TYPE_ACCENT: Record<
  ZoneType,
  { ring: string; icon: React.ReactNode; chip: string }
> = {
  ev_charging: {
    ring: "border-emerald-500/30 text-emerald-300 bg-emerald-500/10",
    icon: <ZapIcon className="h-4 w-4" />,
    chip: "border-emerald-500/30 text-emerald-300",
  },
  general: {
    ring: "border-blue-500/30 text-blue-300 bg-blue-500/10",
    icon: <SunIcon className="h-4 w-4" />,
    chip: "border-blue-500/30 text-blue-300",
  },
  covered: {
    ring: "border-purple-500/30 text-purple-300 bg-purple-500/10",
    icon: <WarehouseIcon className="h-4 w-4" />,
    chip: "border-purple-500/30 text-purple-300",
  },
};

export function ZonesGrid() {
  const [zones, setZones] = React.useState<ParkingZone[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [pending, setPending] = React.useState<ParkingZone | null>(null);
  const [busy, setBusy] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    try {
      const list = await getZones();
      setZones(Array.isArray(list) ? list : []);
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

  const totalCapacity = zones.reduce((s, z) => s + Math.max(0, z.total_capacity), 0);
  const totalAvailable = zones.reduce((s, z) => s + Math.max(0, z.available_spots), 0);
  const totalOccupied = Math.max(0, totalCapacity - totalAvailable);
  const occupancy = totalCapacity === 0 ? 0 : Math.round((totalOccupied / totalCapacity) * 100);
  const evZones = zones.filter((z) => z.type === "ev_charging").length;

  const handleDelete = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await deleteZone(pending.id);
      toast.success(`Zone "${pending.name}" deleted.`);
      setPending(null);
      await fetchData();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to delete zone.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total zones" value={zones.length} accent="emerald" />
        <Kpi label="EV zones" value={evZones} accent="blue" />
        <Kpi label="Total capacity" value={totalCapacity} accent="purple" />
        <Kpi label="Occupancy" value={`${occupancy}%`} accent="amber" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">All zones</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Live capacity for every parking zone in the network.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void fetchData()}
            >
              <RefreshIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent("spotsync:open-create-zone"))}
            >
              <Plus className="h-4 w-4" />
              New zone
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && zones.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              Loading zones…
            </div>
          ) : error && zones.length === 0 ? (
            <div className="p-8 text-center text-slate-300">
              <p className="font-semibold">Couldn't load zones.</p>
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
          ) : zones.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="font-semibold text-slate-200">
                No zones configured yet
              </p>
              <p className="text-sm mt-1">
                Get the SpotSync network started by creating your first zone.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {zones
                .slice()
                .sort((a, b) => a.id - b.id)
                .map((zone) => (
                  <ZoneCard
                    key={zone.id}
                    zone={zone}
                    onDelete={() => setPending(zone)}
                  />
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        busy={busy}
        onConfirm={handleDelete}
        title="Delete this zone?"
        description={
          pending ? (
            <>
              The zone <strong>{pending.name}</strong> will be permanently
              removed from the catalog. Any active reservations on this zone
              will be orphaned. This action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete zone"
        variant="danger"
      />
    </div>
  );
}

function ZoneCard({
  zone,
  onDelete,
}: {
  zone: ParkingZone;
  onDelete: () => void;
}) {
  const total = Math.max(0, zone.total_capacity);
  const available = Math.max(0, zone.available_spots);
  const occupied = Math.max(0, total - available);
  const pct = total === 0 ? 0 : Math.round((available / total) * 100);
  const accent = TYPE_ACCENT[zone.type];

  let status: "ok" | "warn" | "full" = "ok";
  let statusLabel = "Open";
  if (available <= 0) {
    status = "full";
    statusLabel = "Full";
  } else if (pct < 20) {
    status = "warn";
    statusLabel = "Almost full";
  } else if (pct < 50) {
    statusLabel = "Filling up";
  }
  const statusClass: Record<typeof status, string> = {
    ok: "border-emerald-500/30 text-emerald-300 bg-emerald-500/10",
    warn: "border-amber-500/30 text-amber-300 bg-amber-500/10",
    full: "border-rose-500/30 text-rose-300 bg-rose-500/10",
  };

  const progressColor =
    status === "full"
      ? "bg-gradient-to-r from-amber-400 to-rose-500"
      : status === "warn"
        ? "bg-amber-400"
        : "capacity-bar-green";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-400">
              Zone #{zone.id}
            </p>
            <h3 className="font-display text-lg font-semibold text-slate-50 leading-tight mt-1">
              {zone.name}
            </h3>
          </div>
          <span
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${accent.ring}`}
          >
            {accent.icon}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={accent.chip}>
            {TYPE_LABEL[zone.type]}
          </Badge>
          <span className="text-xs font-mono px-2 py-1 rounded-md border border-slate-700 bg-slate-900/60 text-slate-100">
            ${formatPricePerHour(zone.price_per_hour)}
          </span>
          <span className="text-xs text-slate-400">
            Created {formatDateTime(zone.created_at)}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
            <span>
              <strong>{available}</strong> available of {total}
            </span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <Progress
            value={pct}
            className="h-2"
            indicatorClassName={progressColor}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold ${statusClass[status]}`}
          >
            {statusLabel} · {occupied} booked
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={onDelete}
          >
            <TrashIcon className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
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
