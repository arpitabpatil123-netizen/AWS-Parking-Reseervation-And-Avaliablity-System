import * as React from "react";
import {
  ChevronDown as ChevronDownIcon,
  LogOut as LogOutIcon,
  Mail as MailIcon,
  Settings as SettingsIcon,
  ShieldCheck as ShieldIcon,
  User as UserIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ROUTES, USER_ROLES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/format";
import { toast } from "@/lib/toast";
import { clearSession, $user } from "@/store/authStore";
import type { User, UserRole } from "@/types/auth";

import { ProfileSettingsDialog } from "./ProfileSettingsDialog";

/* -------------------------------------------------------------------------- */
/* Tiny primitive: click-outside hook                                          */
/* -------------------------------------------------------------------------- */

/**
 * Runs `handler` when the user clicks anywhere outside `ref.current`.
 * `ignoredSelectors` lets callers exclude the trigger button so the
 * toggle can both open AND close the menu without flicker.
 */
function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  handler: () => void,
  ignoredSelectors: string[] = [],
): void {
  React.useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Element | null;
      if (!target || !ref.current) return;
      if (ref.current.contains(target)) return;
      if (ignoredSelectors.some((sel) => target.closest(sel))) return;
      handler();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [ref, handler, ignoredSelectors]);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function roleLabel(role: UserRole): string {
  return role === USER_ROLES.ADMIN ? "Admin" : "Driver";
}

function roleBadgeClass(role: UserRole): string {
  return role === USER_ROLES.ADMIN
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
    : "border-blue-500/30 bg-blue-500/15 text-blue-300";
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

interface UserMenuProps {
  /**
   * Hydration entry point. The navbar component renders this island
   * with `client:only="react"` so the initial SSR HTML can stay
   * simple. We seed it with the persisted user record from the
   * Nano Store so the very first paint already shows the right
   * avatar initials instead of a blank circle.
   */
  initialUser?: User | null;
}

/**
 * Circular avatar trigger that opens a shadcn-styled account menu.
 *
 * Renders the Sign In / Register pair when no user is present so the
 * navbar still has a working auth affordance for guests without
 * having to keep a parallel SSR placeholder.
 */
export function UserMenu(props: UserMenuProps) {
  // SSR safety: the persistent atom only reads from localStorage in
  // the browser, so on the server we always render the guest state.
  // The client `useEffect` below upgrades us to the avatar once the
  // store has hydrated — `mounted` tracks the transition so the
  // hydration step stays deterministic and never flashes the wrong UI.
  const [user, setUser] = React.useState<User | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // Pull the persisted user once the store is available, then
    // subscribe so login/logout/profile-update from anywhere else
    // in the app keeps the avatar in sync without manual refreshes.
    setUser($user.get());
    setMounted(true);
    return $user.listen((next) => setUser(next));
  }, []);

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setMenuOpen(false), [
    "[data-user-menu-trigger]",
  ]);

  // Close menu on Escape (accessibility + keyboard parity with the
  // native <select> behaviour users expect from a dropdown).
  React.useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  /* ----------------------------- Guest state ---------------------------- */
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={ROUTES.LOGIN}
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white/70 px-4 text-sm font-medium text-slate-700 backdrop-blur-md transition-all",
            "hover:border-slate-400 hover:bg-white hover:text-slate-900",
            "dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200",
            "dark:hover:border-slate-600 dark:hover:bg-slate-800/60 dark:hover:text-slate-50",
          )}
        >
          Sign In
        </a>
        <a
          href={ROUTES.REGISTER}
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all",
            "hover:from-emerald-400 hover:to-emerald-500 hover:shadow-emerald-500/50",
          )}
        >
          Register
        </a>
      </div>
    );
  }

  /* ----------------------------- Logged-in state ------------------------ */
  const initials = initialsOf(user.name, user.email);

  function openSettings() {
    setMenuOpen(false);
    // Defer to the next tick so the dropdown finishes its close
    // animation before the dialog mounts.
    window.setTimeout(() => setSettingsOpen(true), 0);
  }

  function handleLogout() {
    setMenuOpen(false);
    clearSession();
    toast.info("You have been signed out.");
    window.location.href = ROUTES.LOGIN;
  }

  return (
    <>
      <div className="relative flex items-center">
        <button
          ref={triggerRef}
          type="button"
          data-user-menu-trigger
          aria-label="Open account menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className={cn(
            "group relative inline-flex h-10 w-10 items-center justify-center rounded-full",
            "ring-1 ring-slate-300 transition-all duration-200",
            "hover:ring-emerald-500/60 hover:shadow-lg hover:shadow-emerald-500/25",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60",
            "dark:ring-slate-700/60",
            menuOpen && "ring-emerald-500/60 shadow-lg shadow-emerald-500/25",
          )}
        >
          <Avatar className="h-10 w-10">
            <AvatarFallback
              className={cn(
                "bg-gradient-to-br font-display text-sm font-semibold text-white",
                user.role === USER_ROLES.ADMIN
                  ? "from-emerald-500 to-blue-600"
                  : "from-blue-500 to-indigo-600",
              )}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          {/* Tiny chevron badge — makes the trigger read as "menu" not "icon". */}
          <span
            aria-hidden="true"
            className={cn(
              "absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white bg-slate-100 text-slate-600 transition-transform duration-200",
              "dark:border-slate-900 dark:bg-slate-800 dark:text-slate-300",
              menuOpen && "rotate-180 bg-emerald-500 text-white",
            )}
          >
            <ChevronDownIcon className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Account menu"
            className={cn(
              "absolute right-0 top-12 z-50 w-72 origin-top-right overflow-hidden rounded-2xl",
              "border border-slate-200 bg-white/95 text-slate-900 backdrop-blur-xl shadow-2xl shadow-slate-900/20",
              "dark:border-slate-700/70 dark:bg-slate-950/95 dark:text-slate-100 dark:shadow-black/60",
              "animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2",
            )}
          >
            {/* Header card: avatar + identity + role badge */}
            <div
              className={cn(
                "border-b border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4",
                "dark:border-slate-800/80 dark:from-slate-900/80 dark:to-slate-950/40",
              )}
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarFallback
                    className={cn(
                      "bg-gradient-to-br font-display text-sm font-semibold text-white",
                      user.role === USER_ROLES.ADMIN
                        ? "from-emerald-500 to-blue-600"
                        : "from-blue-500 to-indigo-600",
                    )}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate font-display text-sm font-semibold text-slate-900",
                      "dark:text-slate-50",
                    )}
                  >
                    {user.name}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500",
                      "dark:text-slate-400",
                    )}
                  >
                    <MailIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </p>
                  <div className="mt-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1 px-2 py-0 text-[0.65rem] uppercase tracking-wider",
                        roleBadgeClass(user.role),
                      )}
                    >
                      {user.role === USER_ROLES.ADMIN ? (
                        <ShieldIcon className="h-3 w-3" />
                      ) : (
                        <UserIcon className="h-3 w-3" />
                      )}
                      {roleLabel(user.role)}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={openSettings}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                  "focus-visible:bg-slate-100 focus-visible:outline-none",
                  "dark:text-slate-200 dark:hover:bg-slate-800/70 dark:hover:text-slate-50",
                  "dark:focus-visible:bg-slate-800/70",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition-colors",
                    "group-hover:border-emerald-500/40 group-hover:bg-emerald-500/10 group-hover:text-emerald-600",
                    "dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300 dark:group-hover:text-emerald-300",
                  )}
                >
                  <SettingsIcon className="h-4 w-4" />
                </span>
                <span className="flex-1">Settings</span>
                <span
                  className={cn(
                    "text-[0.65rem] uppercase tracking-wider text-slate-400 group-hover:text-slate-500",
                    "dark:text-slate-500 dark:group-hover:text-slate-400",
                  )}
                >
                  Profile
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className={cn(
                  "group mt-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  "text-red-600 hover:bg-red-500/10 hover:text-red-700",
                  "focus-visible:bg-red-500/10 focus-visible:outline-none",
                  "dark:text-red-300 dark:hover:text-red-200",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 transition-colors",
                    "group-hover:border-red-500/50 group-hover:bg-red-500/20 group-hover:text-red-700",
                    "dark:text-red-300",
                  )}
                >
                  <LogOutIcon className="h-4 w-4" />
                </span>
                <span className="flex-1">Logout</span>
                <span
                  className={cn(
                    "text-[0.65rem] uppercase tracking-wider text-red-500/80 group-hover:text-red-600",
                    "dark:text-red-400/70 dark:group-hover:text-red-300",
                  )}
                >
                  Sign out
                </span>
              </button>
            </div>

            {/* Footer microcopy: when the token expires, this footer
                turns into a small reminder. Today it's just a calm
                signature so the menu never looks "unfinished". */}
            <div
              className={cn(
                "border-t border-slate-200 bg-slate-50 px-4 py-2 text-[0.65rem] uppercase tracking-wider text-slate-500",
                "dark:border-slate-800/80 dark:bg-slate-950/60 dark:text-slate-500",
              )}
            >
              Signed in · session active
            </div>
          </div>
        )}
      </div>

      <ProfileSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        user={user}
      />

      {/* Tiny hidden marker so the legacy script in Navbar.astro can
          detect "the React island is mounted" and skip its duplicate
          auth rendering. Not strictly required at runtime. */}
      <span data-user-menu-mounted hidden />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Convenience re-export so the navbar can pass the store snapshot once.      */
/* -------------------------------------------------------------------------- */

/**
 * Read the current user synchronously and return a snapshot suitable
 * for the React island's `initialUser` prop. Useful in SSR contexts
 * where the store has already hydrated.
 */
export function getInitialUser(): User | null {
  return $user.get();
}

export default UserMenu;
