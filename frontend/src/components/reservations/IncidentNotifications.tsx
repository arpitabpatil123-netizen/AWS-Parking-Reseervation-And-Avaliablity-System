import React from "react";

import { getMyNotifications, markNotificationRead } from "@/services/incidentService";
import { isAuthenticated } from "@/store/authStore";
import type { Notification } from "@/types/incident";

export function IncidentNotifications() {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [updating, setUpdating] = React.useState<number | null>(null);

  const loadNotifications = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setNotifications(await getMyNotifications());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isAuthenticated()) {
      window.location.assign("/login");
      return;
    }
    void loadNotifications();
  }, [loadNotifications]);

  async function markRead(id: number) {
    setUpdating(id);
    setError("");
    try {
      const updated = await markNotificationRead(id);
      setNotifications((current) => current.map((item) => item.id === id ? updated : item));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update notification.");
    } finally {
      setUpdating(null);
    }
  }

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  return (
    <section id="incident-notifications" className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Parking alerts</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Incident and zone-closure updates for your reservations.
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300">
            {unreadCount} unread
          </span>
        )}
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {loading ? (
        <p className="mt-5 text-sm text-slate-500" aria-live="polite">Loading alerts…</p>
      ) : notifications.length === 0 ? (
        <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          You have no parking incident alerts.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`rounded-xl border p-4 ${notification.is_read ? "border-slate-200 dark:border-slate-700" : "border-amber-400/50 bg-amber-500/5"}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{notification.message}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(notification.created_at).toLocaleString()}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm font-medium">
                    <a className="text-emerald-700 hover:underline dark:text-emerald-300" href="/">Browse available zones</a>
                    {notification.reservation_id && (
                      <a className="text-slate-600 hover:underline dark:text-slate-300" href="/my-reservations">
                        View my reservations
                      </a>
                    )}
                  </div>
                </div>
                {!notification.is_read && (
                  <button
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    type="button"
                    disabled={updating === notification.id}
                    onClick={() => void markRead(notification.id)}
                  >
                    {updating === notification.id ? "Saving…" : "Mark as read"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
