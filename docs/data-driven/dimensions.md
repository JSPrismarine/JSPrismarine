---
title: Dimensions
group: Documents
category: Guides
---

# Dimensions

A world on this server is a set of dimensions, and each dimension is described by data the way
Java Edition describes it: a dimension type for its physics, a level stem that binds the type to a
generator, and a world preset that supplies the stems. This page explains those three objects,
how a `worlds.<name>` entry in `config.json` turns into running worlds, which generators and
presets work, how portals and the client's dimension change behave, and which parts have not been
checked against a real Bedrock client yet. [running.md](../running.md) has the short version for
somebody who only wants to configure a server.

## Three objects from Java's data

**A dimension type** is a Java `dimension_type` document. It says where the floor is (`min_y`),
how tall the dimension is (`height`) and how much of that height counts as playable
(`logical_height`), how far a block moves when a portal links it to another dimension
(`coordinate_scale`), whether there is sky light and a ceiling, and a map of `attributes` that
Java 26.x moved the old booleans into. The attributes this server reads are
`minecraft:gameplay/bed_rule` and `minecraft:gameplay/respawn_anchor_works` for where a spawn point
can be set, and `minecraft:visual/cloud_height` for a custom dimension's cloud layer. The three
vanilla types are the Overworld (-64 to 320, scale 1), the Nether (0 to 256 with a logical height
of 128, scale 8) and the End (0 to 256, scale 1).

The Bedrock client needs four things the Java document does not say: the integer id its packets
and the save's chunk keys carry, its own spelling of the name, and the vertical range it accepts
for that id. `@jsprismarine/mapping` keeps those as a three-row overlay in
`src/tables/dimensions.json`. The Overworld is id 0, the Nether is id 1 and spelled
`minecraft:nether`, the End is id 2. The Nether row also clamps the height to 128, because the
client discards or crashes on sub chunks above that whatever Java's type says. The server joins the
Java document and the overlay into one `DimensionType` object: `id` is the Java id, `bedrockId`
and `bedrockName` are the client's, `minY` and `height` are the bounds the client accepts, `java`
is the parsed document for everything else, and `custom` marks a type the overlay does not list.

**A level stem** is `{ type, generator }`: a dimension type id and a generator object. The
generator is a tagged union on `type`. `minecraft:noise` carries `settings`, a
`worldgen/noise_settings` id or an inline document, and a `biome_source`; `minecraft:flat` carries
`settings`, either the object with its layers and biome or a `worldgen/flat_level_generator_preset`
id; `minecraft:debug` carries nothing. A kind the server does not know is kept as
`{ type, settings }` for a plugin's factory to read.

**A world preset** is a Java `worldgen/world_preset` document: a map of stems keyed by dimension
id, which must include `minecraft:overworld`. The vanilla datapack ships its three stems only
inside its presets, so the preset is where a world's dimensions come from. `minecraft:normal` has
the Overworld, the Nether and the End as noise stems; `minecraft:flat` has a superflat Overworld
and the same Nether and End; `minecraft:large_biomes` and `minecraft:amplified` swap the
Overworld's noise settings; `minecraft:single_biome_surface` uses a fixed biome source;
`minecraft:debug_all_block_states` uses the debug generator; `minecraft:flat_all_dimensions` makes
all three dimensions flat.

### Where the data comes from

`@jsprismarine/worldgen` parses all three document kinds (`parseDimensionType`, `parseLevelStem`,
`parseWorldPreset`, with `parseFlatGeneratorSettings` and `parseBiomeSource` underneath), and
`@jsprismarine/packs` routes `dimension_type`, `dimension` and `worldgen/*` directories from the
loaded datapacks into the server's registries. `WorldManager` builds the worldgen registries from
the server's pack stack the first time a level needs them, so a datapack in the stack, through
`content-datapacks` or a world pack, adds a `dimension_type` or a `noise_settings` document that
stems and the noise generator can name. The vanilla documents come from the Java data cache that
`pnpm run dev` arranges ([running.md section 1.3](../running.md#13-world-generation-data)), and so
do the biome parameter reports, which no datapack carries.

Two things are copied into `@jsprismarine/prismarine` so that a vanilla level opens without that
cache. The three vanilla `dimension_type` documents are checked in verbatim, and a test compares
them with the cache when it is warm. Two presets are built in, `minecraft:normal` and
`minecraft:flat`, each with an Overworld stem only. When the cache is warm the datapack's presets
are read instead and both of those carry the Nether and the End as well, so whether a flat server
has a Nether depends on whether the Java data is on disk. A noise stem cannot be built without the
cache either way; see [Generator kinds](#generator-kinds).

## The runtime model

Bedrock keeps one save per level, and in it one clock, one set of game rules, one weather, one
spawn and one record per player, with every dimension's chunks side by side in one database. The
server's `Level` owns those. There is one `Level` per `worlds.<name>` entry, and it builds one
`World` per level stem to own what is per dimension: the chunks, the entities, the block systems
and the players standing in it. A `World` reaches its clock, rules and seed through its level, so
most code that asks a world for them did not have to change. A position names a `World`, so "the
Nether" is a world you ask the level for by stem id, `level.world('minecraft:the_nether')`. The
clock is read back from the `Time` field of `level.dat` when the level opens, so a restart
continues the day where the last run left it.

`WorldManager` loads every entry under `worlds`, not only `level-name`; `level-name` is the one
players join. For each entry it reads the config in either spelling, reads the stems the save was
generated with, resolves the stems from the preset, the entry's `dimensions` and the saved ones in
that order of rising priority, and resolves the dimension types the stems name. A type the vanilla
three do not cover is read from the datapack registries, which is the first point at which a
vanilla level touches the Java data. Two stems of one level may not bind the same dimension type:
the two worlds would share a Bedrock id and write over each other's chunks, so `resolveStems`
refuses the level with an error naming both stems and the type, and `Level` repeats the check
when it resolves the types.

**Saved stems win.** The resolved stems are written into the save's `jsprismarine:world_data`
record as `worldGenSettings` on first load. On every later load a saved stem replaces the
configured one for its dimension, and the server logs one line per dimension whose saved generator
kind differs from the configured one, or that the config no longer names. A world keeps the
terrain it was generated with; to change it, start a new world.

**Lazy and eager loading.** Building a dimension's world means asking the generator factories for
the stem's generator and enabling the world. The Overworld is built at startup, and for the
default level that holds whatever the config says, because the server names it before anything
else. Every other stem is built the first time something asks for it, which is a portal trip, a
respawn into it, a login by a player whose record was written there, or `/execute in`, `/summon`
or `/teleport` naming it, unless its entry says `load: "eager"`. A server nobody takes to the End
never pays for the End.

The two paths differ in what enabling does. An eager world, built as the level opens, searches for
its spawn and generates the start region around it, so the first player arrives into generated
terrain (`WorldData.startRegion: 'prepared'`). A lazy world is built from inside a server tick,
where a start region's worth of generation would stall the whole server, so it skips both the
spawn search and the preload (`startRegion: 'deferred'`); the trip that built it loads the chunks
its traveler stands in, and a spawn is searched for only when something asks for one. The cost of
the first trip into a lazy dimension is then the destination's pipeline build on top of those
chunks; a noise stem's `RandomState` costs between 55 and 134 ms per settings and seed. Every
noise stem of a server shares one worker pool of `min(6, cores - 2)` threads, so an eager Nether
does not add a second pool, only its start region's chunks.

A player's record says which dimension it was written in, so a player who logged out in a lazy
dimension comes back there: the login builds the world if nobody has been in it since the boot and
moves the player before anything is sent to the client. A record naming a dimension the level has
no stem for is logged as a warning and the player stays in the world the login built them in.

## The config shape

A `worlds.<name>` entry is `{ seed, provider, preset?, dimensions? }`. Every key:

| Key | What it does |
| --- | --- |
| `seed` | The world seed, written as a string. A value that parses as a 64-bit integer is that integer and anything else is its Java `String.hashCode`. A number is accepted and exact below 2^53; see [World seeds](../running.md#world-seeds). |
| `provider` | How the save is stored. `LevelDB`, the default, is Bedrock's format with every dimension in one database. `Anvil` reads Java's format, with `dimensions/<namespace>/<path>/region` per dimension and `DIM-1` and `DIM1` as fallbacks for saves written before Java 26.1. |
| `preset` | The `worldgen/world_preset` id that supplies the stems. Defaults to `minecraft:normal`. An id the loaded presets do not have stops the server with an error that lists the ones they do. |
| `dimensions.<id>` | One entry per dimension to override or add, keyed by the Java dimension id such as `minecraft:the_nether`. An id the preset has is overridden one key at a time; an id it lacks adds a dimension and then needs both `type` and `generator`. |
| `dimensions.<id>.type` | The dimension type id. Defaults to the preset's stem. A type the vanilla three do not cover has to be defined by a datapack in the server's pack stack, such as one listed under `content-datapacks`. One type backs one dimension per level: two stems naming the same type stop the server with an error. |
| `dimensions.<id>.generator` | The stem's generator object, in the shape a Java `dimension` document writes: `type`, and `settings` and `biome_source` as the kind needs them. Defaults to the preset's stem. A flat generator's `settings` is the object with `layers`, `biome`, `lakes`, `features` and `structure_overrides`, or a `worldgen/flat_level_generator_preset` id such as `minecraft:tunnelers_dream`, which resolves through the pack stack when the world's flat generator is built. |
| `dimensions.<id>.load` | `lazy`, the default for everything but the Overworld, builds the world on first entry; `eager` builds it at startup. |

A config written before `preset` existed spelled a world with `generator` and `layers` keys. The
schema no longer lists them, and the server translates them once on its first start; see
[Migrating an old entry](#migrating-an-old-entry).

The default world, with every dimension of the normal preset:

```json
{
    "worlds": {
        "world": { "preset": "minecraft:normal", "provider": "LevelDB", "seed": "8475011743740320021" }
    }
}
```

A flat Overworld that keeps the Nether and the End from `minecraft:normal`, with the End built at
startup. The `generator` object is the same one a Java datapack writes in a `dimension` file, with
Java's `height` per layer:

```json
{
    "worlds": {
        "world": {
            "seed": "8475011743740320021",
            "provider": "LevelDB",
            "preset": "minecraft:normal",
            "dimensions": {
                "minecraft:the_end": { "load": "eager" },
                "minecraft:overworld": {
                    "generator": {
                        "type": "minecraft:flat",
                        "settings": {
                            "biome": "minecraft:plains",
                            "layers": [
                                { "block": "minecraft:bedrock", "height": 1 },
                                { "block": "minecraft:grass_block", "height": 3 }
                            ]
                        }
                    }
                }
            }
        }
    }
}
```

A dimension the preset lacks. The type `mypack:skylands` has to come from a datapack listed under
`content-datapacks` with a `data/mypack/dimension_type/skylands.json`; the stem itself is this
entry, since a datapack's own `dimension/*.json` documents are loaded but do not add a stem to a
level on their own:

```json
{
    "worlds": {
        "world": {
            "seed": "8475011743740320021",
            "provider": "LevelDB",
            "preset": "minecraft:normal",
            "dimensions": {
                "mypack:skylands": {
                    "type": "mypack:skylands",
                    "generator": { "type": "jsprismarine:void" }
                }
            }
        }
    }
}
```

### Migrating an old entry

Older configs spelled a world as `generator: "Overworld"` or `generator: "Flat"`, with flat
layers under `layers`. Neither key is part of `WorldData` or the config schema any more, so an
editor marks them as unknown properties until the file is rewritten. The server still reads both
through `LegacyWorldData` and translates them before anything else looks at the entry:

| Old entry | Read as |
| --- | --- |
| `generator: "Overworld"`, or no `generator` | `preset: "minecraft:normal"` |
| `generator: "Flat"` without `layers` | `preset: "minecraft:flat"` |
| `generator: "Flat"` with `layers: [{ block, size }]` | `preset: "minecraft:flat"` and a `dimensions["minecraft:overworld"].generator` of type `minecraft:flat` whose `settings` carry the same layers as `{ block, height }`, `biome: "minecraft:plains"`, `lakes: false`, `features: false` and `structure_overrides: []` |
| `layers` without `generator: "Flat"` | Ignored, with a warning to remove it |
| any other `generator` string | The server stops with an error naming the registered generator kinds |

The names are matched without regard to case. A `preset` or an Overworld `generator` the entry
already spells the new way wins over the translated one, so an entry that carries both keeps what
its author wrote last. The server logs one warning per old key per world, writes the entry back
to `config.json` in the new spelling, and logs that it did, so the warnings appear once and the
editor's unknown-property marks go with them. The save needs no conversion: Overworld chunk keys
never carried a dimension integer, and the stems are written into the save from the translated
entry on that first load.

## Generator kinds

A stem's `generator.type` is a kind id, and a factory registered under that kind builds the
generator for one dimension. The four built-in kinds:

| Kind | Needs the Java data cache | What it generates |
| --- | --- | --- |
| `minecraft:noise` | Yes | Java's terrain, surface, carvers, features and structures for the stem's `settings` and `biome_source`. `settings` must name a registered `worldgen/noise_settings` document or carry one inline. Every noise stem shares one generator and one worker pool. Without the cache, building the stem fails with the message that names the fetch commands. |
| `minecraft:flat` | No | The stem's layers stacked from the dimension's floor, every block in the stem's biome, with the sea level fixed at Java's -63. Layers past the dimension's ceiling are dropped, as Java drops them. `lakes`, `features` and `structure_overrides` are read and kept but not honored: nothing runs over a flat chunk yet. |
| `jsprismarine:void` | No | Empty chunks with the dimension's bounds. A Bedrock add-on dimension whose only generator is `void` would become one of these; no pack input produces it yet, so it is reached from a config entry. |
| `minecraft:debug` | No | Java's debug world: every block state of the content palette laid out one every two blocks at y 70 over a barrier floor at y 60, in plains, so grid index `i` shows palette runtime id `i`. A dimension whose bounds miss y 60 to 70 refuses to build. |

A plugin adds a kind through `GeneratorFactories.register({ kind, build(context) })`; the context
carries the stem, the `DimensionType`, the seed, the loaded content, a lazy loader for Java's
worldgen registries and a logger.

Without the Java data cache only the two built-in presets exist: `minecraft:flat` builds its
Overworld, and `minecraft:normal` fails at the noise stem. With the cache every datapack preset
parses, and a stem needs the data only when its kind does, so a `minecraft:flat` level builds its
flat Overworld at startup and reads the data when somebody first enters its Nether. The parity
row described below generates a chunk of each `minecraft:normal` stem; `minecraft:large_biomes`,
`minecraft:amplified` and `minecraft:single_biome_surface` go through the same factory with other
settings documents and are not separately measured.

## Custom dimension types

A stem whose type has no row in the Bedrock overlay is a custom dimension. The level hands such
types Bedrock ids from 1000 upward in stem order, keeps the Java id as the name the client and the
content runtime see, and clamps the Java bounds into the -512 to 512 range the client accepts.
Because the client has no built-in dimension for the id, the join sends a `DimensionData` packet
right after `StartGame` and before any chunk, with one entry per custom type: the bounds, the id,
a generator type of `Void` (the client generates nothing for a dimension a server feeds it), the
stem's fixed or flat biome as the default biome and `minecraft:plains` otherwise, and at protocol
2225 the cloud height from `minecraft:visual/cloud_height` with clouds rendered when the attribute
is present.

The portal rules know the three vanilla types only. A nether portal frame lights in a custom
dimension, since only the End refuses lighting, but the portal leads nowhere because no rule links
that type to another, so only a `/teleport` or `/execute in` can name a custom dimension. For a
player, even that stops short. `PlayerSession.changeWorld` refuses a target world whose dimension
type is custom, logs an error naming the player, the world, the type and its Bedrock id, and
leaves the player where they stand. No client has been verified to accept `ChangeDimension` with
an id of 1000 or more, which is the first open question below, and the refusal stays until one
has. Entities that are not players move freely, since their trip sends nothing about the
dimension to a client. A player whose record was written in a custom dimension still joins there,
because the login moves them without a `ChangeDimension`.

## Portals

Portals are built in two layers. The block half is pure geometry in `@jsprismarine/block-behaviors`
(`rules/portal.ts`), which lights, collapses and activates portals through the block hooks of the
`portal` family; [engine-systems.md](engine-systems.md#portals) summarizes it. The travel half is a
`DimensionTravel` service in `@jsprismarine/prismarine`, which reads a rules table and owns the
dimension list, the scaling, the search and the client sequence. Every constant below is Java's,
read from the 26.3 server jar, except where Bedrock's number is named.

### Nether portal frames and lighting

A frame is obsidian around an interior 2 to 21 blocks wide and 3 to 21 blocks tall; the corners
are not checked, so the smallest frame is 4 by 5 and the largest 23 by 23. Fire or soul fire
appearing anywhere inside a complete frame lights it, whatever placed the fire. The interior may
hold air, fire or portal blocks already there, and nothing else. Lighting writes `minecraft:portal`
with the frame's `portal_axis` into every interior block, scanning the x axis first and then z.
Nothing lights in the End.

A portal block checks its neighbors on every block update. When the neighbor on a vertical face or
on a face along the portal's axis is neither portal nor obsidian, every portal block connected
through the portal's plane is cleared in one go. A portal block whose axis is `unknown`, which a
command wrote, counts every horizontal face and follows its neighbors' axis when a trip reads it.

A lit portal in the Overworld rolls for a zombified piglin on each random tick: `random() * 2000 <
difficultyId`, which is 1, 2 or 3 in 2000 on easy, normal and hard and nothing on peaceful. A hit
spawns `minecraft:zombie_pigman` beside the bottom of the portal, south of a portal on the x axis
and east of one on the z axis, which is where Bedrock puts it.

### Contact timers and cooldowns

Every tick, the world reports each ticking entity whose body overlaps a portal block, players
included, to `DimensionTravel.touch`. The body is the collision box shrunk by a millionth of a
block, as Java's `checkInsideBlocks` shrinks it, so a body resting on a block boundary does not
count the block beyond it. The first touch raises `EntityPortalEnterEvent` and, if nobody cancels
it, opens the entity's portal contact. Nothing happens for an entity on portal cooldown, or for one
that rides or carries another entity, which Bedrock refuses to send through a portal.

The contact is Java's `PortalProcessor`. Its time inside climbs by one per tick the entity touches
the portal and drops by four per tick outside it, so a player who steps out and back in does not
start over, and the contact is dropped once the time runs back down to zero. The trip fires when
the time reaches the portal's delay: 80 ticks for a player in survival, adventure or spectator mode
standing in a nether portal, 0 for a creative player, 0 for anything that is not a player, and 0
for everyone in an end portal.

Departure sets the traveler's cooldown so that arriving inside the destination portal does not
start a trip straight back: 10 ticks for a player and 300 for anything else, which is what Bedrock
writes as the actor's `PortalCooldown` tag. Both the actor NBT and the player record persist it, so
logging out inside the arrival portal and back in does not bounce a player home.

### Where a nether portal leads

The rules table links a nether portal from the Overworld to the Nether, from the Nether to the
Overworld, and from the End, where only a command can place one, to the Overworld. The trip goes
nowhere when the level has no world for the other side, which is the case for an Overworld-only
built-in preset.

The target position is the traveler's feet scaled by the two types' `coordinate_scale`, from over
to, so 8 from the Overworld into the Nether and 1/8 back. The x and z are multiplied and floored,
which rounds toward negative infinity, so -29.9 in the Overworld is block -4 in the Nether rather
than -3. The y is clamped into the destination's logical height, 0 to 127 in the Nether and -64 to
319 in the Overworld, which keeps a trip from y 200 in the Overworld under the Nether's roof.

The search looks for the nearest lit portal block within 128 blocks of the target on x and z, at
any height, in both travel directions; Java uses 128 into the Nether and 16 back, and Bedrock uses
128 both ways, which is the number here. Among the candidates inside that square the winner is the
closest by 3D distance, the lower block on a tie. Every world keeps a `PortalIndex` of its lit
portal blocks, fed by block writes and chunk loads and forgetting a chunk's blocks when the chunk
unloads, so the search reads a set instead of scanning blocks. When the index has nothing within
range, the server loads the chunks within 19 blocks of the target, which is the creation radius
plus the frame's write margin and also brings any portal already standing there into the index,
and searches once more. A found portal block is grown into its whole rectangle, and the traveler
lands at the same relative place inside it that they had in the source portal, as a fraction of
the free width and height once the traveler's own size is taken off. When the two portals run
along different axes the traveler turns 90 degrees.

### Creating a portal

When no portal is found, a player gets one built; an item or a mob with nowhere to arrive stays
where it is, as on Bedrock. The site search is Java's `PortalForcer.createPortal`: every column
within 16 blocks of the target over the dimension's height, looking for a replaceable run on a solid
floor with room for the 4 by 5 frame, the footprint plus a block on each side in a first pass and
the footprint alone in a second, closest by 3D distance. When nothing fits, the portal is forced
at the target with its y clamped between 70 and ten below the ceiling, on an obsidian platform
with four netherrack blocks on each side as Bedrock places them. The written portal is a 4 by 5
frame including corners with six portal blocks, on the source portal's axis. The vertical range a
portal can be created in runs from the dimension's floor to the lower of its client height and
Java's `logical_height`, which is 0 to 128 in the Nether either way.

### End portals, the platform and the exit

An eye of ender placed in a frame completes an end portal when the twelve frames of the flat ring
all hold an eye and face the center; the 3 by 3 interior fills with `end_portal`. Bedrock accepts
only the flat ring, and so does this server.

A trip into the End from the Overworld or the Nether has no countdown. It loads the chunks around
Java's End spawn point, writes the 5 by 5 obsidian platform at y 48 with three rows of air above it
(destroying whatever is in the way, as Java regenerates it on every entry), and lands a player at
(100.5, 49, 0.5) facing west and anything else one block higher at y 50.

A trip out of the End lands a player at their respawn point, which is the next section's rule, and
spends no respawn anchor charge, which matches Java although charging is not modeled here anyway.
Anything else lands one block above the Overworld spawn. The end credits are not shown; the
server logs the client's credits state and never starts them. End gateways are claimed by the
`portal` block family and have no hook, so stepping into one does nothing yet.

### Where a player comes back

A spawn point names a dimension. A bed sets one only where the dimension type's bed rule allows
it, which the 26.3 documents grant to the Overworld alone, and a respawn anchor only where the
type's `respawn_anchor_works` attribute is true, which is the Nether alone. Where the answer is
no, Java explodes the block; that explosion is not modeled yet, so the server only declines to
move the spawn. `/spawnpoint` sets a forced point that is honored whatever stands there.

A death in another dimension respawns the player in the spawn point's world: the level builds that
dimension if it is not loaded, the respawn exchange opens with a `ChangeDimension` marked as a
respawn, and the rest of the sequence below follows. A bed or anchor whose block is gone, or that
has no free column around it, is reported with Bedrock's `tile.bed.notValid` message and cleared,
and the player goes to the default level's Overworld spawn. A point naming a dimension the level
has no stem for counts as a bed that is gone.

### What a plugin can cancel

Two events cover a trip, both cancelable and both reachable the way every other server event is:

- `entityPortalEnter` carries an `EntityPortalEnterEvent` with the entity and the portal block it
  overlaps, raised on the first tick of contact for players and entities alike. The server waits
  for every listener, asynchronous ones included, before it reads the cancel flag, so a listener
  that has to look something up first can still cancel. Canceling opens no contact; the world
  asks again on the next tick the body still overlaps the portal.
- `playerChangeDimension` carries a `PlayerChangeDimensionEvent` with the player, the world they
  are leaving, the world they arrive in and the resolved arrival position and facing, raised just
  before the client sequence starts. Canceling leaves the player where they stand, with no
  cooldown set and nothing sent to the client. Entities that are not players raise no second
  event; they move the moment their trip resolves. A data-driven mob keeps its runtime record
  across the trip: the record is written onto its body before it leaves, as a save would write
  it, so the destination restores the same mob with its component state and portal cooldown
  rather than spawning a fresh one.

`Server.getDimensionTravel()` reaches the service for a plugin that wants to resolve or start a
trip itself.

## What the client sees

The server does its own bookkeeping before the first packet goes out. The player's record is
saved to the level being left so it carries that world's dimension, the player leaves the old
world's roster, the old world's entities are removed from the client, the chunk bookkeeping is
cleared, the position moves to the arrival and the player joins the new roster.

Then comes the sequence Dragonfly, Geyser and Nukkit agree a Bedrock client expects. One
`ChangeDimension` with the destination's Bedrock id, the arrival position, the respawn flag and a
fresh loading screen id; `StopSound` for everything playing; `NetworkChunkPublisherUpdate` centered
on the arrival; a `PlayerAction` of `ChangeDimensionAck` sent by the server, which since 1.19.50 is
the server's to send and goes out before any chunk; the chunks around the arrival, queued in the
new dimension and streamed from the middle outward; and `PlayStatus PlayerSpawn`.

The change then stays pending until the client reports `ServerboundLoadingScreen EndLoadingScreen`
with the id the server handed out. Until then the client's `PlayerAuthInput` positions are still
the old world's and are dropped, and a second `changeWorld` for the same player is logged at debug
and dropped too: the player is still ticked while on the loading screen, and one who arrived
inside the exit portal would otherwise be sent straight back once the 10 tick cooldown ran out,
before the client ever closed the first screen. On the report the server teleports the client to
the exact arrival position, re-sends the attributes and the inventory, which a dimension change is
not known to keep, sends `SetSpawnPosition` with the spawn point's dimension so the compass and
maps point the right way, and raises the changed-dimension advancement hook. Effects are not
re-sent.

One case needs more. A client sent `ChangeDimension` to the dimension it is already in never
closes the screen, so a move between two worlds with the same Bedrock id, such as `/tp` between two
Overworld levels, first detours through three `ChangeDimension` and `PlayStatus` pairs (the current
id, another, that other again) before the real one.

On the join, `StartGame.dimension` is the join world's Bedrock id, so a player saved in the Nether
joins with dimension 1, and `StartGame.generator` describes the level's Overworld stem, Flat for a
flat stem and the overlay's value otherwise, because the field names the world type rather than
the spawn dimension. A level with custom types sends `DimensionData` as described above.

## The parity rows

Three rows in `@jsprismarine/parity` guard this ([parity.md](parity.md) explains the suite):

- `worldgen.dimensions` parses the pinned datapack's four `dimension_type` and seven
  `world_preset` documents through the public parsers and compares them, and the three overlay
  rows, with the research note's tables, then generates chunk 0,0 of each `minecraft:normal` stem
  through the shared noise generator and checks that the payload a client would get has blocks
  inside the Bedrock bounds, biomes the stem's biome source can produce, the biome section count
  the client expects for that dimension id, and no structure type without a builder.
- `blocks.portals` checks that every block the portal rules name exists in the Bedrock palette
  capture with the states the rules read and the values they compare against, that every link in
  the travel tables is between vanilla types the overlay knows, that each vanilla type has a travel
  rule, and that the table's numbers (128, 80, 0, 300, 10) match the research note.
- `protocol.dimension-change` captures the sequence `PlayerSession.changeWorld` sends, encodes it
  through every registered codec and decodes it back to the same bytes and data, and checks that
  the `DimensionDefinition` cloud fields travel at protocol 2225 and stay off the wire at 2193.

## Open questions

The implementation plan listed five questions only a real Bedrock client can answer. None has been
run against one; every slice that touched them says so in its Changeset, and the plan's client
integration test has not been written. What the code does today, and what remains to check:

1. **Does the client accept `ChangeDimension` to an id of 1000 or more, and then `LevelChunk` with
   that id?** The server sends custom ids on the join, in `StartGame` and `DimensionData`, as
   Dragonfly does; Mojang's payload comment lists only 0 to 3. On a change it does not try.
   `PlayerSession.changeWorld` refuses a world of a custom type with a logged error and the player
   stays put, so until this is verified a custom dimension is reachable by joining in it and by
   entities that are not players. Test with one custom `dimension_type` before lifting the
   refusal.
2. **Does the client keep inventory, effects and attributes across a change?** Not yet verified
   against a real client. The server re-sends attributes, the inventory and the spawn position
   after `EndLoadingScreen` as the safe default; effects are not re-sent. A manual run would show
   whether the re-send is needed and whether effects survive without one.
3. **Does the client honor `StartGame.generator` of 3 (Nether) or 4 (End) when the spawn dimension
   is not the Overworld, or must it describe the Overworld stem?** The server always sends the
   Overworld stem's generator. Not yet verified against a real client.
4. **Does a 2225 client accept a `DimensionDefinition` with `Cloud Height` and `Render Clouds`
   appended, and a 2193 client one without?** Both layouts round-trip through the codecs and the
   `protocol.dimension-change` row pins them. The field order has not been verified against a real
   client.
5. **How many chunks must arrive before the client closes the loading screen?** The server queues
   the real chunks around the arrival and streams them from the middle outward; it does not send
   Geyser's empty chunks in radius 3. The bundled `@jsprismarine/client` answers
   `StartLoadingScreen` when `ChangeDimension` arrives and sends `PlayerAction ChangeDimensionAck`
   and `EndLoadingScreen` after the first `LevelChunk` carrying the new dimension's id
   (`packages/client/src/DimensionChange.ts`), and its test runs that exchange through a nether
   portal on a real server, so the server's side of the sequence completes against one chunk. The
   retail Bedrock client is not yet verified; if its screen hangs on a slow pipeline, the fallback
   is Geyser's empty chunks.
