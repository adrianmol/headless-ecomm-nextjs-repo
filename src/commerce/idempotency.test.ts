import { describe, expect, it } from "vitest";
import { idempotencyKey } from "./idempotency";

describe("idempotencyKey", () => {
  it("is stable for the same intent, so a retry collapses", () => {
    const a = idempotencyKey("add", "cart_1", 3, "var_1", 1);
    const b = idempotencyKey("add", "cart_1", 3, "var_1", 1);
    expect(a).toBe(b);
  });

  it("changes when the cart version moves, so a genuine second add is applied", () => {
    // This is the whole point of including the version. Without it, a customer
    // adding a second copy of the same item would be silently swallowed as a
    // duplicate of the first.
    const first = idempotencyKey("add", "cart_1", 3, "var_1", 1);
    const second = idempotencyKey("add", "cart_1", 4, "var_1", 1);
    expect(second).not.toBe(first);
  });

  it("distinguishes operations, carts, variants and quantities", () => {
    const base = idempotencyKey("add", "cart_1", 3, "var_1", 1);
    expect(idempotencyKey("rm", "cart_1", 3, "var_1", 1)).not.toBe(base);
    expect(idempotencyKey("add", "cart_2", 3, "var_1", 1)).not.toBe(base);
    expect(idempotencyKey("add", "cart_1", 3, "var_2", 1)).not.toBe(base);
    expect(idempotencyKey("add", "cart_1", 3, "var_1", 2)).not.toBe(base);
  });

  it("stays within the 255-character limit the spec allows", () => {
    const key = idempotencyKey("add", "x".repeat(500), 1);
    expect(key.length).toBeLessThanOrEqual(255);
    expect(key).toBe(idempotencyKey("add", "x".repeat(500), 1));
  });
});
