import * as React from "react";
import {
  Search as SearchIcon,
  RefreshCw as RefreshIcon,
  Trash2 as TrashIcon,
  ShieldCheck,
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
import { loadAdminData, type AdminDataBundle } from "@/services/adminData";
import {
  countUsersByRole,
  deleteUser,
} from "@/services/userService";
import { formatDate, initialsOf } from "@/lib/format";
import { toast } from "@/lib/toast";
import { $user } from "@/store/authStore";
import type { User, UserRole } from "@/types/auth";
import { ConfirmDialog } from "./ConfirmDialog";

const ROLE_FILTERS: Array<{ key: UserRole | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "driver", label: "Drivers" },
  { key: "admin", label: "Admins" },
  { key: "staff", label: "Staff" },
];

export function UsersTable() {
  const [bundle, setBundle] = React.useState<AdminDataBundle | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<UserRole | "all">("all");

  const [pending, setPending] = React.useState<User | null>(null);
  const [busy, setBusy] = React.useState(false);

  const currentUser = $user.get();

  const fetchData = React.useCallback(async () => {
    try {
      const [data, driverCount, adminCount] = await Promise.all([
        loadAdminData(),
        countUsersByRole("driver").catch(() => 0),
        countUsersByRole("admin").catch(() => 0),
      ]);
      setBundle({
        ...data,
        driverCount,
        adminCount,
      });
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

  const users = bundle?.users ?? [];

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const newThisMonth = React.useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return users.filter(
      (u) => new Date(u.created_at).getTime() >= cutoff,
    ).length;
  }, [users]);

  const handleDelete = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await deleteUser(pending.id);
      toast.success(`Deleted user ${pending.email}.`);
      setPending(null);
      await fetchData();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to delete user.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total users" value={bundle?.users.length ?? 0} accent="emerald" />
        <Kpi label="Drivers" value={bundle?.driverCount ?? 0} accent="blue" />
        <Kpi label="Admins" value={bundle?.adminCount ?? 0} accent="amber" />
        <Kpi label="New (30 days)" value={newThisMonth} accent="purple" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">All users</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Inspect, audit, and remove accounts on the platform.
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
                placeholder="Search name or email…"
                className="pl-9"
              />
            </div>
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
              {ROLE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setRoleFilter(f.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    roleFilter === f.key
                      ? "bg-slate-800 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading && filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              Loading users…
            </div>
          ) : error && !bundle ? (
            <div className="p-8 text-center text-slate-300">
              <p className="font-semibold">Couldn't load users.</p>
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
              <p className="font-semibold text-slate-200">No users match</p>
              <p className="text-sm mt-1">
                Try adjusting the search or role filter.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="w-20">User #</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const initials = initialsOf(u.name, u.email);
                  const isSelf = currentUser?.id === u.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white font-semibold text-xs">
                            {initials}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-100 truncate">
                              {u.name}
                              {isSelf ? (
                                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
                                  <ShieldCheck className="h-3 w-3" />
                                  you
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.role === "admin" ? "green" : "blue"}
                          className="capitalize"
                        >
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-100">
                          {formatDate(u.created_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-400">
                          #{u.id}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                          disabled={isSelf}
                          title={
                            isSelf
                              ? "You cannot delete your own account."
                              : "Delete user"
                          }
                          onClick={() => setPending(u)}
                        >
                          <TrashIcon className="h-4 w-4" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-800/70 bg-slate-900/40 flex-wrap">
            <span className="text-sm text-slate-400">
              {filtered.length} user{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        busy={busy}
        onConfirm={handleDelete}
        title="Delete this user?"
        description={
          pending ? (
            <>
              The account <strong>{pending.name}</strong> ({pending.email})
              will be permanently removed. Associated reservations will be
              orphaned. This action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete user"
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
