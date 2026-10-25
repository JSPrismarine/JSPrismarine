---
title: Engine systems
group: Documents
category: Guides
---

# The engine systems

Almost everything this server knows about Minecraft it reads out of data. Blocks, items, mobs,
loot, recipes, advancements and terrain all come from a pack or a generated table, and
[architecture.md](architecture.md) explains how that was decided and how the two editions are
joined. A handful of systems have no data form at all. [The plan](../plans/data-driven-vanilla.md)
names them in phase 5: redstone, fluid flow, explosions, fire spread, light, the spawning
algorithm and random ticking.

This page is about what the server simulates in each of those, how close the simulation is to Java
Edition, what one tick of it costs, and where it stops. It is written for someone running the
server or changing it, so the numbers are the ones you can observe or budget against.

## Why these are code

Mojang keeps these systems in the game's own code in both editions. There is no redstone file in a
behavior pack, no explosion table in a datapack, and no light format anywhere. So the fallback is
Java's code, which has carried original class, field and method names since Mojang removed
obfuscation in release 26.1. `@jsprismarine/engine-systems` is transcribed from the pinned Java
26.3 server jar in `node_modules/.cache/jsprismarine/java-server/`, constant by constant, and each
rule's source comment names the class it came from.

Natural spawning is the one item on that list with a data form. Bedrock publishes spawn rules, so
the server reads the 60 vanilla `spawn_rules/*.json` files through `@jsprismarine/spawning` and
only the loop around them is code. [entities.md](entities.md) covers it; this page does not.

| What | Where |
| --- | --- |
| Scheduler, redstone, fluids, fire, random ticking, explosions | `packages/engine-systems/` |
| Block light and sky light | `packages/lighting/` |
| Driving all of it from one world tick | `packages/prismarine/src/world/WorldSystems.ts` |
| The world those systems read and write | `packages/prismarine/src/world/EngineWorld.ts` |
| What happens to a block the world destroys | `packages/prismarine/src/world/blockDestroy.ts` |
| A blast over the server's own entities | `packages/prismarine/src/entity/Explosion.ts` |

Every system reads and writes the world through one interface, `WorldAccess`. Nothing in
`@jsprismarine/engine-systems` touches a chunk, a palette or a player, which is why the same
explosion code runs for a class-based entity and for a data-driven one over two different seams.

## The tick

`World.update` runs each system in Java's order, and `WorldSystems.tick` is the part that owns
them. Scheduled block ticks run first, then scheduled fluid ticks, then the chunk tick that draws
random positions, then the light the writes above queued. Light goes last because every block
change made earlier in the tick has already added work to its queue.

Two kinds of update look similar and behave differently. A **scheduled tick** runs on a future game
tick. It carries a position, a block type, a trigger tick and one of Java's seven `TickPriority`
values from -3 to 3, and the list drains in `ScheduledTick.DRAIN_ORDER`, which is
trigger tick, then priority, then the order the tick was scheduled in. Scheduling a second tick
for a position and type that already has one is ignored, which is the rule a repeater's behavior
rests on. A **neighbor update** runs inside the call that changed the block, through a
transcription of `CollectingNeighborUpdater`, and the chain it can set off is capped at 1,000,000
updates.

Each list gets 65536 ticks per game tick, Java's number, and the light engine gets 4096 queue
nodes. Both limits exist so a single tick cannot stall on a backlog of fluid ticks or a light
flood; whatever is left over is reported and runs next tick.

## Random ticking

Random ticking is what grows crops, melts ice, spreads grass and burns out a fire's fuel in
Bedrock. The driver is `ServerLevel.tickChunk`, including `Level.getBlockRandomPos`, whose linear
congruential step `state * 3 + 1013904223` is transcribed exactly because the distribution of crop
growth depends on it. `random_tick_speed` means three draws per chunk section, which is Java's
absolute number; Bedrock's `randomtickspeed` defaults to 1 and the wiki describes it as a relative
speed with no published mapping, so this server implements Java's.

What changed recently is where those draws land. Java's `ServerLevel.tickChunks` decides it twice
over, and this server now does too.

The first test is the player. A chunk is simulated only if a player is within the simulation
distance of it, which is 10 chunks each way, so 441 chunks around each player. A chunk outside
every player's radius stays in memory and stays still. **An idle server with nobody online ticks
zero chunks.** The second test is the section. Inside a simulated chunk, only the sub chunks that
hold something are drawn for, so the three hundred blocks of air above an Overworld column cost
nothing.

Before either test, the server drew in all 24 sections of all 441 loaded chunks whether or not
anyone was online. Measured over the real loop on a flat world, that was 29.5 ms per tick out of a
50 ms budget. The section test alone takes it to 3.5 ms, and with no players online it is nothing
at all.

That is a parity fix as much as a performance one. In vanilla, logging off stops your furnaces,
your farms and your mob spawners, and a chunk you walked away from is frozen until you come back.
A server that ticks every loaded chunk gives players a world where crops grow and ice melts in
places nobody is standing, which is a different game.

One divergence is worth knowing about. Java skips a section when its palette holds nothing that
takes random ticks at all; this server skips a section only when it is empty. A sub chunk of solid
stone is therefore drawn for here and not in Java. Positions are drawn before the block under them
is checked, in both, so the extra draws do nothing visible by themselves. The draw state is shared
across the whole world, though, so stepping it more often shifts every later draw, and the exact
sequence of ticked positions is not Java's.

## Redstone

Power runs 0 to 15 through `SignalGetter` and the per-block `getSignal`, `getDirectSignal` and
`shouldRedstoneWireConnectTo` overrides. Weak power reaches dust and components; strong power is
what a conductor picks up and re-emits, which is why a block under a lever powers the dust beside
it and a block beside a lever does not. Dust uses `DefaultRedstoneWireEvaluator`, the evaluator
vanilla runs, rather than the one Mojang ships behind the `redstone_experiments` feature flag.

The sources are the torch, a block of redstone, levers, buttons, pressure plates, weighted
pressure plates, daylight detectors, observers, comparators and repeaters. Repeaters take their
delay state plus one, times 2 game ticks, and lock while a diode powers either side. Comparators
run in compare and subtract mode and reach one block further through a conductor. Observers pulse
15 for two game ticks when the block they face changes shape and ignore everything else, which is
what makes a Java observer not a block update detector. Pistons use `PistonStructureResolver`
unchanged, including the 12-block push limit and the slime and honey rules.

Tick priority comes from `DiodeBlock.checkTickOnNeighbor`, so a repeater facing the back or side
of another diode schedules at `EXTREMELY_HIGH`, a repeater turning off at `VERY_HIGH`, any other
repeater at `HIGH`, and a comparator at `HIGH` when prioritized and `NORMAL` otherwise. Those
priorities are what make a chain of diodes resolve in the same order it does in vanilla.

Here is a short circuit traced through. Put a lever on a stone block, a repeater at its shortest
delay facing away from it, and a line of dust in front of the repeater.

1. Flipping the lever writes the new block and raises the six neighbor updates around it, plus the
   update on the block holding the lever up, which is how the block it powers finds out.
2. The repeater hears the update, sees power on its back, and schedules a block tick two game
   ticks out, because its delay state of 0 means `(0 + 1) * 2`.
3. Nothing happens on the next game tick. The repeater is still unpowered.
4. On the tick after, the scheduled tick runs. The repeater turns powered and raises its own
   update on the block in front.
5. The dust re-evaluates and reads 15. It steps down by one per block from there.

Redstone is server-decided and invisible to the Bedrock client, so this server implements Java's
rules throughout. Bedrock's produce and consume tick split, its soft inversion bug, its dust
refresh rule, its observers acting as block update detectors and its per-chunk limit of 100
scheduled ticks are all deliberately absent. Quasi-connectivity goes the other way and is
implemented, because `PistonBaseBlock.getNeighborSignal` reads the block above the piston. The
package README lists the full set of divergences.

## Fluids

Flowing water and lava run Java's `FlowingFluid` over Bedrock's two blocks per fluid. A fluid
state is a kind, an amount of 1 to 8, a falling flag and a source flag, all encoded into Bedrock's
own `liquid_depth` by Java's `getLegacyLevel` rule. Three numbers decide how far and how fast a
fluid travels, and they are the only place in the package where the dimension changes an answer.

| Fluid | Drop-off | Hole search | Tick delay | Reach from a source |
| --- | --- | --- | --- | --- |
| Water, every dimension | 1 | 4 | 5 | 7 blocks |
| Lava, overworld and the end | 2 | 2 | 30 | 3 blocks |
| Lava, nether | 1 | 4 | 10 | 7 blocks |

The hole search is `getSlopeDistance`, which scores each candidate side by how far away the
nearest hole is and sends fluid only to the sides tied for the lowest score. Two sources touching
make a third where `water_source_conversion` allows it, and `lava_source_conversion` is off by
default, which is why water is infinite and lava is not. Lava touching water becomes obsidian when
it is a source and cobblestone when it is flowing, lava falling into water becomes stone, and lava
over soul soil next to blue ice becomes basalt.

## Fire

Fire is `FireBlock.tick` and `FireBlock.checkBurnOut`. The ignite and burn odds Mojang installs
for 254 blocks are not restated in the engine package; `@jsprismarine/mapping` already holds them
per block state, dumped from the same jar. A fire ages, burns the six blocks it touches against
denominators of 300 sideways and 250 up and down, and tries to light every position in the 3 by 3
by 6 box around it with odds of `(igniteOdds + 40 + difficultyId * 7) / (age + 30)` against a
denominator that rises by 100 for each block above the first one overhead. Humid biomes set
Java's `INCREASED_FIRE_BURNOUT`, which takes 50 off every burn-out denominator and halves the
spread odds. The infinite fire sources are the `infiniburn` tags: netherrack and magma in the
overworld and the nether, plus bedrock in the end.

Fire runs on scheduled ticks 30 to 40 game ticks apart, as Java does, and ignores
`random_tick_speed` entirely. Bedrock drives fire from random ticks instead, and that is a
deliberate divergence.

Whether a fire tick does anything beyond booking its next one is `ServerLevel.canSpreadFireAround`,
and in 1.21.11 that reads one game rule you should know about.
`minecraft:fire_spread_radius_around_player` is an integer with a default of 128 and a minimum of
-1, and it replaced two booleans. Mojang's own `GameRuleRegistryFix` maps the old settings onto
three of its values, so `doFireTick` off is 0, `doFireTick` on is 128, and `doFireTick` on together
with `allowFireTicksAwayFromPlayer` is -1, which lifts the limit. Any other value means fire only
ticks within that many blocks of a non-spectating player, measured as a straight-line distance from
the block.

A world that still spells the rule `doFireTick` keeps working, because the server resolves every
spelling through the 26.3 game rule registry and converts a stored boolean the way Mojang's fix
does. Setting the radius to 0 stops every fire in the world, and it is reversible: a fire whose
tick is gated still books its next tick, so it keeps its place in the tick list and carries on from
where it stopped when you turn the rule back up.

## Three systems that were right and never started

This is a whole class of bug rather than one defect, and it is worth understanding if you are
adding a system of your own.

Java's `Level.setBlockAndUpdate` does four things: the write, the six neighbor updates, the new
block's own `onPlace`, and the shape updates around it. For a long time `Engine.setBlockAndUpdate`
did the first two and skipped the third. The six neighbor updates tell the neighbors about the new
block. What they do not do is tell the new block about the world it just landed in, and that is
exactly what `onPlace` is for.

Three systems were dead because of it, and every one of them was correct:

- Fire never got the first of the scheduled ticks that age it, spread it and burn it out. Nothing
  else ever books a fire tick, so placed fire sat where it was lit forever.
- Redstone dust placed beside a lever that was already on stayed at 0, because
  `RedstoneWireBlock.onPlace` is what makes new dust work out its own power.
- A piston placed into a position something already powered never extended, because
  `PistonBaseBlock.onPlace` runs `checkIfExtend`.

None of the three had a bug in its tick handler. A system whose first tick nobody books looks
exactly like a system that does not work at all, which is what made these hard to spot. The tests
in `packages/engine-systems/src/engine.test.ts` cover each of the three so it cannot happen quietly
again.

The same reasoning changed how the package is tested. `createTestEngine` now wires a notifying write
back through `setBlockAndUpdate`, the way the server's `World.setLoadedBlockState` does, so a test
world behaves like a running world. A test setup that is simpler than the server's own wiring will
pass code the server's wiring breaks.

## Explosions

A blast is a ray cast, not a sphere, and `packages/engine-systems/src/explosions.ts` is Java's
`ServerExplosion` transcribed from the pinned jar's bytecode. One ray leaves the center for every
cell on the surface of a 16 by 16 by 16 grid, which is 1352 of them, since the 14-cube inside
contributes no new directions. Each ray draws a starting intensity of `radius * (0.7 + nextFloat()
* 0.6)` and steps 0.30000001192092896 blocks at a time. Every step costs a flat 0.22500001, plus
`(blastResistance + 0.3) * 0.3` for the block the ray is standing in. Every position a ray still
has intensity at joins the set that comes out.

Trace a radius-4 blast with solid stone around it and the consequences fall out of those four
numbers:

1. At the median draw, the starting intensity is `4 * (0.7 + 0.5 * 0.6)`, which is exactly 4. The
   range across all 1352 rays is 2.8 to 5.2.
2. Stone's blast resistance is 6, so a step inside stone costs `(6 + 0.3) * 0.3` for the block plus
   0.22500001 for the step, which is 2.115.
3. An intensity of 4 survives two steps. The second lands 0.3 blocks from the center, still inside
   the block the blast started in.
4. Exactly one block comes out.

The same arithmetic answers the other questions players ask:

- **Obsidian is untouchable.** Its resistance of 1200 costs a ray 360.09 per step, and the
  strongest ray a charged creeper can draw is `6 * 1.3`, which is 7.8. A charged creeper cannot
  clear the first block of it.
- **A one-block water moat works.** Water's 100 costs 30.09 per step, which a radius-4 blast cannot
  pay even once.
- **Air is free except for the step.** A ray in the open loses only 0.22500001 a step, so the median
  radius-4 ray survives 18 of them and marks positions out to about 5.1 blocks. That is the familiar
  crater size.
- **Nothing is truly free.** A block with no blast resistance still costs 0.09 a step, which is why
  a ray dies sooner through tall grass than through nothing.
- **Cover works.** Rays that hit a wall stop there, so the blocks behind it survive. The rays all
  run before any block is removed, so the hole a blast is carving never changes what the next ray
  passes through, and a wall shields what is behind it even though the wall is about to go.

Entity damage runs off the same geometry. `getSeenPercent` fires a grid of rays from the entity's
own box back at the center, spaced `1 / (side * 2 + 1)` per axis, so a player's box is sampled 3 by
5 by 3 and cover grades rather than switching on and off. Damage is
`((impact² + impact) / 2) * 7 * reach + 1`, where impact is how close the entity is as a fraction
of `radius * 2`, multiplied by the exposure. Point blank against a creeper that comes to 43
half-hearts. The flat 1 at the end is why standing fully behind a wall still costs half a heart.
Knockback is the same impact, times the entity's knockback multiplier, times
`1 - EXPLOSION_KNOCKBACK_RESISTANCE`, along the line from the center to the entity's eyes.

Each ray's starting intensity is a draw, so this is rule parity rather than bit parity. Two blasts
of the same radius at the same spot carve different holes of the same shape and size, and so would
two in vanilla. Everything that does not depend on a draw matches. The `@jsprismarine/engine-systems`
README lists what is deliberately missing, the largest items being `ServerExplosion.createFire`,
Java's waterlogged-resistance rule, and the `Entity.onExplosionHit` and `Block.wasExploded`
callbacks, which the host raises instead.

## What happens to a block the world destroys

A player breaking a block goes through `blockBreak.ts` whenever the content build is on. The
block's behavior family gets `onBreak` before the block goes, which is what spills a container and
unpairs a double chest, and Java's loot table decides what falls with the player's tool in the roll.
With `content-packs` off the path declines and the server breaks blocks the way it always did.

Everything else that destroys a block used to have a rule of its own, and there were four of them.
None raised a hook. A chest the blast caught kept its contents, a double chest left its other half
paired to air, and what fell was a hardcoded copy of the block rather than a table roll.

They now share one path, `blockDestroy.ts`, reached through `WorldAccess.destroyBlock`. An
explosion, a stream of water washing a block away, a piston popping a block it cannot move, fire
burning a plank, a block that lost its support, a falling anvil and `/setblock destroy` all raise
`onBreak` first and then roll Java's table with whatever the caller knows. An explosion passes its
radius, which every vanilla block table reads through `minecraft:explosion_decay`; that keeps each
item of a rolled stack with a chance of `1 / radius`, so a radius-4 blast keeps one item in four.
Fire passes "this yields nothing", which is Java's `removeBlock(pos, false)`, and a burning chest
still spills what it held even though the chest itself leaves nothing.

A piston is the one case that does not destroy anything it moves. `WorldAccess.moveBlock` carries
the block and its block entity one position together, so a pushed chest arrives with its contents
instead of being written twice and arriving empty. The structure is moved farthest-from-piston
first, which is Java's order in `moveBlocks` and the order that lets each block land in a position
the one ahead of it has already left.

`/setblock replace`, `/setblock keep`, `/fill` outside its `destroy` mode and `/clone` write
straight through and drop nothing. That is also Java's behavior, and it is the reason those
commands are safe to use on a region full of chests.

## Light

`@jsprismarine/lighting` keeps a block light and a sky light layer, 0 to 15 per block, packed two
levels per byte per chunk section. `WorldSystems` drives it from the world tick, reporting every
block change and every chunk load and calling `flush(4096)` at the end of the tick.

None of this reaches a player. The Bedrock protocol has no light packet, and neither
`LevelChunkPacket` nor `SubChunkPacket` carries a light array, so the client computes what it
renders from the block palette it already has. The server keeps its own light because three rules
read it: mob spawning tests a candidate block's level, crop growth needs a minimum level to
advance, and daylight detectors turn the sky level into a redstone signal. When the engine and the
client disagree, the player sees the client's answer and the server acts on its own, and there is
no packet that settles it.

Block light uses the two-queue flood, so removing one torch in a lit room darkens its share before
the remaining torches refill it. Sky light runs off a per-column heightmap, with a constant 15
above the highest blocking block, which is never stored and is most of the volume of an Overworld
chunk. A block change is patched rather than rebuilt. The daylight cycle is not applied here;
`getSkyLight` returns the geometric level, and the three consumers scale it for time and weather
themselves.

The package follows Bedrock on one visible point. Java's lighting has directional opacity and reads
the shape of slabs, stairs, farmland and a dozen other blocks, so light passes through them only in
some directions. Bedrock has one `minecraft:light_dampening` scalar per block state and applies it
in every direction. Modeling Java's rule would make the server compute light the client contradicts
for every slab in the world.

## What it costs

A tick is 50 ms. Here is what the engine systems take out of it, with the budgets that bound them.

| Work | Cost or budget |
| --- | --- |
| Scheduled block ticks, and fluid ticks, per tick | 65536 each, Java's number |
| Light queue nodes per tick | 4096 |
| Random ticks, 441 chunks, nobody online | nothing |
| Random ticks, 441 chunks, one player, flat world | 3.5 ms, down from 29.5 |
| Radius-4 blast | about 0.5 ms |
| Radius-6 blast, a charged creeper | about 1.1 ms |
| 24 blasts detonating in one tick | about 16 ms |
| Lighting 441 chunks during a preload | 1.2 s, down from 5.4 |

The explosion figures are the package README's own measurements. A blast is 1352 rays of up to 18
steps, so the inner loop runs roughly 24,000 times; two flat arrays over the cube a ray can reach
cache the resistance already read and whether a position is already marked, which takes the actual
block reads down to about 800. One shared occluder cache serves every entity's exposure rays.

The light numbers came from two changes. The engine gained `topOfColumn`, so a fresh chunk's column
scan starts below the open sky instead of at the dimension ceiling, which took 441 chunks of
generated terrain from 44.2 million block reads to 16.6 million and from 506 ms to 204 ms inside
the package. The server then gave the engine a runtime-id read and a per-id table of what each
block does to light, instead of resolving a full block state and walking the mapping table's
property rows tens of millions of times. End to end, lighting 441 chunks went from 5.4 s to 1.2 s,
with all 86.7 million resulting light levels unchanged.

If you want to measure a change yourself, `packages/prismarine/benchmarks/flood.bench.ts` runs an
ocean draining into a cavern over the real engine, the real scheduler and the real chunk storage,
with only the server and the socket stubbed.

## Known limits

Some of these are approximations the published data cannot resolve, and some are work not done yet.
Both affect what you will see.

- **No collision shapes, so partial blocks cast no shadow.** Java clips exposure rays with
  `ClipContext.Block.COLLIDER`. Neither edition publishes collision shapes, so `isFullCube` is the
  only occluder here, and a fence or a slab casts none. The same approximation decides redstone
  conductivity, the sturdy-face test and whether a fluid passes through a wall. `isFullCube` is
  derived from the mapping table's light dampening plus a short list of named transparent cubes, and
  conductivity then applies the explicit overrides read out of `Blocks` in the jar, which are the 18
  full cubes that carry no redstone and the two, mud and soul sand, that always do.
- **A blast lights no fires.** `ServerExplosion.createFire` is not implemented. Only a ghast
  fireball and a bed in the nether set it in Java, and neither exists here.
- **Knockback loses Java's vertical component.** Java adds the whole impulse to an entity's motion.
  This server's `applyKnockback` takes a horizontal direction and a strength and works out its own
  lift, so the horizontal part carries over exactly and the vertical part is this server's.
- **Lit TNT does not detonate.** Igniting a TNT block spawns a `minecraft:tnt` entity carrying a
  fuse of 80 ticks, and nothing counts that fuse down. The only thing that explodes today is a mob
  whose definition carries `minecraft:explode`, which is what a creeper's swell goal fires.
- **There is no weather cycle.** `EngineWorld` reports clear weather and no rain at every position,
  so rain never puts a fire out and never blocks a spread.
- **A comparator reading a container reads zero.** The engine asks for a container's fill through
  `BlockEntityData.analogOutput`, and nothing fills that in from a chest yet.
- **A piston forgets it is extended across a restart,** and so does a comparator's remembered
  output. Bedrock keeps a piston's `extended` in a block entity this server does not model, so both
  live in an in-memory map that never reaches disk. The arm block standing in front of the piston is
  what a client sees either way.
- **A pushed block does not fly.** Java puts a moved block into a `minecraft:moving_block` with a
  block entity for two game ticks and lands it at the end; this writes it into its new position in
  one step. Pushing a block entity at all is a Bedrock allowance Java does not have.
- **Simulation distance is a square.** The 10-chunk radius is applied per axis, so the simulated
  region is 21 by 21 chunks rather than a disc.
- **The world random is `Math.random`,** not Java's `LegacyRandomSource`, so nothing that depends on
  a draw matches vanilla bit for bit even when every rule around it does.
- **Bubble columns are not implemented,** and neither is the redstone torch's "might or might not
  turn itself back on" behavior (MC-120938), which is a Java bug with no specified outcome.

The package READMEs carry the full lists:
[`@jsprismarine/engine-systems`](../../packages/engine-systems/README.md) has a "what is not
reproduced" section under each system, and
[`@jsprismarine/lighting`](../../packages/lighting/README.md) explains its deliberate Bedrock
choices. [parity.md](parity.md) describes how the project's parity claim is tested, including the
allow list for rows that depend on a draw.
