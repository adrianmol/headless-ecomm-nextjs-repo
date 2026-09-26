import { ViewTransition, type ReactNode } from "react";

/** Page transitions for checkout; see (shop)/template.tsx. */
export default function CheckoutTemplate({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ViewTransition enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  );
}
