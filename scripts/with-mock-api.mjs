/**
 * Runs a command with the mock commerce API available.
 *
 *   node scripts/with-mock-api.mjs next build
 *
 * TEMPORARY, paired with scripts/mock-api.mjs. Remove both once CI can reach
 * the real commerce API, and point COMMERCE_API_URL at it instead.
 */
import { spawn } from "node:child_process";

const PORT = Number(process.env.MOCK_API_PORT ?? 4010);
const BASE = `http://127.0.0.1:${PORT}/v1`;

const [, , command, ...args] = process.argv;
if (!command) {
  console.error("usage: node scripts/with-mock-api.mjs <command> [args...]");
  process.exit(1);
}

const api = spawn(process.execPath, ["scripts/mock-api.mjs"], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, MOCK_API_PORT: String(PORT) },
});

async function waitForApi(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/products`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`mock API did not become ready on ${BASE}`);
}

let child;
const shutdown = (code) => {
  if (child && !child.killed) child.kill("SIGTERM");
  if (!api.killed) api.kill("SIGTERM");
  process.exit(code);
};

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

try {
  await waitForApi();

  child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, COMMERCE_API_URL: BASE },
  });

  child.on("exit", (code, signal) => shutdown(signal ? 1 : (code ?? 0)));
} catch (error) {
  console.error(`[with-mock-api] ${error.message}`);
  shutdown(1);
}
