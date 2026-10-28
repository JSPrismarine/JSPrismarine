# @jsprismarine/engine-systems

Shared world-system primitives that do not come from Bedrock data: tick scheduling, neighbor
update ordering, redstone signal calculations, random tick selection, explosions, and the weather
cycle. Resolved block families own block behavior, including fluid flow, fire, redstone state
changes, and piston movement.

The Java-derived rules in this package are based on the pinned 26.3 server jar in
`node_modules/.cache/jsprismarine/java-server/`. Source comments name the Java classes behind the
transcribed behavior.

## World access

The engine reads and writes blocks through a small `WorldAccess` interface. Block tick scheduling
lives in `TickScheduler`, and explosions use a separate `ExplosionWorld` interface.

```typescript
import { block, createEngine, createTestWorld } from '@jsprismarine/engine-systems';

const world = createTestWorld();
const engine = createEngine(world);
engine.setBlockAndUpdate({ x: 0, y: 0, z: 0 }, block('minecraft:stone'));
```

`setBlockAndUpdate` writes the block, runs the six neighbor updates in Java's
`CollectingNeighborUpdater` order, and reports resulting signal power to the content bridge. It
does not implement individual block behavior. The active block family's hooks handle placement,
neighbor changes, scheduled ticks, and state transitions.

## Tick scheduling

`TickScheduler` owns the block and fluid tick lists. A scheduled tick carries a trigger tick, a
priority, and insertion order. Ticks drain by trigger tick, then priority, then insertion order;
the per tick budget defaults to Java's 65536 for each list. The host drains the scheduler and
dispatches each tick to the active block family's `onTick` hook.

`TickList` uses one queue for the whole world. Java shards each list by chunk and merges those
shards while draining, so a backlog can produce a different order. This queue runs the oldest due
ticks first.

## Redstone signals

This package calculates weak and strong signal, conductor re-emission, and wire connections for
the Bedrock block identifiers the content families use. `WorldSystems` reports the resulting
power to `onRedstoneUpdate`; `@jsprismarine/block-behaviors` owns the redstone components' state
changes and scheduled behavior. The engine no longer owns their scheduled ticks or state
transitions; it keeps the signal output rules needed to calculate the shared network.

Resolved `minecraft:redstone_conductivity` values override the Java full-cube conductor default.
The vanilla overlay supplies the 28 exceptions extracted from Java's block registrations, and
data-driven packs can declare the same component for their blocks. Collision shapes are not
published, so the full-cube fallback remains an approximation for partial blocks.

## Random ticking

The driver draws `random_tick_speed` positions from each selected section using Java's
`Level.getBlockRandomPos` step, `state * 3 + 1013904223`. Positions are drawn with replacement;
a position whose block does not take random ticks still consumes its draw. Block behavior comes
from the active family's random tick hook.

## Explosions

`explode` traces Java's 1352 rays from the surface of a 16 by 16 by 16 grid. It returns affected
positions and entity hits; the host applies damage, knockback, drops, and entity callbacks.
Blast resistance is read from the mapping table. Exposure treats full cubes as the only
occluders because neither edition publishes collision shapes.

## Weather

`advanceWeatherCycle`, `resetWeatherCycle`, and `weatherCommandState` model Java's saved rain and
thunder counters. They are pure functions: the host stores the returned state, applies game-rule
and dimension checks, and sends any client updates.
