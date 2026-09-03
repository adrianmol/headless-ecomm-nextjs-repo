import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // `server-only` throws by design outside an RSC graph; `next/headers`
      // needs a request scope. Both are stubbed so the data layer is testable
      // as ordinary Node code.
      { find: /^server-only$/, replacement: r("./src/test/stubs/server-only.ts") },
      { find: /^next\/headers$/, replacement: r("./src/test/stubs/next-headers.ts") },
      { find: /^@\//, replacement: r("./src/") },
    ],
  },
  test: {
    environment: "node",
    setupFiles: [r("./src/test/setup.ts")],
    include: ["src/**/*.test.ts"],
  },
});
