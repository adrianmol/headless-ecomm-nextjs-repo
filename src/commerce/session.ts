import "server-only";
import { cookies } from "next/headers";

export const CART_COOKIE = "cart_id";
export const SESSION_COOKIE = "session";

/**
 * `SameSite=Lax`, not `Strict`, and deliberately so: returning from the hosted
 * payment provider is a cross-site top-level navigation, and `Strict` would
 * withhold the cookie — the customer would come back from a successful payment
 * logged out with no cart. That only reproduces against a real PSP, so it is
 * easy to ship by accident.
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

export async function getCartId(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/**
 * Cookies cannot be written during Server Component render. Call this only from
 * a Server Action or Route Handler; Next.js throws otherwise.
 */
export async function setCartId(cartId: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, cartId, { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearCartId(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Headers forwarded to the commerce API. The token is passed server-to-server
 * over the private network and never reaches the browser.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getSessionToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
