import type { Metadata } from "next";
import "./globals.css";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { WebVitals } from "@/components/web-vitals";
import { cn } from "@/lib/utils";

/**
 * `latin-ext` is required, not optional: Romanian needs ă â î ș ț, and the
 * `latin` subset does not contain them. Without it every product title and most
 * body copy silently falls back to a system font mid-word.
 */
const sans = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
});

/**
 * OEM part codes (CB435A, TN-2000, 1T02RY0NL0) are the thing buyers compare
 * character by character. A monospace face makes transposed digits visible and
 * stops 0/O and 1/l collapsing into each other.
 */
const mono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "REPrint — consumabile compatibile pentru imprimante",
    template: "%s | REPrint",
  },
  description:
    "Tonere, cartuse, unitati de cilindru si piese compatibile pentru imprimante Brother, HP, Canon, Kyocera, Xerox si altele.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className={cn("font-sans", sans.variable, mono.variable)}>
      <body>
        {/*
          A client leaf that renders null. It sits in the layout because field
          metrics are wanted on every route, and it is the one exception to
          keeping client components out of layouts — it has no subtree to drag
          along with it.
        */}
        <WebVitals />

        {/*
          No header or footer here. The shop wears them via (shop)/layout.tsx;
          checkout has its own stripped-down frame in (checkout)/layout.tsx,
          because a full menu there is an exit on every step of the funnel.
        */}
        {children}
      </body>
    </html>
  );
}
