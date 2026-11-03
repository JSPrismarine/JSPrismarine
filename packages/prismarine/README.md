# @jsprismarine/prismarine

[![License](https://img.shields.io/github/license/JSPrismarine/JSPrismarine)](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![Contributors](https://img.shields.io/github/contributors/JSPrismarine/JSPrismarine?color=%23E30B5D)](https://github.com/JSPrismarine/JSPrismarine/graphs/contributors)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/prismarine)](https://www.npmjs.com/package/@jsprismarine/prismarine)
[![Code Coverage](https://img.shields.io/codecov/c/github/JSPrismarine/JSPrismarine?token=WLXLSJOGN3&color=63A375)](https://codecov.io/gh/JSPrismarine/JSPrismarine)
[![TODOs Counter](https://img.shields.io/github/search/JSPrismarine/JSPrismarine/todo)](https://github.com/JSPrismarine/JSPrismarine/search?q=todo)
[![FIXMEs Counter](https://img.shields.io/github/search/JSPrismarine/JSPrismarine/fixme)](https://github.com/JSPrismarine/JSPrismarine/search?q=fixme)
[![GitHub Commit Activity](https://img.shields.io/github/commit-activity/m/JSPrismarine/JSPrismarine?color=%2387F4BC)](https://github.com/JSPrismarine/JSPrismarine/commits/master)

`@jsprismarine/prismarine` is the main package of the Prismarine project containing the core (& game logic) implementation of the server.

## Prerequisites

Before you begin, ensure you have met the following requirements:

* You have installed the latest version of Node.js and a package manager like npm, pnpm or bun.

## Installation

To install `@jsprismarine/prismarine`, use the following command:

```
pnpm install @jsprismarine/prismarine --save
```

## Worlds and dimensions

Each `worlds.<name>` entry in `config.json` is a `Level`: one save with one seed, clock, set of
game rules and weather, and one `World` per dimension. The dimensions come from a Java
`worldgen/world_preset` named by `preset`, with per-dimension overrides under `dimensions`. A
stem's generator is built by the `GeneratorFactories` registry, whose built-in kinds are
`minecraft:noise`, `minecraft:flat`, `jsprismarine:void` and `minecraft:debug`; register a
`{ kind, build(context) }` factory to add one. Portal travel between a level's worlds is the
`DimensionTravel` service, reached through `Server.getDimensionTravel()`, with the cancelable
`entityPortalEnter` and `playerChangeDimension` events. The guide is
[docs/data-driven/dimensions.md](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/data-driven/dimensions.md).

## Inbound packet traces

Import `InboundPacketTrace` from `@jsprismarine/prismarine/network/InboundPacketTrace` and pass an
instance as `inboundPacketRecorder` to the `Server` constructor. It captures accepted client
packets with their process-local connection id, server-wide acceptance order, per-connection
sequence, arrival tick, protocol version, and encoded bytes. Replay records across connections in
the order returned by `records()`, awaiting each `replayInboundRecord()` call before the next.
`serialize()` writes a versioned JSON trace, and
`InboundPacketTrace.deserialize()` reads it back, including traces in the previous format version.
The trace does not include a restorable world snapshot, content fingerprints, or RNG state, so it
cannot restore a live world by itself. A `NetworkDispatcher` can feed each record back through its
decoded handler path; the built-in server exposes that method through
`server.getKernel().get(networkToken).replayInboundRecord?.(record, tickOffset)`. The caller must
restore matching connections and advance the server to each recorded tick. Pass an
`OutboundPacketTrace` as `outboundPacketRecorder` to the `Server` constructor to capture encoded
clientbound packets and compare their per-tick digests. `World.replayStateDigest()` hashes loaded
chunks, pending chunk load coordinates and priorities, entities, level weather and rules, and
player inventories for a per-tick world comparison. The packet benchmark measures dispatcher
recording and replay CPU plus serialized packet-trace storage; it does not measure snapshot or
world-digest costs. Packet bytes may contain login identity data, so keep capture opt-in and
protect any trace you store. Run `pnpm --filter @jsprismarine/prismarine run bench:inbound-packets`
to reproduce the packet benchmark.

## JSON Schemas

The server uses `config.json` for its settings.

Draft 7 schemas for the package's JSON configuration and data files are
included in the published package under `schemas/`. JSON object files receive
a `$schema` URL for the build that last wrote them. Package builds and release
executables use their exact version. Standalone nightly executables use the
`unstable` npm dist-tag, which resolves to the latest unstable package. The
files `ops.json` and `banned-players.json` contain arrays at the root and carry
their schema URL in a leading comment. These URLs use UNPKG, so standalone
server users do not need to install an npm package to access the schemas.

`Block.getJavaTags()` and `Item.getJavaTags()` expose Java datapack tag membership after the
content stack loads. `hasJavaTag(name)` checks one membership. Their `getTags()` and `hasTag(name)`
methods continue to expose Bedrock tags.

## Startup benchmark

`bench:startup` compares source and built server startup with Node's compile cache disabled, cold,
and warm. Each run starts from a fresh temporary `JSP_DIR` with the same flat-world configuration
and seed. The report includes time and main-thread CPU until the server listens, heap use, and the
content-build, command-build, and world-manager-enable phases.

```sh
pnpm --filter @jsprismarine/prismarine run bench:startup
pnpm --filter @jsprismarine/prismarine run bench:trends -- --scenarios startup --write /tmp/startup-baseline.json
```

## Block-state allocation benchmark

`bench:block-state-allocation` measures retained heap after `buildServerContent()` and CPU time
inside `resolveBlocks()` with the default vanilla stack. The [benchmark notes](benchmarks/block-state-allocation.md)
record the baseline comparison, current PR head measurements, and commands for reproducing both.

## Terrain proto cache

Callers that construct `DataDrivenGenerator` can opt into a bounded disk cache for immutable
`terrain` status tiles with `persistentProtoCache`. The default stays off. Records are keyed by the
seed, dimension, worldgen settings, effective datapack registries, template contents, generator
version, cache schema, and chunk position. A corrupt or incompatible record is removed, then the
generator rebuilds that terrain tile. Choose a dedicated directory and a byte limit for it.

```ts
const generator = new DataDrivenGenerator({
    registries,
    templates,
    persistentProtoCache: {
        directory: join(worldDirectory, 'terrain-proto-cache'),
        maxBytes: 512 * 1024 * 1024
    }
});
```

Custom template sources need a stable `worldgenFingerprint` for the cache to start. Custom
structure builders and worker pipelines are not supported with persistent terrain caching. Run
`pnpm --filter @jsprismarine/prismarine run bench:terrain-cache` to compare an 11 by 11 preload and
a 3 by 3 player return after six distant chunk requests. The benchmark reports cache storage,
record bytes written, write amplification, and time saved against regeneration.

## Shared terrain tiles

Worker-based whole-chunk generation can also share a bounded in-memory store for immutable terrain
tiles. It is opt-in and lasts only as long as the generator's process. When every slot is occupied,
or a tile is larger than `maxTileBytes`, the worker builds that tile locally. A worker exit releases
any unpublished claims from that worker; completed tiles remain available to the other workers.

```ts
import { DataDrivenGenerator, defaultChunkPipeline } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import { SharedTerrainTileStore } from '@jsprismarine/prismarine/world/generators/datadriven/SharedTerrainTileStore';

const terrainTiles = new SharedTerrainTileStore({
    maxBytes: 32 * 1024 * 1024,
    maxTileBytes: 512 * 1024
});
const generator = new DataDrivenGenerator({
    registries,
    sharedTerrainTileStore: terrainTiles,
    chunks: { pipeline: defaultChunkPipeline(), workers: 4 }
});
```

The complete seed, dimension, generator settings, effective registry and template fingerprints,
generation flags, and chunk coordinates identify each tile. Custom template sources need a stable
`worldgenFingerprint`. Run `pnpm --filter @jsprismarine/prismarine run bench:chunks` with the
`chunks` arm and the `shared` tile-store mode to compare throughput and memory with worker-local
generation.
