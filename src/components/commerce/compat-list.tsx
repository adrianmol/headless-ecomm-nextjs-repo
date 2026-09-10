import Link from "next/link";

export type CompatBrand = {
  brandSlug: string;
  brandName: string;
  models: readonly { slug: string; name: string }[];
};

/**
 * Which printers this consumable fits.
 *
 * The single most important block on the page after the price: a buyer's whole
 * question is "will this work in my machine", and getting it wrong means a
 * return. So the models are listed in full rather than truncated behind a
 * "show more" — a hidden model is indistinguishable from an unsupported one.
 *
 * Each model links to its own compatibility page, which turns the PDP into a
 * lateral navigation surface: someone who landed on the wrong cartridge for
 * their printer is one click from the right one.
 */
export function CompatList({ brands }: { brands: readonly CompatBrand[] }) {
  if (brands.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="compat-heading">
      <h2 id="compat-heading" className="text-base font-semibold">
        Compatibil cu
      </h2>
      <dl className="mt-3 space-y-3">
        {brands.map((brand) => (
          <div key={brand.brandSlug}>
            <dt className="text-sm font-medium">
              <Link
                href={`/compatibil/${brand.brandSlug}`}
                className="focus-visible:ring-ring rounded hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {brand.brandName}
              </Link>
            </dt>
            <dd className="mt-1.5">
              <ul className="flex flex-wrap gap-1.5">
                {brand.models.map((model) => (
                  <li key={model.slug}>
                    <Link
                      href={`/compatibil/${brand.brandSlug}/${model.slug}`}
                      className="border-border bg-secondary text-secondary-foreground focus-visible:ring-ring hover:border-foreground/30 inline-block rounded border px-2 py-1 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {model.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
