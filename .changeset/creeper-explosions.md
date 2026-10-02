---
'@jsprismarine/prismarine': minor
---

Make creepers explode, and align knockback with vanilla's.

**`entity/Explosion.ts`** is a blast given a power rather than a creeper's method, because everything that explodes explodes the same way and differs only in how hard: TNT is 4, a creeper 3, a charged one 6. The damage curve is vanilla's - `((impact² + impact) / 2) × 7 × diameter + 1` - and it is steep on purpose, so a creeper at point blank does forty-three half-hearts and kills an unarmoured player outright while one at four blocks costs a couple.

Cover works. A ray is walked from the blast to the middle of each body and anything solid on the way stops it, so a wall between you and a creeper protects you. Deliberately all-or-nothing where vanilla grades a corner by sampling a grid of rays through the whole box - cheaper, and it gets the case that matters right. One thing that is *not* treated as cover is an unloaded chunk: `BlockView.isSolid` answers "yes" for anything not in memory, which is the correct conservative answer for a pathfinder and exactly the wrong one here, since it would have made a blast at the edge of the loaded world silently harmless.

Blocks are removed as a sphere, gated on `mobGriefing`, and checked by *name* against a blast-proof list rather than through the block registry - the registry knows a fifth of the blocks the client does and returns air for the rest, so a blast-resistance check through it would quietly decide most of the world was air and blow up the lot.

**`SwellGoal`** is the fuse. It is a goal and not an argument to `MeleeAttackGoal` because a creeper's attack is a *timer*: it stops, hisses, and is interruptible for a second and a half, none of which a swing has any concept of. Backing away puts it out, which is the point of the mob - a creeper is something you beat by moving rather than something that simply costs you health. It escapes at a wider range than it ignites at, so a target circling the boundary does not light and snuff it every other tick.

**Mob metadata can now reach a client at all**, which the fuse needed and which had exactly the same shape as the attribute gap fixed earlier: everything that sent metadata had the local player's runtime id baked in, so it arrived once, inside the packet that spawned the entity. A creeper could light its fuse and a mob could catch fire with nobody ever seeing either. `WorldChangeSink` gained `entityMetadataChanged`.

**Knockback now matches vanilla, and was too strong.** Vanilla shoves *twice* for a sprint hit - once from being hurt and once from the attack - and each shove halves whatever the last one left before adding its own. Modelling that as one combined impulse of `0.4 + 0.5` is not the same thing and is noticeably harder: it sent a sheep half again as far as vanilla does. The composition is now exact, so a sprint hit both throws less far and cancels more of the run the target was making. A plain hit is unchanged.
