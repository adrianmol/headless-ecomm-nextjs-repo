/**
 * Catalog fixtures for the REPrint consumables storefront.
 *
 * TEMPORARY SCAFFOLDING, like the mock API that serves it. Shared by
 * `scripts/mock-api.mjs` so the dev server, `build:ci` and E2E all see one
 * catalog — two divergent fixture sets is how a test passes against data the
 * running app never returns.
 *
 * Shapes mirror openapi/commerce.yaml exactly. If this drifts from the spec the
 * build stops exercising the real contract and becomes theatre.
 */

/** Romanian standard VAT, in basis points. */
export const VAT_RATE = 2100;

const RON = "RON";

/**
 * Money in bani (minor units). Never a float anywhere in this file.
 *
 * `ron(3400)` is 34,00 lei.
 */
export const ron = (amountMinor) => ({ amountMinor, currency: RON });

/**
 * The backend is the only thing allowed to divide by the VAT rate, and in
 * development that is this file. The storefront receives both figures and
 * derives neither — see ADR-0004.
 *
 * Rounds half away from zero on the net amount, which is the convention
 * Romanian invoicing uses.
 */
export const exVat = (grossMinor) =>
  ron(Math.round(grossMinor / (1 + VAT_RATE / 10000)));

const brand = (slug, name) => ({ slug, name });

export const printerBrands = [
  brand("brother", "Brother"),
  brand("hp", "HP"),
  brand("canon", "Canon"),
  brand("kyocera", "Kyocera"),
  brand("xerox", "Xerox"),
  brand("samsung", "Samsung"),
  brand("lexmark", "Lexmark"),
  brand("epson", "Epson"),
];

/** Printer models per brand slug, for the finder's second dropdown. */
export const printerModels = {
  brother: [
    { slug: "hl-2130", name: "HL-2130" },
    { slug: "hl-l2350dw", name: "HL-L2350DW" },
    { slug: "dcp-1510", name: "DCP-1510" },
    { slug: "mfc-j1010dw", name: "MFC-J1010DW" },
    { slug: "hl-b2080dw", name: "HL-B2080DW" },
  ],
  hp: [
    { slug: "laserjet-p1005", name: "LaserJet P1005" },
    { slug: "laserjet-pro-m15w", name: "LaserJet Pro M15w" },
    { slug: "laserjet-1018", name: "LaserJet 1018" },
    { slug: "deskjet-2720", name: "DeskJet 2720" },
  ],
  canon: [
    { slug: "i-sensys-lbp6030", name: "i-SENSYS LBP6030" },
    { slug: "i-sensys-mf3010", name: "i-SENSYS MF3010" },
    { slug: "pixma-ts3350", name: "PIXMA TS3350" },
  ],
  kyocera: [
    { slug: "ecosys-p2040dn", name: "ECOSYS P2040dn" },
    { slug: "ecosys-m2040dn", name: "ECOSYS M2040dn" },
  ],
  xerox: [
    { slug: "phaser-3020", name: "Phaser 3020" },
    { slug: "workcentre-3025", name: "WorkCentre 3025" },
  ],
  samsung: [
    { slug: "ml-1670", name: "ML-1670" },
    { slug: "xpress-m2020", name: "Xpress M2020" },
  ],
  lexmark: [
    { slug: "ms310dn", name: "MS310dn" },
    { slug: "e260", name: "E260" },
  ],
  epson: [
    { slug: "ecotank-l3150", name: "EcoTank L3150" },
    { slug: "workforce-wf-2830", name: "WorkForce WF-2830" },
  ],
};

const brandBySlug = new Map(printerBrands.map((b) => [b.slug, b]));

/**
 * Expands `["brother:hl-2130", "brother:dcp-1510"]` into the nested
 * Compatibility shape, grouping models under their brand.
 */
function compat(refs) {
  const grouped = new Map();
  for (const ref of refs) {
    const [brandSlug, modelSlug] = ref.split(":");
    const printerBrand = brandBySlug.get(brandSlug);
    const model = (printerModels[brandSlug] ?? []).find(
      (m) => m.slug === modelSlug,
    );
    if (!printerBrand || !model) {
      throw new Error(`Unknown compatibility reference: ${ref}`);
    }
    if (!grouped.has(brandSlug)) {
      grouped.set(brandSlug, { printerBrand, printerModels: [] });
    }
    grouped.get(brandSlug).printerModels.push(model);
  }
  return [...grouped.values()];
}

/** Placeholder art, one per kind. Real photography is a content task. */
const image = (kind, alt) => ({
  url: `/img/${kind}.png`,
  alt,
  width: 800,
  height: 800,
});

/**
 * The catalog.
 *
 * Titles follow the shop's real convention — kind, yield in parentheses, brand,
 * model, colour, then OEM codes — because that is the string buyers scan and
 * paste into search engines.
 */
const catalog = [
  {
    slug: "toner-compatibil-hp-35a-black-cb435a",
    title: "Toner compatibil (2K) HP 35A Black (CB435A)",
    description:
      "Cartus de toner compatibil pentru imprimante HP LaserJet. Randament 2.000 de pagini la acoperire 5% conform ISO/IEC 19752.",
    kind: "toner",
    attributes: {
      color: "black",
      yieldPages: 2000,
      oemCodes: ["CB435A", "35A"],
      manufacturer: "G&G",
      isOriginal: false,
    },
    compatibility: ["hp:laserjet-p1005", "hp:laserjet-1018"],
    gross: 3400,
    compareAtGross: 4200,
    stock: 42,
  },
  {
    slug: "toner-compatibil-brother-tn-2000-black",
    title: "Toner compatibil (2.5K) Brother TN 2000 Black (TN-2000, TN2000)",
    description:
      "Cartus de toner compatibil pentru imprimante Brother HL si DCP. Randament 2.500 de pagini la acoperire 5%.",
    kind: "toner",
    attributes: {
      color: "black",
      yieldPages: 2500,
      oemCodes: ["TN-2000", "TN2000"],
      manufacturer: "INTEGRAL",
      isOriginal: false,
    },
    compatibility: ["brother:hl-2130", "brother:dcp-1510"],
    gross: 3800,
    stock: 18,
    // The one fixture with quantity breaks: offices buy toner by the box, and
    // the tier table needs a product to render on in development.
    tiers: [
      { minQuantity: 3, gross: 3600 },
      { minQuantity: 10, gross: 3300 },
    ],
  },
  {
    slug: "toner-compatibil-brother-tn-119-black",
    title: "Toner compatibil (1.5K) Brother TN 119 Black (TN-119, TN119)",
    description:
      "Cartus de toner compatibil de capacitate standard pentru imprimante Brother.",
    kind: "toner",
    attributes: {
      color: "black",
      yieldPages: 1500,
      oemCodes: ["TN-119", "TN119"],
      manufacturer: "HYB",
      isOriginal: false,
    },
    compatibility: ["brother:hl-2130"],
    gross: 2000,
    stock: 3,
  },
  {
    slug: "unitate-cilindru-compatibila-brother-dr-b023",
    title:
      "Unitate de cilindru compatibila (12K) Brother DR B023 Black (DR-B023, DRB023)",
    description:
      "Unitate de cilindru (drum) compatibila. Randament 12.000 de pagini. Se inlocuieste independent de cartusul de toner.",
    kind: "drum",
    attributes: {
      color: "none",
      yieldPages: 12000,
      oemCodes: ["DR-B023", "DRB023"],
      manufacturer: "CET",
      isOriginal: false,
    },
    compatibility: ["brother:hl-b2080dw"],
    gross: 7200,
    stock: 7,
  },
  {
    slug: "cartus-compatibil-brother-lc-421xl-black",
    title: "Cartus compatibil (6K) Brother LC 421XL Black (LC-421XLBK)",
    description:
      "Cartus cu cerneala compatibil de mare capacitate pentru multifunctionale Brother inkjet.",
    kind: "inkjet",
    attributes: {
      color: "black",
      yieldPages: 6000,
      oemCodes: ["LC-421XLBK", "LC421XLBK"],
      manufacturer: "InkMate",
      isOriginal: false,
    },
    compatibility: ["brother:mfc-j1010dw"],
    gross: 4500,
    stock: 25,
  },
  {
    slug: "toner-compatibil-hp-w1106a-black",
    title: "Toner compatibil (1K) HP 106A Black (W1106A)",
    description:
      "Cartus de toner compatibil pentru imprimante HP Laser 107 si MFP 135.",
    kind: "toner",
    attributes: {
      color: "black",
      yieldPages: 1000,
      oemCodes: ["W1106A", "106A"],
      manufacturer: "G&G",
      isOriginal: false,
    },
    compatibility: ["hp:laserjet-pro-m15w"],
    gross: 3900,
    stock: 0,
  },
  {
    slug: "cartus-compatibil-hp-305-color",
    title: "Cartus compatibil (200p) HP 305 Color (3YM60AE)",
    description:
      "Cartus cu cerneala tricolor compatibil pentru imprimante HP DeskJet.",
    kind: "inkjet",
    attributes: {
      color: "tricolor",
      yieldPages: 200,
      oemCodes: ["3YM60AE", "305"],
      manufacturer: "InkMate",
      isOriginal: false,
    },
    compatibility: ["hp:deskjet-2720"],
    gross: 5500,
    stock: 11,
  },
  {
    slug: "toner-compatibil-canon-crg-725-black",
    title: "Toner compatibil (1.6K) Canon CRG 725 Black (3484B002)",
    description:
      "Cartus de toner compatibil pentru imprimante Canon i-SENSYS LBP si MF.",
    kind: "toner",
    attributes: {
      color: "black",
      yieldPages: 1600,
      oemCodes: ["CRG-725", "3484B002"],
      manufacturer: "INTEGRAL",
      isOriginal: false,
    },
    compatibility: ["canon:i-sensys-lbp6030", "canon:i-sensys-mf3010"],
    gross: 3200,
    compareAtGross: 3900,
    stock: 30,
  },
  {
    slug: "cartus-compatibil-canon-pg-545xl-black",
    title: "Cartus compatibil (400p) Canon PG 545XL Black (8286B001)",
    description:
      "Cartus cu cerneala negru de mare capacitate compatibil pentru Canon PIXMA.",
    kind: "inkjet",
    attributes: {
      color: "black",
      yieldPages: 400,
      oemCodes: ["PG-545XL", "8286B001"],
      manufacturer: "InkMate",
      isOriginal: false,
    },
    compatibility: ["canon:pixma-ts3350"],
    gross: 4800,
    stock: 14,
  },
  {
    slug: "toner-compatibil-kyocera-tk-1160-black",
    title: "Toner compatibil (7.2K) Kyocera TK 1160 Black (1T02RY0NL0)",
    description:
      "Cartus de toner compatibil de mare randament pentru Kyocera ECOSYS. 7.200 de pagini.",
    kind: "toner",
    attributes: {
      color: "black",
      yieldPages: 7200,
      oemCodes: ["TK-1160", "1T02RY0NL0"],
      manufacturer: "SCC",
      isOriginal: false,
    },
    compatibility: ["kyocera:ecosys-p2040dn", "kyocera:ecosys-m2040dn"],
    gross: 9500,
    stock: 9,
  },
  {
    slug: "unitate-cuptor-compatibila-kyocera-fk-1150",
    title: "Unitate de cuptor compatibila (100K) Kyocera FK 1150 (302RV93050)",
    description:
      "Unitate de cuptor (fuser) compatibila pentru Kyocera ECOSYS. Piesa de schimb pentru service.",
    kind: "fuser",
    attributes: {
      color: "none",
      yieldPages: 100000,
      oemCodes: ["FK-1150", "302RV93050"],
      manufacturer: "CET",
      isOriginal: false,
    },
    compatibility: ["kyocera:ecosys-p2040dn"],
    gross: 42000,
    stock: 2,
  },
  {
    slug: "toner-compatibil-xerox-106r02773-black",
    title: "Toner compatibil (1.5K) Xerox 3020 Black (106R02773)",
    description:
      "Cartus de toner compatibil pentru Xerox Phaser 3020 si WorkCentre 3025.",
    kind: "toner",
    attributes: {
      color: "black",
      yieldPages: 1500,
      oemCodes: ["106R02773"],
      manufacturer: "MK Imaging",
      isOriginal: false,
    },
    compatibility: ["xerox:phaser-3020", "xerox:workcentre-3025"],
    gross: 3600,
    stock: 21,
  },
  {
    slug: "toner-compatibil-samsung-mlt-d1042s-black",
    title: "Toner compatibil (1.5K) Samsung MLT D1042S Black (SU737A)",
    description:
      "Cartus de toner compatibil pentru imprimante Samsung ML si Xpress.",
    kind: "toner",
    attributes: {
      color: "black",
      yieldPages: 1500,
      oemCodes: ["MLT-D1042S", "SU737A"],
      manufacturer: "HYB",
      isOriginal: false,
    },
    compatibility: ["samsung:ml-1670", "samsung:xpress-m2020"],
    gross: 3100,
    stock: 16,
  },
  {
    slug: "toner-compatibil-lexmark-50f2h00-black",
    title: "Toner compatibil (5K) Lexmark 502H Black (50F2H00)",
    description:
      "Cartus de toner compatibil de mare randament pentru Lexmark MS310 si MS410.",
    kind: "toner",
    attributes: {
      color: "black",
      yieldPages: 5000,
      oemCodes: ["50F2H00", "502H"],
      manufacturer: "SCC",
      isOriginal: false,
    },
    compatibility: ["lexmark:ms310dn"],
    gross: 8900,
    stock: 5,
  },
  {
    slug: "recipient-toner-rezidual-compatibil-lexmark-e260",
    title: "Recipient toner rezidual compatibil Lexmark E260 (E260X22G)",
    description:
      "Recipient pentru toner rezidual compatibil. Consumabil de intretinere periodica.",
    kind: "waste",
    attributes: {
      color: "none",
      oemCodes: ["E260X22G"],
      manufacturer: "CET",
      isOriginal: false,
    },
    compatibility: ["lexmark:e260"],
    gross: 2600,
    stock: 12,
  },
  {
    slug: "cartus-compatibil-epson-603xl-black",
    title: "Cartus compatibil (500p) Epson 603XL Black (C13T03A14010)",
    description:
      "Cartus cu cerneala negru de mare capacitate compatibil pentru Epson WorkForce si Expression.",
    kind: "inkjet",
    attributes: {
      color: "black",
      yieldPages: 500,
      oemCodes: ["603XL", "C13T03A14010"],
      manufacturer: "InkMate",
      isOriginal: false,
    },
    compatibility: ["epson:workforce-wf-2830"],
    gross: 3300,
    stock: 19,
  },
  {
    slug: "rola-preluare-hartie-compatibila-hp-rl1-0019",
    title: "Rola de preluare hartie compatibila HP (RL1-0019)",
    description:
      "Rola de preluare a hartiei, compatibila. Piesa consumabila care rezolva blocajele repetate de alimentare.",
    kind: "roller",
    attributes: {
      color: "none",
      oemCodes: ["RL1-0019"],
      manufacturer: "CET",
      isOriginal: false,
    },
    compatibility: ["hp:laserjet-p1005", "hp:laserjet-1018"],
    gross: 1500,
    stock: 33,
  },
];

/** Products, in the exact shape `GET /products` returns. */
export const products = catalog.map((entry, index) => ({
  id: `prod_${index + 1}`,
  slug: entry.slug,
  title: entry.title,
  description: entry.description,
  kind: entry.kind,
  attributes: entry.attributes,
  compatibility: compat(entry.compatibility),
  images: [image(entry.kind, entry.title)],
  variants: [{ id: `var_${index + 1}`, title: "Standard" }],
}));

/**
 * Offers, keyed by slug. Both VAT figures are produced here — that is the point
 * of the design: the backend owns the rounding, the storefront just renders.
 */
export const offers = Object.fromEntries(
  catalog.map((entry, index) => [
    entry.slug,
    {
      variantId: `var_${index + 1}`,
      price: ron(entry.gross),
      priceExVat: exVat(entry.gross),
      vatRate: VAT_RATE,
      ...(entry.compareAtGross
        ? { compareAtPrice: ron(entry.compareAtGross) }
        : {}),
      ...(entry.tiers
        ? {
            priceTiers: entry.tiers.map((tier) => ({
              minQuantity: tier.minQuantity,
              unitPrice: ron(tier.gross),
              unitPriceExVat: exVat(tier.gross),
            })),
          }
        : {}),
      availability: { inStock: entry.stock > 0, quantity: entry.stock },
    },
  ]),
);

/**
 * Facet counts, computed from the filtered result set.
 *
 * Labels are produced here because the contract says the backend supplies them:
 * the storefront must not map `toner` to Romanian prose itself.
 */
const KIND_LABELS = {
  toner: "Tonere",
  inkjet: "Cartuse cerneala",
  drum: "Unitati cilindru",
  fuser: "Unitati cuptor",
  waste: "Recipiente toner rezidual",
  roller: "Role",
  other: "Altele",
};

const COLOR_LABELS = {
  black: "Negru",
  cyan: "Cyan",
  magenta: "Magenta",
  yellow: "Galben",
  tricolor: "Tricolor",
  none: "Fara culoare",
};

function tally(items, pick) {
  const counts = new Map();
  for (const item of items) {
    for (const { value, label } of pick(item)) {
      const existing = counts.get(value);
      if (existing) existing.count += 1;
      else counts.set(value, { value, label, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function buildFacets(items) {
  return [
    {
      key: "brand",
      label: "Marca imprimantei",
      values: tally(items, (p) =>
        (p.compatibility ?? []).map((c) => ({
          value: c.printerBrand.slug,
          label: c.printerBrand.name,
        })),
      ),
    },
    {
      key: "kind",
      label: "Tip consumabil",
      values: tally(items, (p) =>
        p.kind ? [{ value: p.kind, label: KIND_LABELS[p.kind] ?? p.kind }] : [],
      ),
    },
    {
      key: "manufacturer",
      label: "Producator",
      values: tally(items, (p) =>
        p.attributes?.manufacturer
          ? [
              {
                value: p.attributes.manufacturer,
                label: p.attributes.manufacturer,
              },
            ]
          : [],
      ),
    },
    {
      key: "color",
      label: "Culoare",
      values: tally(items, (p) =>
        p.attributes?.color
          ? [
              {
                value: p.attributes.color,
                label: COLOR_LABELS[p.attributes.color] ?? p.attributes.color,
              },
            ]
          : [],
      ),
    },
  ].filter((facet) => facet.values.length > 0);
}

/** Applies the `/products` filters. AND across keys, as the spec describes. */
export function filterProducts(query) {
  return products.filter((product) => {
    if (query.kind && product.kind !== query.kind) return false;
    if (
      query.manufacturer &&
      product.attributes?.manufacturer !== query.manufacturer
    ) {
      return false;
    }
    if (query.color && product.attributes?.color !== query.color) return false;

    if (query.brand) {
      const match = (product.compatibility ?? []).find(
        (c) => c.printerBrand.slug === query.brand,
      );
      if (!match) return false;
      if (
        query.model &&
        !match.printerModels.some((m) => m.slug === query.model)
      ) {
        return false;
      }
    }

    if (query.inStock === true) {
      const offer = offers[product.slug];
      if (!offer?.availability.inStock) return false;
    }

    return true;
  });
}

/** Sorts a filtered set. `relevance` keeps catalog order. */
export function sortProducts(items, sort) {
  const priceOf = (p) => offers[p.slug]?.price.amountMinor ?? 0;
  const yieldOf = (p) => p.attributes?.yieldPages ?? 0;

  switch (sort) {
    case "price_asc":
      return [...items].sort((a, b) => priceOf(a) - priceOf(b));
    case "price_desc":
      return [...items].sort((a, b) => priceOf(b) - priceOf(a));
    case "yield_desc":
      return [...items].sort((a, b) => yieldOf(b) - yieldOf(a));
    default:
      return items;
  }
}
