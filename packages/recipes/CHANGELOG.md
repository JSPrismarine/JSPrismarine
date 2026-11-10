# @jsprismarine/recipes

## 0.20.0

No changes in this release.

## 0.19.2

No changes in this release.

## 0.19.1

No changes in this release.

## 0.19.0

No changes in this release.

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`0560f8f`](https://github.com/JSPrismarine/JSPrismarine/commit/0560f8fe0c92da772f9013fd05a318d543b948dd) Thanks [@filiphsps](https://github.com/filiphsps)! - Index crafting matches by occupied grid shape and cache immutable villager crafting candidates.

## 0.16.0

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0d1512e`](https://github.com/JSPrismarine/JSPrismarine/commit/0d1512e0d028a2644883407b03ff20fe7c224633) Thanks [@filiphsps](https://github.com/filiphsps)! - New package: the Java Edition recipe evaluator. It parses all 22 recipe serializers Java 26.3
  registers, including the eight `crafting_special_*` types and the four more that are code behind a
  parameterized file, and resolves ingredients in all four composition forms (identifier, `#tag`,
  list, inline object with component predicates). `matchRecipe` and `createRecipeBook` match a
  crafting grid with vanilla's cropping, mirroring and offset placement, plus the furnace,
  stonecutter, smithing and brewing stations, and report per-slot consumption and remainder items.
  `compileRecipes` translates recipes to Bedrock identifiers through an injected mapper and reports
  every reviewed loss and unmapped identifier instead of dropping a recipe silently. Tags, crafting
  remainders, item durability and dye colors are injected lookups, so the package depends on no
  registry implementation.
