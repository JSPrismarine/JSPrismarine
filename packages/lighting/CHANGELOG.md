# @jsprismarine/lighting

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

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
