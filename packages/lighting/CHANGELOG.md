# @jsprismarine/lighting

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

## 0.20.0

No changes in this release.

## 0.19.2

No changes in this release.

## 0.19.1

No changes in this release.

## 0.19.0

### Patch Changes

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.

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

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`92a7e35`](https://github.com/JSPrismarine/JSPrismarine/commit/92a7e35e438239ef5abe037161068c630d253857) Thanks [@filiphsps](https://github.com/filiphsps)! - Defer chunk lighting to the simulation guard ring and settle loaded reads on demand.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`50e0bc9`](https://github.com/JSPrismarine/JSPrismarine/commit/50e0bc9f1cf417b0fa3d81309bcda5c0e9d16d8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip light scans for sections whose revision-keyed palettes cannot emit or dampen light.

## 0.16.0

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`db08972`](https://github.com/JSPrismarine/JSPrismarine/commit/db089721e086f1591e40609ee7a1a9faec2d19ca) Thanks [@filiphsps](https://github.com/filiphsps)! - Let a view tell the engine where a column's blocks stop. `BlockLightView` gains an optional
  `topOfColumn(x, z)`, one past the highest y that emits or dampens light, and a chunk's first scan
  starts there instead of at `maxY`.
  
  That scan is the engine's hottest loop by a wide margin: it reads every block of all 256 columns of
  every chunk that loads, and in an Overworld most of what it reads is the open sky above the ground,
  which moves neither the heightmap nor a source. Lighting 441 chunks of generated terrain went from
  44.2 million block reads to 16.6 million, and from 506 ms to 204 ms, with every one of the 86.7
  million resulting levels unchanged.
  
  A view that leaves `topOfColumn` out is scanned from `maxY`, as every view was before. An answer
  above `maxY` is taken as `maxY`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b197add`](https://github.com/JSPrismarine/JSPrismarine/commit/b197add97829722b6bcfa5def5a747d6543da92e) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/lighting`: a server-internal block light and sky light engine. Both layers hold
  0 to 15 per block, packed two levels per byte per chunk section. Block light uses the two-queue
  flood so removing a source darkens its share before the remaining sources refill it; sky light runs
  off a per-column heightmap, with full light above the highest blocking block and the usual
  attenuation below it. `onBlockChanged` patches rather than rebuilds, and `flush(budget)` processes a
  bounded number of nodes and reports what is left, so a tick cannot stall. The engine reads the world
  through an injected `BlockLightView` and touches no chunk or world class; `@jsprismarine/lighting/testing`
  ships a typed double. These levels are for mob spawning, crop growth and daylight detectors only:
  the Bedrock protocol has no light packet, so the client computes what it renders.
