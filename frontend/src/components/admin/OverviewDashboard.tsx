import * as React from "react";
import {
  Users as UsersIcon,
  Car as CarIcon,
  CalendarCheck2 as CalendarIcon,
  Zap as ZapIcon,
  ParkingCircle as ParkingIcon,
  Activity as ActivityIcon,
  ArrowRight,
  RefreshCw as RefreshIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import { ApiError } from "@/services/api";
import {
  loadAdminData,
  computeKpis,
  type AdminDataBundle,
} from "@/services/adminData";
import { formatRelativeTime, initialsOf } from "@/lib/format";
import { INDIA_LOCALE, INDIA_TIME_ZONE } from "@/lib/constants";
import { capacityOccupancyPercent } from "@/lib/utils";
import type { Reservation } from "@/types/reservation";
import type { User } from "@/types/auth";

const CHART_COLORS = {
  active: "#10b981",
  completed: "#3b82f6",
  cancelled: "#94a3b8",
  ev: "#10b981",
  general: "#3b82f6",
  covered: "#a855f7",
  emerald: "#10b981",
  amber: "#f59e0b",
};

const STATUS_COLORS = [
  CHART_COLORS.active,
  CHART_COLORS.completed,
  CHART_COLORS.cancelled,
];

const TYPE_COLORS: Record<string, string> = {
  ev_charging: CHART_COLORS.ev,
  general: CHART_COLORS.general,
  covered: CHART_COLORS.covered,
};

/* -------------------------------------------------------------------------- */
/* KPI tile                                                                   */
/* -------------------------------------------------------------------------- */

interface KpiTileProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  caption: string;
  accent: "emerald" | "blue" | "purple" | "amber" | "rose";
  progress?: number;
}

const ACCENT_CLASSES: Record<KpiTileProps["accent"], string> = {
  emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-500/30",
  blue: "from-blue-500/20 to-blue-500/5 text-blue-300 border-blue-500/30",
  purple: "from-purple-500/20 to-purple-500/5 text-purple-300 border-purple-500/30",
  amber: "from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-500/30",
  rose: "from-rose-500/20 to-rose-500/5 text-rose-300 border-rose-500/30",
};

function KpiTile(props: KpiTileProps) {
  const { label, value, icon, caption, accent, progress } = props;
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {label}
            </p>
            <p className="mt-2 font-display text-3xl font-bold text-slate-50 tabular-nums">
              {value}
            </p>
            <p className="mt-1 text-xs text-slate-400">{caption}</p>
          </div>
          <span
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br ${ACCENT_CLASSES[accent]}`}
          >
            {icon}
          </span>
        </div>
        {typeof progress === "number" ? (
          <Progress
            value={progress}
            className="mt-4 h-1.5"
            indicatorClassName={
              progress > 80
                ? "bg-gradient-to-r from-amber-400 to-rose-500"
                : "capacity-bar-green"
            }
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function buildDailySeries(reservations: Reservation[]) {
  // Bucket reservations by day for the last 14 days.
  const now = Date.now();
  const days = 14;
  const map = new Map<string, number>();
  const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateKeyInIndia = (date: Date): string => {
    const parts = dateKeyFormatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return `${year}-${month}-${day}`;
  };
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = dateKeyInIndia(d);
    map.set(key, 0);
  }
  for (const r of reservations) {
    const ts = new Date(r.created_at);
    if (Number.isNaN(ts.getTime())) continue;
    const key = dateKeyInIndia(ts);
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return Array.from(map.entries()).map(([key, count]) => {
    const d = new Date(`${key}T12:00:00Z`);
    const label = d.toLocaleDateString(INDIA_LOCALE, {
      timeZone: INDIA_TIME_ZONE,
      month: "short",
      day: "numeric",
    });
    return { day: label, count };
  });
}

function buildStatusMix(
  bundle: AdminDataBundle,
): Array<{ name: string; value: number; key: string }> {
  const k = computeKpis(bundle);
  return [
    { name: "Active", value: k.activeReservations, key: "active" },
    { name: "Completed", value: k.completedReservations, key: "completed" },
    { name: "Cancelled", value: k.cancelledReservations, key: "cancelled" },
  ];
}

function buildTopZones(bundle: AdminDataBundle) {
  return [...bundle.zones]
    .map((z) => {
      const used = Math.max(0, z.total_capacity - z.available_spots);
      const pct = capacityOccupancyPercent(z.total_capacity, z.available_spots);
      return {
        name: z.name.length > 18 ? `${z.name.slice(0, 18)}…` : z.name,
        type: z.type,
        occupancy: pct,
        used,
        total: z.total_capacity,
      };
    })
    .sort((a, b) => b.occupancy - a.occupancy)
    .slice(0, 6);
}

function buildOccupancyRing(
  bundle: AdminDataBundle,
): Array<{ name: string; value: number; key: string }> {
  const k = computeKpis(bundle);
  return [
    { name: "Reserved", value: k.totalReserved, key: "reserved" },
    { name: "Available", value: k.totalAvailable, key: "available" },
  ];
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function OverviewDashboard() {
  const [bundle, setBundle] = React.useState<AdminDataBundle | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

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
        setRefreshing(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchData();
    const interval = window.setInterval(() => void fetchData({ silent: true }), 30_000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    void fetchData();
  };

  if (loading && !bundle) {
    return <DashboardSkeleton />;
  }

  if (error && !bundle) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="p-6 text-center text-slate-200">
          <p className="font-semibold">Couldn't load the dashboard.</p>
          <p className="text-sm text-slate-400 mt-1">{error}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={handleRefresh}
          >
            <RefreshIcon className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = bundle!;
  const kpis = computeKpis(data);
  const statusMix = buildStatusMix(data);
  const daily = buildDailySeries(data.reservations);
  const topZones = buildTopZones(data);
  const occupancyRing = buildOccupancyRing(data);

  const recentReservations = [...data.reservations]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 8);
  const recentUsers = [...data.users]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Live · Updated {formatRelativeTime(new Date().toISOString())}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshIcon
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button type="button" variant="default" size="sm" asChild>
            <a href="/admin/reservations">
              View reservations
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button type="button" variant="electric" size="sm" asChild>
            <a href="/admin/zones">
              <ZapIcon className="h-4 w-4" />
              New zone
            </a>
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Total users"
          value={kpis.totalUsers}
          caption="All registered accounts"
          icon={<UsersIcon className="h-5 w-5" />}
          accent="emerald"
        />
        <KpiTile
          label="Drivers"
          value={kpis.totalDrivers}
          caption="Driver accounts"
          icon={<CarIcon className="h-5 w-5" />}
          accent="blue"
        />
        <KpiTile
          label="Total reservations"
          value={kpis.totalReservations}
          caption="All-time bookings"
          icon={<CalendarIcon className="h-5 w-5" />}
          accent="purple"
        />
        <KpiTile
          label="Active"
          value={kpis.activeReservations}
          caption="Currently locked-in spots"
          icon={<ActivityIcon className="h-5 w-5" />}
          accent="emerald"
          progress={
            kpis.totalReservations === 0
              ? 0
              : Math.round(
                  (kpis.activeReservations / kpis.totalReservations) * 100,
                )
          }
        />
        <KpiTile
          label="Available spots"
          value={kpis.totalAvailable}
          caption="Slots drivers can book"
          icon={<ParkingIcon className="h-5 w-5" />}
          accent="blue"
          progress={
            kpis.totalCapacity === 0
              ? 0
              : Math.round((kpis.totalAvailable / kpis.totalCapacity) * 100)
          }
        />
        <KpiTile
          label="Reserved spots"
          value={kpis.totalReserved}
          caption="Currently occupied slots"
          icon={<ZapIcon className="h-5 w-5" />}
          accent="amber"
          progress={kpis.occupancyPct}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">Daily bookings</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                Reservations created in the last 14 days.
              </p>
            </div>
            <Badge variant="green">{kpis.totalReservations} total</Badge>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="day"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #1e293b",
                      borderRadius: 8,
                      color: "#f8fafc",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#colorBookings)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Reservation mix</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Active vs completed vs cancelled.
            </p>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {statusMix.map((entry, idx) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[idx]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #1e293b",
                      borderRadius: 8,
                      color: "#f8fafc",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Network occupancy</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              {kpis.totalReserved} reserved of {kpis.totalCapacity} capacity.
            </p>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={occupancyRing}
                    dataKey="value"
                    innerRadius={70}
                    outerRadius={100}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {occupancyRing.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={
                          entry.key === "reserved" ? "#f59e0b" : "#10b981"
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #1e293b",
                      borderRadius: 8,
                      color: "#f8fafc",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 text-sm">
              <span className="inline-flex items-center gap-2 text-slate-300">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Reserved · {kpis.totalReserved}
              </span>
              <span className="inline-flex items-center gap-2 text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Available · {kpis.totalAvailable}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top zones by occupancy</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              The six busiest parking zones right now.
            </p>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topZones}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    type="number"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#cbd5e1"
                    fontSize={11}
                    tickLine={false}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #1e293b",
                      borderRadius: 8,
                      color: "#f8fafc",
                    }}
                    formatter={(value, _name, item) => {
                      const payload = item?.payload as
                        | { used: number; total: number; occupancy: number }
                        | undefined;
                      const numeric =
                        typeof value === "number"
                          ? value
                          : Number(value ?? 0);
                      return [
                        `${numeric}% (${payload?.used ?? 0}/${payload?.total ?? 0} spots)`,
                        "Occupancy",
                      ];
                    }}
                  />
                  <Bar dataKey="occupancy" radius={[0, 6, 6, 0]}>
                    {topZones.map((z) => (
                      <Cell
                        key={z.name}
                        fill={TYPE_COLORS[z.type] ?? "#3b82f6"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent reservations</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                The 8 most recent driver bookings.
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="/admin/reservations">
                View all
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </CardHeader>
          <CardContent className="pt-2">
            {recentReservations.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                No reservations yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {recentReservations.map((r) => {
                  const driverName = r.user?.name ?? `User #${r.user_id}`;
                  const driverEmail = r.user?.email ?? "";
                  const initials = initialsOf(driverName, driverEmail);
                  const statusVariant: "green" | "blue" | "ghost" =
                    r.status === "active"
                      ? "green"
                      : r.status === "completed"
                        ? "blue"
                        : "ghost";
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 py-3"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 text-white font-semibold text-xs">
                        {initials}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">
                          {driverName}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {r.zone?.name ?? `Zone #${r.zone_id}`} ·{" "}
                          {formatRelativeTime(r.created_at)}
                        </p>
                      </div>
                      <Badge variant={statusVariant} className="capitalize">
                        {r.status}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Newest users</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                The 5 most recently registered accounts.
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="/admin/users">
                View all
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </CardHeader>
          <CardContent className="pt-2">
            {recentUsers.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                No users yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {recentUsers.map((u: User) => {
                  const initials = initialsOf(u.name, u.email);
                  return (
                    <li key={u.id} className="flex items-center gap-3 py-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white font-semibold text-xs">
                        {initials}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">
                          {u.name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {u.email}
                        </p>
                      </div>
                      <Badge
                        variant={u.role === "admin" ? "green" : "blue"}
                        className="capitalize"
                      >
                        {u.role}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-slate-900/60 border border-slate-800/70 animate-pulse"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 h-80 rounded-2xl bg-slate-900/60 border border-slate-800/70 animate-pulse" />
        <div className="h-80 rounded-2xl bg-slate-900/60 border border-slate-800/70 animate-pulse" />
      </div>
    </div>
  );
}