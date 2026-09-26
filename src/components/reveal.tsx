import { Suspense, ViewTransition, type ReactNode } from "react";

/**
 * A Suspense boundary whose skeleton hands over to the content instead of
 * being swapped for it: the skeleton fades out fast, the content fades and
 * rises in. See the Motion block in globals.css for the classes.
 *
 * Same contract as <Suspense> otherwise, including the CLS rule: `fallback`
 * must still reserve the loaded content's height. The animation is opacity and
 * transform only, so it moves nothing in layout.
 *
 * `default="none"` on both sides keeps these from animating on unrelated
 * transitions — a basket refresh or a page change elsewhere.
 */
export function Reveal({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="skeleton-out" default="none">
          {fallback}
        </ViewTransition>
      }
    >
      <ViewTransition enter="content-in" default="none">
        {children}
      </ViewTransition>
    </Suspense>
  );
}
