import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Search by product code. A plain GET form to `/cauta`, for the same reason the
 * printer finder is one: it works without JavaScript and every search is a URL.
 *
 * **It says "cod produs", not the plan's „codul de pe cartuș".** HUB resolves a
 * product by its own code and nothing else yet — an OEM code printed on a
 * cartridge finds nothing (docs/hub-api-gaps.md §2). Promising that search and
 * failing it is worse than naming the one that works. The label changes when
 * the search route exists; the form does not.
 *
 * `id` and `label` are required because the header renders one on every page
 * and the home page renders a second. Two inputs sharing an id break both
 * labels, and two search landmarks sharing a name are indistinguishable in a
 * screen reader's landmark list.
 */
export function CodeSearch({
  id,
  label,
  className,
}: {
  id: string;
  label: string;
  className?: string;
}) {
  return (
    <form
      action="/cauta"
      method="get"
      role="search"
      aria-label={label}
      className={cn("flex gap-2", className)}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        name="q"
        type="search"
        placeholder="Cod produs, de ex. CN-PGI29C"
        // A part code is not a word: no correction, no capitalised first letter.
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={64}
        className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 flex-1 rounded-md border px-3 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
      />
      <button
        type="submit"
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring flex h-10 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        <Search aria-hidden className="size-4" />
        <span className="sr-only sm:not-sr-only">Caută</span>
      </button>
    </form>
  );
}
