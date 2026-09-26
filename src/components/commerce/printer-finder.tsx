import { cn } from "@/lib/utils";

export type FinderOption = { slug: string; name: string };

/**
 * "Which printer do you have?" — the shop's primary entry point.
 *
 * **A plain GET form, and deliberately not a client component.**
 *
 * The obvious build is two dependent `<select>`s wired with JavaScript that
 * fetches models when the brand changes. That would be a client island on the
 * homepage and on every compatibility page, plus a JSON endpoint to feed it, to
 * reproduce something the platform already does: a form submits, the server
 * renders the next state.
 *
 * Instead the form GETs to `/api/compatibil`, a redirect-only handler that
 * rewrites the query parameters into the canonical path
 * (`/compatibil/brother/hl-2130`). Choosing a brand without a model lands on
 * the brand page, where this same component renders again — now with that
 * brand's models filled in server-side. Two steps, no fetch logic, no
 * hydration, and it works with JavaScript disabled.
 *
 * That handler is a redirect, not the data endpoint the client version would
 * have needed: it returns no catalog data and is never called by script.
 *
 * The cost is one extra navigation to populate the model list. That is the
 * right trade for a control most visitors use once per session, and it keeps
 * the catalog pages at zero app-owned client JS.
 */
export function PrinterFinder({
  brands,
  models,
  selectedBrand,
  selectedModel,
  className,
}: {
  brands: readonly FinderOption[];
  /** Models for `selectedBrand`. Empty until a brand is chosen. */
  models?: readonly FinderOption[];
  selectedBrand?: string;
  selectedModel?: string;
  className?: string;
}) {
  const hasModels = models !== undefined && models.length > 0;

  return (
    <form
      action="/api/compatibil"
      method="get"
      className={cn(
        "border-border bg-card flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end",
        className,
      )}
    >
      <div className="flex-1">
        <label
          htmlFor="finder-brand"
          className="mb-1 block text-xs font-medium"
        >
          Marca imprimantei
        </label>
        <select
          id="finder-brand"
          name="brand"
          defaultValue={selectedBrand ?? ""}
          className="border-input bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <option value="">Selecteaza Brand</option>
          {brands.map((brand) => (
            <option key={brand.slug} value={brand.slug}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1">
        <label
          htmlFor="finder-model"
          className="mb-1 block text-xs font-medium"
        >
          Modelul
        </label>
        <select
          id="finder-model"
          name="model"
          defaultValue={selectedModel ?? ""}
          disabled={!hasModels}
          // Explains the disabled state rather than leaving it inert and
          // unexplained, which is the usual failure of dependent selects.
          aria-describedby={hasModels ? undefined : "finder-model-hint"}
          className="border-input bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {/* Wording matches reprint.ro's finder, which shoppers already know. */}
          <option value="">Selecteaza Echipament</option>
          {(models ?? []).map((model) => (
            <option key={model.slug} value={model.slug}>
              {model.name}
            </option>
          ))}
        </select>
        {!hasModels && (
          <span id="finder-model-hint" className="sr-only">
            Alege mai intai marca imprimantei, apoi vei putea alege modelul.
          </span>
        )}
      </div>

      <button
        type="submit"
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring h-10 shrink-0 rounded-md px-5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        Cauta
      </button>
    </form>
  );
}
