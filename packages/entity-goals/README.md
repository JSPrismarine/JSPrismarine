# @jsprismarine/entity-goals

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/entity-goals)](https://www.npmjs.com/package/@jsprismarine/entity-goals)

All 170 vanilla Bedrock `minecraft:behavior.*` goals, plus the A\* path finder they navigate with.
It is written against the goal seam of `@jsprismarine/entities`, which owns the `Goal` interface, the
`priority` and `control_flags` parsing and the scheduler; this package owns what each goal does.

```typescript
import { EntityTypes } from '@jsprismarine/entities';
import { createGoalEntityRegistry } from '@jsprismarine/entity-goals';

const types = new EntityTypes({ components: createGoalEntityRegistry({ world: (entity) => worlds.get(entity) }) });
const zombie = types.spawn('minecraft:zombie', { environment: { actuator } });

zombie.tick(); // the scheduler runs one goal per control flag
```

`createGoalEntityRegistry` registers these goals first and then every non-goal component the entity
runtime implements. The order matters: `registerEntityComponents` skips a name that is already
registered, and it ships its own reference versions of `float`, `random_stroll` and
`look_at_player`. Calling `registerVanillaGoals(registry)` on a registry that already holds those
three leaves them alone and returns their names.

## The goal inventory

`utils/build-inventory.ts` reads the composed vanilla behavior pack and writes
`src/generated/goalInventory.json`: every goal name, how many of the 129 entity files use it, the
union of parameter keys observed under it with their JSON types, and which entities carry it.
Everything here is written against that file, and `src/totality.test.ts` fails when a name in it has
no registered factory.

Regenerate it with `pnpm --filter @jsprismarine/entity-goals run inventory`, which needs the sources
`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches.

Measured against Bedrock Dedicated Server 1.26.51.1:

| Measure | Result |
| --- | --- |
| Entity definitions | 129 |
| Distinct `minecraft:behavior.*` names | 170 |
| Names with a registered factory | 170 |
| Entities whose every goal is implemented | 129 of 129 |
| Entities that declare at least one goal | 92 |
| Entities with no goals at all | 37 |
| Most goals on one entity | 27 (`minecraft:villager_v2`) |
| Goals exactly one entity uses | 91 |
| Goals at most two entities use | 123 |

The twenty most used goals, with how many entity files declare each: `look_at_player` 69,
`random_stroll` 64, `random_look_around` 55, `float` 49, `nearest_attackable_target` 49,
`hurt_by_target` 42, `panic` 37, `melee_box_attack` 32, `tempt` 31, `avoid_mob_type` 28, `breed` 26,
`mount_pathing` 26, `follow_parent` 24, `pickup_items` 20, `equip_item` 17, `ranged_attack` 14,
`random_swim` 12, `player_ride_tamed` 10, `find_mount` 8, `flee_sun` 7.

## Where the values come from

Thirty of Java's goal class names match a Bedrock goal name after snake-casing, so for those the
constants are read out of the unobfuscated 26.3 server jar rather than guessed, and the JSDoc on the
goal names the class. Examples: the 0.02 chance per tick and the 40 to 79 tick hold in
`look_at_player` are `LookAtPlayerGoal.DEFAULT_PROBABILITY` and its `start`; the 20-tick swing
cadence and 10-tick re-path interval in the melee goals are `MeleeAttackGoal`; the 2-to-4-block
window and 1-in-5 roll in `leap_at_target` are `LeapAtTargetGoal`; the 8-block partner search,
60-tick courtship and 3-block distance in `breed` are `BreedGoal`; the 300-tick revenge memory in
`hurt_by_target` is `HurtByTargetGoal`.

A goal's parameters come from its body, but a server that wants Java's numbers can rewrite the
body first. `javaGoalBody` in `src/javaArguments.ts` takes one Bedrock body and the goals the mob's
Java class registers. It writes the arguments of the Java goal it stands for into the keys that mean
the same thing: `LookAtPlayerGoal`'s `lookDistance` becomes `look_distance`, a `TemptGoal`'s item
predicate becomes `items`, a `NearestAttackableTargetGoal`'s class becomes a bound on
`entity_types`. Keys Java has no counterpart for, such as sounds and events, stay as written.
`JAVA_TRANSLATED_GOALS` lists the goals it rewrites.

```typescript
import { java_entity_goals } from '@jsprismarine/bedrock-data';
import { javaGoalBody } from '@jsprismarine/entity-goals/javaArguments';

const body = javaGoalBody('minecraft:behavior.look_at_player', zombieBody, java_entity_goals['minecraft:zombie'], context);
```

The goals arrive as data, `@jsprismarine/bedrock-data`'s `java_entity_goals`, which this package
does not depend on. The caller's `JavaGoalContext` answers what the capture leaves to the server:
the mob's Java attributes, a filter for a set of Java entity types, and the Bedrock items of a Java
item tag. JSPrismarine's server applies it to every entity file it loads, because the Bedrock
client runs no mob AI and [ADR 0024](../../docs/adr/0024-java-decides-server-decided-goal-parameters.md)
gives those numbers to Java. A server that leaves it out runs the pack's numbers.

Two cases are worth naming. Java's `TemptGoal` scares the entity off when the player moves more than
0.1 blocks or turns more than 5 degrees; Bedrock spells that as the single `can_get_scared` flag,
which is parsed and handed to the server, because the goal seam carries no player rotation. Java
has one melee class; Bedrock has `melee_attack` and `melee_box_attack`, which differ in
whether the reach test uses the distance or the collision boxes, and with no collision boxes in the
seam both run the same loop with `reach_multiplier` as the only difference.

## The navigation model

`findPath` is A\* over whole blocks against an injected `NavigationView`. A server implements the
view; the first four members are required and the rest are optional, so a goal degrades rather than
throwing when the server cannot answer one yet.

```typescript
export interface NavigationView {
    blockAt(position: EntityPosition): string | undefined;
    isPassable(position: EntityPosition): boolean;
    isSolid(position: EntityPosition): boolean;
    isWater(position: EntityPosition): boolean;
    isLava(position: EntityPosition): boolean;
    doorAt?(position: EntityPosition): DoorState | undefined;
    isDamaging?(position: EntityPosition): boolean;
    isSunlit?(position: EntityPosition): boolean;
    isPortal?(position: EntityPosition): boolean;
    isClimbable?(position: EntityPosition): boolean;
    isLadder?(position: EntityPosition): boolean;
    collisionTop?(position: EntityPosition): number;
}
```

Three media decide which cells a profile may enter, and a cell is enterable when any enabled medium
accepts it: ground when the entity stands on something, swim when the cell is a liquid it moves
through, and fly when the cell is open air. `minecraft:navigation.climb` adds vertical moves through
climbable blocks, while `minecraft:can_climb` enables vertical moves through ladder blocks for any
navigation type. A ground move keeps its height, steps up one block when the profile jumps, or falls
to the first supported cell within the fall limit. Diagonal moves cost `sqrt(2)` and may not cut a
corner. A block whose collision reaches above its cell, as a fence's or a wall's does by
`collisionTop`, takes no body, and neither does the cell over it, so no path steps onto a fence.

`NavigationProfile` comes from the entity's active `minecraft:navigation.*` component, which
`@jsprismarine/entities` already parses, plus three facts that component does not carry: the height
from `minecraft:collision_box`, the step height from `minecraft:variable_max_auto_step`, and a fall
limit of 3 blocks. The separate `minecraft:can_climb` marker adds ladder traversal. The flags map
onto the search like this.

- `can_pass_doors`, `can_open_doors`, `can_open_iron_doors`, `can_break_doors`. An open door needs
  `can_pass_doors`. A closed one needs `can_open_doors`, and an iron one needs
  `can_open_iron_doors` as well, or `can_break_doors`.
- `avoid_water`. A water cell costs 8 extra when the profile can float, swim or is amphibious, and
  is refused otherwise.
- `can_path_over_water`, `can_path_over_lava`, `can_walk_in_lava`. These decide whether a liquid
  below the entity carries it, and whether a lava cell may be entered at all.
- `avoid_damage_blocks`, `avoid_portals`, `blocks_to_avoid`. These refuse a cell outright.
- `avoid_sun`. A sunlit cell costs 8 extra rather than being refused, so an entity still paths when
  there is no shade. `flee_sun` is the goal that refuses sunlight outright.
- `can_fly`, `can_swim`, `can_walk`, `is_amphibious`, `can_float`. These enable the three media.

The search expands at most 512 nodes unless the caller raises the budget, and returns the closest
node it reached only when the request asks for a partial path.

`Navigator` is the one place that calls the path finder. A goal says where it wants to be and the
navigator feeds the actuator one waypoint at a time. It works the way Java's `PathNavigation` does:

- All of an entity's goals share one navigator, from `navigatorOf`, so a goal that starts a walk
  takes over the walk under way.
- `moveTo` follows the closest route when no route reaches the destination, and returns false only
  when no step gets the entity any closer. `plan` asks the same question without walking, and
  `canReach` asks for a route that reaches the destination.
- A host calls `sweepNavigation` once per entity per game tick, after the goals, so a walk advances
  every tick even while its goal waits for the next selector tick.
- The entity reaches a node once it is near the node's center across the ground, by Java's
  `followThePath` rule, and within a block of its height.
- A walk that moves the entity less than its speed allows over 100 ticks stops, and `stuck`
  reports it.
- Every 20 ticks the navigator checks the next nodes and plans again when a block closed them.

With no `NavigationView` the navigator hands the destination straight to `EntityActuator.moveTo` and
tracks arrival by distance, which is the degraded mode a server gets before it implements the view.

## The two seams a server satisfies

`EntityActuator`, from `@jsprismarine/entities`, is `position`, `moveTo`, `stopMoving`, `lookAt`,
`jump`, `randomTarget` and `nearestPlayer`, which the goals here use, and the optional `width` and
`movementSpeed`, which the navigator reads to decide when a node is reached and when a walk is
stuck. `randomTarget` is only consulted when no `NavigationView` is supplied. With one, the
navigator draws candidates itself and keeps the first the path finder gets the entity closer to. A
walker draws as Java's `LandRandomPos` does: `landPositionAt` refuses a draw with no ground under it
and lifts one inside the ground onto it, and `hasPathMalus` refuses one in a liquid the walker
avoids.

`GoalWorld` is this package's own seam, because the vanilla goals attack, search for blocks, pick up
items, mount, trade, breed and teleport, and nothing in `EntityActuator` reaches any of that. Every
member is optional, following the convention `FilterEntityView` sets: a goal whose world cannot
answer what it needs refuses to start. A server supplies one per entity through
`registerVanillaGoals(registry, { world })`.

The members, grouped by what needs them:

- Sight and surroundings: `navigation`, `mobs`, `players`, `items`, `blocks`, `canSee`, `poi`,
  `home`, `setHome`.
- Combat: `target`, `setTarget`, `damagers`, `lastPusher`, `attack`, `shoot`, `knockback`, `push`,
  `explode`.
- Items: `pickUp`, `dropItem`, `giveItem`, `carriedItem`, `setCarriedItem`, `inventory`,
  `dropLoot`.
- Blocks and the world: `setBlock`, `breakBlock`, `spawn`, `teleportTo`, `playSound`.
- Relationships: `owner`, `vehicle`, `riders`, `mount`, `dismount`, `canBreedWith`,
  `isReadyToBreed`, `breedWith`, `openTrade`, `tradingPlayer`.
- Flags and reporting: `setSitting`, `setSleeping`, `trigger`, `report`.

`mobs(radius, families)` may use the optional family list to narrow a candidate search. It must
include every entity in those families; the goal still evaluates the complete data-driven filter
before choosing a target.

Everything a filter can already answer is read through `EntityInstance.filterContext` rather than
added here, so the entity's own flags (`in_water`, `is_baby`, `is_sitting`, `on_ground` and the
rest), the time of day and the weather need no new member.

`GoalWorld.trigger` exists because a goal event with a target other than `self` has to be routed by
the server. An event aimed at `self` goes through `EntityInstance.fire`, so its effects land on the
entity's next tick like every other event.

## Families

| File | Goals | What they share |
| --- | --- | --- |
| `goals/targeting.ts` | 9 | Find, hold and release the attack target; no control flags |
| `goals/attacking.ts` | 30 | Read the target and hurt it; `move` and `look` |
| `goals/looking.ts` | 6 | Turn the head; `look` only |
| `goals/movement.ts` | 44 | Wander, swim, fly, flee, follow and walk to a found position |
| `goals/social.ts` | 26 | Breeding, tempting, owners, mounting, trading and gifts |
| `goals/work.ts` | 14 | Jobs, farming, item pickup and placing blocks |
| `goals/environment.ts` | 17 | Sleeping, hiding, sitting and eating a block |
| `goals/specials.ts` | 24 | The dragon phases and 200-tick death animation, the squid states, the slime and the timer flags |

## Testing

`src/harness.ts` ships the doubles the package's own tests use, and a server can check its seam
implementations against the same ones. `RecordingActuator` logs every call and moves the entity to
whatever it was asked to walk to, `voxelGrid` builds a `NavigationView` from layers of text, and
`GoalHarness` puts a real `EntityInstance` with a real scheduler behind both.

```typescript
const harness = new GoalHarness({
    goals: { 'minecraft:behavior.float': { priority: 0, chance_per_tick_to_float: 1 } },
    flags: { in_water: true }
});

harness.tick(3);
harness.holderOf('jump'); // 'minecraft:behavior.float'
```

`src/scheduler.test.ts` runs the zombie's nine base goals, with the priorities the vanilla file
writes, and shows which goal holds each flag as a player comes into range.

### The ender dragon against Java

The dragon's phase goals run a copy of Java's phase manager, which flies the dragon by
Java's `EnderDragon.aiStep`. `vectors/26.3/` holds what Java's own code computes for it, and
`src/goals/dragonPhases.vectors.test.ts` compares the copy with it:

- `dragon-nodes.json`: the path nodes over a fixed heightmap, the closest node to a grid of
  points, and the path between every pair of nodes, with crystals standing and with none.
- `dragon-fights.json`: seeded fights with the phase, position, yaw and wall contact on every
  tick, each target the dragon flew toward, each fireball and breath cloud, each block it broke,
  each push and blow its wings and head dealt, each blow it took and the velocity a blow knocked
  it back to, each line of sight it checked, and every draw from the dragon's random source. The
  test hands the copy Java's draws, and the velocity a knockback left, which the server works
  out, and fails on the first tick where anything differs.
- `dragon-walls.json`: Java's `checkWalls` on its own over boxes of water, lava, waterlogged
  blocks, kelp and other blocks, with `mobGriefing` on and off: the blocks `removeBlock` was
  called on and what it answered, the blocks it left, whether the box was a wall, and the draws.
  The test answers each `removeBlock` as Java's level did, since what a removed block leaves is
  the world's fluid rule.

`utils/oracle/DumpDragonVectors.java` records them. It runs Java's `EnderDragon` on a
`ServerLevel` it allocates without a server, with the vanilla data pack's tags and damage types:
open air over the heightmap, players and zombies that keep their clocks but never move, and in
two fights pillars of stone, obsidian, end stone, fire, light and other blocks across the
dragon's path, one with `mobGriefing` off. One fight lands explosions, a player's blows and
arrows on the dragon's head and body, in flight and while it sits until it takes off, and one is
centered away from the world's origin. The fights hold no fluids: an entity's tick asks a loaded
chunk whether it stands in one, and the oracle's level has none, so the walls file records
`checkWalls` alone, which reads only blocks, fluids, tags and the game rule.
Regenerate them after a Java bump with
`pnpm --filter @jsprismarine/entity-goals run vectors`, which fetches the pinned server jar if the
cache lacks it and needs a JDK the jar can run on.

## What is left to the server

Three things the goals parse and hand over rather than carry out, because the behavior belongs
somewhere else.

- The explosion itself. `minecraft:behavior.swell` holds the creeper still and the
  `minecraft:explode` component does the rest.
- Villager points of interest. Bedrock has no memory or point-of-interest registry at all, so the
  work site, the bed, the bell and the village come through `GoalWorld.poi` and the server decides
  what counts.
- Whether two entities may breed. `minecraft:breedable` owns that rule, so `breed` and `make_love`
  ask `GoalWorld.canBreedWith`.
