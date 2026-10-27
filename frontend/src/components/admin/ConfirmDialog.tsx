import * as React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Reusable destructive / confirmation dialog used by the admin tables.
 *
 * Renders a shadcn-style modal with a coloured warning icon, a title,
 * a description node, and a pair of buttons. The confirm button is
 * styled destructive (red) when `variant="danger"`, primary emerald
 * otherwise. `busy` flips the confirm button into a disabled + spinner
 * state so an unawaited async handler cannot be re-triggered.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "danger",
    busy = false,
    onConfirm,
  } = props;

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } catch {
      // Caller is responsible for surfacing the error — we just close
      // the dialog only when the parent updates `open` to false.
    }
  };

  const Icon = variant === "danger" ? Trash2 : AlertTriangle;
  const iconWrapClass =
    variant === "danger"
      ? "bg-red-500/15 text-red-300 border-red-500/30"
      : "bg-amber-500/15 text-amber-300 border-amber-500/30";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconWrapClass}`}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-2">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
