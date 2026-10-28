# @jsprismarine/engine-systems

The engine systems neither edition publishes as data: the tick scheduler, redstone, flowing fluids,
fire spread with the random tick driver, explosions and the weather cycle. Every other package in
this repository is built from Mojang's own data. These are not, because Mojang keeps them in code in both editions, so
this package is written against the code instead.

The code it is written against is the pinned Java 26.3 server jar in
`node_modules/.cache/jsprismarine/java-server/`. Mojang removed obfuscation in release 26.1, so the
jar carries original class, field and method names, and every constant and ordering rule here was
read out of it rather than from a wiki page. The classes are named in the source comments:
`LevelTicks`, `ScheduledTick`, `TickPriority`, `RedstoneWireBlock`, `DefaultRedstoneWireEvaluator`,
`DiodeBlock`, `RepeaterBlock`, `ComparatorBlock`, `ObserverBlock`, `PistonBaseBlock`,
`PistonStructureResolver`, `CollectingNeighborUpdater`, `SignalGetter`, `FlowingFluid`,
`WaterFluid`, `LavaFluid`, `LiquidBlock`, `FireBlock`, `ServerExplosion`,
`ExplosionDamageCalculator`, `ApplyExplosionDecay`, `WeatherData`, `WeatherCommand` and
`ServerLevel`.

## The `WorldAccess` seam

Every system reads and writes the world through one interface, `WorldAccess`. Nothing in this
package touches a chunk, a palette or a block entity directly.

```ts
import { createEngine, createTestWorld } from '@jsprismarine/engine-systems';

const world = createTestWorld();
const engine = createEngine(world);
world.onBlockUpdated((at, to) => engine.setBlockAndUpdate(at, to));
```

`setBlockAndUpdate` is the whole of Java's `Level.setBlockAndUpdate`: the write, the six neighbor
updates, the new block's own `onPlace`, and the shape updates around it. A host that raises only
the neighbor updates gets a world where dust placed beside a live lever stays dark, a piston placed
into a powered position never extends, and fire never burns anything, because all three of those
are `onPlace` and none of them is a neighbor update.

`WorldAccess` covers block state, block entity data, tick scheduling and its two queries, item
drops, sounds, difficulty, weather, rain, dimension, game time, the world random and the height
bounds. Explosions take `ExplosionWorld`, which is the six members of it a blast actually uses, so
a host can set one off without standing up the rest of the engine. The random source and the height bounds are not in the brief's list but are needed:
fire spread, lava's spread delay and the random tick driver all draw from the random source, and
`PistonBaseBlock.isPushable` and `FlowingFluid` both read the height bounds.

Scheduling sits behind `WorldAccess` rather than beside it, so a system never needs two objects. The
host owns the scheduler, drains it, and calls `Engine.runScheduledTick` for each due tick. That
matches Java, where the tick lists are part of the level and are serialized to disk.

`createTestWorld` is a real implementation of the interface over a map of positions, not a mock.
`createTestEngine` returns a world and an engine already wired to each other, which is the shape the
tests use to build circuits, troughs and fires.

## 1. The tick scheduler

`TickList` is Java's `LevelTicks` for one kind of tick, and `TickScheduler` holds the two kinds the
level keeps: block ticks and fluid ticks, run in that order by `ServerLevel.tick`.

A scheduled tick carries a trigger tick, a priority and the order it was scheduled in. The drain
order is Java's `ScheduledTick.DRAIN_ORDER`, trigger tick then priority then schedule order, and the
order inside one batch is `INTRA_TICK_DRAIN_ORDER`, priority then schedule order, with the trigger
tick deliberately not a tiebreaker. The seven priorities carry Java's own values, -3 through 3.
Scheduling a second tick for a position and type that already has one is ignored, which is the rule
the repeater's behavior rests on.

The per-tick budget is 65536, the number `ServerLevel.tick` passes to both lists.

A scheduled tick and an immediate neighbor update are different things, and keeping them apart is
most of what this system is for. A scheduled tick runs on a future game tick. A neighbor update runs
inside the call that changed the block, through `createNeighborUpdates`, which is a transcription of
`CollectingNeighborUpdater`: the first update runs a loop, and every update raised while that loop
is running is pushed on a stack and taken before the outer update walks its next direction.

One deliberate difference. Java shards each tick list per chunk and merges the shards while
draining. This keeps one queue for the whole world, which produces the same order whenever every due
tick has the same trigger tick, which is every tick that is not part of a backlog the budget left
behind. For a backlog the two can disagree, and this ordering is the stricter one: it runs the
oldest ticks first.

## 2. Redstone

The power model is `SignalGetter` plus the per-block `getSignal`, `getDirectSignal`, `ownSignal` and
`shouldRedstoneWireConnectTo` overrides. Power runs 0 to 15. Weak power reaches dust and components;
strong power is what a conductor picks up and re-emits, which is why a block under a lever powers
the dust beside it and a block beside a lever does not.

Dust uses `DefaultRedstoneWireEvaluator`, the evaluator vanilla runs. Mojang ships a second one,
`ExperimentalRedstoneWireEvaluator`, behind the `redstone_experiments` feature flag whose entire
datapack is a `pack.mcmeta`; this package implements the default and not the experiment.

The sources are the torch, a block of redstone, levers, buttons, pressure plates, weighted pressure
plates, daylight detectors, observers, comparators and repeaters. Repeaters take their delay state
times 2 game ticks and lock while a diode powers either side, both read live rather than stored.
Comparators run in compare and subtract mode, read a container's fill through
`BlockEntityData.analogOutput`, and reach one block further through a conductor. Observers pulse 15
for two game ticks when the block they face changes shape, and ignore everything else, which is what
makes a Java observer not a block update detector.

Tick priority comes from `DiodeBlock.checkTickOnNeighbor`: a repeater facing the back or side of
another diode schedules at `EXTREMELY_HIGH`, a repeater turning off at `VERY_HIGH`, any other
repeater at `HIGH`, and a comparator at `HIGH` when prioritized and `NORMAL` otherwise.

Pistons use `PistonStructureResolver` unchanged: the 12-block limit, the reorder when a branch meets
a line already queued, slime and honey dragging their neighbors with the one pair that refuses to
stick, and `popped` blocks breaking instead of moving. The push reaction and the destroy time both
come from `@jsprismarine/mapping`, which dumps them from the same jar, so nothing about which blocks
move is written down twice. Extending and retracting are the two phases: `resolvePistonStructure`
decides, `applyPistonMove` acts.

### What is not reproduced

Redstone is server-decided and invisible to the Bedrock client, so this package implements Java's
rules. These Bedrock behaviors are therefore deliberately absent.

- **The produce and consume tick split.** Bedrock runs redstone outside the main loop, with power
  components reading input on odd game ticks and mechanisms acting on even ones. Java has one loop
  and so does this package.
- **Dust refreshing only on produce ticks.** Bedrock dust carries a one-tick pulse but renders its
  state only on a produce tick. Here dust state and dust power are the same thing.
- **Soft inversion.** A Bedrock torch on a powered piston flips (MCPE-17909, Won't Fix). There is no
  equivalent here.
- **Observers as block update detectors.** Bedrock observers fire on any block update and only on
  odd game ticks. Here they fire on a shape change from the block they face, on any tick.
- **Bedrock's fixed 2-tick piston start delay and its refusal to abort mid-move.** Java pistons
  start on the tick they are powered and abort an extension when power goes away; so do these.
- **Bedrock's per-chunk limit of 100 scheduled ticks per game tick.** The budget here is Java's
  65536 for the whole level.
- **Random transmission order within a tick.** Bedrock's is random; Java's is deterministic and
  positional, and so is this.

Quasi-connectivity is the other direction: it is Java and Legacy Console only, Mojang closed its
absence on Bedrock as working as intended (MCPE-14664), and it is implemented here, because
`PistonBaseBlock.getNeighborSignal` reads the block above the piston and this package implements
Java's rules. Zero-ticking and sticky-piston block dropping are not implemented: both are Java bugs
by Mojang's own account, and the zero-tick family was patched out of Java in 20w12a.

## 3. Fluids

`FlowingFluid` over Bedrock's two blocks per fluid. A fluid state is a kind, an amount of 1 to 8, a
falling flag and a source flag, encoded into Bedrock's own `liquid_depth` state by Java's
`getLegacyLevel` rule: 0 is a source, 1 to 7 count down from full, and adding 8 marks falling.

The three numbers that decide how far and how fast a fluid travels are the jar's, and they are the
only place in this package where the dimension changes an answer.

| Fluid | Drop-off | Hole search | Tick delay | Reach from a source |
| --- | --- | --- | --- | --- |
| Water, every dimension | 1 | 4 | 5 | 7 blocks |
| Lava, overworld and the end | 2 | 2 | 30 | 3 blocks |
| Lava, nether | 1 | 4 | 10 | 7 blocks |

The hole search is `getSlopeDistance`, which scores each candidate side by how many blocks away the
nearest hole is and sends fluid only to the sides tied for the lowest score. Two sources touching
make a third where `water_source_conversion` allows it, and `lava_source_conversion` is off by
default, which is why water is infinite and lava is not. The interactions are `LiquidBlock`'s: lava
touching water becomes obsidian when it is a source and cobblestone when it is flowing, lava falling
into water becomes stone, and lava over soul soil next to blue ice becomes basalt.

### What is not reproduced

- **Java's `FluidState` on an arbitrary block.** Java attaches a fluid to any block, which is why
  `waterlogged` is a block state there. Bedrock's palette has no `waterlogged` anywhere and uses a
  second block layer instead, so this package keeps Java's algorithm over Bedrock's two blocks. A
  host that wants waterlogging puts the fluid in the second layer and calls this package for the
  layer's own position.
- **Bedrock's `minecraft:liquid_detection` component.** Which blocks a fluid may occupy is answered
  from the push reaction here, because `popped` is the reaction every block in Java's
  `washed_away_by_fluids` tag carries.
- **Collision-shape face occlusion.** Java's `canPassThroughWall` merges two collision shapes and
  asks whether the shared face is occluded. Neither edition publishes collision shapes, so this
  answers from the full-cube test described under "What has no published source" below.

## 4. Fire and random ticking

`FireBlock.tick` and `FireBlock.checkBurnOut`. The ignite and burn odds that `FireBlock.bootStrap`
installs for 254 blocks are not repeated here: `@jsprismarine/mapping` already holds them per block
state, dumped from the same jar, so `igniteOddsOf` and `burnOddsOf` read them.

Fire ages, burns the six blocks it touches with denominators of 300 sideways and 250 up and down,
and tries to light every position in the 3 by 3 by 6 box around it with odds of
`(igniteOdds + 40 + difficultyId * 7) / (age + 30)` against a denominator that rises by 100 for each
block above the first one overhead. Rain puts it out and blocks the spread. The infinite fire
sources are the `infiniburn` block tags: netherrack and magma in the overworld and the nether, plus
bedrock in the end.

Fire runs on scheduled ticks 30 to 39 game ticks apart, as Java does, and is not affected by the
random tick speed. Bedrock drives fire from random ticks instead; that is a deliberate divergence.
The data-driven fire family books the first tick when its `onPlace` hook runs. The engine keeps the
same placement fallback for worlds without that family and skips its random draw when the tick is
already booked. Every scheduled tick books the next one before doing anything else.

Whether a fire tick does anything past that booking is `ServerLevel.canSpreadFireAround`, which
reads the 1.21.11 game rule `minecraft:fire_spread_radius_around_player`. The rule is an integer, a
default of 128 and a minimum of -1, and `GameRuleRegistryFix` folds the two booleans it replaced
onto three of its values: `doFireTick` off is 0, on is 128, and on with
`allowFireTicksAwayFromPlayer` is -1, which lifts the limit. Anything else means fire ticks only
within that many blocks of a non-spectating player. The radius needs the player list, which this
package does not have, so `EngineOptions.canSpreadFireAround` is where the host answers it. Say
nothing and fire spreads everywhere.

The random tick driver is `ServerLevel.tickChunk`. It draws `random_tick_speed` positions from each
randomly ticking section with `Level.getBlockRandomPos`, whose linear congruential step,
`state * 3 + 1013904223`, is transcribed exactly because the distribution of crop growth depends on
it. Positions are drawn with replacement, so one block can be chosen twice in a chunk tick, and a
position whose block does not take random ticks still consumes its draw.

`random_tick_speed` defaults to 3 in Java and means three draws per section. Bedrock's
`randomtickspeed` defaults to 1 and the wiki says it "specifies only relative speed instead of the
exact number", with no published mapping between the two. This package implements Java's absolute
three.

Which blocks take random ticks comes from the mapping table's `randomTick` flag. What a random tick
does to a block is not this package's business past the fluids: `EngineOptions.randomTickHandlers`
is the hook `@jsprismarine/block-behaviors` fills with crop growth, ice melting and the rest.

## 5. Explosions

`ServerExplosion`, which is a ray cast rather than a sphere. One ray leaves the center for every
cell on the surface of a 16 by 16 by 16 grid, 1352 of them, each carrying an intensity of
`radius * (0.7 + random * 0.6)` and stepping 0.3 blocks at a time. Every block a ray crosses takes
`(blastResistance + 0.3) * 0.3` off that intensity and every step takes a further 0.22500001, and
every position a ray still has intensity at joins the set that comes out. That is the whole reason a
blast carves an irregular hole, leaves the blocks behind a wall standing, and is stopped by one
block of water where a block of stone only slows it.

The blast resistance is `@jsprismarine/mapping`'s, dumped from the same jar, so obsidian's 1200 and
water's 100 are not written down here. Air is the one block that costs a ray nothing at all; a block
with no resistance still costs it 0.09, which is why a ray dies faster through tall grass than
through nothing.

Entity damage is `ExplosionDamageCalculator.getEntityDamageAmount` over
`ServerExplosion.getSeenPercent`. The exposure fires a grid of rays from the entity's own box back
at the center, spaced `1 / (side * 2 + 1)` per axis, and reports the fraction that arrive, so cover
grades rather than switching. Damage is `((impact² + impact) / 2) * 7 * reach + 1` where impact is
how close the entity is as a fraction of `radius * 2`, times the exposure, and the flat one at the
end is why standing fully behind a wall still costs half a heart. Knockback is the same impact
times `getKnockbackMultiplier` times `1 - EXPLOSION_KNOCKBACK_RESISTANCE`, along the line from the
center to the entity's eyes.

A blast is 1352 rays of up to 18 steps, so the hot loop runs about 24,000 times. Two flat arrays
over the cube a ray can reach hold the resistance already read and whether a position is already
marked, which takes the block reads down to about 800, and one shared occluder cache serves every
entity's exposure rays. A TNT blast of radius 4 costs about 0.5 ms, a charged creeper's radius 6
about 1.1 ms, and a 24-TNT chain detonating in one tick about 16 ms.

`explode` returns the hits rather than applying them, because this package has no entity model, and
calls `onBlockDestroyed` for each block before clearing it, because it has no item model either.
That is where a host rolls the block's loot table with Java's `explosion_radius`, the parameter
`ApplyExplosionDecay` turns into a `1 / radius` chance per item.

### What is not reproduced

- **Collision-shape clipping for the exposure rays.** Java clips with `ClipContext.Block.COLLIDER`.
  Neither edition publishes collision shapes, so the exposure rays treat `isFullCube` as the only
  thing that casts a shadow, and a fence or a slab casts none. The same approximation the fluids
  and redstone make, listed under "What has no published source" below.
- **Waterlogging.** Java takes the higher of the block's and the fluid's resistance at a position,
  which is how a waterlogged block resists like water. Bedrock keeps its water in a second block
  layer, so a host that wants that calls `explosionResistanceOf` for the second layer itself.
- **Fire.** `ServerExplosion.createFire` lights one position in three where the block is air and the
  block below renders solid. Only a ghast fireball and a bed in the nether set it, and neither
  exists here yet. The positions it needs are in `ExplosionResult.positions`, air included, which is
  why air is in there.
- **`Entity.onExplosionHit` and `Block.wasExploded`.** The per-entity and per-block callbacks Java
  fires after the blast, which are what chains one TNT into the next and what pops a shulker box's
  contents. The host raises those from the hits and the destroyed blocks.
- **The draws themselves.** Each ray's starting intensity and the shuffle that decides which dropped
  stacks merge both come from the host's random source, which is not Java's `LegacyRandomSource`.
  Two blasts therefore carve different holes of the same shape and size. Everything that does not
  depend on a draw matches.

## 6. Weather

`ServerLevel.advanceWeatherCycle` over `WeatherData`. Three counters and two flags, stepped
once a game tick, and that is the whole of why it rains: nothing samples a climate, a counter
runs out and the flag it was holding flips.

Rain and thunder are two cycles running beside each other, not one inside the other. Each
counter either runs down, flipping its flag and booking the opposite stretch when it hits zero,
or books its first stretch if it was already at zero. The durations are the jar's
`UniformInt`s, inclusive at both ends.

| Counter | Waiting | Running |
| --- | --- | --- |
| Rain | 12000 to 180000 ticks | 12000 to 24000 |
| Thunder | 12000 to 180000 | 3600 to 15600 |

The third counter, `clearWeatherTime`, is what `/weather clear` sets. While it runs it pins the
other two to one tick and holds both flags false, so the cycle restarts on the tick after it
ends. `weatherCommandState` is the whole of `WeatherCommand` that belongs here: which counters
each of the three forms sets and what duration it uses when the command names none.

Because the two cycles are independent, the thundering flag does come up with no rain under it.
Java's `getThunderLevel` multiplies by the rain level, so that state is clear everywhere it
matters, and `weatherOf` answers `clear` for it. A thunderstorm is always rain.

`advanceWeatherCycle` is a function from one state to the next rather than something that owns
a world, because the state is five numbers the host already has to save and send. The host
steps it, keeps what comes back, and tells its clients when `weatherOf` changed. Whether to
step it at all is the host's: Java gates it on `doWeatherCycle` and on whether the dimension can
have weather.

### What is not reproduced

- **`Level.isRainingAt`'s biome test.** Java asks whether the biome's precipitation at that
  position is rain rather than snow, which is a temperature curve over the height. Neither
  edition publishes the curve in a form this repository holds, so a host answers the first three
  conditions - it is raining, the sky is visible, and nothing stands above - and treats every
  biome as rainy. Fire in a snowy biome is therefore put out where Java would leave it burning.
- **The rain and thunder levels.** Java carries a float per level that rises and falls by 0.01 a
  tick, which is what fades the sky rather than switching it. Nothing here reads a partial
  level, so the flags are the whole state.
- **Lightning.** `ServerLevel.tickChunk` strikes during a thunderstorm, which needs the player
  list and a lightning entity; neither is this package's.

## What has no published source

One input to this package has no published source in either edition, and it is called out rather
than hidden: whether a block's collision shape fills its cube, which Java calls
`isCollisionShapeFullBlock`. Redstone conductivity defaults to it, the sturdy-face test uses it, and
fluid flow through a wall uses it.

`isFullCube` derives it from the mapping table's light dampening, which is 15 for every opaque cube
and 0 or 1 for the slabs, stairs, fences and plates that are not cubes, plus a short list of
transparent cubes by name. Conductivity then applies the explicit overrides read out of `Blocks` in
the jar: the blocks whose registration calls `isRedstoneConductor(Blocks::never)` and the two that
call `isRedstoneConductor(Blocks::always)`.

There are 26 call sites, 24 refusing and 2 accepting, but five of the 24 sit in shared property
factories and so cover 65 blocks between them: `leavesProperties` the twelve leaves,
`pistonProperties` the two pistons, and three lambdas handed to `ColorCollection.registerBlocks` and
`WeatheringCopperCollection.registerBlocks` the sixteen stained glass colors, the eight copper grates
and the eight copper bulbs. 26 of those 65 are written down here, which is 26 blocks and not the 26
call sites. The other 39 dampen light by less than 15 and are not named as transparent cubes, so
`isFullCube` already refuses them and the override would change no answer.

## Left for later

- The `minecraft:moving_block` flight. Java puts a pushed block into a block entity for two game
  ticks and lands it at the end; `applyPistonMove` writes the blocks into their new positions in one
  step. The flight belongs to the block-entity layer, and so does pushing a block entity, which
  Bedrock allows and Java does not.
- Java's piston block event. `checkIfExtend` defers the move to a block event that runs later in the
  same game tick; this runs it in place, which is the same game tick.
- The redstone torch's 160-tick burnout restart is implemented, but Java's "might or might not turn
  itself back on depending on the update chain" (MC-120938) is not, because the behavior is a bug
  with no specified outcome.
- Bubble columns, which `LiquidBlock` schedules alongside the fluid tick.
