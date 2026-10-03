import * as React from "react";
import { cn } from "../lib/cn";

/**
 * Brand logo, theme-aware with no JavaScript.
 *
 * The coloured mark shows in light mode; the white mark shows in dark mode,
 * selected purely by `prefers-color-scheme` (see theme.css). Both images are
 * present in the DOM and one is hidden, so there is no flash on load.
 *
 * `height` sets the rendered height in px; width follows the 1923×818 mark's
 * aspect ratio.
 */
export interface LogoProps extends Omit<React.ComponentProps<"span">, "children"> {
  height?: number;
  alt?: string;
  lightSrc?: string;
  darkSrc?: string;
}

export function Logo({
  className,
  height = 28,
  alt = "KAP",
  lightSrc = "/kap-logo.png",
  darkSrc = "/kap-logo-white.png",
  style,
  ...props
}: LogoProps) {
  return (
    <span
      data-slot="logo"
      className={cn("inline-flex shrink-0 items-center", className)}
      style={{ height, ...style }}
      {...props}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={lightSrc} alt={alt} className="block h-full w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={darkSrc} alt="" aria-hidden className="hidden h-full w-auto dark:block" />
    </span>
  );
}
