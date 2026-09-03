import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Architecture boundary from docs/architecture.md §2: the UI layer receives plain
// props, so it stays testable without mocking HTTP. Enforced here because this
// boundary erodes gradually and code review does not reliably catch it.
//
// Scoped to the `@/commerce` data layer alias and relative escapes out of
// components/. Deliberately NOT `**/commerce/**`, which would also match the
// legitimate `src/components/commerce/` presentational directory.
//
// The complementary rule — no Client Component may import the data layer — is
// enforced at build time by `import 'server-only'` in src/commerce/client.ts,
// which is a stronger guarantee than lint can offer.
const dataLayerImports = [
  "@/commerce",
  "@/commerce/**",
  "../commerce/**",
  "../../commerce/**",
  "../../../commerce/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: dataLayerImports,
              message:
                "components/ must not import commerce/. Fetch on the server and pass plain props down. See docs/architecture.md §2.",
            },
          ],
        },
      ],
    },
  },

  // Playwright fixtures take a callback conventionally named `use`, which the
  // React hooks rule reads as the `use` hook. These files contain no React.
  {
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
