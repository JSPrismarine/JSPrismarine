---
'@jsprismarine/engine-systems': patch
---

Add `@jsprismarine/engine-systems`, the four engine systems neither edition publishes as data: the
tick scheduler, redstone, flowing fluids, and fire spread with the random tick driver. Every
constant and ordering rule is read out of the pinned Java 26.3 server jar, which carries original
names since Mojang removed obfuscation in 26.1, rather than from a wiki page.

All four read and write the world through one `WorldAccess` interface covering block state, block
entity data, tick scheduling and its two queries, item drops, sounds, difficulty, weather, rain,
dimension, game time, the world random and the height bounds. `createTestWorld` implements it over
a map of positions and `createTestEngine` returns a world and an engine wired to each other, so a
test builds a real circuit rather than a mock.

The scheduler is `LevelTicks`, `LevelChunkTicks` and `ScheduledTick`: Java's drain order, the seven
`TickPriority` values of -3 through 3, the rule that a second tick for the same position and type is
ignored, and the budget of 65536 ticks per list per game tick. `createNeighborUpdates` is
`CollectingNeighborUpdater`, which is what keeps an immediate neighbor update apart from a scheduled
tick.

Redstone implements Java Edition's rules, because redstone is server-decided and invisible to the
Bedrock client. Power runs 0 to 15 through `SignalGetter` and the per-block signal overrides, dust
uses `DefaultRedstoneWireEvaluator` rather than the experiment Mojang ships behind a feature flag,
repeaters take their delay state times 2 game ticks and lock from a diode on either side,
comparators run compare and subtract and read a container's fill, observers pulse 15 for two game
ticks on a shape change from the block they face, and pistons use `PistonStructureResolver`
unchanged, including the 12-block limit and the slime and honey rules. Quasi-connectivity is
implemented; Bedrock's produce and consume tick split, soft inversion, its dust refresh rule and its
observer-as-update-detector are not, and the README lists them.

Fluids run `FlowingFluid` over Bedrock's two blocks per fluid, encoding the level into Bedrock's own
`liquid_depth` by Java's `getLegacyLevel` rule. Water drops 1 level per block, searches 4 for a hole
and ticks every 5; lava drops 2, searches 2 and ticks every 30 outside the nether, and drops 1,
searches 4 and ticks every 10 inside it. Obsidian, cobblestone, stone and basalt all come out of
`LiquidBlock`.

Fire is `FireBlock` with the ignite and burn odds read from `@jsprismarine/mapping` rather than
restated, running on scheduled ticks 30 to 40 game ticks apart as Java does. The random tick driver
is `ServerLevel.tickChunk` with `Level.getBlockRandomPos` transcribed exactly, drawing Java's
absolute three positions per section where Bedrock's rule is documented as relative with no
published mapping.
