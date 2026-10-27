import * as React from "react";
import {
  Check as CheckIcon,
  Loader2 as LoaderIcon,
  Mail as MailIcon,
  Save as SaveIcon,
  ShieldCheck as ShieldIcon,
  User as UserIcon,
  X as XIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { USER_ROLES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/format";
import { toast } from "@/lib/toast";
import { updateUser } from "@/store/authStore";
import { ApiError } from "@/services/api";
import { updateProfile } from "@/services/authService";
import type { User, UserRole } from "@/types/auth";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const NAME_MIN = 2;
const NAME_MAX = 100;

function roleLabel(role: UserRole): string {
  return role === USER_ROLES.ADMIN ? "Admin" : "Driver";
}

function roleBadgeClass(role: UserRole): string {
  return role === USER_ROLES.ADMIN
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
    : "border-blue-500/30 bg-blue-500/15 text-blue-300";
}

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN) {
    return `Name must be at least ${NAME_MIN} characters.`;
  }
  if (trimmed.length > NAME_MAX) {
    return `Name must be ${NAME_MAX} characters or fewer.`;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

interface ProfileSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

/**
 * Profile settings dashboard.
 *
 * Two halves:
 *   1. A read-only identity card (email, role, joined date) so the
 *      user can confirm what the server stores.
 *   2. An editable "Display name" form that persists via
 *      `PATCH /auth/me` and updates the local auth store on success.
 *
 * Email + role are intentionally NOT editable here — changing them
 * is a sensitive flow (verification, admin grant) that lives behind
 * dedicated flows, not the quick settings modal.
 */
export function ProfileSettingsDialog(props: ProfileSettingsDialogProps) {
  const { open, onOpenChange, user } = props;

  const [name, setName] = React.useState(user.name);
  const [initialName, setInitialName] = React.useState(user.name);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Re-seed the form whenever the dialog is opened so a user can
  // edit, cancel, and re-open without seeing their stale draft.
  React.useEffect(() => {
    if (open) {
      setName(user.name);
      setInitialName(user.name);
      setError(null);
    }
  }, [open, user.name]);

  const trimmed = name.trim();
  const dirty = trimmed !== initialName.trim();
  const validationError = trimmed ? validateName(trimmed) : null;
  const canSave = dirty && !validationError && !saving;

  const initials = initialsOf(user.name, user.email);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      const updated = await updateProfile({ name: trimmed });
      updateUser(updated);
      setInitialName(updated.name);
      setName(updated.name);
      toast.success("Profile updated successfully.");
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Your session has expired. Please sign in again.");
        } else if (err.status === 400 || err.status === 422) {
          setError(err.errors || err.message || "Please check your input.");
        } else {
          setError(err.message || "We couldn't update your profile.");
        }
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred. Please try again.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setName(initialName);
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-xl",
          // Override the default px-6 so the hero header can paint
          // edge-to-edge while the body keeps comfortable padding.
          "p-0 overflow-hidden",
        )}
      >
        <form onSubmit={handleSave} className="flex flex-col">
          {/* --------------------------- Hero header ------------------------ */}
          <div
            className={cn(
              "relative overflow-hidden border-b border-slate-200 px-6 py-5",
              "bg-gradient-to-br from-white via-slate-50 to-slate-100",
              "dark:border-slate-800/80 dark:from-slate-900/90 dark:via-slate-950/80 dark:to-slate-950/40",
            )}
          >
            {/* Decorative gradient blob — purely cosmetic. */}
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-30 blur-3xl",
                user.role === USER_ROLES.ADMIN
                  ? "bg-emerald-500/40 dark:bg-emerald-500/30"
                  : "bg-blue-500/40 dark:bg-blue-500/30",
              )}
            />
            <div className="relative flex items-center gap-4">
              <Avatar className="h-14 w-14 ring-2 ring-slate-200 dark:ring-slate-800">
                <AvatarFallback
                  className={cn(
                    "bg-gradient-to-br font-display text-base font-semibold text-white",
                    user.role === USER_ROLES.ADMIN
                      ? "from-emerald-500 to-blue-600"
                      : "from-blue-500 to-indigo-600",
                  )}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <DialogHeader className="space-y-1 p-0">
                  <DialogTitle className="text-xl text-slate-900 dark:text-slate-50">
                    Profile settings
                  </DialogTitle>
                  <DialogDescription className="text-slate-600 dark:text-slate-400">
                    Update your display name. Email and role are managed by your
                    account administrator.
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>
          </div>

          {/* ----------------------------- Body ---------------------------- */}
          <div className="flex flex-col gap-5 px-6 py-5">
            {/* ---- Read-only identity fields (email + role) ---- */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ReadOnlyField
                label="Email address"
                value={user.email}
                icon={<MailIcon className="h-3.5 w-3.5" />}
              />
              <ReadOnlyField
                label="Role"
                value={roleLabel(user.role)}
                icon={
                  user.role === USER_ROLES.ADMIN ? (
                    <ShieldIcon className="h-3.5 w-3.5" />
                  ) : (
                    <UserIcon className="h-3.5 w-3.5" />
                  )
                }
                trailing={
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1 px-2 py-0 text-[0.6rem] uppercase tracking-wider",
                      roleBadgeClass(user.role),
                    )}
                  >
                    {roleLabel(user.role)}
                  </Badge>
                }
              />
            </div>

            {/* ---- Editable display name ---- */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="profile-name"
                className="text-[0.75rem] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Display name
              </label>
              <div className="relative">
                <Input
                  id="profile-name"
                  name="name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (error) setError(null);
                  }}
                  maxLength={NAME_MAX}
                  autoComplete="name"
                  placeholder="Your full name"
                  className={cn(
                    "h-11 pl-10 pr-24 text-sm",
                    // Inline validation styling — red ring only when
                    // the user has actually typed something invalid.
                    validationError &&
                      trimmed.length > 0 &&
                      "border-red-500/60 focus-visible:ring-red-500/40",
                  )}
                  aria-invalid={Boolean(validationError && trimmed.length > 0)}
                  aria-describedby="profile-name-hint"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                >
                  <UserIcon className="h-4 w-4" />
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.7rem] tabular-nums",
                    trimmed.length > NAME_MAX - 10
                      ? "text-amber-600 dark:text-amber-300"
                      : "text-slate-400 dark:text-slate-500",
                  )}
                >
                  {trimmed.length}/{NAME_MAX}
                </span>
              </div>
              <p
                id="profile-name-hint"
                className={cn(
                  "text-xs",
                  validationError && trimmed.length > 0
                    ? "text-red-600 dark:text-red-300"
                    : "text-slate-500 dark:text-slate-500",
                )}
              >
                {validationError && trimmed.length > 0
                  ? validationError
                  : `This is the name shown across SpotSync (${NAME_MIN}–${NAME_MAX} characters).`}
              </p>
            </div>

            {/* ---- Inline error banner ---- */}
            {error && (
              <div
                role="alert"
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-200",
                )}
              >
                <XIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* ---- Dirty indicator ---- */}
            {dirty && !error && !validationError && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                </span>
                You have unsaved changes.
              </div>
            )}
          </div>

          {/* ---------------------------- Footer ---------------------------- */}
          <DialogFooter
            className={cn(
              "gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between",
              "dark:border-slate-800/80 dark:bg-slate-950/60",
            )}
          >
            <p className="text-xs text-slate-500">
              Changes save immediately to your account.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={!dirty || saving}
                className="h-10"
              >
                Reset
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="h-10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSave}
                className="h-10 min-w-[8.5rem]"
              >
                {saving ? (
                  <>
                    <LoaderIcon className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : dirty ? (
                  <>
                    <SaveIcon className="h-4 w-4" />
                    Save changes
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    Saved
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Read-only field row                                                         */
/* -------------------------------------------------------------------------- */

interface ReadOnlyFieldProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
}

function ReadOnlyField({ label, value, icon, trailing }: ReadOnlyFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
        {label}
      </span>
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700",
          "dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-200",
        )}
      >
        <span
          aria-hidden="true"
          className="text-slate-400 dark:text-slate-500"
        >
          {icon}
        </span>
        <span className="flex-1 truncate">{value}</span>
        {trailing}
      </div>
    </div>
  );
}
