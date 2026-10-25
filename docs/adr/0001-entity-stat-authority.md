# Which edition decides an entity stat

Status: accepted

Bedrock's entity definitions and Java Edition's attribute suppliers publish 438 of the same stats
for the same entity, and they disagree on 151 of them. Preferring one edition everywhere is wrong
in both directions, so the decision is per stat. Java decides `max_health`, `attack_damage`,
`follow_range` and `knockback_resistance`. Bedrock decides `movement_speed`, `flying_speed`,
`jump_strength`, `width` and `height`. Fifteen reviewed rows keep Bedrock's value inside a stat
Java decides, each because Java's attribute supplier publishes a number Java Edition itself never
runs with.

The table lives in [`packages/entities/src/javaStats.ts`](../../packages/entities/src/javaStats.ts)
and is the only copy. `javaAttributeBases` turns it into the attribute bases one entity spawns
with, and `statRuling` turns a measured disagreement into an accepted row with its reason, so the
parity dashboard derives its rows from the decision rather than repeating it.

## Why it splits this way

The plan's parity claim is that the server implements Java's rules for every behavior a server
decides, and the behavior the client expects where the client decides. Mob stats fall on both
sides of that line, and the dividing evidence is what the Bedrock client simulates with.

Java decides the four stats the client never computes. The client draws hearts from the health
attribute the server sends and never derives one. It reports that a swing happened and at whom,
with no damage field anywhere in `ItemUseOnActorInventoryTransaction`, so the server computes every
hit. It runs no mob AI at all, which makes the follow range purely a server number; row 227 of
[the edition-differences note](../research/edition-behavior-differences.md) classifies it as
server-decided and invisible. And knockback reaches a mob as a server-sent position delta, because
`SetActorMotionPacket` "does nothing" for an actor the client does not predict, so the resistance
that scales it is the server's alone.

Bedrock decides the five that reach the client's own simulation.
`ClientMovementPredictionSyncPacket` is the client telling the server what it predicted an actor
with, and its payload is the bounding box scale, width and height, then the movement speed, the
underwater and lava speeds, the jump strength, the health, the hunger, the friction modifier, the
bounciness and the air drag. That list is Mojang's own enumeration of the client's prediction
inputs, and five of this decision's nine stats are on it.

For the hitbox the case is stronger than prediction alone. The client draws the mob from the model
in its own resource pack and collides with the box the server sends in actor data 53 and 54. A box
that disagrees with the drawn model means aiming at a mob and missing, which is the failure the
plan's section 8 warns about, and the large rows would be grossly wrong: the ender dragon is 13 by
4 on Bedrock against Java's 16 by 8, the rabbit 0.82 by 1 against 0.49 by 0.6, the tadpole 0.8 by
0.6 against 0.4 by 0.3. Row 168 classifies entity hitboxes as mixed and visibly broken, and
exclusion 5 of the parity claim names them.

Movement speed is the one call made under real uncertainty, and it goes to Bedrock for that
reason. Java's `movement_speed` registry default is 0.7, and the dump holds exactly 0.7 for 17 of
the 93 types: armor stand, bat, cod, ender dragon, ghast, glow squid, mannequin, phantom,
pufferfish, salmon, shulker, slime, squid, sulfur cube, tropical fish, vex and wandering trader.
Every one of those moves under a control that never reads the attribute. The dump records a
resolved attribute map, so it cannot tell a value a class declared from one it inherited, and a
blanket preference for Java would make a squid seven times faster than Java's own squid. On top of
that, seven of the disagreeing rows are mounts a player rides, which exclusion 3 names as
client-predicted simulation. Where the data cannot settle a row, the option that cannot desync
wins, and that is Bedrock's.

## The wither

The loudest single row is the wither, 600 health on Bedrock against Java's 300, and it takes
Java's 300. An operator will notice a boss losing half its health, so it is worth being explicit
about why. Row 250 classifies the wither's health as server-decided and visible-and-correct, and
MCPE-127978 is not among the six behaviors that section 14 excludes as closed-by-Mojang-on-purpose.
The Bedrock number is also difficulty-scaled, 300, 450 or 600, where Java is a flat 300 on every
difficulty, so Bedrock's 600 is the Hard end of a scale this server would otherwise have to
reproduce. The armor stand moves the same way, from Bedrock's 6 to Java's 20.

## The exceptions

Every exception is a case where the Java number is published but not played.

- Horse, donkey, mule, llama and trader llama keep Bedrock's health. Java's horse supplier
  publishes 53 and randomizes the attribute at spawn to a draw from 15 to 30, which is the range
  Bedrock's health component already writes.
- Slime, magma cube and sulfur cube keep Bedrock's health, and slime and magma cube keep Bedrock's
  damage. Java sets both from the cube's size at spawn, so the dumped 20 and 2 are the
  living-entity defaults. Bedrock writes the same per-size values as component groups.
- Hoglin and zoglin keep Bedrock's damage. Bedrock writes the adult damage as a range whose mean is
  Java's number and the baby's as a separate component group, where Java halves the one attribute
  in code. Overriding the type would give a baby the adult's damage.
- The iron golem keeps Bedrock's damage. Bedrock writes the rolled range 7 to 21; Java rolls the
  same range from a base of 15. The editions agree and only the published number differs.
- The ender dragon and the armor stand keep Bedrock's knockback resistance. Java makes both immune
  in code and leaves the attribute at 0, so taking that 0 would make them knockbackable, which is
  neither edition's behavior.

## Consequences

33 of the 151 disagreements now resolve to Java's value: 21 follow ranges, 10 attack damages and 2
max healths. 118 keep Bedrock's, of which 103 are stats Bedrock decides and 15 are the reviewed
exceptions above. The corpus test in `vanillaEntities.test.ts` fails when a disagreement on a
Java-decided stat is not on the exception list, so a Mojang retune that opens a new one has to be
reviewed rather than absorbed.

Java's dump is keyed by Java's entity names, and five of the 93 are a Bedrock entity that kept the
identifier Mojang renamed away from: the evoker spawns as `evocation_illager`, the villager and
zombie villager as `villager_v2` and `zombie_villager_v2`, the tropical fish as `tropicalfish` and
the zombified piglin as `zombie_pigman`. `javaAttributeBases` resolves those through
`@jsprismarine/mapping`, which owns the identifier seam, so the decision reaches them rather than
silently passing them over.

The 113 are accepted divergences, not defects, and the parity dashboard should carry them as
allow-list rows built from `statRuling`.
