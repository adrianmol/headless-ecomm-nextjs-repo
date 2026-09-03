/**
 * Serves the standalone build the way the container does.
 *
 * `next start` is not supported alongside `output: 'standalone'` — Next warns
 * as much — and more importantly it is not what ships: the Docker image runs
 * `node server.js` out of `.next/standalone`. Testing `next start` would mean
 * measuring and E2E-ing a server we never deploy.
 *
 * The tracing that produces `.next/standalone` deliberately excludes
 * `.next/static` and `public`, so the Dockerfile copies them in. This does the
 * same thing locally.
 */
import { cp, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

try {
  await access(standalone);
} catch {
  console.error(
    "[serve-standalone] .next/standalone missing — run `pnpm build:ci` first.",
  );
  process.exit(1);
}

await cp(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});

try {
  await cp(path.join(root, "public"), path.join(standalone, "public"), {
    recursive: true,
  });
} catch {
  // public/ is optional.
}

const child = spawn(process.execPath, [path.join(standalone, "server.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: process.env.PORT ?? "3000",
    HOSTNAME: process.env.HOSTNAME ?? "127.0.0.1",
  },
});

child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
