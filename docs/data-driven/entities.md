---
title: Entities
group: Documents
category: Guides
---

# Data-driven entities

What a mob does on this server is decided by a Bedrock behavior-pack file rather than by a
TypeScript class. A definition names the mob's components, the component groups its events switch
on and off, and the goals it runs. The server reads that file, resolves it once, and builds every
instance of the mob from the result, so adding a mob means shipping a pack rather than writing
code.

This page explains how a definition becomes a running mob, which parts of a definition the server
acts on today, and where it stops. It assumes you know Minecraft and a behavior pack's shape, and
nothing about the plan or the research notes behind the implementation.

## Where the code lives

Six pieces share the work.

| Package | What it owns |
| --- | --- |
| [`@jsprismarine/entities`](../../packages/entities/README.md) | Definition parsing, components and component groups, the event engine, entity properties, the filter evaluator, the goal scheduler |
| [`@jsprismarine/entity-goals`](../../packages/entity-goals/README.md) | All 170 vanilla `minecraft:behavior.*` goals and the A\* path finder they walk with |
| [`@jsprismarine/entity-brains`](../../packages/entity-brains/README.md) | Java Edition's brain AI, for the twenty mobs Bedrock's format cannot describe |
| [`@jsprismarine/spawning`](../../packages/spawning/README.md) | The `spawn_rules/*.json` grammar and the natural spawn loop |
| [`@jsprismarine/trading`](../../packages/trading/README.md) | Trade tables, offer generation and the villager economy |
| `packages/prismarine/src/entity/data/` | The host: one runtime per dimension that wires the five packages to a live world |

None of the five packages knows there is a server. Each declares an interface for what it needs
from the world, and the host implements it. That is why they have their own test suites and why a
plugin can drive one of them without a world at all.

## From a file to a mob

The runtime keeps three stages of the same content apart.

A definition is the parsed JSON of one entity file, exactly as the winning pack wrote it. A type is
that definition resolved once at load time, with every component bound to an implementation and
every group pre-resolved. An instance is one live mob, with its own component state, its own
attributes and its own goal scheduler.

Resolution is deliberately lenient. `parseEntityDefinition` validates the shape of the five keys
Mojang's own schema types (`description`, `components`, `component_groups`, `events`, `upgrades`)
and reports anything it did not read instead of refusing the file. A pack written against a newer
game still loads, and the diagnostics report names what the runtime ignored. Four features are
gated on `format_version`, and using one below its version loads anyway with a report: root-level
event `filters` need 1.19.20, `queue_command` needs 1.20.60, `emit_particle` and `play_sound` need
1.21.50, and `entity_version` with `upgrades` needs 1.26.20.

The composed vanilla behavior pack of Bedrock Dedicated Server 1.26.51.1 holds 129 entity
definitions, and all 129 parse without an error.

## A chicken, traced

The vanilla chicken is small enough to follow end to end and uses most of the machinery. Here is
the part of `entities/chicken.json` that matters, trimmed:

```json
{
  "format_version": "1.26.50",
  "minecraft:entity": {
    "description": {
      "identifier": "minecraft:chicken",
      "spawn_category": "creature",
      "properties": {
        "minecraft:climate_variant": {
          "type": "enum",
          "values": ["temperate", "warm", "cold"],
          "default": "temperate"
        }
      }
    },
    "components": {
      "minecraft:health": { "value": 4, "max": 4 },
      "minecraft:movement": { "value": 0.25 },
      "minecraft:collision_box": { "width": 0.6, "height": 0.8 },
      "minecraft:navigation.walk": { "can_path_over_water": true, "avoid_damage_blocks": true },
      "minecraft:behavior.float": { "priority": 0 },
      "minecraft:behavior.panic": { "priority": 1, "speed_multiplier": 1.5 },
      "minecraft:behavior.tempt": { "priority": 4, "items": ["wheat_seeds", "..."] },
      "minecraft:behavior.random_stroll": { "priority": 6, "speed_multiplier": 1 },
      "minecraft:behavior.look_at_player": { "priority": 7, "look_distance": 6, "probability": 0.02 }
    },
    "component_groups": {
      "minecraft:chicken_baby": { "minecraft:is_baby": {}, "minecraft:ageable": { "duration": 1200 } },
      "minecraft:chicken_adult": {
        "minecraft:loot": { "table": "loot_tables/entities/chicken.json" },
        "minecraft:breedable": { "breeds_with": { "minecraft:chicken": {} } },
        "minecraft:behavior.breed": { "priority": 3, "speed_multiplier": 1 },
        "minecraft:spawn_entity": { "entities": [{ "spawn_item": "egg", "min_wait_time": 300 }] }
      }
    },
    "events": {
      "minecraft:entity_spawned": {
        "sequence": [
          {
            "randomize": [
              { "weight": 95, "trigger": "minecraft:spawn_adult" },
              { "weight": 5, "add": { "component_groups": ["minecraft:chicken_baby"] } }
            ]
          },
          {
            "first_valid": [
              {
                "filters": { "test": "has_biome_tag", "value": "spawns_warm_variant_farm_animals" },
                "set_property": { "minecraft:climate_variant": "warm" }
              }
            ]
          }
        ]
      },
      "minecraft:spawn_adult": { "add": { "component_groups": ["minecraft:chicken_adult"] } }
    }
  }
}
```

A chicken arrives in the world like this.

1. `spawn_rules/chicken.json` offers the position. It puts the chicken in the `animal` population
   pool, wants the surface pass, a `minecraft:grass_block` underfoot, light 7 to 15, a biome tagged
   `animal`, and a herd of 2 to 4. Its weight of 10 competes with every other rule that passed at
   the same position.
2. The runtime creates the instance and fires exactly one spawn event,
   `minecraft:entity_spawned`. The `randomize` node draws 95 against 5, so about nineteen chickens
   in twenty trigger `minecraft:spawn_adult` and the twentieth gets the baby group instead. The
   weights are relative, not percentages; 95 and 5 would behave the same as 19 and 1.
3. The `first_valid` node in the same sequence reads the biome's tags and writes the
   `minecraft:climate_variant` enum property, which the client reads to pick the chicken's skin.
   It cannot test for the baby group the `randomize` node may just have added, because an event's
   effects are decided immediately and applied only when the entity next ticks.
4. On the next tick, the adult group's components initialize: `minecraft:loot` names the table
   death rolls, `minecraft:breedable` tells the breeding code which mate and which baby to make,
   and `minecraft:behavior.breed` joins the scheduler at priority 3.
5. Every tick after that, the scheduler walks the goals from priority 0 upward and starts each one
   whose control flags are free. `float` holds `jump`, `panic` and `random_stroll` want `move`,
   `look_at_player` and `random_look_around` want `look`, and `tempt` wants both `move` and `look`.
   Hold wheat seeds nearby and `tempt` at priority 4 takes both flags away from `random_stroll` at
   6 and `look_at_player` at 7, in the same tick.
6. The stats the client is sent come from the components, except where [ADR
   0001](../adr/0001-entity-stat-authority.md) hands a stat to Java. The chicken keeps Bedrock's
   0.6 by 0.8 hitbox, where Java publishes 0.4 by 0.7.

`minecraft:spawn_entity` runs one timer per configured entry. When it expires, the runtime checks
the entry's filters, then creates the requested item or entity with its count, spawn event and
sound. `single_use` stops that entry after a successful spawn. The runtime does not yet track
leashes, so an entry with `should_leash` names that missing behavior in the server log.

## Components: what runs, and what only parses

Vanilla's 129 definitions use 202 distinct non-goal component keys. All 202 names are registered,
and every entity definition resolves with its non-goal components recognized. Seventy keys carry
runtime behavior. The remaining 132 expose data without simulating their behavior; some have a
dedicated schema, and the generic factories preserve the raw body. Both are available through
`EntityInstance.componentParams`.

This count includes host reads and actor-metadata projections. It does not mean every field of each
component has a runtime implementation.

The 70 with runtime effects include components that change entity state, decide an outcome, or
project state to the client: the nine
attribute components plus `minecraft:attack`, which write their stat when the group they live in
initializes; the timers (`minecraft:timer`, `minecraft:ageable`, `minecraft:angry`,
`minecraft:transformation`); the damage components (`minecraft:damage_sensor`,
`minecraft:hurt_on_condition`, `minecraft:damage_over_time`, `minecraft:breathable`); the
population components (`minecraft:despawn`, `minecraft:instant_despawn`, `minecraft:persistent`);
`minecraft:transient`, which keeps its entity out of saved actor records;
`minecraft:environment_sensor`, `minecraft:ambient_sound_interval`, `minecraft:rideable`,
`minecraft:spawn_entity`, `minecraft:interact`, and `minecraft:vibration_listener`, which connects
its entity to world game-event delivery; the actor metadata markers `minecraft:is_charged`,
`minecraft:is_ignited`, `minecraft:is_saddled`, `minecraft:is_chested`,
`minecraft:is_illager_captain`, `minecraft:is_shaking`, `minecraft:is_hidden_when_invisible`,
`minecraft:is_stackable`, `minecraft:is_collidable`, `minecraft:is_pregnant`, `minecraft:is_stunned`,
`minecraft:body_rotation_always_follows_head`, `minecraft:body_rotation_blocked`,
`minecraft:uses_uniform_air_drag`,
`minecraft:renders_when_invisible`, `minecraft:rotation_axis_aligned`,
`minecraft:rotation_locked_to_vehicle`, `minecraft:uses_legacy_friction`, and
`minecraft:out_of_control`, which project their
state into actor metadata; `minecraft:can_fly`, which enables airborne paths and projects the
Bedrock actor's `CANFLY` flag; `minecraft:can_power_jump`, which projects `CAN_POWER_JUMP`;
`minecraft:dash_action`, `minecraft:input_ground_controlled`, `minecraft:free_camera_controlled`, and
`minecraft:vertical_movement_action`, which project `CAN_DASH`, `WASD_CONTROLLED`,
`WASD_FREE_CAMERA_CONTROLLED`, and `CAN_USE_VERTICAL_MOVEMENT_ACTION` to actor metadata;
`minecraft:fire_immune`, which prevents fire damage and projects `FIRE_IMMUNE`;
`minecraft:air_drag_modifier`, `minecraft:friction_modifier`, and
`minecraft:bounciness`, which the shared body physics reads from the active component set; the
eleven `minecraft:on_*`
trigger components; and `minecraft:cannot_be_attacked`, which blocks entity attacks.
`minecraft:interact` evaluates item
filters, enforces its cooldowns, raises its event, adjusts health by `health_amount`, plays
`play_sounds`, emits its `vibration` game event, requests the `spawn_items` loot table from the host,
adds `add_items` loot to the player's inventory, and applies `hurt_item`, `use_item`, and
`transform_to_item` through the live inventory; other interaction fields still report as unsupported.
`minecraft:angry` counts its anger down, raises `calm_event`, excludes targets matching `filters`,
plays `angry_sound` on the configured `sound_interval`, and broadcasts on activation, attack, being
attacked, and death according to its flags. Each broadcast reaches nearby entities of the same type
or the configured `broadcast_targets` families, evaluates `broadcast_filters` with the broadcaster
as the caller and each candidate as `other`, and fires the candidate's
`minecraft:on_friendly_anger` trigger. It gives candidates the triggering entity as their target
when one is known.
Attacker exceptions are
data in `minecraft:ignore_cannot_be_attacked`; the package supports that component for custom
definitions too.
The ground-input, dash, free-camera, and vertical-movement components currently only advertise
controls to the client; the server does not apply those inputs to entity movement.
The entities package README lists each component and what it does.

"Parses as data" is not the same as "ignored". The host reads several data components itself:
`minecraft:breedable` drives breeding, `minecraft:healable` and `minecraft:tameable` handle item
interactions, `minecraft:collision_box` and the `minecraft:navigation.*` flavors build the path
finder's profile; its walking, swimming, and flight capabilities project to `CANWALK`, `CANSWIM`, and
`CANFLY`. `minecraft:can_climb` enables ladder traversal and projects to `CANCLIMB`, while
`minecraft:can_fly` lets the pathfinder leave solid ground, and `minecraft:can_stand_on_powder_snow`
makes powder snow support the entity in pathfinding and body collision. The host also reads
`minecraft:explode` to detonate a creeper, `minecraft:rideable` to seat riders, and the two
trade-table components to build a merchant. The shared body physics reads `minecraft:air_drag_modifier`,
`minecraft:uses_uniform_air_drag`, `minecraft:friction_modifier`, and `minecraft:bounciness` to apply
the active entity's drag, ground friction, and collision response.

Every non-goal key in the vanilla pack is registered, including keys used by only one entity such as
the enderman's `minecraft:teleport`, the shulker's `minecraft:peek`, and the warden's
`minecraft:anger_level`. Registration makes a component's data available; it does not promise that
the server simulates its behavior. The corpus test checks the 202 names and counts the keys that
currently carry behavior.

An unknown component name writes a `component.unknown` warning to the server log and
`ServerContent.diagnostics`, and appears in `EntityType.unimplementedComponents`. A registered
component without runtime behavior does not produce that warning, so check the entity component
inventory in the package README when deciding whether the server simulates a component.

## Events and the component-group state machine

An entity's state is which component groups are active, and events are the only thing that changes
it. The rule the engine follows is the one Mojang documents: the effects of an event are determined
immediately and applied when the entity next ticks. A filter in a later `sequence` entry therefore
cannot see what an earlier entry changed.

Inside one node the engine runs `add`, `remove`, `set_property`, the raw actions and `trigger`,
then walks `sequence` in order, then draws one branch of `randomize`, then takes the first passing
branch of `first_valid`. A node's own `filters` gate the whole node, and nodes nest without limit.
When the effects are applied, groups are removed first and added second, so a group an event both
removes and adds ends up active and re-initialized, which restarts the timers inside it.

Nine action keys parse into something the engine carries out: `play_sound`, `set_home_position`,
`emit_vibration`, `drop_item`, `execute_event_on_home_block`, `emit_particle`, `reset_target`,
`stop_movement` and `queue_command`. Eight of those are everything the vanilla pack writes, across
its 850 events; `queue_command` is documented and unused by vanilla. Six of the nine leave the
entities package through an effects seam the host fills, and `set_home_position`, `stop_movement`
and `reset_target` are carried out inside the package.

The prismarine host routes emitted game events through a per-world Java-style listener registry.
It searches only loaded chunks within the event's notification range, applies each listener's own
radius, and delivers distance-ordered listeners nearest first. Active vibration listeners on data-
driven wardens and allays receive events; wardens record suspicious positions, and allays update the
note-block position they follow.

`damage`, `die` and `teleport` are worth naming because they appear in some third-party
documentation as event actions. They are not. Mojang's `EventActions.md` does not list them, no
vanilla entity writes one, and this server treats an unrecognized action key the way it treats any
other: the event still runs its other effects, and the unreadable key reaches the report. To make
an event take a mob out of the world, add a component group carrying `minecraft:instant_despawn`,
which removes it without rolling its loot table. To kill it properly, deal the damage from the
code that fired the event.

When lethal damage queues a self event, the runtime leaves one tick for it to apply before
removing the entity. That lets the Ender Dragon's data-defined death event activate
`minecraft:behavior.dragondeath`; the goal holds its controls for 200 ticks, then removes it.

## Filters

Filters are the shared condition language, and the same evaluator answers them for entity
definitions, spawn rules and trade tables. All 107 filter tests Mojang's generated documentation
lists are implemented, and vanilla uses 86 of them.

Both encodings parse. 27 vanilla entity files are written by the 1.26 serializer, which writes
`subject` and `operator` as integers rather than strings, and the `AND`, `OR`, `NOT`, `all` and
`any` aliases read as their canonical combinators. Two shapes vanilla writes that the published
grammar does not describe also parse: five files put `all_of` and `any_of` in one object, and the
skeleton writes the legacy shorthand `{"other_with_families": "lightning"}`.

A filter test whose fact nothing can answer evaluates to false and is reported, rather than
defaulting to true. That matters when you are debugging: a mob that never does a thing may be
looking at a world fact this server does not track yet, and the report names the test.

`has_tag` reads the entity's dynamic string tags, the same set the `/tag` command edits. The host
keeps that set on data-driven entities across live-body replacement and writes it to the actor's
`Tags` list when the entity is saved.

## Goals

A goal is a component carrying a `priority` and optional `control_flags`, and all 170
`minecraft:behavior.*` names vanilla uses have a registered factory in `@jsprismarine/entity-goals`.
`packages/entity-goals/src/totality.test.ts` fails if a name in the generated goal inventory has no
registered factory, so the number cannot drift without the build noticing. Ninety-two vanilla
entities declare at least one goal, and every goal name they declare is registered; the other 37
definitions have no goals.

The scheduler is the documented one. Priority 0 is the highest. Each tick it stops every running
goal that can no longer continue, then walks the registered goals upward from 0 and starts each one
whose control flags (`move`, `look`, `jump`) are either free or held by a strictly worse priority,
stopping the holder in the same tick. A goal with no control flags runs alongside everything else,
which is how the nine targeting goals work.

Where Java and Bedrock describe the same goal, the constants come from Java. Thirty of Java's goal
class names match a Bedrock name after snake-casing, so for those the numbers are read out of the
unobfuscated 26.3 server jar and the JSDoc names the class: the 0.02 chance per tick in
`look_at_player`, the 20-tick swing cadence in the melee goals, the 300-tick revenge memory in
`hurt_by_target`. Where the two editions disagree, the Bedrock parameter wins, because these are
Bedrock definitions.

Movement goes through an A\* path finder over whole blocks. The profile comes from the entity's
active `minecraft:navigation.*` component plus its collision height and step height, and the flags
on that component decide which cells the search may enter: doors, water, lava, damaging blocks,
portals, sunlight and the three media (ground, swim, fly). A search expands at most 512 nodes
unless the caller raises the budget.

The goals reach the world through `GoalWorld`, a 43-member interface covering sight, combat, items,
blocks, relationships and reporting. Every member is optional, and a goal whose world cannot answer
what it needs refuses to start rather than throwing. The server answers all 43 today, which takes
the inventory from 118 goals able to run to all 170; before the seam was finished, `hurt_by_target`
(42 of the 129 vanilla entities carry it), `panic` (37), `breed` (26) and `mount_pathing` (26) could
never start.

## Brain mobs, and why they are different

Java Edition runs two unrelated mob AI systems, and Bedrock's data format only describes one of
them.

The goal system is the one Bedrock's `minecraft:behavior.*` components express, and 30 of Java's 67
goal class names match a Bedrock name directly. The brain system is something else: a memory map, a
list of sensors that write into it, and a table of behaviors keyed by priority and activity.
Bedrock publishes no memory registry, no sensor registry and no activity registry at all, so a
Bedrock-shaped entity file has no way to say what a brain mob is doing. There is no component for
"the piglin has been admiring this gold ingot for 119 ticks" because the format never names that
idea.

Exactly twenty mob classes in Java build a brain, and the list is a fact rather than a judgment
call: scanning every class under `net/minecraft/world/entity/` for `brainProvider` or `makeBrain`
finds 21, and the twenty-first is `LivingEntity`, which holds the base. The twenty are the allay,
armadillo, axolotl, breeze, camel, copper golem, creaking, frog, goat, happy ghast, hoglin,
nautilus, piglin, piglin brute, sniffer, tadpole, villager, warden, zoglin and zombie nautilus.
Everything else in the game, including every zombie, skeleton, farm animal and the ender dragon, is
goals only.

`@jsprismarine/entity-brains` implements that second system against Java 26.3: all 115 memory
modules, all 24 sensors, all 26 activities, the combinators, and each of the twenty mobs with its
real activity table, priorities, memory conditions and constants. The behavior library is 37 shared
behaviors plus the mob-specific ones. A behavior whose effect the world seam can express is
implemented in full; the rest keep their real name, memory conditions and constants, do the memory
bookkeeping Java does, and leave the world effect to the host. The piglin's barter loot, the
sniffer's dig, the warden's sonic boom damage and the raid state machine are in that group.

Two consequences are worth knowing before you build around a brain mob.

A brain mob does not run its Bedrock goals. The host hands a `GoalWorld` only to entities that are
not brain mobs, so the `minecraft:behavior.*` components in a frog's vanilla file never start; its
Java brain drives it instead. The camel and the happy ghast are the exceptions, because Java gives
both a `registerGoals` and a `brainProvider`, and the runtime ticks both systems for them.

The villager needs a translation step. The brain registry is written against Java, so it names the
villager `minecraft:villager`, and that is also the identifier of Bedrock's legacy villager file;
Bedrock's current villager spawns as `minecraft:villager_v2`. Looking a brain up by the spawned
identifier alone therefore missed it, and a villager ran its 27 Bedrock goals with its schedule,
professions, memories and sensors unused. The lookup goes through `@jsprismarine/mapping`'s Java
to Bedrock entity table instead, which is the same source `javaEntityStats` reads for the same
renames, so all twenty brain mobs attach. The villager is the only one of the twenty the two
editions spell differently.

## Stats: which edition decides a number

Bedrock's entity definitions and Java's attribute suppliers publish 438 of the same stats for the
same entity, and they disagree on 151 of them. Picking one edition everywhere is wrong in both
directions, so the choice is made per stat and recorded in [ADR
0001](../adr/0001-entity-stat-authority.md).

Java decides `max_health`, `attack_damage`, `follow_range` and `knockback_resistance`, because the
Bedrock client never computes any of them: it draws hearts from the attribute the server sends,
reports that a swing happened without a damage number, and runs no mob AI. That is why a wither
here spawns with Java's 300 health instead of Bedrock's difficulty-scaled 600.

Bedrock decides `movement_speed`, `flying_speed`, `jump_strength`, `width` and `height`, because
those are the stats the client simulates an actor with. `ClientMovementPredictionSyncPacket` is the
client telling the server what it predicted an actor with, and its payload enumerates the bounding
box, the speeds and the jump strength. The hitbox is the clearest case: the client draws the mob
from its own resource pack and collides with the box the server sends, so a box that disagrees with
the drawn model means a player aims at a mob and misses.

33 of the 151 disagreements resolve to Java's value, and 118 keep Bedrock's, of which 15 are
reviewed exceptions where Java publishes a number Java itself overwrites at spawn, such as the
horse's 53 health or a slime's. The corpus test fails if a new disagreement appears on a
Java-decided stat without a review, so a Mojang retune cannot be absorbed silently. The ADR has the
reasoning and the full exception list.

## Spawning

Natural spawning runs Bedrock's model, from Bedrock's 60 vanilla `spawn_rules/*.json` files. All 60
parse with no diagnostic, all 21 condition components vanilla writes are evaluated, and the six
population pools are `animal` (27 rules), `monster` (24), `water_animal` (5), `pillager` (2), `cat`
(1) and `ambient` (1).

Choosing Bedrock's model over Java's was deliberate, and the reason is farms. Java's spawning rules
are implementable and the Bedrock client would never see the difference, but a Bedrock player's mob
farm is built against Bedrock's caps, rates and spawn-position rules, and swapping in Java's model
would break every one of them. Section 12 decision 3 of
[the plan](../plans/data-driven-vanilla.md) records that.

The awkward part is that Mojang publishes none of the numbers the algorithm needs. There is no
published spawn rate, cap, radius, herd placement rule or density radius; the one source of figures
is a documentation table where every entry is hedged with a tilde. So every constant is this
project's reading, and they live in `packages/spawning/src/tables/spawnConstants.json` with a
`source` string each rather than in code, where you can read the reasoning and replace the whole
table.

| Pool | Cap | Scope | Cycle |
| --- | --- | --- | --- |
| `animal` | 10 | Per player | Every 400 ticks |
| `water_animal` | 5 | Per player | Every 400 ticks |
| `water_ambient` | 20 | Per player | Every 400 ticks |
| `ambient` | 15 | Per player | Every 400 ticks |
| `monster` | 70 | Per region | Every 20 ticks |
| `cat` | 5 | Per region | Every 1200 ticks |
| `pillager` | None | Per region | Every 20 ticks |

One cycle reads the pool's cap, samples 8 chunks within 4 chunks of each player, tries 3 positions
per chunk for the surface pass and 3 for the underground pass, collects every rule condition that
passes at a position, draws one by weight, applies its `rarity` roll, places a herd, and gives each
member its type and spawn event. It stops the moment the pool reaches its cap, even mid-herd.

## Trading

`@jsprismarine/trading` reads both trade table grammars, the economy one and the legacy one, and
runs the villager economy on top. Against bedrock-samples it parses all 27 vanilla tables, 110
tiers and 384 trades, and implements the six trade item functions vanilla uses.

Mojang names the economy's fields and publishes none of its formulas, so the demand, restock,
level-up and discount arithmetic is Java's, which is the only published model, with three choices
written down in the package README. A trader's level is how many tiers its experience has unlocked.
Demand moves at restock rather than inside a stock cycle. The discount fields are flat deltas on
the first want rather than percentages.

On a default build only 18 of the 27 tables load, because BDS ships eleven of them as an
undocumented binary format the pack loader cannot read and reports as `definition.mcb`. Copying the
JSON versions from bedrock-samples into a world pack fills the gap.

## Running it

Every server runs this, and there is no setting that turns it on or off. Nothing stands behind it
either: the 111 written entity classes, the 11 hand-written goals and the `MobSpawner` that used
to place a dozen species near players are deleted, so a pack stack that will not load stops the
server at startup rather than falling back to them. Behavior pack directories listed under
`content-world-packs` in `config.yaml` load after the vanilla ones, and later packs replace
earlier definitions whole; see [using-packs.md](using-packs.md) for the precedence rules.

Five written classes remain for compatibility with saved actors that have no data-runtime
record: a dropped stack, an arrow, an egg, a snowball and `Human`, which is what a player is. TNT
and falling blocks restore through their vanilla entity definitions. The projectile classes remain
for older saved actors; new projectile flight and hit behavior comes from each type's
`minecraft:projectile` component. Everything else is a component set in the runtime with a
`GenericEntity` for a body, so a mob's hitbox, stats and death loot table come from the pack rather
than a table in this repository. `Entity.getBox()` reads the type's `minecraft:collision_box` from
the content registry, and the only box still written down here is `minecraft:item`, the type Mojang
ships no entity file for.

The server opens one `EntityRuntime` per dimension as that dimension's content adapter is
assembled, and `World.update` ticks it. Each tick, for each entity in order: the queued events
apply, the active components run, the goal scheduler runs, a brain mob updates its activity and
ticks its brain, and the body takes one step along whatever walk the AI asked for. Then the spawn
cycle and the despawn pass run. The body and the entity behind it stay in step in both directions,
so a player's blow reaches the components that decide what it cost and the shove that came with it
moves the mob.

A default build registers all 129 of those definitions and recognizes every non-goal component
name they use. BDS keeps chemistry, the editor, and four experimental packs in the same
`behavior_packs` folder, and the default asks for none of them; `PackStackRequest.bedrockPacks`
names more of them by UUID if you want them. Startup can still report warnings for unsupported
fields, actions, or identifiers. A registered component with no runtime behavior does not produce
an unknown-component warning.

### Adding your own mob

1. Write a behavior pack with `manifest.json` and your entity file under `entities/`, exactly as
   you would for BDS.
2. Point `content-world-packs` at its directory and restart the server.
3. Read the startup log. Every unknown component, unreadable event and unmapped identifier is
   reported there with the pack and file that wrote it.
4. If the mob should spawn naturally, add a `spawn_rules/` file naming one of the population pools
   above. Without one it exists only when something else creates it.
5. Ship a resource pack with the geometry and textures, or set `runtime_identifier` to a vanilla
   mob so the client draws that one instead. The server never sends a model, so a mob with
   neither arrives invisible.

## Known limits

Each of these changes what you can expect to work.

**Dense active chunks can still be expensive.** Entities tick only in chunks inside a player's
simulation distance, using the same gate for class-based and data-driven entities. Loaded chunks
outside every player's simulation distance stay still, and with no online players entity AI and
movement stop. In active chunks, each entity still runs its data-driven components and goals every
tick. Targeting, attacking, and path-finding can make a dense crowd exceed the 50 millisecond tick
budget. The navigator and path-finder's block view cost about 20 microseconds per entity per tick,
down from 623, but there is no tick budget for individual goals.

**A mob's attack target is lost over a save.** The target is a runtime id, drawn fresh each
session, so saving it could point the mob at an unrelated entity after restart. A tamed mob's
owner is saved by the player's stable UUID and rebound to that player's current runtime id when
they rejoin. The other component state survives too: a save writes each entity's component groups,
property values, attributes, body state and population pool into its actor compound as JSON, and
the runtime restores it without rerunning the spawn event. A held item comes back as an identifier
rather than as a stack, which is as much as the goal seam models.

**Taming, breeding, and healing use their component data.** Right-clicking an entity checks its
active `minecraft:tameable`, `minecraft:breedable`, or `minecraft:healable` item list. A matching
tame item uses the configured probability and fires `tame_event` on success; a matching breeding
item puts an eligible adult in love; a matching healing item restores its configured health amount.
Healing also checks the component's filters and `force_use` flag. Ageable babies accept configured
feed, pause, and reset items, advancing the remaining growth time by each feed item's `growth`
fraction. Accepted interactions consume one item outside creative mode, and a declared per-item
`result_item` replaces it in the player's inventory. Healable item `effects` are not implemented; an
entry that requires status effects is declined without consuming the held item.

**The dolphin's buried treasure has no source.** `GoalWorld.poi` answers the block-backed kinds
from the world (beds, bells, the thirteen job-site blocks, doors, and whether a position is
indoors). Wardens now record `suspicious_location` when their vibration listener receives an event,
and allays update the note-block position they follow. No generator records the dolphin's
`buried_treasure`, so that goal still finds nothing.

**No mob event is ever active.** Nothing on this server runs pillager patrols or village raids, so
the host answers `minecraft:mob_event_filter` with a flat no rather than a guess, and every rule
that gates on one refuses.

**Four spawn rules have no conditions.** The blaze, cat, pillager and wither skeleton rules register
a pool and leave placement to engine code (fortress spawns, village cats, patrol placement). This
server spawns them wherever the pool cycle happens to look, which is wrong for all four.

**Structure and spawner spawning is absent.** Spawner blocks, trial spawners and structure-bound mob
lists are not spawn rules and are not implemented.
