# @jsprismarine/prismarine

[![License](https://img.shields.io/github/license/JSPrismarine/JSPrismarine)](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
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

## Entry points

The package exports a fixed list of modules, each the module that defines what it exports. The
root exports `Server`; import everything else from its own module, such as `Config` from
`@jsprismarine/prismarine/config/Config`. A path that is not on the list does not resolve. The
[extending guide](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/guide/extending.md#entry-points)
lists them.

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
The packet trace is separate from the initial-state manifest. `Level.captureReplayInitialState()`
saves the ready worlds in one save pass, fails if the pass cannot hold a player, a chunk or the
level data or cannot commit, and then records effective content and
world-generation fingerprints, serializable RNG state, loaded-world digests, and a provider
snapshot of persisted data. The built-in LevelDB
provider captures every database record, `level.dat`, `level.dat_old`, `levelname.txt`, and fallback
player-data JSON, including persisted chunks that were unloaded. Restore it with
`restoreReplayInitialStateSnapshot(provider, manifest)` into a newly constructed, disabled provider
before enabling it. Once the level has loaded the snapshot, call
`Level.restoreReplayRandomState(manifest)` to verify level metadata and loaded-world digests, then
restore RNG state. The manifest validates the snapshot digest, and providers without snapshot
support reject capture and restore. LevelDB replaces records in one database batch, then restores
metadata and player files, so restore is not atomic; discard the target if a file operation fails
after the database write. The provider snapshot covers persisted data, but not runtime state or
pending simulation work, and does not fingerprint executable server or plugin code. Capturing also
fails when the server uses a custom random callback without a serializable state contract. A
`NetworkDispatcher` can feed each record back through its decoded handler path; the built-in
server exposes that method through
`server.getKernel().get(networkToken).replayInboundRecord?.(record, tickOffset)`. The caller must
restore matching connections and advance the server to each recorded tick. Pass an
`OutboundPacketTrace` as `outboundPacketRecorder` to the `Server` constructor to capture encoded
clientbound packets and compare their per-tick digests. `World.replayStateDigest()` hashes loaded
chunks, pending chunk load coordinates and priorities, block update positions and due ticks,
scheduled block and fluid ticks, the Java random tick generator state, light queue depth, entities,
level weather and rules, and player inventories. Scheduler entries retain their trigger time,
priority, and insertion order. Light work is represented by queue depth to keep each digest bounded,
so the digest does not identify queued light nodes. These digest fields detect divergence but do not
restore pending work or the per-world random tick generator. It also does not cover unloaded chunks
or every pending simulation subsystem.

`packages/client/src/SessionReplay.test.ts` exercises the live replay path with two flat replay
worlds using seed `2847`. It captures a provider snapshot before client login, restores that
snapshot into both replay worlds, then replays four scripted `MovePlayerPacket` records from a real
client through `networkToken`. The test logs the same two identities into each world and compares
world and outbound packet digests at each tick. It seeds `Server` randomness, fixes the remaining
global random calls, and disables natural mob spawning in the flat fixture so unrelated spawn
timing does not change the world digest. Login remains live because the trace does not restore
connection lifecycle or pre-login sessions; the test maps the captured connection order and input
entity id onto each live session. Its per-tick outbound digest normalizes process-local actor ids
by the logged-in players and by first-seen packet order for other actors before hashing packet
bytes. The test does not cover frame grouping, restoration of in-memory runtime or pending
simulation state, complete lighting work queues, or Java-verified entity update order. Packet bytes
and snapshots may include player data, so keep capture opt-in and protect any trace or manifest you
store. The packet benchmark measures
dispatcher recording and replay CPU plus serialized packet-trace storage, but it does not measure
world ticks or digests.

The performance-tagged case in `packages/client/src/SessionReplay.test.ts` replays the same fixed
movement trace with packet recording and per-tick digests disabled, then enabled. Both runs log in
first; the baseline installs no packet recorders and maps the mover from its captured connection id,
since the mover connects first in both runs. It reports tick CPU and wall time, per-tick world and
outbound digest CPU, checkpoint snapshot capture, manifest validation and RNG-restore cost, and
trace and manifest sizes. Manifest size includes the provider snapshot. Snapshot restore runs during
world setup outside this measurement. Outbound trace size is a JSON record estimate, not a
measurement of its in-memory JavaScript objects. Run
`pnpm --filter @jsprismarine/client exec vitest run --config vitest.config.ts src/SessionReplay.test.ts`
to run the live replay test, or add
`-t "reports replay instrumentation cost against an unrecorded baseline"` to that command to run
the performance measurement. Run
`pnpm --filter @jsprismarine/prismarine run bench:inbound-packets` to reproduce the packet-only
benchmark.

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

## Content snapshot benchmark

`pnpm run bench:content-snapshot` compares fresh content builds with a V8 startup snapshot. The
snapshot keeps resolved seed-independent registries and a rebindable world source; each restored
process redirects captured world views to its own adapter and rebuilds seed-bound Java and Bedrock
loot streams. The benchmark checks content digests and registry identity across seeds, and reports
custom-pack invalidation. Pass `-- --vanilla` to use the fetched default pack stack instead of the
small fixture.

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
