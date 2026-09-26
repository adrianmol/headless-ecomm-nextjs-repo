import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Cos", href: "/cos" },
  { label: "Date de livrare", href: "/finalizare-comanda" },
  { label: "Confirmare", href: null },
] as const;

/**
 * Where the shopper is in the three-step flow, and that it is only three.
 *
 * Earlier steps link back while the order is still open, so "change the basket"
 * is one click from checkout. Once the order is placed (`current` 2) they are
 * plain text: going back to an emptied basket is not a step of anything.
 *
 * A Server Component: position is known from the route, so no client state.
 */
export function CheckoutSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <nav aria-label="Pasii comenzii" className="mb-8">
      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const linked = done && current < 2 && step.href;

          const marker = (
            <span
              aria-hidden
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done && "bg-primary text-primary-foreground",
                active && "bg-foreground text-background",
                !done && !active && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
          );

          return (
            <li key={step.label} className="flex items-center gap-2">
              {index > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-4 sm:w-10",
                    done || active ? "bg-foreground/40" : "bg-border",
                  )}
                />
              )}
              {linked ? (
                <Link
                  href={step.href}
                  className="focus-visible:ring-ring flex items-center gap-2 rounded hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                  {marker}
                  <span className="sr-only sm:not-sr-only">{step.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2",
                    active ? "font-semibold" : "text-muted-foreground",
                  )}
                >
                  {marker}
                  {/* The current step keeps its label on narrow screens. */}
                  <span className={active ? undefined : "sr-only sm:not-sr-only"}>
                    {step.label}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
