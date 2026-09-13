import { describe, expect, it } from "vitest";
import {
  hubCategoryIdFromSlug,
  hubCategorySlug,
  isCanonicalHubCategorySlug,
} from "./hub-slug";

describe("hubCategorySlug", () => {
  it("builds a readable segment with the id trailing", () => {
    expect(hubCategorySlug({ id: 25968, name: "CX510de (28E0512)" })).toBe(
      "cx510de-28e0512-25968",
    );
    expect(hubCategorySlug({ id: 1727, name: "Kyocera TK-7300" })).toBe(
      "kyocera-tk-7300-1727",
    );
  });

  it("folds Romanian diacritics rather than percent-encoding them", () => {
    // A legal URL with ș in it arrives as %C8%99 in logs, analytics and support
    // tickets, where a human expected an s.
    expect(hubCategorySlug({ id: 7, name: "Unități cilindru șiț" })).toBe(
      "unitati-cilindru-sit-7",
    );
  });

  it("degrades to the bare id when the name yields nothing usable", () => {
    // "-7" would be neither readable nor valid; "7" is a working URL.
    expect(hubCategorySlug({ id: 7, name: "" })).toBe("7");
    expect(hubCategorySlug({ id: 7, name: "///" })).toBe("7");
  });
});

describe("hubCategoryIdFromSlug", () => {
  it("reads the id back out", () => {
    expect(hubCategoryIdFromSlug("cx510de-28e0512-25968")).toBe(25968);
    expect(hubCategoryIdFromSlug("kyocera-tk-7300-1727")).toBe(1727);
  });

  it("is unambiguous for names that themselves end in digits", () => {
    // This is why the id is anchored at the end: category 21724 is named "1100".
    const slug = hubCategorySlug({ id: 21724, name: "1100" });
    expect(slug).toBe("1100-21724");
    expect(hubCategoryIdFromSlug(slug)).toBe(21724);
  });

  it("accepts a bare id, which is what an unnamed category produces", () => {
    expect(hubCategoryIdFromSlug("25968")).toBe(25968);
  });

  it("round-trips every shape hubCategorySlug can produce", () => {
    for (const name of [
      "CX510de (28E0512)",
      "1100",
      "",
      "Unități cilindru",
      "Toner 6.000 pagini / 5%",
      "—",
    ]) {
      const id = 12345;
      expect(hubCategoryIdFromSlug(hubCategorySlug({ id, name }))).toBe(id);
    }
  });

  it.each([
    ["no digits at all", "cx510de"],
    ["an empty segment", ""],
    ["a trailing hyphen", "cx510de-"],
    ["digits that are not trailing", "25968-cx510de"],
    ["a zero id", "cx510de-0"],
  ])("returns null for %s", (_label, slug) => {
    // A malformed category URL is a bad link, which is a 404 rather than a fault,
    // so the caller decides — hence null instead of a throw.
    expect(hubCategoryIdFromSlug(slug)).toBeNull();
  });

  it("rejects an id beyond safe integer range instead of silently rounding", () => {
    // Number() would round this and resolve some other category entirely.
    expect(hubCategoryIdFromSlug("x-99999999999999999999")).toBeNull();
  });

  it.each([
    ["a doubled hyphen", "cx510de--5", 5],
    ["a zero-padded id", "cx510de-007", 7],
  ])("resolves %s and leaves it to the canonical check", (_label, slug, id) => {
    /*
      These were originally asserted as null. That was over-strict on my part:
      the id is recoverable, so the friendly outcome is to resolve it and redirect
      to the canonical URL. A 404 would punish a visitor for a malformed link that
      still identifies the right page.
    */
    expect(hubCategoryIdFromSlug(slug)).toBe(id);
    expect(isCanonicalHubCategorySlug(slug, { id, name: "CX510de" })).toBe(
      false,
    );
  });
});

describe("isCanonicalHubCategorySlug", () => {
  const category = { id: 25968, name: "CX510de (28E0512)" };

  it("recognises the canonical form", () => {
    expect(isCanonicalHubCategorySlug("cx510de-28e0512-25968", category)).toBe(
      true,
    );
  });

  it("rejects a stale readable part, so it can be redirected", () => {
    // The id still resolves, which is the point: a renamed category keeps working
    // on its old URL and the page can send the visitor to the current one rather
    // than accumulating two indexable URLs for one page.
    expect(isCanonicalHubCategorySlug("old-name-25968", category)).toBe(false);
    expect(hubCategoryIdFromSlug("old-name-25968")).toBe(25968);
  });
});
