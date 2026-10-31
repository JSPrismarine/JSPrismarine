# @jsprismarine/entities

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a825e54`](https://github.com/JSPrismarine/JSPrismarine/commit/a825e5478baccfc586fc3acd3fd5d8d9fc17a02d) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement piglin admire and barter interactions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`582536f`](https://github.com/JSPrismarine/JSPrismarine/commit/582536f53c4ed407b065155dc6dce7f5f48982d8) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry out the event actions, fire the `minecraft:on_*` triggers, and give the components that
  measure most real behavior. The package parsed the vanilla pack well and then did almost nothing
  with it: 16 of the 157 implemented components carried behavior, every event action was collected
  raw and reported, and nothing fired the eleven trigger components.
  
  **Event actions.** Nine keys parse into an `EntityAction` and run. Eight are everything the composed
  vanilla pack writes, measured over its 850 events: `play_sound` 23 uses, `set_home_position` 17,
  `emit_vibration` 9, `drop_item` 2, `execute_event_on_home_block` 2, and one each of
  `emit_particle`, `reset_target` and `stop_movement`. The ninth is `queue_command`, which the
  documentation describes and no vanilla entity uses. Six leave through the new
  `EntityEnvironment.effects` seam; `set_home_position` and `stop_movement` go through the actuator
  and `reset_target` clears the attack target the entity now owns. An action key the package does not
  parse, a body it cannot read, and an action whose environment member a caller left out each reach
  the report.
  
  **Damage and triggers.** `EntityInstance.damage` applies the damage instead of only offering it to
  the components. The sensors decide the amount with the damager answering the `damager` and `other`
  filter subjects, `minecraft:fire_immune` and `minecraft:freezing_immune` turn their causes aside
  after the sensors have seen them, the rest comes off the `health` attribute, and
  `minecraft:on_hurt`, `minecraft:on_hurt_by_player` and `minecraft:on_death` fire in that order.
  `setAttackTarget` fires the two target triggers. `EntityInstance.trigger` is the firing point for
  all eleven; the six that name equipment, fire, flight, sleep and friendly anger wait for a caller.
  
  **Components.** `minecraft:hurt_on_condition` (87 of the 129 vanilla entities),
  `minecraft:breathable` (84), `minecraft:ageable` (35), `minecraft:ambient_sound_interval` (32),
  `minecraft:rideable` (36), `minecraft:angry` (20) and `minecraft:damage_over_time` (3) stopped being
  parse-only. `minecraft:despawn` now leaves a `minecraft:persistent` entity alone, and
  `minecraft:timer` and `minecraft:environment_sensor` honor a `target` other than `self` through the
  new `EntityInstance.raise`. 37 of the 157 implemented keys carry behavior, up from 16.
  
  **Breaking.** `EntityInstance.damage` returns a `DamageResult` rather than a `DamageOutcome`,
  `EventAction` gained a `parsed` member, `TriggerComponentParams` and `RideableParams` moved to their
  own modules with `target` narrowed from `string` to `EventTarget`, and `TRIGGER_COMPONENTS` is now a
  tuple of its eleven names.
  
  `@jsprismarine/bedrock-data` exports the Java attribute golden as `java_entity_attributes`, which
  the entity corpus test measures the Bedrock stats against: 423 stats are published in both editions
  and 279 agree.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`da1793e`](https://github.com/JSPrismarine/JSPrismarine/commit/da1793e286c051351c49dfb1e35b002a6e787bce) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix two gaps the written entity classes were covering, found by connecting real clients to a
  server running the data path alone.
  
  A data-driven mob dropped nothing when it died. `EntityRuntime.kill` read the loot table off the
  resolved type, which only ever sees an entity's base components, and 29 of the 128 vanilla entity
  files declare `minecraft:loot` only inside a component group. The cow carries it in
  `minecraft:cow_adult`, so every cow, pig, sheep and chicken in the world died empty-handed. The
  table is now read off the live instance through `EntityInstance.lootTable()`, which sees the
  groups the entity's spawn event turned on, and falls back to the type.
  
  `minecraft:behavior.mount_pathing` started on nothing more than the entity having a target. The
  adult zombie carries it at priority 2 and `minecraft:behavior.melee_box_attack` at priority 4, and
  both claim the `move` and `look` control flags, so the moment a zombie picked a player it took
  those flags off every goal below it and stood still. Mojang's wording for the goal is "while
  mounted", and it now refuses unless the entity is riding something.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f4ec478`](https://github.com/JSPrismarine/JSPrismarine/commit/f4ec4787eb307bbeefe5d51034f43b0728088c55) Thanks [@filiphsps](https://github.com/filiphsps)! - Add slot-based equipment-change triggers to data-driven entities

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`35dc8ab`](https://github.com/JSPrismarine/JSPrismarine/commit/35dc8ab56ba8acf18a68357c3c0ca1e4ed1f8801) Thanks [@filiphsps](https://github.com/filiphsps)! - Use each entity's navigation and physics data, and place spawned mobs at their correct feet positions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3f0e622`](https://github.com/JSPrismarine/JSPrismarine/commit/3f0e6228843e07f161a665424b7d7fad69273188) Thanks [@filiphsps](https://github.com/filiphsps)! - Use loaded crafting recipes for `minecraft:shareables` rules with `craft_into` when entities share items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0d64a00`](https://github.com/JSPrismarine/JSPrismarine/commit/0d64a00ec60a7c2064030bfdcec0b2ca26de5236) Thanks [@filiphsps](https://github.com/filiphsps)! - Fire `minecraft:on_start_landing` when an airborne data-driven entity lands.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`376f8e2`](https://github.com/JSPrismarine/JSPrismarine/commit/376f8e258ba349d5fa5d7c496b3aa6b8045dec46) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the `play_sounds` effects declared by `minecraft:interact` entries.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`91eaefa`](https://github.com/JSPrismarine/JSPrismarine/commit/91eaefae197242e2476901190792924edcabb0fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven proximity and one-shot status effects.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b194cc3`](https://github.com/JSPrismarine/JSPrismarine/commit/b194cc3b8a647bd944f78b60903cf23edcc04d1b) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement `minecraft:combat_regeneration`, including self and same-family rewards when an attack target dies.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9617d18`](https://github.com/JSPrismarine/JSPrismarine/commit/9617d187fd9dad87384a46b57548d94441123eeb) Thanks [@filiphsps](https://github.com/filiphsps)! - Read mate and offspring rules from minecraft:offspring_data and retain legacy offspring support.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c59762e`](https://github.com/JSPrismarine/JSPrismarine/commit/c59762eb7d8d7e58bd477e48de087667c565045b) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven entity sensors

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2e922ce`](https://github.com/JSPrismarine/JSPrismarine/commit/2e922ce3b1e06c27fbcfac65d2d01a977f2e5ccc) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement the data-driven target-nearby sensor

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa) Thanks [@filiphsps](https://github.com/filiphsps)! - Load the shipped vanilla pack stack in strict mode, and report the files behind a collapsed
  diagnostic.
  
  A Bedrock definition file that fails structural parsing is still an error, unless a later pack in
  the stack provides the same pack-relative path. That copy replaces the broken one whole, so the
  broken file cannot reach the composed result and a warning is enough. The BDS vanilla layers need
  this rule: two of them carry an `entities/npc.json` that patches a saved pack rather than defining
  an entity, and the 1.20.80 layer carries the real one. Strict mode now fails on errors alone, which
  is what `DiagnosticSeverity` already documented, so `load(bdsVanillaLayers, { strict: true })`
  succeeds.
  
  `DiagnosticCollector` still collapses repeats of one pack, code and message into a single
  diagnostic, because a pack-wide pattern should cost one line of the report. A collapsed diagnostic
  now carries `occurrences`, the number of files it covers, and `paths`, the first five of them, so a
  per-file finding that happens 28 times no longer reads as one.
  
  `@jsprismarine/entities` drops `normalizeFilterSource`, which rewrote two vanilla filter shapes the
  packs grammar once rejected and now accepts. All 982 filter values in the BDS layers and
  bedrock-samples parse to the same result without it. `parseEntityFilter` is the packs parser under
  the entities name.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`59a3e5c`](https://github.com/JSPrismarine/JSPrismarine/commit/59a3e5c5b910027bcb07b47ed65faa177a2c8d98) Thanks [@filiphsps](https://github.com/filiphsps)! - Handle matching spawn eggs through the spawn_egg_interaction component hook.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3a673cf`](https://github.com/JSPrismarine/JSPrismarine/commit/3a673cf89f9c11a8c3ba503c7a62dfc21ca1b5b0) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven entity teleport behavior

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`931294b`](https://github.com/JSPrismarine/JSPrismarine/commit/931294b82cad6bc2ed4d65a68c36e3c7c560bf00) Thanks [@filiphsps](https://github.com/filiphsps)! - Register the charged creeper marker and project its powered actor flag.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bf9bb09`](https://github.com/JSPrismarine/JSPrismarine/commit/bf9bb0905c5278e4ffc2fd88a7eebe62db6c7ea3) Thanks [@filiphsps](https://github.com/filiphsps)! - Project vanilla actor marker components to client metadata.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c0ccdfe`](https://github.com/JSPrismarine/JSPrismarine/commit/c0ccdfeb805c0869006d380408dc74f84496ddaf) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement angry component broadcasts with nearby filters and target propagation.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`985c08e`](https://github.com/JSPrismarine/JSPrismarine/commit/985c08e1f93cbb557a8ce8be02fb2e0a04587f31) Thanks [@filiphsps](https://github.com/filiphsps)! - Drive baby growth from ageable feed item data and honor configured result items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`609b543`](https://github.com/JSPrismarine/JSPrismarine/commit/609b543617f8731ab597322cf5a6132e4d4ca519) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/entities`, the Bedrock entity definition, component and event runtime. It parses
  the five top-level keys of an entity file structurally and reports an unknown key rather than
  refusing the file, dispatches on `format_version` for the four gated features, and resolves
  `components` and `component_groups` once at load through `@jsprismarine/content`. The event engine
  determines an event's effects immediately and applies them on the entity's next tick, with `add`,
  `remove`, `sequence`, weighted `randomize` against an injectable random source, `first_valid`,
  `trigger` with target routing and a cycle guard, and `set_property`; re-adding an active component
  group re-initializes its components. Entity properties carry the four types with range clamping and
  Molang defaults. The filter evaluator covers all 107 documented tests over a context of eight entity
  subjects plus item, block and world views, reusing the grammar and both encodings from
  `@jsprismarine/packs`. The goal seam is a `GoalFactory` plus a priority scheduler over the `move`,
  `look` and `jump` control flags, with three reference goals. 157 of the 202 non-goal component keys
  vanilla uses are implemented, which covers every non-goal component of 102 of the 129 vanilla
  entities.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`97fde37`](https://github.com/JSPrismarine/JSPrismarine/commit/97fde374f2812e33f4b6a71bbbcf268b78963700) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply entity attack protection and attacker exception filters from entity data.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03e6df9`](https://github.com/JSPrismarine/JSPrismarine/commit/03e6df9845bc83a24309e667bb10a7bcd17c2d88) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply lethal entity events before removal and finish the data-defined Ender Dragon death behavior.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d29e1d4`](https://github.com/JSPrismarine/JSPrismarine/commit/d29e1d4ef750af20698531f32a3e36040312d3a9) Thanks [@filiphsps](https://github.com/filiphsps)! - Emit named particles declared by `minecraft:interact.particle_on_start`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c1f0bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f0bc3fe5abfffa6c43d9cc44a407e4e25fd10a) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor `minecraft:interact.swing` and relay successful interaction animations to clients tracking the player.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cd8645c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd8645c9b8bfcb48162a0c9f99a5d4c7449ea613) Thanks [@filiphsps](https://github.com/filiphsps)! - Decide which edition owns each entity stat the two editions disagree on.
  
  The cross-check against Java's attribute dump measured 423 stats both editions publish for the same
  entity and found 144 disagreements, and it recorded them as findings while running on Bedrock's
  numbers. `src/javaStats.ts` now decides them per stat. Java decides `max_health`, `attack_damage`,
  `follow_range` and `knockback_resistance`, the four a Bedrock client never computes for itself: it
  draws hearts from an attribute the server sends, carries no damage field on an attack, runs no mob
  AI, and takes knockback as a server-sent position delta. Bedrock decides `movement_speed`,
  `flying_speed`, `jump_strength`, `width` and `height`, which `ClientMovementPredictionSyncPacket`
  lists among the inputs the client predicts an actor with, and which for the hitbox also have to
  match the model the client draws.
  
  31 disagreements resolve to Java, so a wither spawns with 300 health instead of 600 and a witch
  follows from 16 blocks instead of 64. 98 keep Bedrock's value because Bedrock decides the stat, and
  15 are reviewed exceptions where Java's supplier publishes a number Java Edition overwrites at
  spawn, such as the horse's 53 health or a slime's size-scaled 20. The reasoning is in
  `docs/adr/0001-entity-stat-authority.md` and decision 11 of `docs/plans/data-driven-vanilla.md`.
  
  `EntityEnvironment` gains an optional `javaStats` source, so passing
  `@jsprismarine/bedrock-data`'s `java_entity_attributes` turns the decision on; leaving it out runs
  the pack's own numbers as before. `Attributes` takes the resolved bases as a constructor argument,
  and `statRuling(identifier, stat)` turns a measured disagreement into an accepted row with its
  reason, so the parity dashboard derives its allow list from the decision rather than repeating it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f94da48`](https://github.com/JSPrismarine/JSPrismarine/commit/f94da4841180543ba50be440c4bc796a8a472fcb) Thanks [@filiphsps](https://github.com/filiphsps)! - Enforce the cooldown and post-damage cooldown declared by `minecraft:interact`.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`701c6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/701c6e7e83b91ae2eaa8aa2bbadbf049c6ef75cf) Thanks [@filiphsps](https://github.com/filiphsps)! - Load falling blocks from entity data and simulate their configured fall and landing behavior through the live entity runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6237d25`](https://github.com/JSPrismarine/JSPrismarine/commit/6237d2570ef950f83dcc0111de283340ff35aca3) Thanks [@filiphsps](https://github.com/filiphsps)! - Move tameable item behavior into component hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1d905e2`](https://github.com/JSPrismarine/JSPrismarine/commit/1d905e27de007bc64a3f8c4f3c87c46955573e2a) Thanks [@filiphsps](https://github.com/filiphsps)! - Normalize legacy entity offspring data at type resolution and use the canonical component at runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c132c90`](https://github.com/JSPrismarine/JSPrismarine/commit/c132c9073992d5a0e8a7f9203298ec8711b0d585) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven area attacks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b503085`](https://github.com/JSPrismarine/JSPrismarine/commit/b503085d2c068c27dbb4087e00e3e1a12a42e384) Thanks [@filiphsps](https://github.com/filiphsps)! - Use the declared default for underwater movement

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`67546be`](https://github.com/JSPrismarine/JSPrismarine/commit/67546bec49a4f299b2be9b54b10a7d42865884a9) Thanks [@filiphsps](https://github.com/filiphsps)! - Support entities spawned by minecraft:interact

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`542da3b`](https://github.com/JSPrismarine/JSPrismarine/commit/542da3b62a4895905847cd14c0952a97d254d472) Thanks [@filiphsps](https://github.com/filiphsps)! - Read vanilla entity air drag, ground friction, and bounciness from active component data.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8196ea9`](https://github.com/JSPrismarine/JSPrismarine/commit/8196ea9e576d0acc3e17fe6b159791e25dc1092e) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor `minecraft:transient` by excluding those entities from saved actor records.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`62df686`](https://github.com/JSPrismarine/JSPrismarine/commit/62df68684596605007aef673182fc0b5d61d1a1f) Thanks [@filiphsps](https://github.com/filiphsps)! - Run nameable entity behavior through the data-driven runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2bea6ac`](https://github.com/JSPrismarine/JSPrismarine/commit/2bea6ac82e3a0a100ee254c7e536df73262bef9f) Thanks [@filiphsps](https://github.com/filiphsps)! - Expose mapped Java entity type tag memberships on resolved entity types and live entities.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c67300a`](https://github.com/JSPrismarine/JSPrismarine/commit/c67300a6cef6ec68daa9f720bc31c7f238874e01) Thanks [@filiphsps](https://github.com/filiphsps)! - Honor hurt_item in data-driven entity interactions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0d53afd`](https://github.com/JSPrismarine/JSPrismarine/commit/0d53afdc4b0f42260231d56bbdeb2b4874f8bae7) Thanks [@filiphsps](https://github.com/filiphsps)! - Project entity interaction text to actor metadata

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d647e47`](https://github.com/JSPrismarine/JSPrismarine/commit/d647e4746b3533fbc61afac8414b749a253a32c1) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply data-driven `minecraft:interact.health_amount` effects and expose `is_missing_health` from an entity's health attribute.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7b70cc7`](https://github.com/JSPrismarine/JSPrismarine/commit/7b70cc76fb8f1584746b76ee406ad48811d5d6a2) Thanks [@filiphsps](https://github.com/filiphsps)! - Reach Java's stats for the five entities the pack still names the way Bedrock used to.
  
  `javaAttributeBases` looked an entity up in Java's attribute table by the identifier it spawned under, and that table is keyed by Java's names. Five of the 93 types it holds are a Bedrock entity that kept its older identifier: the evoker spawns as `evocation_illager`, the villager and zombie villager as `villager_v2` and `zombie_villager_v2`, the tropical fish as `tropicalfish` and the zombified piglin as `zombie_pigman`. None of them found their row, so the stat decision never applied to any of them. Two showed it in a value an operator can see: Bedrock's evoker followed from 64 blocks where Java's follows from 12, and Bedrock's villager from 128 where Java's follows from 16.
  
  The lookup now goes through `javaEntityTypeToBedrock` from `@jsprismarine/mapping`, which owns the Java to Bedrock identifier seam, so the renames are read off that table rather than copied here. A Bedrock identifier several Java types map onto, such as the one every boat variant lands on, is left alone, because there is no single Java row to take. `javaEntityStats` is exported for a caller that needs the row itself.
  
  The corpus test used to walk the Java table by name and skip anything the Bedrock registry did not have under that name, which is why it could not see this. It now resolves each type the same way, so the comparison covers 438 stats rather than 423, and the five are no longer invisible to it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`68cef3f`](https://github.com/JSPrismarine/JSPrismarine/commit/68cef3f794575714fef335397e8d6e21aa7ae512) Thanks [@filiphsps](https://github.com/filiphsps)! - Parse every vanilla entity component body

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7562d04`](https://github.com/JSPrismarine/JSPrismarine/commit/7562d044dae9cefb977dc5f24a9a82c7121d8365) Thanks [@filiphsps](https://github.com/filiphsps)! - Gate entity ticking by simulation distance and reuse filter views

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c5ae5e6`](https://github.com/JSPrismarine/JSPrismarine/commit/c5ae5e6e2e231751c82840c05dbc34435ccd7304) Thanks [@filiphsps](https://github.com/filiphsps)! - Avoid allocating family lists in goal neighbor checks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cd3077c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd3077c55d5ee9984512f8e34660e7aae5b55680) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined ageable pause and reset effects.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`321a017`](https://github.com/JSPrismarine/JSPrismarine/commit/321a0170b36a2946fa3d06fe5924336222275de2) Thanks [@filiphsps](https://github.com/filiphsps)! - Route tame and breed interactions through entity data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fee1601`](https://github.com/JSPrismarine/JSPrismarine/commit/fee1601bb697b8ba9625b0d10e292d66f33d3391) Thanks [@filiphsps](https://github.com/filiphsps)! - Cut what a vanilla mob costs to tick, without changing a decision it takes.
  
  Path finding was nearly all of it, and almost none of that was the search itself. One node expansion
  asked the world about the same cell several times over. The node tested its own cost, each of its
  eight neighbors tested the two cells a diagonal would cut past, and every cell a node bordered was
  asked again when that cell was itself expanded. Ninety block reads per expansion. A `CellReader` per
  search keeps each answer, hands the view one position object instead of allocating one per read, and
  keys its memo on a packed integer rather than an `"x,y,z"` string. A node now costs about
  twenty-five reads.
  
  `findPath` also refuses outright when no cell within the goal radius is one the profile could stand
  in. A search succeeds only by popping a node inside that radius, and every node but the root came
  out of the enterable test, so such a search cannot succeed whatever it does. Saying so costs a few
  dozen block reads instead of the whole 512-node budget. That is where the tick spikes lived.
  `minecraft:behavior.flee_sun`, `find_cover`, `move_to_land` and `avoid_mob_type` draw up to ten
  candidate destinations and ask whether each is reachable, and a candidate three blocks in the air
  was costing the full budget: half a million block reads in one `canStart`, on every mob standing in
  daylight, on the same tick.
  
  `GoalScheduler` keeps its priority order between ticks rather than sorting the entry map three times
  a tick with a `localeCompare` comparator. The comparator is unchanged, so the order is the one it
  already produced.
  
  Measured over real vanilla entity definitions, thirty mobs around a player: the mean per-mob cost
  fell from 290 to 15 microseconds a tick, the 99th-percentile whole tick from 350 ms to 6 ms, and the
  worst tick from 1879 ms to 12 ms. At a hundred mobs the worst tick fell from 3571 ms to 42 ms. Every
  goal decision and every resulting path is unchanged, checked by digesting which goals ran on which
  mob and where each mob stood, every tick, over five seeded scenarios.
  
  The `entity-goals` bump is `minor` because `NavigationView` now states that the path finder hands
  every call the same position object. A view that reads the three numbers and answers, which is what
  the package's own `voxelGrid` and the server's view both do, needs no change. One that kept the
  object or keyed a cache on it does.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a0c479e`](https://github.com/JSPrismarine/JSPrismarine/commit/a0c479e0ab28de8ba46bac842ddc90a50d9e679f) Thanks [@filiphsps](https://github.com/filiphsps)! - Give a mob the equipment its table rolls, and show it to the clients watching.
  
  `minecraft:equipment` was parsed and thrown away. Its factory returned `{}`, so no mob ever rolled
  its table: a census of 90 live bodies found none holding an item, and `Entity.setHeldItem` had no
  callers anywhere. A skeleton fired from an empty fist, and the villager's trade offer and the
  enderman's carried block were written to `MobBody.carried` by the goals and read back only by other
  goals, because nothing mirrored them onto the body a client is sent.
  
  Bedrock drives mob gear from a loot table where Java hardcodes it in
  `Mob.populateDefaultEquipmentSlots`, so the component's `table` is the reference for what a mob
  spawns holding. Those tables are the behavior pack's own and Java has no counterpart: its registry
  carries `entities/skeleton` but no `entities/skeleton_gear`, and its only three `equipment/` tables
  are trial chamber ones. The roll therefore reads `definitions.lootTables` through the evaluator in
  `@jsprismarine/loot` rather than through a second evaluator written for it. Which slot a rolled item
  lands in comes from the item's own `minecraft:equippable`, so a table naming `minecraft:iron_helmet`
  dresses the head without a table of identifiers here going stale.
  
  Pools this evaluator cannot gate are left out. `@jsprismarine/loot` implements modern Java, where a
  pool carries one `condition`; Bedrock still writes the older plural `conditions` array and adds a
  pool-level `tiers`. A condition that is not read is a condition that does not gate, and handed
  `zombie_equipment.json` whole the evaluator armed 2000 of 2000 zombies where vanilla arms about one
  in twenty. What survives the pruning is each mob's signature weapon, the part that fires
  unconditionally in vanilla too: measured against a running server, 13 of the 18 vanilla types that
  carry the component get theirs, among them the skeleton's bow, the pillager's crossbow, the
  vindicator's axe, the wither skeleton's stone sword and the piglin's golden one. What is dropped is
  the chance-gated extras and the tiered armor sets, for which absent is both the safe direction and
  the common vanilla outcome. Reading the rest needs a Bedrock loot dialect in `@jsprismarine/loot`.
  
  Equipment reaches a client through one write funnel, the shape `blockentity/blockEntityWrite.ts`
  set. A revision counter answers whether anything was written at all, which on an ordinary tick is
  false for every entity in the world, and a write whose encoded bytes match what the body already
  carries is dropped before `WorldChangeSink.entityEquipmentChanged` hears about it. Over 300 ticks
  with 22 armed mobs in view, a real client received four equipment packets, every one of them for a
  mob that had just spawned and none for a mob it had already been told about; an unguarded per-tick
  write would have sent 13,200, and the same window carried 20,440 movement packets.
  
  `PlayerSession.sendEquipmentFor` is new and serves any entity, where `sendArmorFor` reads a
  `Human`'s armor container and so could not serve a mob. `WorldChangeSink` gains
  `entityEquipmentChanged`, which every implementer must now answer.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d490871`](https://github.com/JSPrismarine/JSPrismarine/commit/d49087199730fb9eac7d8ee1976ad36df8475394) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven inside block notifications.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b98742b`](https://github.com/JSPrismarine/JSPrismarine/commit/b98742b80037c69e51cf6059bff2b45147e6a53e) Thanks [@filiphsps](https://github.com/filiphsps)! - Project ignited marker state to client actor metadata.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`68febb8`](https://github.com/JSPrismarine/JSPrismarine/commit/68febb838436b90836c311f7cc435676dff5a438) Thanks [@filiphsps](https://github.com/filiphsps)! - Project Bedrock marker components to matching actor flags.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c32bfed`](https://github.com/JSPrismarine/JSPrismarine/commit/c32bfededb57b65bab45897dda54e0fa621d0ff1) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Java-derived mob navigation and path costs, and separate overlapping mobs during movement.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5121b88`](https://github.com/JSPrismarine/JSPrismarine/commit/5121b88dab4fbfd3c6f14476ef2ae0014a710086) Thanks [@filiphsps](https://github.com/filiphsps)! - Support entity item repair interactions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`738a665`](https://github.com/JSPrismarine/JSPrismarine/commit/738a66555ddfad7912d7b6c61f28e78a575996cc) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement the remaining data-driven `minecraft:angry` target, sound, and broadcast behavior.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-driven entity dyeing through the item behavior runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5445a16`](https://github.com/JSPrismarine/JSPrismarine/commit/5445a16a437bddc8726e71d4ae135d5286e351bb) Thanks [@filiphsps](https://github.com/filiphsps)! - Record an entity's spawn position as home when `minecraft:home` activates.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0e7d345`](https://github.com/JSPrismarine/JSPrismarine/commit/0e7d345611f49a463d03f3762f3006f5cab2aaf6) Thanks [@filiphsps](https://github.com/filiphsps)! - Emit vibration game events for data-defined interactions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`259282c`](https://github.com/JSPrismarine/JSPrismarine/commit/259282cf8da2397f26bea2bea8816eb6e4ec91d4) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply configured status effects from healable entity items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`949785e`](https://github.com/JSPrismarine/JSPrismarine/commit/949785e4be1ae2ffd834354fefe993990d5000d6) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` item names, tags, priorities, and pickup limits when entities collect drops.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined interaction loot tables, resolve legacy Bedrock item variants, and preserve item counts and drop offsets.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a1c9fe5`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c9fe587b5d6eb19a990c16766962c49f9614fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Move healable item behavior into its data-driven component

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d304979`](https://github.com/JSPrismarine/JSPrismarine/commit/d3049792f9f15adc6936c8049c56a913732ce036) Thanks [@filiphsps](https://github.com/filiphsps)! - Parse equip and drop interaction slots, and scan all slots for item filters

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9258ef1`](https://github.com/JSPrismarine/JSPrismarine/commit/9258ef152ef8c0802eefc2cad93e1f8ddb950f46) Thanks [@filiphsps](https://github.com/filiphsps)! - Run ageable pause and reset effects, and drop data-defined items when entities grow up.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`13147a3`](https://github.com/JSPrismarine/JSPrismarine/commit/13147a33e36e0f0a00fc5935b9b7f4862e8d686d) Thanks [@filiphsps](https://github.com/filiphsps)! - Track player bed-sleeping state so cats can fire `minecraft:on_wake_with_owner` when their
  owner wakes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3c86e27`](https://github.com/JSPrismarine/JSPrismarine/commit/3c86e279350e4b8dd7c67c6ab84e9ab5b617faea) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-driven `minecraft:spawn_entity` timers through the live entity runtime.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e3fbb5f`](https://github.com/JSPrismarine/JSPrismarine/commit/e3fbb5f7f4db31c80f4d07a51065fc3b28a726c6) Thanks [@filiphsps](https://github.com/filiphsps)! - Parse `minecraft:strength` and include strength-based slots in entity inventory capacity.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1b08aed`](https://github.com/JSPrismarine/JSPrismarine/commit/1b08aed5a46a79b19ee36c0cc644c958663d3c4b) Thanks [@filiphsps](https://github.com/filiphsps)! - Simulate the data-driven daylight burning component.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`aedac18`](https://github.com/JSPrismarine/JSPrismarine/commit/aedac183fbdabb86c1140c67feab3cf21b8f0ce9) Thanks [@filiphsps](https://github.com/filiphsps)! - Fire `minecraft:on_start_takeoff` after a data-driven entity's ground jump.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`163c611`](https://github.com/JSPrismarine/JSPrismarine/commit/163c611a935d954736c43f98aad3bf7ffa875917) Thanks [@filiphsps](https://github.com/filiphsps)! - Move ageable result_item handling into the component hook

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d06d825`](https://github.com/JSPrismarine/JSPrismarine/commit/d06d8258b8a875f15fbf4ae7b5a249377639742c) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply configured status effects on melee attacks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7ddfa43`](https://github.com/JSPrismarine/JSPrismarine/commit/7ddfa4319dcf42685218014950ad48dafbacc051) Thanks [@filiphsps](https://github.com/filiphsps)! - Move breed item handling into component hooks

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`de16ae0`](https://github.com/JSPrismarine/JSPrismarine/commit/de16ae07c1f0167885a280a1fc91030b9fbfe0cf) Thanks [@filiphsps](https://github.com/filiphsps)! - Let spawn egg handlers decline unrelated item interactions.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c) Thanks [@filiphsps](https://github.com/filiphsps)! - Serve the vanilla behavior pack alone, and let Mojang's content load without 55 warnings about
  itself.
  
  The default stack handed the whole BDS `behavior_packs` folder to the loader, so a default build
  served the editor pack's five `editor:` entities, chemistry's balloon and ice bomb, and eight
  chemistry reducer recipes that won over the vanilla recipes of the same name. It now composes the
  packs it was asked for, by the header UUID a world references a pack by, and the default asks for
  the vanilla behavior pack: 129 entity types rather than 136. `PackStackRequest.bedrockPacks` names
  more packs by UUID, or `'all'` composes the folder whole, for a server that does want chemistry or
  the editor.
  
  A clean build reported 102 warnings and no error. 26 of them were the `"events": null` an entity
  with no events is written with, and 26 the empty `"remove": {}` of a randomize branch that changes
  nothing; the parser already read both correctly, so the warnings only taught an operator to skip
  the report. Both are silent now, and an events key that is neither an object nor null, and a
  `component_groups` that is there and is not a list, still report. What is left is 47 warnings that
  each name something the server does not do, and an unknown component now names the first file that
  declared it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03e7f72`](https://github.com/JSPrismarine/JSPrismarine/commit/03e7f729a0fd42a8c6cb42582914f646b4a6762d) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply minecraft:interact add_items loot to the player inventory.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`5a1ab40`](https://github.com/JSPrismarine/JSPrismarine/commit/5a1ab4010008ca1065cc934efb11701831d2c8ac) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined entity interaction filters, events, and held-item transformations through the live inventory.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2e24f49`](https://github.com/JSPrismarine/JSPrismarine/commit/2e24f499570960f91e53c0388e6ea00a7f662116) Thanks [@filiphsps](https://github.com/filiphsps)! - Implement data-driven block sensors and route nearby block breaks.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2291a0d`](https://github.com/JSPrismarine/JSPrismarine/commit/2291a0d0ce40d73af8eb09cf0e46cfa2ab79db5c) Thanks [@filiphsps](https://github.com/filiphsps)! - Support entity take-item interactions
- Updated dependencies [[`428fd29`](https://github.com/JSPrismarine/JSPrismarine/commit/428fd2953c93ea8472696575798735a4a36ec51b), [`232a1ce`](https://github.com/JSPrismarine/JSPrismarine/commit/232a1ce20b5ade2e33b703300fb671f0c3f62076), [`cde1039`](https://github.com/JSPrismarine/JSPrismarine/commit/cde1039d276df8d3787b361e072fafdb32a6da9a), [`f8a43ce`](https://github.com/JSPrismarine/JSPrismarine/commit/f8a43ce910da3d8e1c88091c8886a7c1d09ab0c0), [`e96d1b7`](https://github.com/JSPrismarine/JSPrismarine/commit/e96d1b76f18207192a9e815e6a2a558a8c4005ff), [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa), [`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`d66cf52`](https://github.com/JSPrismarine/JSPrismarine/commit/d66cf527b79391e194f85137e1e5b573993c7947), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`f370405`](https://github.com/JSPrismarine/JSPrismarine/commit/f37040563ed0cac590fe971ef3a448cb2e01a581), [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42), [`c9cafc8`](https://github.com/JSPrismarine/JSPrismarine/commit/c9cafc8529e05fe90ea2812920feb76cbcaf4a1b), [`8518afc`](https://github.com/JSPrismarine/JSPrismarine/commit/8518afc7b9ee684ebe4255ce26e7b56d612a145a), [`4355293`](https://github.com/JSPrismarine/JSPrismarine/commit/4355293f75d669659511516448b9c600900c351b), [`db4b039`](https://github.com/JSPrismarine/JSPrismarine/commit/db4b039894d90ab3a7ee6fc700728adadfc678f5), [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0), [`0626058`](https://github.com/JSPrismarine/JSPrismarine/commit/06260585d51d8ce0668b7cf854663bb1aea9aee9), [`2fcd89f`](https://github.com/JSPrismarine/JSPrismarine/commit/2fcd89f8ff551915692aedca68cd556735432590), [`91fcf8b`](https://github.com/JSPrismarine/JSPrismarine/commit/91fcf8b9a7c4334c8fab86bc4fae2b94356351d5), [`015a810`](https://github.com/JSPrismarine/JSPrismarine/commit/015a8102014c24f224797dec0b1919d3a045e1c3), [`29aa940`](https://github.com/JSPrismarine/JSPrismarine/commit/29aa940e8ddc1db5bf37b213179adad8e3eb21a5), [`78694d1`](https://github.com/JSPrismarine/JSPrismarine/commit/78694d1577b8bc994963b5eb53d712858ee363df), [`908645b`](https://github.com/JSPrismarine/JSPrismarine/commit/908645b1f8ea87a6e511dbe25675f39760b41627), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`32ce6f2`](https://github.com/JSPrismarine/JSPrismarine/commit/32ce6f2f752e7e89c4445d1936e13a6e243a3a30), [`9e53c61`](https://github.com/JSPrismarine/JSPrismarine/commit/9e53c61399266bf9e26dd87160c45ccd251a21f8), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c), [`bed113d`](https://github.com/JSPrismarine/JSPrismarine/commit/bed113d91a2de02b80d5688c3f43eadf802271c4)]:
  - @jsprismarine/mapping@0.16.0
  - @jsprismarine/packs@0.16.0
  - @jsprismarine/content@0.16.0
  - @jsprismarine/molang@0.16.0
