# @jsprismarine/entity-brains

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/entity-brains)](https://www.npmjs.com/package/@jsprismarine/entity-brains)

Java Edition's brain AI: memories, sensors, activities, the behavior combinators, and the twenty
mobs that build a brain. This is the half of vanilla mob behavior that Bedrock's entity JSON has no
way to describe.

```typescript
import { BrainMobRegistry, registerBrainMobs } from '@jsprismarine/entity-brains';

const registry = new BrainMobRegistry();
registerBrainMobs(registry); // 20 mobs

const villager = registry.get('minecraft:villager');
const brain = villager.makeBrain({ variant: 'minecraft:farmer' });

// Once per mob tick, in this order, as Java's Mob.customServerAiStep does.
villager.updateActivity(context);
brain.tick(context);
```

## Why this package exists

Java runs two unrelated mob AI systems. The goal system is 68 classes and 5520 lines, and 30 of its
67 concrete goal names match a Bedrock `minecraft:behavior.*` name after snake-casing, so Bedrock's
data-driven JSON carries those mobs; `@jsprismarine/entity-goals` implements them. The brain system
is 116 classes and 8905 lines plus 24 sensors, 115 memory modules and 26 activities, and **Bedrock
publishes no memory, sensor or activity registry at all**. A Bedrock-shaped runtime cannot hold the
per-mob state a Java brain holds, because the format never names it.

Exactly twenty mob classes build a brain. The list is not a judgement call: scanning the constant
pool of every top-level class under `net/minecraft/world/entity/` for `brainProvider` or `makeBrain`
finds 21 classes, and the twenty-first is `LivingEntity`, which holds the base. Everything else in
the game, including every zombie, skeleton, farm animal, slime, guardian and the ender dragon, is
goals only.

Two of the twenty carry both systems. `Camel` and `HappyGhast` have a `registerGoals` and a
`brainProvider`, so a server must run both schedulers for them. `DUAL_SYSTEM_MOBS` reports that
list, and `BrainMobDefinition.alsoRunsGoals` reports it per mob.

[docs/research/java-code-only-behavior.md](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/research/java-code-only-behavior.md) section 4
is the source for the two-system split and for the twenty-mob list.

## The source

Everything here is read out of the pinned Java Edition 26.3 server jar, which since release 26.1
ships with original class, field and method names and no obfuscation map. The jar is the one
`@jsprismarine/bedrock-data` caches under `node_modules/.cache/jsprismarine/java-server/26.3`. The
villager schedule is the one exception, because Mojang moved it into a datapack: it comes from
`data/minecraft/timeline/villager_schedule.json` in the 26.3 vanilla datapack.

### Measured counts, against the research note

| Registry | Note | Measured | Where |
| --- | --- | --- | --- |
| `minecraft:memory_module_type` | 115 | 115 | `MemoryModuleType.<clinit>` |
| `minecraft:sensor_type` | 24 | 24 | `SensorType.<clinit>` |
| `minecraft:activity` | 26 | 26 | `Activity.<clinit>` |
| Mobs with a brain | 20 | 20 | `brainProvider` and `makeBrain` references |

All three match. Six of the 115 memory modules register under a name that differs from their Java
field name, which is worth knowing when reading a saved brain: `NEAREST_LIVING_ENTITIES` registers
as `mobs`, `NEAREST_VISIBLE_LIVING_ENTITIES` as `visible_mobs`,
`NEAREST_VISIBLE_ATTACKABLE_PLAYER(S)` as `nearest_visible_targetable_player(s)`,
`LONG_JUMP_COOLDOWN_TICKS` as `long_jump_cooling_down`, `BREEZE_SHOOT_RECOVERING` as
`breeze_shoot_recover`, and `LIKED_NOTEBLOCK_POSITION` as `liked_noteblock`.

## The brain model

A brain is a memory map, a sensor list, and a table of behaviors keyed by priority and activity.
One tick runs four steps in Java's order: age the memories, run the sensors, start every stopped
behavior whose activity is active, then tick every running one. Starting before ticking is
observable, because a behavior started this tick also ticks this tick.

### Memories

A memory is a typed slot holding an optional value with an optional expiry in ticks. Three rules
decide most of what a brain does.

A memory set with a time to live of `n` is readable on `n` ticks and is cleared on the `n` plus
first, because `MemorySlot.tick` checks expiry before decrementing.

An empty array is stored as no value. `Brain.setMemory` nulls out an empty collection, which is why
`value_present` on a list memory means "the sensor found something" rather than "the sensor ran".

An unregistered memory fails every precondition, including `registered`. A brain only registers the
memories its declared list, its sensors and its behaviors name, so a behavior whose memories the mob
never declared is silently inert. That is the mechanism behind several vanilla quirks, including why
`WardenAi.setDigCooldown` checks that the memory already has a value before writing it.

### Memory preconditions

`MemoryStatus` has three members. `value_present` and `value_absent` are the obvious ones.
`registered` means the slot must exist but may be empty, and a behavior asks for it when it intends
to write the memory, which is how the brain learns to allocate the slot.

### Activities

A brain is in exactly one non-core activity at a time plus every core activity, and `core` is the
only core activity any vanilla mob declares. The brain itself never chooses an activity: it only
answers whether one is possible. The choice lives in each mob's `updateActivity`, which calls
`setActiveActivityToFirstValid` with an ordered list, and that list is the mob's priority order
between activities.

Leaving an activity erases the memories it declared as `memoriesToEraseWhenStopped`, which is the
`ActivityData.create(activity, priority, list, memory)` shorthand Java uses for `ATTACK_TARGET`,
`AVOID_TARGET`, `ADMIRING_ITEM` and friends.

### Behaviors

`BehaviorControl` has four members: `tryStart`, `tickOrStop`, `doStop` and a status that is
`stopped` or `running`. `Behavior` adds memory preconditions and a duration drawn from
`[minDuration, maxDuration]`, and its `canStillUse` returns false by default, so a behavior that
does not override it runs for exactly one tick.

`OneShot` is a behavior whose whole body is one function that reports whether it did anything.
Nearly all of Java's behavior library is built this way, through `BehaviorBuilder`.

### The declarative form

Java writes `BehaviorBuilder` as an applicative functor over `MemoryCondition`, because DataFixerUpper
gave it one for free. The content is simpler than the encoding, and this package writes it as a
fluent chain that accumulates the accessor types.

```typescript
const setLookTarget = behavior('SetEntityLookTarget')
    .absent(MemoryModuleTypes.LOOK_TARGET)
    .present(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
    .build((context, lookTarget, nearest) => {
        const target = nearest.get().findClosest(predicate);
        if (target === undefined) return false;
        lookTarget.set(entityTracker(target));
        return true;
    });
```

### The combinators

`GateBehavior` runs a weighted list of children under one set of memory conditions. Its order policy
is `ordered` or `shuffled` and its running policy is `run_one` or `try_all`, and it stops once no
child is running. `RunOne` is the shuffled `run_one` case and is the most used combinator in the
game. `TriggerGate` is the same over plain triggers rather than full behaviors, so nothing stays
running across ticks.

The shuffle is the exponential ranking trick Java uses. Each entry takes the key
`-random ** (1 / weight)` and the list sorts ascending, which makes the chance an entry sorts first
proportional to its weight.

## The twenty mobs and their activity tables

Priorities are Java's. A number in parentheses after an activity is the priority its first behavior
takes; `ActivityData.createPriorityPairs` numbers the rest upward from there.

| Mob | Activities | Gated by | Sensors |
| --- | --- | --- | --- |
| allay | `core` (0), `idle` (0) | | 4 |
| armadillo | `core` (0), `idle` (0 to 4), `panic` (0) | `panic`: `DANGER_DETECTED_RECENTLY` present and `IS_PANICKING` absent | 5 |
| axolotl | `core` (0), `idle` (0 to 4), `fight` (0), `play_dead` (0) | `fight`: `ATTACK_TARGET`; `play_dead`: `PLAY_DEAD_TICKS` | 5 |
| breeze | `core` (0), `idle` (0 to 3), `fight` (0 to 4) | `fight`: `ATTACK_TARGET` present, `WALK_TARGET` absent | 4 |
| camel | `core` (0), `idle` (0 to 4) | | 4 |
| copper golem | `core` (0), `idle` (0 to 2) | | 2 |
| creaking | `core` (0), `idle` (10), `fight` (10) | `fight`: `ATTACK_TARGET` | 2 |
| frog | `core` (0), `idle` (0 to 4), `swim` (0 to 5), `lay_spawn` (0 to 4), `tongue` (0), `long_jump` (0 to 1) | three activities split on `IS_IN_WATER`, `IS_PREGNANT` and `LONG_JUMP_MID_JUMP` | 5 |
| goat | `core` (0), `idle` (0 to 3), `long_jump` (0 to 1), `ram` (0 to 1) | `idle` needs both cooldowns *present* | 6 |
| happy ghast | `core` (0), `idle` (1 to 4), `panic` (no behaviors) | `panic`: `IS_PANICKING` | 5 |
| hoglin | `core` (0), `idle` (10), `fight` (10), `avoid` (10) | `fight`: `ATTACK_TARGET`; `avoid`: `AVOID_TARGET` | 4 |
| nautilus | `core` (0), `idle` (1 to 4), `fight` (0) | `fight`: four memory conditions | 5 |
| piglin | `core` (0), `idle` (10), `admire_item` (10), `fight` (10), `celebrate` (10), `avoid` (10), `ride` (10) | one memory each | 5 |
| piglin brute | `core` (0), `idle` (10), `fight` (10) | `fight`: `ATTACK_TARGET` | 5 |
| sniffer | `core` (0), `idle` (0 to 4), `sniff` (0), `dig` (0) | `sniff` and `dig`: three memories each | 4 |
| tadpole | `core` (0), `idle` (0 to 2) | | 4 |
| villager | `core` (0 to 10), `work`, `play`, `rest`, `meet`, `idle`, `panic`, `pre_raid`, `raid`, `hide` | `work`: `JOB_SITE`; `meet`: `MEETING_POINT` | 9 |
| warden | `core` (0), `emerge` (5), `dig` (0 to 1), `idle` (10), `roar` (10), `fight` (10), `investigate` (5), `sniff` (5) | one memory each | 2 |
| zoglin | `core` (0), `idle` (10), `fight` (10) | `fight`: `ATTACK_TARGET` | 2 |
| zombie nautilus | `core` (0), `idle` (1 to 3), `fight` (0) | `fight`: four memory conditions | 5 |

A few of these are worth calling out.

**The goat is inverted.** Its `idle` activity requires `RAM_COOLDOWN_TICKS` and
`LONG_JUMP_COOLDOWN_TICKS` to be *present*, so a goat is idle precisely while it is still waiting out
its timers. `GoatAi.initMemories` fills both on spawn.

**The happy ghast's panic activity has no behaviors at all.** It exists so that `IS_PANICKING`
suppresses every idle behavior while the core activity's `AnimalPanic` flies the ghast away.

**The frog splits one wander three ways.** `idle`, `swim` and `lay_spawn` do nearly the same thing
and are told apart by `IS_IN_WATER`, `IS_PREGNANT` and `LONG_JUMP_MID_JUMP`. None of those three has
a Bedrock equivalent.

**The warden never gives up on an unreachable target.** Its `StopAttackingIfTargetInvalid` is built
with `canGrowTiredOfTryingToReachTarget` false, where every other mob drops a target it has not
reached in 200 ticks.

**The creaking's activity choice is overridden outside the table.** `CreakingAi.updateActivity`
falls back to the default activity whenever the creaking cannot move, which is how a watched
creaking freezes mid-chase.

**The zoglin has no `<Mob>Ai` class.** Its three activities are static methods on `Zoglin` itself,
which is why a scan for `*Ai.class` finds nineteen files for twenty mobs.

### The villager schedule

The villager is the only brain mob with a schedule, and in 26.1 Mojang moved it out of code into the
`minecraft:timeline` datapack type. `VILLAGER_SCHEDULE` and `BABY_VILLAGER_SCHEDULE` are the two
tracks of `data/minecraft/timeline/villager_schedule.json`.

| Tick | Adult | Baby |
| --- | --- | --- |
| 10 | `idle` | `idle` |
| 2000 | `work` | |
| 3000 | | `play` |
| 6000 | | `idle` |
| 9000 | `meet` | |
| 10000 | | `play` |
| 11000 | `idle` | |
| 12000 | `rest` | `rest` |

`Brain.updateActivityFromSchedule` reads the schedule at most once every twenty ticks, which is
`Brain.SCHEDULE_UPDATE_DELAY`. The throttle is observable: a villager crossing a keyframe can take up
to a second to notice.

### The warden's anger

`AngerManagement` is per-suspect anger that decays by one a tick, clamped at 150, with three bands at
0, 40 and 80. A plain disturbance adds 35, so it takes three to make a warden angry. A projectile
adds 10. Being hit adds `ANGRY`'s minimum plus 20.

The sort is the part worth reading. A suspect the warden is already angry at outranks one it is not,
a player outranks a non-player in the same band, and only then does the raw anger decide. That is
why a warden chases the player who poked it rather than the skeleton that shot it, even when the
skeleton has more anger.

Anger is not a memory and does not live in the brain. A host owns the `AngerManagement` and passes
it to `makeWardenBrain`, because the anger outlives any one brain.

### The piglin's gold economy

`wantsToPickUp` is the rule, and reading it in order is the clearest statement of the economy.
Repellents are never picked up. A baby skips the items in `#minecraft:ignored_by_piglin_babies`. A
gold ingot is taken only when the off hand is free. Food is taken only when the piglin has not eaten
recently. Anything else goes by whether it beats what the piglin already holds.

Being handed a gold ingot holds `ADMIRING_ITEM` for 119 ticks, which is `ADMIRE_DURATION`, and that
memory is what puts the piglin into the `admire_item` activity. `onBarter` is the hook
`makePiglinBrain` takes so the host can roll its data-defined barter table after admiration ends.

Four memories decide what admiring does, and none of them has a Bedrock equivalent:
`ADMIRING_ITEM`, `TIME_TRYING_TO_REACH_ADMIRE_ITEM`, `DISABLE_WALK_TO_ADMIRE_ITEM` and
`ADMIRING_DISABLED`. The third is the interesting one. A piglin that spends 200 ticks failing to
reach an item gives up and refuses to path to one for another 200, but still wants an item that lands
in front of it.

## The BrainWorld seam

Java's behaviors reach straight into `ServerLevel`, `Mob`, `PathNavigation` and `PoiManager`. This
package keeps none of those. Everything a behavior or a sensor needs from outside the brain arrives
through three interfaces in `src/world.ts`.

`BrainWorld` is the level: the clock, the random source, the entities and items nearby, the targeting
tests, blocks and block tags, a block search, points of interest with claim and release, a random
reachable position, sounds and game events.

`BrainMob` is the body: its brain, its navigation, a condition writer, look, jump, attack, a sound,
and an attribute lookup.

`BrainNavigation` is path following: `moveTo`, `isDone`, `isStuck`, `canReach` and `stop`. This is
deliberately this package's own interface and not an import. `@jsprismarine/entity-goals` owns the
170 Bedrock goals and an A\* path finder over its own `NavigationView`, and a server satisfies both
interfaces with one adapter over that finder. Depending on `entity-goals` here would make the brain
system wait on the goal system, and the two are independent.

Two members do more work than their size suggests. `BrainWorld.randomPos` stands in for Java's whole
`ai/util` tree, nine classes (`LandRandomPos`, `AirRandomPos`, `AirAndWaterRandomPos`,
`DefaultRandomPos`, `HoverRandomPos` and their helpers) whose only job is to draw a reachable
position subject to a medium and a direction. `BrainEntity.conditions` is a string set that answers
every boolean fact Java reads off a concrete mob class, such as `Armadillo::isScared` or
`Camel::refuseToMove`; `EntityCondition` names the ones this package reads. That mirrors how
`@jsprismarine/entities` keeps its filter view small, and it means a host that cannot answer a fact
simply leaves it out.

### The test double

`src/testWorld.ts` carries `TestWorld`, `TestMob`, `TestEntity`, `TestItemEntity` and
`TestNavigation`. It is a real implementation, not a mock: entities, blocks, points of interest and
the clock are plain data a test writes, and every member answers from that data. Tests script the
random source rather than seeding it, so a draw is a fact of the test.

```typescript
const world = new TestWorld({ dayTime: 2000 });
world.addPoi({ x: 2, y: 64, z: 0 }, 'minecraft:farmer');

const body = world.spawn('minecraft:villager', { x: 0, y: 64, z: 0 });
body.attach(VILLAGER_BRAIN.makeBrain({ variant: 'minecraft:farmer' }));

VILLAGER_BRAIN.updateActivity(body.context);
body.tickBrain();
```

`TestNavigation` records every `moveTo` and lets a test mark a position unreachable, which is how the
`CANT_REACH_WALK_TARGET_SINCE` path is exercised without a path finder.

## What is covered and what is partial

The brain core, the activity stack, the memory model, the combinators and all 24 sensors are
complete. All twenty mobs have their real activity table, their real priorities, their real memory
conditions and their real constants, and the brain runs them.

The behavior library is 37 shared behaviors in `src/behavior/common.ts` plus the mob-specific ones
beside each mob. A behavior whose effect is expressible through the seam is implemented in full. The
rest keep their real name, their real memory conditions and their real constants, and they do the
memory bookkeeping Java does, while leaving the world effect to the host. Those are the behaviors
that need facts the seam deliberately does not carry.

- **Inventories and items.** The allay's delivery needs its inventory, and the copper golem's
  transfer needs two containers. Piglin bartering uses `makePiglinBrain`'s `onBarter` hook so the
  host can roll the active `minecraft:barter` table; the allay and copper golem write their memories
  and leave the item move to the host.
- **Block placement.** The frog's `TryLaySpawnOnFluidNearLand` and the sniffer's dig emit a game
  event and clear their memory; the host places the block.
- **Damage and projectiles.** The warden's sonic boom and the breeze's wind charge walk their memory
  state machines and play their sounds. The 10 damage, the 15 by 20 reach and the two knockback
  factors are constants on `WARDEN.sonicBoom` for a host to apply.
- **Villager professions and trading.** `VillagerProfession` carries only what the brain reads: the
  profession id, its job-site point of interest and its secondary blocks. `WorkAtComposter`,
  `HarvestFarmland`, `UseBonemeal`, `ShowTradesToPlayer`, `TradeWithVillager`, `GiveGiftToHero` and
  `VillagerMakeLove` are present by name with their real priorities and weights, and their effects
  belong to `@jsprismarine/trading` and the farming code.
- **Raids.** `SetRaidStatus`, `ResetRaidStatus`, `RingBell` and `CelebrateVillagersSurvivedRaid` are
  in the `pre_raid` and `raid` packages by name. The raid state machine itself is 1675 lines of Java
  in `world/entity/raid` and is a separate piece of work.
- **Poses and animations.** A behavior that sets a pose in Java writes an `EntityCondition` here
  instead, so a host can drive its own animation state.

Two deliberate simplifications are worth naming. `AnimalMakeLove` writes only the body's own
`BREED_TARGET`, because a partner is a `BrainEntity` view rather than a second brain; a host that
wants Java's symmetric pairing writes the partner's memory itself. `GoToWantedItem` always declares
`WALK_TARGET` as `registered` and refuses in its body when a walk is already running, where Java
picks `registered` or `absent` from its `interruptOngoingWalk` argument; the behavior is the same and
it keeps one builder chain instead of two with different accessor shapes.

## Tests

151 tests, no gated corpus. They cover the memory expiry rule and the precondition map, the activity
stack and the schedule throttle, each combinator, each of the 24 sensors against the world double,
and one representative situation for each of the twenty mobs: an idle villager going to work at tick
2000 and staying idle without a job site, a piglin holding `ADMIRING_ITEM` for 119 ticks when given
gold, a warden escalating through 0, 40 and 80, a frog targeting a slime and switching to `tongue`,
and the camel and the happy ghast ticking their brain beside a goal scheduler double.

Where a constant matters, the test title or a comment names it and says where it came from.

```sh
pnpm --filter @jsprismarine/entity-brains exec vitest run
```
