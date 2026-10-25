---
'@jsprismarine/prismarine': patch
---

Drop the content checks that nothing can make true. Removing the `content-packs` flag made
`Server.getContent()` return a build or throw, so three guards against a server without content
became unreachable: the `content === undefined` early return in `blockBreak.ts`, the random tick
ternary in `WorldManager.buildWorld`, and the undefined content `loadServerFunctions` and
`functionContentOf` accepted. `BreakWorld` and `DestroyWorld` no longer type `getContent()` as
optional. No behavior changes; none of these modules is exported from the package entry point.

Roughly fifteen comments still described the flag, most of them some form of "X is undefined while
`content-packs` is off". Each now says what X is and when it can still be absent. A further set
named classes the entity deletion removed: `OldVillager`, `spawnableEntities`, `Mob`,
`Mob.applyKnockback`, `Mob.pushFromNeighbors` and `Mob.lootState`.
