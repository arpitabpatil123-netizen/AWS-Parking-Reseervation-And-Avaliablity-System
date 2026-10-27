import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30",
        secondary:
          "border-transparent bg-slate-700/60 text-slate-200 hover:bg-slate-700",
        destructive:
          "border-transparent bg-red-500/20 text-red-300 hover:bg-red-500/30",
        outline: "border-slate-600 text-slate-300",
        ghost: "border-slate-700/50 bg-slate-800/40 text-slate-300",
        blue: "border-transparent bg-blue-500/20 text-blue-300 hover:bg-blue-500/30",
        purple:
          "border-transparent bg-purple-500/20 text-purple-300 hover:bg-purple-500/30",
        amber:
          "border-transparent bg-amber-500/20 text-amber-300 hover:bg-amber-500/30",
        green:
          "border-transparent bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
