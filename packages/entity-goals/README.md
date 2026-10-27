# @jsprismarine/entity-goals

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
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
goal names the class. Examples: the 0.02 chance per tick and the 40 to 80 tick hold in
`look_at_player` are `LookAtPlayerGoal.DEFAULT_PROBABILITY` and its `start`; the 20-tick swing
cadence and 10-tick re-path interval in the melee goals are `MeleeAttackGoal`; the 2-to-4-block
window and 1-in-5 roll in `leap_at_target` are `LeapAtTargetGoal`; the 8-block partner search,
60-tick courtship and 3-block distance in `breed` are `BreedGoal`; the 300-tick revenge memory in
`hurt_by_target` is `HurtByTargetGoal`.

Where the two editions disagree the Bedrock parameter wins, because these are Bedrock definitions.
Two cases are worth naming. Java's `TemptGoal` scares the entity off when the player moves more than
0.1 blocks or turns more than 5 degrees; Bedrock spells that as the single `can_get_scared` flag,
which is parsed and handed to the server, because the goal seam carries no player rotation. Java
splits melee into one class; Bedrock has `melee_attack` and `melee_box_attack`, which differ in
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
}
```

Three media decide which cells a profile may enter, and a cell is enterable when any enabled medium
accepts it: ground when the entity stands on something, swim when the cell is a liquid it moves
through, and fly when the cell is open air. `minecraft:navigation.climb` adds vertical moves through
climbable blocks. A ground move keeps its height, steps up one block when the profile jumps, or
falls to the first supported cell within the fall limit. Diagonal moves cost `sqrt(2)` and may not
cut a corner.

`NavigationProfile` comes from the entity's active `minecraft:navigation.*` component, which
`@jsprismarine/entities` already parses, plus three facts that component does not carry: the height
from `minecraft:collision_box`, the step height from `minecraft:variable_max_auto_step` and a fall
limit of 3 blocks. The flags map onto the search like this.

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
navigator feeds the actuator one waypoint at a time. With no `NavigationView` it hands the
destination straight to `EntityActuator.moveTo` and tracks arrival by distance, which is the
degraded mode a server gets before it implements the view.

## The two seams a server satisfies

`EntityActuator`, from `@jsprismarine/entities`, is unchanged: `position`, `moveTo`, `stopMoving`,
`lookAt`, `jump`, `randomTarget` and `nearestPlayer`. The goals here use all seven. `randomTarget`
is only consulted when no `NavigationView` is supplied; with one, the navigator draws candidates and
keeps the first the path finder reaches.

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
- Relationships: `owner`, `vehicle`, `riders`, `mount`, `dismount`, `canBreedWith`, `breedWith`,
  `openTrade`, `tradingPlayer`.
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

## What is left to the server

Four things the goals parse and hand over rather than carry out, because the behavior belongs
somewhere else.

- The explosion itself. `minecraft:behavior.swell` holds the creeper still and the
  `minecraft:explode` component does the rest.
- Villager points of interest. Bedrock has no memory or point-of-interest registry at all, so the
  work site, the bed, the bell and the village come through `GoalWorld.poi` and the server decides
  what counts.
- Whether two entities may breed. `minecraft:breedable` owns that rule, so `breed` and `make_love`
  ask `GoalWorld.canBreedWith`.
- The ender dragon's flight path. Its eight phase goals are `{"priority": n}` in the vanilla file
  and nothing else, so each one holds its phase's control flags for a fixed time and leaves the
  flight to the server.
