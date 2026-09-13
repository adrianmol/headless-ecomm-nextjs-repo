#!/usr/bin/env node
//
// Inspect the HUB catalog API from the command line.
//
// Signing this by hand is the reason ad-hoc curl does not work: every request
// needs HMAC-SHA256(secret, METHOD \n PATH \n BODY \n TIMESTAMP) as a hex digest,
// over the path *including its query exactly as sent*. This replicates the same
// formula as src/commerce/hub/client.ts and nothing else, so if the two ever
// disagree the client is the one to trust.
//
// Credentials come from the environment. Pass them with --env-file so they never
// reach your shell history or the process list:
//
//   node --env-file=.env scripts/hub.mjs categories
//   node --env-file=.env scripts/hub.mjs category 535
//   node --env-file=.env scripts/hub.mjs product DEV-D3130C
//   node --env-file=.env scripts/hub.mjs live DEV-D3130C,DEV-D3130M
//   node --env-file=.env scripts/hub.mjs raw '/hub-api/v1/category/535?adanc=1&pe_pagina=5'
//
// Every command prints a short summary; add --json for the untouched response.
import { createHmac } from "node:crypto";

const KEY = process.env.HUB_API_KEY;
const SECRET = process.env.HUB_API_SECRET;
const BASE = process.env.HUB_API_URL ?? "https://hub.reprint.ro";

if (!KEY || !SECRET) {
  console.error(
    "HUB_API_KEY and HUB_API_SECRET are required.\n" +
      "Put them in .env and run: node --env-file=.env scripts/hub.mjs <command>",
  );
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== "--json");
const asJson = process.argv.includes("--json");
const [command, argument] = args;

async function call(path) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Built once, and the signed string is read back off the same object — the
  // query cannot be reordered between signing and sending.
  const url = new URL(path, BASE);
  const signedPath = `${url.pathname}${url.search}`;
  const signature = createHmac("sha256", SECRET)
    .update(["GET", signedPath, "", timestamp].join("\n"))
    .digest("hex");

  const response = await fetch(url, {
    headers: {
      "X-Api-Key": KEY,
      "X-Timestamp": timestamp,
      "X-Signature": signature,
      accept: "application/json",
    },
  });

  const body = await response.json().catch(() => null);
  if (!body) {
    console.error(`HTTP ${response.status}, and the body was not JSON.`);
    process.exit(1);
  }
  if (body.ok === false) {
    // The window is 5 minutes and the usual cause of `unauthorized` is the
    // clock, not the secret. Worth saying once rather than rediscovering.
    const hint =
      body.error?.code === "unauthorized"
        ? "  (check the system clock before the credentials: the signing window is 5 minutes)"
        : "";
    console.error(`${body.error?.code}: ${body.error?.message ?? ""}${hint}`);
    process.exit(1);
  }
  if (asJson) {
    // Printed here, at the one place a response exists, so --json cannot drift
    // from what the summary was built on — and does not cost a second request.
    console.log(JSON.stringify(body.data, null, 2));
    process.exit(0);
  }

  return body.data;
}

/**
 * Reads the first key that exists, so either naming works.
 *
 * Not defensive programming for its own sake: this API returned Romanian field
 * names (`categorii`, `parinte`, `nume`, `produs`, `pret`) on 2026-09-13 and
 * English ones (`categories`, `parent`, `name`, `product`, `price`) hours later
 * the same day. The contract states that names are contract and are never
 * renamed, so one of the two is a mistake — but a diagnostic tool that dies on
 * whichever is live today is useless precisely when you need to find out.
 */
const pick = (obj, ...names) => {
  for (const n of names) if (obj?.[n] !== undefined) return obj[n];
  return undefined;
};

const money = (p) => {
  const value = pick(p ?? {}, "valoare", "value");
  if (value === null || value === undefined) return "no price";
  const currency = pick(p, "moneda", "currency") ?? "";
  const was = pick(p, "promo");
  const withVat = pick(p, "cu_tva", "with_vat");
  return `${value} ${currency}${was ? ` (was ${was})` : ""}${withVat ? " incl. VAT" : ""}`;
};

const stockOf = (p) => pick(p, "stoc", "stock") ?? {};
const priceOf = (p) => pick(p, "pret", "price");
const nameOf = (x) => pick(x, "nume", "name") ?? "";

const productLine = (p) =>
  `${String(p.id).padEnd(7)} ${String(p.sku).padEnd(16)} ${String(pick(stockOf(p), "stare", "state") ?? "?").padEnd(9)} ${money(priceOf(p)).padEnd(22)} ${nameOf(p)}`;

function showProduct(p) {
  const stock = stockOf(p);
  const specs = pick(p, "caracteristici", "specs", "attributes") ?? [];
  const variants = pick(p, "variante", "variants") ?? [];
  const description = pick(p, "descriere", "description") ?? "";

  console.log(`${nameOf(p)}\n`);
  console.log(`  id / sku      ${p.id} / ${p.sku}`);
  console.log(`  slug          ${p.url || "(none)"}`);
  console.log(
    `  brand         ${p.brand}   manufacturer: ${pick(p, "producator", "manufacturer") ?? "?"}`,
  );
  console.log(
    `  type          ${pick(p, "tip", "type") ?? "?"}${pick(p, "pachet", "is_pack") ? "  (bundle)" : ""}`,
  );
  console.log(`  price         ${money(priceOf(p))}`);
  console.log(
    `  stock         ${pick(stock, "stare", "state")} — "${pick(stock, "eticheta", "label")}", orderable: ${pick(stock, "se_comanda", "orderable")}, qty: ${pick(stock, "cantitate", "quantity") ?? "n/a"}`,
  );
  const offerCode = pick(p, "cod_oferta", "offer_code");
  if (offerCode) console.log(`  offer code    ${offerCode}`);
  const capacity = pick(p, "capacitate", "capacity");
  if (capacity) console.log(`  capacity      ${capacity}`);
  if (p.oem) console.log(`  OEM codes     ${p.oem}`);
  const cats = pick(p, "categorii", "categories");
  if (cats?.length) console.log(`  categories    ${cats.join(", ")}`);
  if (description)
    console.log(`  description   ${description.length} bytes of HTML`);

  if (specs.length) {
    console.log(`\n  specifications (${specs.length}):`);
    for (const spec of specs.slice(0, 12))
      console.log(`    ${nameOf(spec)}: ${pick(spec, "valoare", "value")}`);
    if (specs.length > 12) console.log(`    … ${specs.length - 12} more`);
  }
  if (variants.length) {
    console.log(`\n  other manufacturers (${variants.length}), by price:`);
    for (const v of variants.slice(0, 10)) console.log(`    ${productLine(v)}`);
  }
}

switch (command) {
  case "categories": {
    const data = await call("/hub-api/v1/category");
    const cats = pick(data, "categorii", "categories") ?? [];
    const ids = new Set(cats.map((c) => c.id));
    const parentOf = (c) => pick(c, "parinte", "parent");
    const roots = cats.filter((c) => parentOf(c) === 0);
    const orphans = cats.filter(
      (c) => parentOf(c) !== 0 && !ids.has(parentOf(c)),
    );
    const kinds = new Map();
    for (const c of cats) {
      const kind = pick(c, "fel", "kind");
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    }

    console.log(
      `${cats.length} categories   shop: ${data.shop ?? "whole catalogue"}`,
    );
    console.log(`kinds: ${[...kinds].map(([k, v]) => `${k}=${v}`).join("  ")}`);
    console.log(`roots: ${roots.length}`);
    for (const r of roots)
      console.log(`   ${String(r.id).padEnd(6)} ${nameOf(r)}`);
    // The thing that makes this tree unusable for navigation, surfaced by
    // default rather than left for someone to rediscover.
    console.log(
      `\n${orphans.length} categories name a parent that is not in this response`,
    );
    const missing = [...new Set(orphans.map(parentOf))];
    console.log(`missing parent ids: ${missing.join(", ")}`);
    console.log(`(nothing beneath those is reachable from a root)`);
    break;
  }

  case "category": {
    if (!argument) {
      console.error("usage: category <id>  — try 535 or 1878");
      process.exit(1);
    }
    const data = await call(
      `/hub-api/v1/category/${encodeURIComponent(argument)}?adanc=1&pe_pagina=20&numara=1`,
    );
    const c = pick(data, "categorie", "category");
    const children = pick(data, "copii", "children") ?? [];
    const products = pick(data, "produse", "products") ?? [];
    const paging = pick(data, "paginare", "pagination") ?? {};
    console.log(
      `${nameOf(c)}   (id ${c.id}, kind ${pick(c, "fel", "kind")}, parent ${pick(c, "parinte", "parent")})`,
    );
    console.log(
      `slug: ${c.url || "(none — every HUB category has an empty slug)"}`,
    );
    console.log(
      `products: ${paging.total ?? "?"} across ${pick(paging, "pagini", "pages") ?? "?"} pages   direct children: ${children.length}`,
    );
    if (children.length) {
      console.log(`\nchildren:`);
      for (const k of children.slice(0, 15))
        console.log(
          `   ${String(k.id).padEnd(6)} ${String(pick(k, "fel", "kind")).padEnd(7)} ${nameOf(k)}`,
        );
      if (children.length > 15)
        console.log(`   … ${children.length - 15} more`);
    }
    console.log(`\nfirst ${products.length} products:`);
    for (const p of products) console.log(`   ${productLine(p)}`);
    break;
  }

  case "product": {
    if (!argument) {
      console.error("usage: product <id|sku>  — try DEV-D3130C");
      process.exit(1);
    }
    // id, sku and ?url=slug all resolve to the same product, so this sends the
    // argument as-is and lets the API decide.
    const data = await call(
      `/hub-api/v1/product/${encodeURIComponent(argument)}?rude=1`,
    );
    showProduct(pick(data, "produs", "product") ?? data);
    break;
  }

  case "live": {
    if (!argument) {
      console.error("usage: live <sku,sku,…>  (max 200)");
      process.exit(1);
    }
    const data = await call(
      `/hub-api/v1/live?skus=${encodeURIComponent(argument)}`,
    );
    const live = pick(data, "produse", "products") ?? [];
    console.log(`fresh price and stock for ${live.length}:`);
    for (const p of live)
      console.log(
        `   ${String(p.sku).padEnd(16)} ${String(pick(stockOf(p), "stare", "state")).padEnd(9)} ${money(priceOf(p))}`,
      );
    const absent = pick(data, "lipsa", "missing") ?? [];
    if (absent.length) {
      // The field exists so a storefront learns a product went away instead of
      // leaving a stale price on screen.
      console.log(
        `\nrequested but NOT returned (withdrawn, EOL, unpublished):`,
      );
      console.log(`   ${absent.join(", ")}`);
    }
    break;
  }

  case "raw": {
    if (!argument) {
      console.error("usage: raw '/hub-api/v1/...'");
      process.exit(1);
    }
    const data = await call(argument);
    console.log(JSON.stringify(data, null, 2));
    break;
  }

  default:
    console.error(
      "usage: hub.mjs <categories|category <id>|product <id|sku>|live <skus>|raw <path>> [--json]",
    );
    process.exit(1);
}
