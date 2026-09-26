"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";
import { CART_ADDED_EVENT, type CartAddedDetail } from "@/lib/cart-events";
import { LineThumbnail } from "./line-thumbnail";

const VISIBLE_MS = 6000;
const EXIT_MS = 200;
const TICK_MS = 250;

type Toast = CartAddedDetail & { id: number; pathname: string };

/*
  Own classes rather than `defaultButtonClasses`: that string fixes `h-8`, and
  without tailwind-merge in this client leaf an added `h-10` would race it.
*/
const actionBase =
  "focus-visible:ring-ring/50 inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:outline-none";

/**
 * The "added to basket" confirmation, shown for every add-to-cart on the site.
 *
 * A client leaf in the shop layout that renders an empty live region until an
 * `announceCartAdded` event arrives; see src/lib/cart-events.ts for why an
 * event rather than a provider. Like WebVitals in the root layout, it has no
 * subtree, so it does not turn the layout into a client boundary.
 *
 * - Offers the two next steps, basket and checkout, rather than just a word.
 * - Announced politely and never takes focus: the shopper may be mid-scroll
 *   through a listing and adding several things.
 * - Dismisses itself after a few seconds, but not while hovered or focused —
 *   a toast that vanishes under the pointer is a classic accessibility failure
 *   (WCAG 2.2.1). Escape and the close button end it at once.
 * - Tied to the page it was raised on, so it does not follow the shopper into
 *   the basket they just opened from it.
 */
export function CartToast() {
  const pathname = usePathname();
  const [toast, setToast] = useState<Toast | null>(null);
  const [leaving, setLeaving] = useState(false);
  const paused = useRef(false);
  const nextId = useRef(0);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    function onAdded(event: Event) {
      const detail = (event as CustomEvent<CartAddedDetail>).detail ?? {};
      nextId.current += 1;
      paused.current = false;
      setLeaving(false);
      setToast({
        ...detail,
        id: nextId.current,
        pathname: pathnameRef.current,
      });
    }
    window.addEventListener(CART_ADDED_EVENT, onAdded);
    return () => window.removeEventListener(CART_ADDED_EVENT, onAdded);
  }, []);

  // Counts down only while nobody is reading it, and restarts per toast.
  useEffect(() => {
    if (!toast || leaving) return;
    let remaining = VISIBLE_MS;
    const timer = setInterval(() => {
      if (paused.current) return;
      remaining -= TICK_MS;
      if (remaining <= 0) setLeaving(true);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [toast, leaving]);

  // Unmounts once the exit animation has played.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => {
      setToast(null);
      setLeaving(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  useEffect(() => {
    if (!toast) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLeaving(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast]);

  const visible = toast !== null && toast.pathname === pathname;
  const dismiss = () => setLeaving(true);

  return (
    // Always mounted, so the region exists before its content does — a live
    // region inserted together with its text is often not announced at all.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:justify-end sm:p-6"
    >
      {visible && (
        <div
          key={toast.id}
          onMouseEnter={() => (paused.current = true)}
          onMouseLeave={() => (paused.current = false)}
          onFocus={() => (paused.current = true)}
          onBlur={() => (paused.current = false)}
          className={`border-border bg-card pointer-events-auto w-full max-w-sm rounded-xl border p-4 shadow-lg motion-reduce:animate-none ${
            leaving
              ? "animate-out fade-out slide-out-to-bottom-2 fill-mode-forwards duration-200"
              : "animate-in fade-in slide-in-from-bottom-4 duration-300"
          }`}
        >
          <div className="flex items-start gap-3">
            <LineThumbnail imageUrl={toast.imageUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <CheckCircle2
                  aria-hidden
                  className="text-primary size-4 shrink-0"
                />
                Adaugat in cos.
              </p>
              {toast.name && (
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
                  {toast.name}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Inchide notificarea"
              className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring -mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>

          {/* Uneven on purpose: the primary label must not wrap on a phone. */}
          <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
            <Link
              href="/cos"
              onClick={dismiss}
              className={`${actionBase} border-border hover:bg-muted border`}
            >
              Vezi cosul
            </Link>
            <Link
              href="/finalizare-comanda"
              onClick={dismiss}
              className={`${actionBase} bg-primary text-primary-foreground hover:bg-primary/85`}
            >
              Finalizeaza comanda
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
