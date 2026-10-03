import * as React from "react";
import { cn } from "../lib/cn";

/**
 * Brand logo, theme-aware with no JavaScript.
 *
 * The coloured mark shows in light mode; the white mark shows in dark mode,
 * selected purely by `prefers-color-scheme` (see theme.css). Both images are
 * present in the DOM and one is hidden, so there is no flash on load.
 */
export interface LogoProps extends Omit<React.ComponentProps<"span">, "children"> {
  /** Rendered height; width follows the 1923×818 aspect ratio. */
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
  ...props
}: LogoProps) {
  const imgClass = "w-auto object-contain";
  return (
    <span
      data-slot="logo"
      className={cn("inline-flex items-center", className)}
      style={{ height }}
      {...props}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={lightSrc} alt={alt} height={height} className={cn(imgClass, "dark:hidden")} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={darkSrc}
        alt=""
        aria-hidden
        height={height}
        className={cn(imgClass, "hidden dark:block")}
      />
    </span>
  );
}
