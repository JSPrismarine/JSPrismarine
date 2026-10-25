# @jsprismarine/engine-systems

The four engine systems neither edition publishes as data: the tick scheduler, redstone, flowing
fluids, and fire spread with the random tick driver. Every other package in this repository is built
from Mojang's own data. These four are not, because Mojang keeps them in code in both editions, so
this package is written against the code instead.

The code it is written against is the pinned Java 26.3 server jar in
`node_modules/.cache/jsprismarine/java-server/`. Mojang removed obfuscation in release 26.1, so the
jar carries original class, field and method names, and every constant and ordering rule here was
read out of it rather than from a wiki page. The classes are named in the source comments:
`LevelTicks`, `ScheduledTick`, `TickPriority`, `RedstoneWireBlock`, `DefaultRedstoneWireEvaluator`,
`DiodeBlock`, `RepeaterBlock`, `ComparatorBlock`, `ObserverBlock`, `PistonBaseBlock`,
`PistonStructureResolver`, `CollectingNeighborUpdater`, `SignalGetter`, `FlowingFluid`,
`WaterFluid`, `LavaFluid`, `LiquidBlock`, `FireBlock` and `ServerLevel`.

## The `WorldAccess` seam

All four systems read and write the world through one interface, `WorldAccess`. Nothing in this
package touches a chunk, a palette or a block entity directly.

```ts
import { createEngine, createTestWorld } from '@jsprismarine/engine-systems';

const world = createTestWorld();
const engine = createEngine(world);
world.onBlockUpdated((at, to) => {
    engine.updates.updateNeighborsAt(at, to.name);
    engine.updates.shapeUpdatesAround(at);
});
```

`WorldAccess` covers block state, block entity data, tick scheduling and its two queries, item
drops, sounds, difficulty, weather, rain, dimension, game time, the world random and the height
bounds. The random source and the height bounds are not in the brief's list but are needed:
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

Fire runs on scheduled ticks 30 to 40 game ticks apart, as Java does, and is not affected by the
random tick speed. Bedrock drives fire from random ticks instead; that is a deliberate divergence.

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

## What has no published source

One input to this package has no published source in either edition, and it is called out rather
than hidden: whether a block's collision shape fills its cube, which Java calls
`isCollisionShapeFullBlock`. Redstone conductivity defaults to it, the sturdy-face test uses it, and
fluid flow through a wall uses it.

`isFullCube` derives it from the mapping table's light dampening, which is 15 for every opaque cube
and 0 or 1 for the slabs, stairs, fences and plates that are not cubes, plus a short list of
transparent cubes by name. Conductivity then applies the 26 explicit overrides read out of `Blocks`
in the jar: the blocks whose registration calls `isRedstoneConductor(Blocks::never)` and the two
that call `isRedstoneConductor(Blocks::always)`.

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
