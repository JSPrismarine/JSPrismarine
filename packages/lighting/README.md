# @jsprismarine/lighting

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/lighting)](https://www.npmjs.com/package/@jsprismarine/lighting)

A block light and sky light engine for a Bedrock server. Both layers hold 0 to 15 per block, both
stay current as blocks change, and the work runs in bounded steps so one tick cannot stall on a
light flood.

```ts
import { LightEngine } from '@jsprismarine/lighting';

const engine = new LightEngine(view);
engine.onChunkLoaded(chunkX, chunkZ);

engine.onBlockChanged({ x, y, z }, previousProperties, nextProperties);

const { queued } = engine.flush(2048);
if (queued > 0) {
    // Come back next tick.
}
```

## This light never reaches a player

The Bedrock protocol has no light packet, and neither `LevelChunkPacket` nor `SubChunkPacket`
carries a sky-light or block-light array. The client computes and renders light itself from the
block palette it already has, which is the opposite of Java Edition, where the server ships both
arrays in the chunk packet plus a dedicated light-update packet.

So nothing here changes what a player sees. The server keeps its own light because three rules read
it:

- Mob spawning, which tests the light level of a candidate block.
- Crop growth, which needs a minimum level to advance a stage.
- Daylight detectors, which turn the sky level into a redstone signal.

When this engine and the client disagree, the player sees the client's answer and the server acts on
this one. There is no packet that settles the argument.

## What is deliberately missing

Java's lighting has directional opacity: it reads the shape of pistons, daylight detectors,
enchanting tables, farmland, lecterns, stonecutters, dirt paths, snow, end portal frames, slabs and
stairs, and light passes through them only in some directions. Bedrock has no such thing. A Bedrock
block state carries one `minecraft:light_dampening` scalar between 0 and 15, the client applies that
scalar in every direction, and the wiki records the visible result as "Slabs, stairs, and farmland do
not block light".

This engine follows Bedrock. Modeling Java's per-face rule would make the server compute light the
client contradicts for every slab and stair in the world, which is the worst of both: slower, and
wrong against what the player is looking at.

## The seam

The engine reads the world through one injected interface and holds no reference to chunk, block or
world classes:

```ts
interface BlockLightView {
    readonly minY: number;
    readonly maxY: number;
    readonly hasSkyLight: boolean;
    blockAt(x: number, y: number, z: number): BlockLightProperties | undefined;
}
```

`BlockLightProperties` is `{ lightEmission, lightDampening }`. `@jsprismarine/mapping` already
produces that shape: a row from `bedrockBlockPropertiesOf(name, states)` satisfies the type with no
conversion, so a server implementation of `blockAt` is a block lookup followed by a property lookup.

`undefined` means the chunk is not loaded. The engine never asks about a y outside `minY` to `maxY`,
so it is the only meaning the value carries.

`@jsprismarine/lighting/testing` exports `TestBlockLightView`, an in-memory implementation with
`place`, `loadChunk` and `unloadChunk`, plus a `lightBlock` helper that fills in the field a test
does not care about.

## How it computes

**Storage.** Each chunk section holds up to two `LightSection` arrays, one per layer, each 4096
levels packed two per byte into 2048 bytes. Sections are created on first write, so a dark section
costs nothing. Sky light at or above the heightmap is a constant 15 and is never stored at all,
which is most of the volume of an overworld chunk.

**Block light** uses the two-queue flood. An increase node spreads its level to each of the six
neighbors, which costs `max(1, lightDampening)` of the block being entered. A decrease node darkens
every neighbor dimmer than the level that went away and queues an increase from every neighbor that
is at least as bright, so removing one torch in a lit room darkens its share and then refills from
the torches that are left. A block that emits and blocks at once, such as a lit furnace, keeps its
own emission when the decrease wave passes over it.

**Sky light** uses a per-column heightmap: for each of a chunk's 256 block columns, one past the y of
the highest block with a dampening above 0. Everything at or above it reads 15. Below it, light
propagates with the same attenuation block light uses, which is how the space under an overhang
falls one level per block away from the edge and how water fades with depth.

Only two kinds of sky-exposed cell have anywhere to send their 15: the one at the heightmap, which
lights the column below, and the ones facing a horizontal neighbor whose heightmap is higher, which
light that neighbor sideways. Seeding is therefore proportional to local relief rather than to the
height of the world.

**A block change** is patched, not rebuilt. The heightmap entry moves only when the change was at or
above the column's highest blocking block, and the only scan is the walk down the column that finds
the next blocker after the top one breaks. When the heightmap rises, the cells that just lost their
open sky are darkened from 15 and refilled through the new blocker.

**Flushing** is budgeted. `flush(budget)` processes at most that many queue nodes and returns
`processed`, `queued` and `deferred`. Every decrease node runs before any increase node. Stopping
mid-flush leaves readable but not yet correct levels; they are correct once `queued` is 0.

**Chunk borders** are ordinary propagation. The engine crosses section and chunk boundaries through
the view, and an unloaded neighbor is skipped rather than treated as opaque, so the lit block next to
the border keeps its level instead of being shaded against a surface that is not there. The column is
recorded and counted in `deferred`. `onChunkLoaded` computes the new chunk's light and re-seeds
across the border of every loaded neighbor, which is what finishes the propagation that stopped
there.

## Decisions this package makes

- **The server announces chunks.** The engine stores light only in columns it was given through
  `onChunkLoaded`, and `onChunkUnloaded` drops a column's light. A chunk the view can read but the
  engine has not been told about is treated as unloaded. One entry point for a chunk is simpler to
  reason about than lazily inventing a heightmap for a column nobody declared.
- **Deferred work is reconstructed, not stored.** Propagation into an unloaded chunk is dropped and
  rebuilt from the neighbors' borders when that chunk loads. A queue of parked nodes would grow with
  every edit next to an unloaded border and would still need the border pass for chunks that unload
  and come back, so it would be a second mechanism for a case the first one already covers.
- **Unloading does not correct the neighbors.** Light that a departing chunk contributed to its
  neighbors stays until something changes. Vanilla does the same, and the border re-seed makes it
  right again when the chunk returns.
- **The daylight cycle is not applied here.** `getSkyLight` returns the geometric level. Scaling it
  for the time of day and the weather, 15 at clear noon down to 4 at midnight, belongs to the rule
  that reads it, because the three consumers scale it differently.
