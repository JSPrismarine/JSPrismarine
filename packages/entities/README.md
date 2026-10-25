# @jsprismarine/entities

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/entities)](https://www.npmjs.com/package/@jsprismarine/entities)

The Bedrock entity runtime: definition parsing, the component and component-group state machine, the
event engine, entity properties, the filter evaluator and the goal scheduler. It builds on
`@jsprismarine/content` for registries, component binding and hook dispatch, on
`@jsprismarine/packs` for the filter grammar, and on a caller-supplied Molang evaluator for the
expressions component bodies carry.

```typescript
import { EntityTypes } from '@jsprismarine/entities';

const types = new EntityTypes();
const diagnostics = types.load(files); // { data, pack, path } per entity file

const zombie = types.spawn('minecraft:zombie');
zombie.fire('minecraft:start_transforming_into_drowned');
zombie.tick(); // the event lands here, not when it was fired
```

## The definition model

An entity file is `{"format_version": "<semver>", "minecraft:entity": {...}}`, and the entity body
has `description`, `components`, `component_groups`, `events` and `upgrades`. Mojang's own
`ActorDocument.json` types those five keys and leaves every body dynamic, so `parseEntityDefinition`
validates structure and reports an unknown key rather than refusing the file. A pack written against
a newer game still loads, and the report names what the runtime did not read.

`description` yields `identifier`, `isSpawnable`, `isSummonable`, `isExperimental`, `spawnCategory`,
`runtimeIdentifier`, `properties`, `animations`, `scripts` and `entityVersion`.

`format_version` gates four things, and a file that uses one below its version loads and is reported
as `entity.versionGate`: root-level event `filters` need 1.19.20, `queue_command` needs 1.20.60,
`emit_particle` and `play_sound` need 1.21.50, and `entity_version` with `upgrades` needs 1.26.20.

`components` is the always-active set. `component_groups` is a map of group name to component map,
inactive until an event adds it. Both resolve once at load: the base components through
`resolveTypes`, the groups through the same `ComponentRegistry`, and the result is an `EntityType`
that answers questions without parsing anything.

## The event engine

An event runs in two steps, which is the rule the documentation states. The effects are determined
immediately and applied when the entity next ticks, so a filter in a later `sequence` entry cannot
see what an earlier one changed. `determineEvent` is the first step and returns `EventEffects`;
`EntityInstance.fire` queues them and `EntityInstance.tick` applies them.

Within one node the engine runs `add`, `remove`, `set_property`, the raw actions and `trigger`, then
walks `sequence` in order, then draws one branch of `randomize`, then takes the first passing branch
of `first_valid`. A node's own `filters` gate the whole node. Nodes nest without limit.

- `randomize` weights are relative, not percentages. The zombie's spawn event writes 9500, 425 and
  75; other entities write 1 and 1. The draw goes through a `RandomSource` a caller injects, so a
  test scripts it.
- `trigger` on `self` folds into the same result, with a cycle guard that reports instead of
  looping. A trigger on `other`, `player`, `target`, `baby`, `parent`, `holder` or `block` comes back
  as an `OutgoingTrigger` for the caller to route.
- `set_property` takes a literal or an expression. A string is ambiguous in the file, because the
  engine reads it as Molang and vanilla also writes enum members bare, so the parser keeps the text
  and the engine resolves it: a member of the target property's enum wins, and anything else goes to
  the Molang evaluator.
- The actions this package does not carry out keep their bodies in `EventEffects.actions`, including
  the five vanilla uses that appear in no documentation page: `first_valid` (which is modeled),
  `set_home_position`, `drop_item`, `execute_event_on_home_block` and `stop_movement`.

Applying effects removes groups first and adds second, so a group an event both removes and adds
ends up active and re-initialized. That is the documented rule: "adding a component group that is
already active will cause those components to be re-initialized ... an already-added
`minecraft:timer` that is added again will start its timing logic over." A re-added group also moves
to the end of the active list, so its components replace an earlier group's.

Exactly one spawn event runs when an entity is created. `spawnEventFor` maps the cause to
`minecraft:entity_spawned`, `minecraft:entity_born`, `minecraft:entity_transformed` or
`minecraft:on_prime`, and an event the caller names replaces it rather than adding to it, which is
what `/summon`, a spawn rule's `initial_event`, `minecraft:spawn_entity.spawn_event` and the
`minecraft:drowned<minecraft:as_adult>` form in `transformation.into` all do.

## Entity properties

`description.properties` declares `int`, `float`, `enum` and `bool` properties. An `int` or `float`
clamps into its `range` silently, an `enum` accepts only its declared members, and a write of
anything else is refused and reported. A default is a literal or a Molang expression; the expression
goes to `EntityEnvironment.propertyDefault`, which takes no entity because a default may only call
`query.had_component_group`. The documented limits are checked and reported rather than enforced: 32
properties per entity, 16 members per enum, member names starting with a letter.

Filters read properties through `int_property`, `float_property`, `bool_property`, `enum_property`
and `has_property`, and an entity answers those about itself with no caller view, along with
`has_component`, `is_family`, `is_baby`, `is_tamed`, `is_persistent`, `actor_health`, `is_variant`,
`is_mark_variant` and `is_skin_id`.

## The filter grammar

`@jsprismarine/packs` owns the grammar and parses both encodings, including the integer `subject`
and `operator` the 1.26 serializer writes in 27 vanilla entity files and the `AND`, `OR`, `NOT`,
`all` and `any` aliases. This package evaluates the parsed form against a `FilterContext`.

A context holds the subjects (`self`, `other`, `player`, `target`, `parent`, `baby`, `damager`,
`holder`), an item view, a block view, a world view and a random source. Every view member is
optional, and a test whose fact no view answers evaluates to false and reports through
`onUnanswered`, which is what the engine does for a fact it cannot establish. `self` is the only
required subject, because it is what a test with no `subject` key reads.

The entity view is deliberately small: `flag`, `measure` and `names` take the test's own name, so
one member answers 43 boolean tests, one answers 17 numeric tests and one answers 12 name-set tests.
The rest are the facts that need their own shape: properties, components, equipment, slot fill,
vehicle, owner, attack target, leash holder and trust.

Two shapes the vanilla files write are not in the published grammar, and `normalizeFilterSource`
rewrites them before the parser sees them. Five vanilla filters put `all_of` and `any_of` in one
object, which reads as one `all_of` over the two groups; one filter, in the skeleton's
`minecraft:lightning_immune` group, writes the legacy shorthand `{"other_with_families":
"lightning"}`.

## The goal seam

A goal is a component carrying a `priority` and `control_flags`. `goalComponent` wraps a
`GoalFactory` into a component factory that parses those two fields, builds the goal when the
component initializes and takes it off the scheduler when its group is removed. A later agent
implementing the other 167 goals writes exactly this:

```typescript
export interface GoalFactory<P> {
    /** The component name, such as `minecraft:behavior.random_stroll`. */
    readonly name: string;
    /** The control flags the goal holds when the definition names none. */
    readonly controlFlags: readonly ControlFlag[];
    /** Parses the goal's own parameters; `priority` and `control_flags` are handled for you. */
    readonly schema: ComponentSchema<P>;
    /** Builds the goal for one entity, each time the component initializes. */
    create(params: P, entity: EntityInstance): Goal;
}

export interface Goal {
    canStart(): boolean;
    canContinue?(): boolean;
    start?(): void;
    stop?(): void;
    tick?(): void;
}
```

`ControlFlag` is `move`, `look` or `jump`. The scheduler stops every running goal that cannot
continue, then walks the registered goals from priority 0 upward and starts each one whose control
flags are free or held by a strictly worse priority, stopping the holder in the same tick. That is
the documented rule: "0 is the highest priority ... If the entity is busy doing a low priority
behavior and a high priority behavior comes up, the entity will immediately switch." A goal with no
control flags runs alongside everything else, which is how the targeting goals work. Ties break by
name so the order is stable.

`minecraft:behavior.float`, `minecraft:behavior.random_stroll` and
`minecraft:behavior.look_at_player` ship as reference implementations, one per control flag. They
move the entity through `EntityActuator`, the navigation and look-control seam a caller supplies.

## Components

Components come in two kinds, and the difference matters when reading the coverage numbers.

Components with behavior contribute hooks. `minecraft:timer` draws its duration and fires its event,
restarting whenever its group is re-added. `minecraft:environment_sensor` evaluates its triggers
every tick. `minecraft:damage_sensor` answers a damage event by cause and filters, and the first
trigger that matches wins. `minecraft:transformation` counts down and asks the world to replace the
entity. `minecraft:despawn` applies the standard distance and chance rules, or its filters when it
has them. `minecraft:instant_despawn` removes the entity the moment it becomes active. The attribute
components (`health`, `movement`, `underwater_movement`, `lava_movement`, `flying_speed`,
`follow_range`, `knockback_resistance`, `attack_damage`, `attack`, `horse.jump_strength`) write their
attribute when they initialize, which is what makes a re-added group reset the stat it carries.

Data components parse, normalize and expose their value through `EntityInstance.componentParams`,
which is the whole of what a flag like `minecraft:can_climb` or a table reference like
`minecraft:shareables` means to the server. `minecraft:collision_box`, `minecraft:type_family`,
`minecraft:loot`, `minecraft:experience_reward`, `minecraft:rideable`, `minecraft:inventory`,
`minecraft:equipment`, `minecraft:breathable`, `minecraft:physics`, `minecraft:pushable`, the seven
`minecraft:navigation.*` flavors, the nine `minecraft:movement.*` flavors, the six integer state
components and the ten `minecraft:on_*` triggers are written out; the rest are parsed structurally.

The line the package draws is every non-goal key that two or more of the 129 vanilla entities use.
The 45 keys exactly one entity uses stay unregistered on purpose, so loading the vanilla pack names
them in the report instead of silently doing nothing.

## Measured coverage

Against the composed vanilla behavior pack of Bedrock Dedicated Server 1.26.51.1, through the corpus
test in `src/vanillaEntities.test.ts`:

| Measure | Result |
| --- | --- |
| Entity definitions composed | 129 |
| Files that parse without an error | 129 |
| Unknown top-level or `description` keys | 0 |
| Non-goal component keys in vanilla | 202, of which 157 are implemented |
| Entities whose every non-goal component is implemented | 102 of 129 |
| Goals in vanilla | 170, of which 3 are implemented |
| Entities whose every goal is implemented | 38 of 129 |
| Entities fully covered, components and goals | 33 of 129 |
| Filter tests the documentation lists | 107, all implemented |
| Filter tests vanilla uses | 86, all implemented |

The research note measures that the 140 most used non-goal keys cover 88 of the 129 entities; 157
keys cover 102. The 27 entities that are not component-covered need keys only they use, such as the
enderman's `minecraft:teleport`, the shulker's `minecraft:peek`, the warden's
`minecraft:anger_level` and the villager's `minecraft:trade_table`.

The corpus test needs the sources that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`
caches and runs only with `JSP_VANILLA_ENTITIES` set:

```sh
JSP_VANILLA_ENTITIES=1 pnpm --filter @jsprismarine/entities exec vitest run src/vanillaEntities.test.ts
```

## What a later agent adds

- **Goals.** 167 of the 170. 30 of Java's 67 goal class names match a Bedrock `minecraft:behavior.*`
  name after snake-casing, so the goal mobs port; the 20 Java brain mobs have no data expression in
  either format and need a second mechanism written against Java's memory, sensor and activity
  model.
- **Spawn rules.** The 21 spawn-rule components, the population pools and the herd placement. The
  filter evaluator and `spawnEventFor` already take the `initial_event`, `event` and `permute_type`
  names a spawn rule hands over.
- **Trading.** `minecraft:economy_trade_table` and `minecraft:trade_table` parse as data today;
  the tier, demand and restock machinery is the trading agent's.
- **The world seams.** `EntityActuator` for navigation and look control, `EntityEnvironment.remove`
  and `transform` for despawn and transformation, `route` for a trigger aimed at another entity,
  `molang` for the expressions in component bodies, and `filterContext` for everything about the
  world a filter asks.
