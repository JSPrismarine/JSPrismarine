---
'@jsprismarine/entities': patch
---

Decide which edition owns each entity stat the two editions disagree on.

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
