/**
 * Prettier configuration.
 *
 * Deliberately takes Prettier's defaults. The repository's existing style — double
 * quotes, semicolons, trailing commas, 80-column wrapping — already matches them,
 * so overriding anything would create churn without settling an argument. An empty
 * config is the honest expression of "we do not have opinions beyond the default".
 *
 * `prettier-plugin-tailwindcss` is intentionally NOT used. It would reorder every
 * class list in the repository, turning a mechanical formatting commit into a very
 * large one, and class order carries no meaning here — Tailwind resolves conflicts
 * by CSS source order, not attribute order.
 *
 * .mjs rather than .prettierrc.json so this reasoning can live next to the config,
 * matching eslint.config.mjs and postcss.config.mjs.
 *
 * @type {import("prettier").Config}
 */
const config = {};

export default config;
