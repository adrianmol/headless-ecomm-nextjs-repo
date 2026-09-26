/**
 * Romania's 41 counties plus Bucuresti, the set a Romanian courier expects in
 * the "judet" field of an address.
 *
 * Spelled without diacritics, like the rest of the storefront's copy, and in
 * the form couriers and the shop recognise. A closed list rather than free
 * text: "Cj", "Cluj-Napoca" and "jud Cluj" are all the same county to a person
 * and three different values to a courier's import.
 *
 * Shared by the form (options) and the schema (validation), so the two cannot
 * disagree.
 */
export const RO_COUNTIES = [
  "Alba",
  "Arad",
  "Arges",
  "Bacau",
  "Bihor",
  "Bistrita-Nasaud",
  "Botosani",
  "Braila",
  "Brasov",
  "Bucuresti",
  "Buzau",
  "Calarasi",
  "Caras-Severin",
  "Cluj",
  "Constanta",
  "Covasna",
  "Dambovita",
  "Dolj",
  "Galati",
  "Giurgiu",
  "Gorj",
  "Harghita",
  "Hunedoara",
  "Ialomita",
  "Iasi",
  "Ilfov",
  "Maramures",
  "Mehedinti",
  "Mures",
  "Neamt",
  "Olt",
  "Prahova",
  "Salaj",
  "Satu Mare",
  "Sibiu",
  "Suceava",
  "Teleorman",
  "Timis",
  "Tulcea",
  "Valcea",
  "Vaslui",
  "Vrancea",
] as const;

export function isRoCounty(value: string): boolean {
  return (RO_COUNTIES as readonly string[]).includes(value);
}
