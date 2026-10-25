---
'@jsprismarine/entity-goals': patch
---

Add `@jsprismarine/entity-goals`, which implements all 170 vanilla Bedrock AI goals against the
goal seam of `@jsprismarine/entities`. The work is driven by a generated inventory:
`utils/build-inventory.ts` reads the composed behavior pack of Bedrock Dedicated Server 1.26.51.1
and writes `src/generated/goalInventory.json` with every `minecraft:behavior.*` name, its use count
over the 129 entity files, the union of parameter keys observed under it with their JSON types, and
which entities carry it. The measured count is 170, matching the research note. A totality test
asserts every name in that file has a registered factory, so coverage cannot silently regress, and
the measured result is 170 of 170 goals and 129 of 129 entities fully covered.

Goals are grouped by family: targeting, attacking, looking, movement, social, work, environment and
the single-entity specials. Thirty of them have a Java counterpart whose class name matches after
snake-casing, and for those the constants are read out of the unobfuscated 26.3 server jar rather
than guessed, with the class named in the JSDoc: `LookAtPlayerGoal.DEFAULT_PROBABILITY` of 0.02,
`MeleeAttackGoal`'s 20-tick swing and 10-tick re-path, `LeapAtTargetGoal`'s 2-to-4-block window,
`BreedGoal`'s 8-block partner search and 60-tick courtship, `HurtByTargetGoal`'s 300-tick revenge
memory, and the rest. Where the editions differ the Bedrock parameter wins, and the JSDoc records
the difference.

Navigation is an A\* search over whole blocks against an injected `NavigationView`, governed by a
`NavigationProfile` built from the entity's `minecraft:navigation.*` component. It honors
`can_pass_doors`, `can_open_doors`, `can_open_iron_doors`, `can_break_doors`, `avoid_water`,
`avoid_damage_blocks`, `avoid_sun`, `avoid_portals`, `blocks_to_avoid`, `can_path_over_water`,
`can_path_over_lava`, `can_walk_in_lava` and the walk, fly, hover, swim, climb and generic
variants. `Navigator` is the only caller of the path finder and falls back to
`EntityActuator.moveTo` when no view is supplied, so every movement goal still runs on a server
that has not implemented the view yet.

`registerVanillaGoals(registry, { world })` wires every goal, and `createGoalEntityRegistry` builds
the registry in the order that makes these implementations win over the three reference goals the
entity runtime ships. `GoalWorld` is the second seam a server implements, beside `EntityActuator`,
and every member is optional so a goal refuses to start rather than throwing when the world cannot
answer it.
