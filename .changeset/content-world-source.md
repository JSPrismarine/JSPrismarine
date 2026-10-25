---
'@jsprismarine/prismarine': minor
---

Run the content behaviors against the live world. `buildServerContent` was called with no `world`,
so every adapter member fell back to `unwiredWorldSource` and threw: the 49 block behavior
families, the item families and the component runtimes ran only in their own unit tests. A server
now passes `serverWorldSource`, which spreads the four subsystems' groups into one adapter per
dimension over the loaded `World`.

Wired to the live world: the block reads and writes, the block entity records, neighbor
notification and redstone power; the dimension bounds, clock, day time, difficulty and spawn point;
the light level, chunk loading and surface column; both scheduled tick lists; the named sounds and
particles, which travel as `PlaySoundPacket` and `SpawnParticleEffectPacket` through two new
`WorldChangeSink` members; the entity queries, removal and drops; and the item behaviors' world
half.

Still refused, each naming the subsystem that owes it: `blocks.biome` and `blocks.biomeTags`, which
have no table mapping a chunk's numeric biome id back to an identifier; `entities.spawn`, which
needs a factory covering every identifier a pack can name; `effects.emitGameEvent`, which nothing
listens for; the item behaviors' entity, inventory and screen actions, which need a player session;
and the `spawning`, `ai`, `generation` and `commands` groups, which stay absent.

A write that leaves the same block standing now raises `onBlockStateChange` rather than `onPlace`,
once per state value that moved. That is what the two hooks are documented to mean, and it is what
makes a door terminate: a door opens by rewriting its own `open_bit` from inside `onPlace`.

`World` gained `setLoadedBlockRuntimeId`, `getKnownSpawnPosition`, `playNamedSound` and
`spawnNamedParticle`, which is what the behaviors need to act from inside a tick without awaiting a
chunk.
