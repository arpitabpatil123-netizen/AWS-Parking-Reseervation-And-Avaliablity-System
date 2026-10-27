import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal shadcn-style Avatar primitive.
 *
 * SpotSync doesn't currently use profile photos — every avatar is a
 * coloured circle with initials inside. We expose the same
 * `Avatar` / `AvatarImage` / `AvatarFallback` shape Radix uses so
 * adding `<AvatarImage>` later is a zero-friction drop-in.
 */

const Avatar = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "relative inline-flex h-10 w-10 shrink-0 select-none items-center justify-center overflow-hidden rounded-full",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = "Avatar";

const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, ...props }, ref) => (
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  <img
    ref={ref}
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
