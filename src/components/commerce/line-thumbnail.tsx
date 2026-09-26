import Image from "next/image";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Square product image for basket and order lines.
 *
 * Fixed size whether or not an image exists, so a line without one lines up
 * with its neighbours and the row height does not depend on the upstream data.
 * The image is decorative here — the product name sits right beside it — so
 * the alt text is empty rather than a repeat of the name.
 */
export function LineThumbnail({
  imageUrl,
  size = "md",
}: {
  imageUrl: string | null | undefined;
  size?: "sm" | "md";
}) {
  const px = size === "md" ? 80 : 56;
  return (
    <div
      className={cn(
        "bg-muted border-border flex shrink-0 items-center justify-center overflow-hidden rounded-md border",
        size === "md" ? "size-20" : "size-14",
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          width={px}
          height={px}
          sizes={`${px}px`}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <Package aria-hidden className="text-muted-foreground/60 size-6" />
      )}
    </div>
  );
}
