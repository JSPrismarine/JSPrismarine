# Java decides the server-decided goal parameters

Status: accepted

A Bedrock entity definition writes each AI goal's tuning as a goal body, such as
`"look_distance": 6` in a zombie's `minecraft:behavior.look_at_player`. A Java mob passes the same
decision to its goal in `registerGoals`, such as `new LookAtPlayerGoal(this, Player.class, 8.0F)`.
On 2026-11-16 the two disagreed on 175 rows of the `entities.behavior` parity family. Examples: look
distances, tempt ranges and items, speed multipliers, target and avoid sets, owner distances, search
ranges and start intervals. Java decides them, for the reason
[ADR 0001](0001-entity-stat-authority.md) gives Java the four server-decided stats: the Bedrock
client runs no mob AI, so a goal parameter is a number only the server ever reads.

## What it covers

A goal argument Java passes, or a constant of the Java goal class that a Bedrock body overrides,
replaces the Bedrock key that means the same thing. The keys are the ones
`@jsprismarine/entity-goals`' `javaArguments.ts` writes:

- Looking: `look_distance` and `probability` of `look_at_player`, with `look_time` removed so
  `LookAtPlayerGoal.start`'s hold applies. `float` loses `chance_per_tick_to_float`, so
  `FloatGoal.tick`'s 0.8 applies.
- Wandering: `speed_multiplier` and `interval` of `random_stroll`, `random_swim` and `swim_wander`.
- Targeting: the `entity_types` of `nearest_attackable_target`, bounded by Java's target classes,
  with an entry added for each class a Java goal targets with no predicate of the mob's own. Each
  entry searches the mob's Java `follow_range`, and the goal scans on Java's `randomInterval`.
  `hurt_by_target` strikes back at every attacker except the classes Java's goal ignores, and sets
  `alert_same_type` where Java calls `setAlertOthers`.
- Fleeing: the `entity_types` of `avoid_mob_type`, one per Java `AvoidEntityGoal`, with its class,
  `maxDist` and both speed modifiers. A goal with a predicate of the mob's own keeps the pack's
  filters on top of its class, since those filters stand for the check the capture cannot carry.
- Tempting: the `items` Java's predicate reads, its speed, stop distance and `canScare`, and the
  mob's Java `tempt_range` as `within_radius`.
- Speeds: `speed_multiplier` of `panic`, `breed`, `follow_parent`, `melee_box_attack`,
  `flee_sun`, `run_around_like_crazy`, `move_towards_home_restriction`, `ranged_attack`,
  `follow_owner`, `stomp_turtle_egg`, `move_to_water`, `use_kinetic_weapon` and `move_to_village`.
  A `panic` with Java's default damage predicate also drops the pack's `damage_sources`.
- Distances: `attack_radius`, `start_distance` and `stop_distance`, `yd`, `search_range` and
  `search_height`, `approach_distance`, and the 12-block teleport of `teleport_to_owner`.

## What stays Bedrock's

Everything the client predicts or draws, and everything Java has no counterpart for, stays as the
pack writes it:

- The base movement speed a multiplier scales. ADR 0001 gives `movement_speed` to Bedrock, so a
  goal walks at Java's multiplier of Bedrock's speed.
- A ridden mount's movement, which exclusion 3 of the
  [parity claim](../data-driven/parity.md) names as client-predicted.
- Sounds, events, `priority` and `control_flags`. Java's priorities number a different goal list,
  and an event is how a Bedrock definition changes its own component groups.
- Which goals a mob runs at all. A Bedrock goal Java's class never registers is tracked in #3130.
  A goal whose code differs from Java's, rather than its numbers, is a fix to that goal, such as
  #3133 and #3134.

## How it is wired

`packages/bedrock-data/utils/java-goals/` reads every Java mob's goals and arguments out of the
pinned server jar's bytecode. It writes `src/jsp/java/entity_goals.json`, which the package exports
as `java_entity_goals`, so the server never needs the jar. The parity suite reads the jar with the
same code. `javaGoalBody` in `@jsprismarine/entity-goals` maps one Java goal onto the body keys it
means. The server's definition overlay `prismarine/src/entity/javaGoals.ts` applies it to every
entity file as it loads. That overlay resolves a Java class to a Bedrock family filter and a Java
item tag to Bedrock items.

## Consequences

A goal parameter is no longer edited in a behavior pack for the vanilla mobs: the overlay writes
over the vanilla body. A world pack that ships its own entity file for a vanilla identifier goes
through the same overlay. The parity rows derive their expectations from the same capture the
server runs, so a Mojang retune shows up as a stale capture in `capture.test.ts`, not as a silent
change.

A Java class becomes a filter over Bedrock families. Two types with the same family set cannot be
told apart that way, and the wither and the wither skeleton carry the same five families. A Java
goal that names one of them therefore matches both (#3166).
