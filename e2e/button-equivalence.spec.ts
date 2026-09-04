import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const REQUIRED_TOKENS = [
  "h-8",
  "gap-1.5",
  "px-2.5",
  "bg-primary",
  "text-primary-foreground",
];

const STYLE_PROPS = [
  "height",
  "paddingLeft",
  "paddingRight",
  "gap",
  "backgroundColor",
  "color",
];

/**
 * Variant tokens that only take effect in a state the default page load does
 * not show. They cannot be compared by computed style without reaching the
 * state, so they are compared structurally as well — both elements must carry
 * the identical set, since both are supposed to derive from
 * `buttonBaseClasses` in src/lib/button-variants.ts.
 */
const STATEFUL_TOKENS = [
  "disabled:pointer-events-none",
  "disabled:opacity-50",
  "focus-visible:border-ring",
  "focus-visible:ring-3",
  "focus-visible:ring-ring/50",
];

/**
 * The AddToCart PDP leaf stopped importing Button/cva to keep tailwind-merge and
 * cva out of the client bundle, so its styling is now a copy of the resolved
 * default-Button class string rather than the component itself. That is a
 * duplication risk, and these tests are what make it safe.
 *
 * An earlier version of this file asserted only the default, enabled state at
 * page load while the changelog claimed disabled, pending and focus-visible were
 * covered. They were not. The states below are now actually exercised.
 */

async function snapshot(locator: Locator) {
  return locator.evaluate((el: Element, props: string[]) => {
    const style = window.getComputedStyle(el as HTMLElement);
    return {
      cls: el.getAttribute("class") ?? "",
      style: Object.fromEntries(
        props.map((prop) => [prop, style.getPropertyValue(prop)]),
      ) as Record<string, string>,
    };
  }, STYLE_PROPS);
}

function ringOf(locator: Locator) {
  return locator.evaluate(
    (el: Element) => window.getComputedStyle(el as HTMLElement).boxShadow,
  );
}

/**
 * `buttonBaseClasses` carries `transition-all`, so the focus ring interpolates
 * in. Reading `boxShadow` once returns whatever frame happened to be current —
 * observed as `alpha 0.0036 / spread 0.02px` on its way to `alpha 0.5 / 3px`,
 * which made a direct comparison between two elements fail intermittently.
 *
 * Sampling until two consecutive reads agree waits for the animation to settle
 * without hard-coding its duration.
 */
async function settledRing(locator: Locator) {
  let previous = await ringOf(locator);
  for (let i = 0; i < 40; i++) {
    await locator.page().waitForTimeout(50);
    const current = await ringOf(locator);
    if (current === previous) return current;
    previous = current;
  }
  throw new Error("focus ring never settled");
}

/** A real `<Button variant="default">`, for comparison. */
async function defaultButton(page: Page) {
  await page.goto("/cart");
  const checkout = page.getByRole("link", { name: "Checkout" });
  await expect(checkout).toBeVisible();
  return checkout;
}

test.describe("AddToCart matches a default Button", () => {
  test("resolved size, colour and layout tokens are identical", async ({
    page,
  }) => {
    await page.goto("/products/merino-crew");
    const add = page.getByRole("button", { name: "Add to basket" });
    await expect(add).toBeVisible();
    const addSnap = await snapshot(add);

    await add.click();
    await expect(page.getByText("Added to your basket.")).toBeVisible();

    const buttonSnap = await snapshot(await defaultButton(page));

    for (const token of REQUIRED_TOKENS) {
      expect(addSnap.cls, `AddToCart missing ${token}`).toContain(token);
      expect(buttonSnap.cls, `default Button missing ${token}`).toContain(
        token,
      );
    }

    for (const prop of STYLE_PROPS) {
      expect(
        addSnap.style[prop],
        `computed ${prop} differs between AddToCart and default Button`,
      ).toBe(buttonSnap.style[prop]);
    }

    // Structural, because these only apply in states this assertion cannot see.
    for (const token of STATEFUL_TOKENS) {
      expect(addSnap.cls, `AddToCart missing ${token}`).toContain(token);
      expect(buttonSnap.cls, `default Button missing ${token}`).toContain(
        token,
      );
    }
  });

  test("the disabled state is really disabled and really dimmed", async ({
    page,
  }) => {
    // oxford-shirt is out of stock in the mock, which is the only route to a
    // genuinely disabled AddToCart.
    await page.goto("/products/oxford-shirt");

    const add = page.getByRole("button", { name: "Out of stock" });
    await expect(add).toBeVisible();
    await expect(add).toBeDisabled();

    // `disabled:opacity-50` and `disabled:pointer-events-none` must actually
    // resolve, not merely be present in the class string.
    const opacity = await add.evaluate(
      (el) => window.getComputedStyle(el as HTMLElement).opacity,
    );
    expect(Number(opacity)).toBeCloseTo(0.5, 2);

    const pointerEvents = await add.evaluate(
      (el) => window.getComputedStyle(el as HTMLElement).pointerEvents,
    );
    expect(pointerEvents).toBe("none");
  });

  test("keyboard focus draws the same ring as a default Button", async ({
    page,
  }) => {
    await page.goto("/products/merino-crew");
    const add = page.getByRole("button", { name: "Add to basket" });
    await expect(add).toBeVisible();

    // Tab to it rather than calling focus(): `:focus-visible` is about input
    // modality, and only a real keyboard interaction proves the ring a keyboard
    // user actually sees.
    await page.keyboard.press("Tab");
    for (
      let i = 0;
      i < 30 && !(await add.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(add).toBeFocused();

    const addRing = await settledRing(add);
    // A ring is the whole point; "none" would mean the token is inert.
    expect(addRing).not.toBe("none");

    // Activate from the keyboard too, both to stay in keyboard modality and
    // because the basket must be non-empty for /cart to render a Checkout
    // button to compare against.
    await page.keyboard.press("Enter");
    await expect(page.getByText("Added to your basket.")).toBeVisible();

    const checkout = await defaultButton(page);
    await page.keyboard.press("Tab");
    for (
      let i = 0;
      i < 30 &&
      !(await checkout.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(checkout).toBeFocused();

    expect(await settledRing(checkout)).toBe(addRing);
  });
});
