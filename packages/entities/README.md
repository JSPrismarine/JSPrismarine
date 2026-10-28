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

## Event actions

Nine action keys parse into an `EntityAction` and run. Eight are everything the composed vanilla
pack writes, measured over its 850 events: `play_sound` 23 uses, `set_home_position` 17,
`emit_vibration` 9, `drop_item` 2, `execute_event_on_home_block` 2, and one each of `emit_particle`,
`reset_target` and `stop_movement`. The ninth is `queue_command`, which the documentation describes
and no vanilla entity uses. Four of those eight appear in no documentation page.

Six of the nine leave the package through `EntityEnvironment.effects`: `playSound`, `emitParticle`,
`emitVibration`, `queueCommand`, `dropItem` and `executeEventOnBlock`. The other three stay here.
`set_home_position` reads the actuator's position and records it, which is what `home_distance` then
measures against; `stop_movement` abandons the path through the actuator; and `reset_target` clears
the attack target the entity owns.

Nothing passes silently. An action key the package does not parse, a body it cannot read, and an
action whose environment member a caller left out each reach the report with the event that asked.

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
`has_component`, `is_family`, `is_baby`, `is_tamed`, `is_missing_health`, `is_persistent`,
`actor_health`, `is_variant`, `is_mark_variant` and `is_skin_id`.

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

Two shapes the vanilla files write are not in the published grammar, and the packs parser reads
both. Five vanilla filters put `all_of` and `any_of` in one object, which reads as one `all_of`
over the two groups; one filter, in the skeleton's `minecraft:lightning_immune` group, writes the
legacy shorthand `{"other_with_families": "lightning"}`. `parseEntityFilter` is that parser under
the name this package calls it by.

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

## Damage, triggers and riding

Three pieces of entity state live here because the components that read and write them do.

`EntityInstance.damage` runs one damage event end to end. The first component that answers
`onDamage` decides the amount, which is what `minecraft:damage_sensor` does with its cause list and
filters. An immunity component turns the cause aside afterwards, so a sensor still fires its event
on damage the entity ends up ignoring: `minecraft:fire_immune` covers `campfire`, `fire`,
`fire_tick`, `lava`, `magma` and `soul_campfire`, and `minecraft:freezing_immune` covers `freezing`.
What is left comes off the `health` attribute. Whoever dealt the damage answers both the `damager`
and the `other` filter subjects.

`minecraft:cannot_be_attacked` blocks attacks from entities. An attacker can carry
`minecraft:ignore_cannot_be_attacked` to allow all targets, or only targets passing its `filters`.
`minecraft:angry.filters` excludes matching targets while that component is active. The runtime
applies both rules during entity target checks, melee, projectile, and explosion damage.

The ten event-shaped `minecraft:on_*` components fire through `EntityInstance.trigger`, which
evaluates the component's filters, queues a `self` event for the next tick and routes any other
target. Six fire from inside the package: `on_hurt`, `on_hurt_by_player` and `on_death` from a
damage event, `on_target_acquired` and `on_target_escape` from `setAttackTarget`, and
`on_friendly_anger` from the anger broadcast. A caller fires the other four after the entity is set
on fire, starts landing or taking off, or wakes with its owner. The slot-specific
`minecraft:on_equipment_changed` raises the first matching `on_equip` or `on_unequip` event when a
default equipment slot changes; inventory slots are outside its scope.

`minecraft:rideable` seats riders on the vehicle. `mount` checks the seat count and the
`family_types` list, moves a rider off whatever it was riding, and fires `on_rider_enter_event`;
`dismount` fires `on_rider_exit_event`; and taking the component off a group empties the seats. That
answers `rider_count` and `is_controlling_passenger_family` on the vehicle, and `is_riding` and the
`vehicle` subject on the rider.

## Components

Components come in two kinds, and the difference matters when reading the coverage numbers.

Components with behavior contribute hooks. The nine attribute components (`health`, `movement`,
`underwater_movement`, `lava_movement`, `flying_speed`, `follow_range`, `knockback_resistance`,
`attack_damage`, `horse.jump_strength`) and `minecraft:attack` write their attribute when they
initialize, which is what makes a re-added group reset the stat it carries. `minecraft:attack` also
applies its configured status effect after a melee hit. The rest:

| Component | What it does |
| --- | --- |
| `minecraft:timer` | Draws its duration and raises its event, restarting whenever its group is re-added |
| `minecraft:spawn_entity` | Counts down each configured entry, then spawns its item or entity, honoring filters, count, event, sound, and `single_use` |
| `minecraft:spawn_egg_interaction` | Uses a matching spawn egg to create the offspring declared by the entity's component data |
| `minecraft:offspring_data` | Declares compatible mates and offspring pairs for breeding and spawn egg interactions |
| `minecraft:breedable` | Matches `breed_items`, checks tame, health, baby, love, and cooldown requirements, enters the love state, and replaces the consumed item with its per-item `result_item` ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_breedable?view=minecraft-bedrock-stable)) |
| `minecraft:ageable` | Counts `duration` down, advances the remaining time by matching `feed_items` and their `growth`, pauses or resets it through the configured items and events, applies `result_item`, drops `drop_items` on growth, honors `interact_filters`, and raises `grow_up` ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_ageable?view=minecraft-bedrock-stable)) |
| `minecraft:healable` | Matches a configured item and filter, restores health when the entity is injured or `force_use` is set, applies each configured effect with its chance, duration, and amplifier, and replaces the consumed item with `result_item` ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_healable?view=minecraft-bedrock-stable)) |
| `minecraft:mob_effect` | Applies the configured effect to nearby mobs and players that pass `entity_filter`, honoring `effect_range`, `effect_time`, `cooldown_time`, and `ambient` ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_mob_effect?view=minecraft-bedrock-stable)) |
| `minecraft:spell_effects` | Applies its configured effects and then removes the named effects when the component is added; restored entities do not repeat the one-time operation ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_spell_effects?view=minecraft-bedrock-stable)) |
| `minecraft:tameable` | Accepts configured `tame_items`, rolls `probability` for each attempt, and on success records the owner, raises `tame_event`, and replaces the consumed item with `result_item`; failed attempts are accepted and consume one item outside creative mode ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_tameable?view=minecraft-bedrock-stable)) |
| `minecraft:interact` | Applies `on_interact.filters` and events, enforces cooldowns, projects `interact_text` to touch-screen clients, plays `play_sounds`, emits `vibration`, adjusts health, emits `particle_on_start` at the entity with its configured offsets, repairs entity inventory or equipment items, moves an entity's main-hand item into an empty player hand, creates configured entities, rolls `add_items` and `spawn_items` loot tables, uses or transforms the live player's item, equips or drops named equipment and `minecraft:inventory` slots, and gives items to the entity's main hand. Piglin interactions can start admiration and request a barter when the matching components are active. Successful interactions relay the player's arm swing to other viewers tracking them by default; set `swing: false` to suppress it. Non-`none` `particle_on_start.copper_event` still reports as unsupported ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_interact?view=minecraft-bedrock-stable)) |
| `minecraft:admire_item` | Sets the piglin's admiration duration and the cooldown after damage, which ends current admiration and disables new attempts |
| `minecraft:barter` | Rolls `barter_table` with the `barter` loot context after the piglin releases its gold ingot, honoring the cooldown after damage |
| `minecraft:angry` | Counts down over `duration` plus or minus `duration_delta`, raises `calm_event`, excludes targets with `filters`, broadcasts on activation, attack, being attacked, or death as configured, and plays `angry_sound` on its `sound_interval` ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_angry?view=minecraft-bedrock-stable)) |
| `minecraft:environment_sensor` | Evaluates its triggers against the world every tick |
| `minecraft:entity_sensor` | Searches nearby mobs and players for each subsensor, applies `event_filters`, count bounds, `require_all`, range offsets, and cooldowns, then raises its event ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_entity_sensor?view=minecraft-bedrock-stable)) |
| `minecraft:block_sensor` | Raises every matching `on_block_broken` event when a listed block breaks within `sensor_radius`, applying `sources` to the breaker ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_block_sensor?view=minecraft-bedrock-stable)) |
| `minecraft:inside_block_notifier` | Tracks block states overlapped by the entity and raises the configured events when it enters or leaves a match ([component reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_inside_block_notifier?view=minecraft-bedrock-stable)) |
| `minecraft:target_nearby_sensor` | Tracks the current target through `inside_range` and `outside_range`, honors `must_see` for inside events, and fires its vision-loss event while the target is inside range |
| `minecraft:damage_sensor` | Answers a damage event by cause and filters; the first trigger that matches wins |
| `minecraft:hurt_on_condition` | Hurts the entity every half second while a condition's filters pass |
| `minecraft:damage_over_time` | Hurts the entity every `time_between_hurt` seconds while it is active |
| `minecraft:burns_in_daylight` | Validates `protection_slot`; the dimension runtime ignites the entity in direct sunlight unless that slot is occupied or it is wet, keeps fire while exposed, and applies fire damage |
| `minecraft:breathable` | Spends and refills the air supply, and suffocates once it is gone |
| `minecraft:ambient_sound_interval` | Plays its sound on the interval its body names |
| `minecraft:rideable` | Holds the seats, and empties them when the component goes |
| `minecraft:transformation` | Counts down and asks the world to replace the entity |
| `minecraft:despawn` | Applies the distance and chance rules, or its filters, unless the entity is persistent |
| `minecraft:instant_despawn` | Removes the entity the moment it becomes active |
| `minecraft:ignore_cannot_be_attacked` | Lets attacker data filter exceptions to a target's attack protection |
| `minecraft:on_*` triggers | Raise events at their owning fixed point; `on_equipment_changed` watches default equipment slots |

Other empty markers are read directly rather than through hooks:
`minecraft:persistent` stops `minecraft:despawn`; `minecraft:transient` excludes the actor from saved
records; `minecraft:fire_immune` and `minecraft:freezing_immune` turn their causes aside in
`EntityInstance.damage`; and `minecraft:cannot_be_attacked` blocks entity attacks unless the
attacker's `minecraft:ignore_cannot_be_attacked` filter allows the target. `minecraft:fire_immune`
also sets the Bedrock actor's `FIRE_IMMUNE` flag. `minecraft:body_rotation_blocked` projects to
`BODY_ROTATION_BLOCKED`. `minecraft:out_of_control` projects to `OUT_OF_CONTROL`.

Data components parse, normalize and expose their value through `EntityInstance.componentParams`.
The separate breeding runtime reads compatible mates and offspring pairs from
`minecraft:offspring_data`. Entity definitions using the older `minecraft:offspring` spelling are
normalized to that component when their type is resolved.
The pathfinder reads `minecraft:can_climb` to climb ladders and `minecraft:can_fly` to allow airborne
paths, and reads `minecraft:can_stand_on_powder_snow` to treat powder snow as support. The runtime
projects `minecraft:can_climb` to `CANCLIMB`, the active navigation profile's
walk and swim abilities to `CANWALK` and `CANSWIM`, and its flight ability to `CANFLY`. It projects
`minecraft:can_power_jump`, `minecraft:dash_action`, `minecraft:input_ground_controlled`,
`minecraft:free_camera_controlled`, and `minecraft:vertical_movement_action` to `CAN_POWER_JUMP`,
`CAN_DASH`, `WASD_CONTROLLED`, `WASD_FREE_CAMERA_CONTROLLED`, and
`CAN_USE_VERTICAL_MOVEMENT_ACTION`. These flags tell the client which controls are available; the
server does not yet apply those inputs to entity movement. A table reference like
`minecraft:shareables` remains data for a system to use. The outer runtime also reads
physics values from the active component set: `minecraft:air_drag_modifier` changes air resistance,
`minecraft:uses_uniform_air_drag` applies the same drag on both axes,
`minecraft:friction_modifier` changes ground friction, and `minecraft:bounciness` changes how much
impact velocity a collision returns. `minecraft:collision_box`, `minecraft:type_family`,
`minecraft:loot`, `minecraft:experience_reward`, `minecraft:inventory`, `minecraft:equipment`,
`minecraft:physics`, `minecraft:pushable`, `minecraft:air_drag_modifier`,
`minecraft:friction_modifier`, `minecraft:bounciness`, `minecraft:nameable`, `minecraft:is_dyeable`, the seven `minecraft:navigation.*` flavors,
the nine `minecraft:movement.*` flavors and the six integer state components are written out; the
rest are parsed structurally. `minecraft:type_family` and the integer state components are data a filter
reads, so an entity answers `is_family`, `is_variant`, `is_mark_variant` and `is_skin_id` from them
with no caller view. `minecraft:nameable` gates name-tag use, queues its default and matching name
events, and projects the configured visibility and custom name to the client. `minecraft:is_dyeable`
gates dye use, updates the entity's palette color, and projects its touch-screen prompt.

Every non-goal key in the vanilla pack has a component factory, so the loader preserves its body
and exposes it through `EntityInstance.componentParams`. Some of the 34 keys used by only one entity
still have no runtime behavior. Their factories preserve their bodies, and the corpus test counts
them as parsed rather than behaviorally implemented.

## Measured coverage

Against the composed vanilla behavior pack of Bedrock Dedicated Server 1.26.51.1, through the corpus
test in `src/vanillaEntities.test.ts`:

| Measure | Result |
| --- | --- |
| Entity definitions composed | 129 |
| Files that parse without an error | 129 |
| Unknown top-level or `description` keys | 0 |
| Non-goal component keys in vanilla | 202, all registered |
| Non-goal keys with a component hook | 83 |
| Non-goal keys with a runtime effect across the server | 92 |
| Entities whose every non-goal component is registered | 129 of 129 |
| Goal names in vanilla | 170, all registered by `@jsprismarine/entity-goals` |
| Entities that declare goals | 92 of 129; all their goal names are registered |
| Filter tests the documentation lists | 107, all implemented |
| Filter tests vanilla uses | 86, all implemented |
| Event action keys vanilla uses | 8, all carried out; 56 uses |
| Stats both editions publish for the same entity | 438, of which 287 agree |

The 151 stats the two editions disagree on, measured against the 93 entity types of
`@jsprismarine/bedrock-data`'s `java_entity_attributes`, are `movement_speed` 42, `height` 35,
`width` 24, `follow_range` 21, `attack_damage` 15, `max_health` 10, `flying_speed` 2 and
`knockback_resistance` 2.

Java's table is keyed by Java's entity names, and five types spawn under the name Bedrock used
before Mojang renamed them: the evoker as `evocation_illager`, the villager and zombie villager as
`villager_v2` and `zombie_villager_v2`, the tropical fish as `tropicalfish` and the zombified
piglin as `zombie_pigman`. Those rows are found through `@jsprismarine/mapping`, so the decision
reaches them too.

Which edition wins is decided per stat in [`src/javaStats.ts`](src/javaStats.ts) and recorded in
[ADR 0001](../../docs/adr/0001-entity-stat-authority.md). Java decides the four a Bedrock client
never computes for itself, so the wither spawns with Java's 300 health rather than Bedrock's 600
and the witch follows from Java's 16 blocks rather than 64. Bedrock decides the five the client
predicts an actor with, which `ClientMovementPredictionSyncPacket` enumerates: the bounding box
width and height, the movement and flying speeds, and the jump strength. 33 disagreements resolve
to Java, 103 keep Bedrock's value because Bedrock decides the stat, and 15 are reviewed exceptions
where Java publishes a number it overwrites at spawn, such as the horse's 53 health or a slime's.

Pass the table in to turn the decision on:

```typescript
import { java_entity_attributes } from '@jsprismarine/bedrock-data';

const wither = types.spawn('minecraft:wither', { environment: { javaStats: java_entity_attributes } });
wither.attributes.get('health')?.base; // 300, where the pack writes 600
```

`statRuling(identifier, stat)` answers why one entity's stat resolved the way it did, so a parity
row quotes the decision instead of keeping a second copy of it.

The registry recognizes all 202 non-goal component names used by the 129 vanilla entities. That
measures name coverage rather than complete simulation: 83 component factories have hooks, and 92
components have a runtime effect across the server when host reads and protocol projections are
included. The remaining 110 bodies are available as data for behavior that still needs to be added.

`minecraft:target_nearby_sensor` reads the entity's current target. The host currently defines
visibility as being within `follow_range`; it does not test block occlusion.

The corpus test needs the sources that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`
caches and runs only with `JSP_VANILLA_ENTITIES` set:

```sh
JSP_VANILLA_ENTITIES=1 pnpm --filter @jsprismarine/entities exec vitest run src/vanillaEntities.test.ts
```

## What a later agent adds

- **Goal parity.** All 170 vanilla goal names have registered factories, and the totality test keeps
  that inventory complete. The remaining work is validating each goal's world effects and timing
  against its game behavior.
- **Spawn rules.** The 21 spawn-rule components, the population pools and the herd placement. The
  filter evaluator and `spawnEventFor` already take the `initial_event`, `event` and `permute_type`
  names a spawn rule hands over.
- **Trading.** `minecraft:economy_trade_table` and `minecraft:trade_table` parse as data today;
  the tier, demand and restock machinery is the trading agent's.
- **The world seams.** `EntityActuator` for navigation and look control, `EntityEnvironment.remove`
  and `transform` for despawn and transformation, `effects` for the six event actions that leave the
  package, `route` for a trigger aimed at another entity, `molang` for the expressions in component
  bodies, and `filterContext` for everything about the world a filter asks.
- **The remaining event-shaped triggers whose state is outside the package.** `on_start_landing`,
  `on_start_takeoff` and `on_wake_with_owner` need flight or sleep state the package does not own.
  Each parses and runs through `EntityInstance.trigger` when a caller reaches its fixed point.
  Prismarine fires `on_ignite` when daylight starts a fire; `on_equipment_changed` is handled by
  default equipment slot changes, and `on_friendly_anger` by the anger broadcast.
- **Remaining entity component behavior.** Of the 202 non-goal component names in the vanilla pack,
  110 currently expose data without runtime behavior. The component bodies remain accessible to the
  host, but registration alone does not mean the server simulates them.
