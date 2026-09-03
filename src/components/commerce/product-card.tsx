import Image from "next/image";
import Link from "next/link";

export type ProductCardProps = {
  slug: string;
  title: string;
  image?: { url: string; alt: string; width: number; height: number };
};

/**
 * Presentational: plain props, no data-layer import (enforced by the ESLint
 * boundary rule). A Server Component — nothing here is interactive, so shipping
 * it to the browser would be wasted bytes.
 */
export function ProductCard({ slug, title, image }: ProductCardProps) {
  return (
    <Link
      href={`/products/${slug}`}
      className="group focus-visible:ring-ring block rounded-lg focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="bg-muted relative aspect-4/5 overflow-hidden rounded-lg">
        {image && (
          <Image
            src={image.url}
            alt={image.alt}
            width={image.width}
            height={image.height}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        )}
      </div>
      <h2 className="mt-2 text-sm font-medium">{title}</h2>
    </Link>
  );
}

/** Mirrors ProductCard's box exactly: same aspect ratio, same title line height. */
export function ProductCardSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-muted aspect-4/5 animate-pulse rounded-lg" />
      <div className="bg-muted mt-2 h-5 w-3/4 animate-pulse rounded" />
    </div>
  );
}
