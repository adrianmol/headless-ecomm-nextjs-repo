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
 * The AddToCart PDP leaf stopped importing Button/cva to remove that dependency
 * from the client bundle, but it must remain visually identical to a default
 * Button. This test proves both receive the same resolved size, colour and
 * layout tokens by checking class names and computed style.
 */
test("AddToCart button matches a default Button's visual tokens", async ({
  page,
}) => {
  await page.goto("/products/merino-crew");

  const add = page.getByRole("button", { name: "Add to basket" });
  await expect(add).toBeVisible();

  const [addClass, addStyle] = await add.evaluate((el) => {
    const style = window.getComputedStyle(el as HTMLElement);
    return [
      el.getAttribute("class") ?? "",
      Object.fromEntries(
        [
          "height",
          "paddingLeft",
          "paddingRight",
          "gap",
          "backgroundColor",
          "color",
        ].map((prop) => [prop, style.getPropertyValue(prop)]),
      ) as Record<string, string>,
    ];
  });

  for (const token of REQUIRED_TOKENS) {
    expect(addClass, `AddToCart missing ${token}`).toContain(token);
  }

  await add.click();
  await expect(page.getByText("Added to your basket.")).toBeVisible();

  await page.goto("/cart");
  const checkout = page.getByRole("link", { name: "Checkout" });
  await expect(checkout).toBeVisible();

  const [checkoutClass, checkoutStyle] = await checkout.evaluate((el) => {
    const style = window.getComputedStyle(el as HTMLElement);
    return [
      el.getAttribute("class") ?? "",
      Object.fromEntries(
        [
          "height",
          "paddingLeft",
          "paddingRight",
          "gap",
          "backgroundColor",
          "color",
        ].map((prop) => [prop, style.getPropertyValue(prop)]),
      ) as Record<string, string>,
    ];
  });

  for (const token of REQUIRED_TOKENS) {
    expect(checkoutClass, `default Button missing ${token}`).toContain(token);
  }

  for (const prop of STYLE_PROPS) {
    expect(
      addStyle[prop],
      `computed ${prop} does not match between AddToCart and default Button`,
    ).toBe(checkoutStyle[prop]);
  }
});
