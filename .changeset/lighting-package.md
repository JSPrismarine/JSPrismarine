---
'@jsprismarine/lighting': patch
---

Add `@jsprismarine/lighting`: a server-internal block light and sky light engine. Both layers hold
0 to 15 per block, packed two levels per byte per chunk section. Block light uses the two-queue
flood so removing a source darkens its share before the remaining sources refill it; sky light runs
off a per-column heightmap, with full light above the highest blocking block and the usual
attenuation below it. `onBlockChanged` patches rather than rebuilds, and `flush(budget)` processes a
bounded number of nodes and reports what is left, so a tick cannot stall. The engine reads the world
through an injected `BlockLightView` and touches no chunk or world class; `@jsprismarine/lighting/testing`
ships a typed double. These levels are for mob spawning, crop growth and daylight detectors only:
the Bedrock protocol has no light packet, so the client computes what it renders.
