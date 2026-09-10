import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Achizitii SEAP / SICAP",
  description:
    "Cum pot institutiile publice achizitiona consumabile prin SEAP / SICAP.",
  alternates: { canonical: "/info/seap" },
};

/**
 * Public procurement information page.
 *
 * Static content, no backend. Deliberately describes only the *process* — that
 * catalogue offers can be published in SEAP/SICAP on request, and that a
 * public institution can ask for one — and states no CUI, registration number,
 * contract number, framework agreement, or certification.
 *
 * Those are verifiable facts about a real legal entity participating in public
 * procurement. Inventing any of them would be publishing false statements about
 * a company's standing in a government system, which is materially worse than
 * an empty page. They are owner-supplied content and belong in a CMS field.
 *
 * The page therefore ends in a call to contact rather than a specification.
 */
export default function SeapPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Achizitii SEAP / SICAP</h1>

      <div className="mt-6 space-y-4 text-sm leading-relaxed">
        <p>
          Institutiile publice pot achizitiona consumabilele din acest catalog
          prin sistemul electronic de achizitii publice (SEAP / SICAP).
        </p>
        <p>
          Pentru produsele de care aveti nevoie putem publica o oferta in
          catalogul electronic, la cerere. Trimiteti lista de consumabile sau
          modelele de imprimante pe care le folositi, iar oferta va fi publicata
          spre atribuire.
        </p>
        <p>
          Daca nu stiti exact ce consumabile folosesc echipamentele
          dumneavoastra, cautarea dupa marca si model din pagina principala
          returneaza lista completa a produselor compatibile, cu randament si
          coduri echivalente pentru fiecare.
        </p>
      </div>

      <div className="border-border mt-8 rounded-lg border p-4">
        <h2 className="text-base font-semibold">Pasii urmatori</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Identificati consumabilele necesare, dupa modelul imprimantei sau
            dupa codul cartusului.
          </li>
          <li>Trimiteti lista, impreuna cu cantitatile estimate.</li>
          <li>
            Oferta este publicata in catalogul electronic si poate fi atribuita.
          </li>
        </ol>
      </div>

      <p className="text-muted-foreground mt-8 text-sm">
        <Link
          href="/produse"
          className="text-primary focus-visible:ring-ring rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          Rasfoieste catalogul
        </Link>{" "}
        sau{" "}
        <Link
          href="/compatibil"
          className="text-primary focus-visible:ring-ring rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          cauta dupa modelul imprimantei
        </Link>
        .
      </p>
    </main>
  );
}
