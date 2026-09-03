/**
 * Resolved default button style constants, dependency-free.
 *
 * `buttonBaseClasses` holds the layout, focus, disabled, and active states shared
 * by every button variant. `buttonPrimaryClasses` adds the default primary colour
 * treatment. `defaultButtonClasses` is the full class string for a plain native
 * button that must look identical to a `<Button variant="default">`.
 */

export const buttonBaseClasses =
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const buttonPrimaryClasses =
  "bg-primary text-primary-foreground hover:bg-primary/80";

export const defaultButtonClasses = `${buttonBaseClasses} ${buttonPrimaryClasses}`;
