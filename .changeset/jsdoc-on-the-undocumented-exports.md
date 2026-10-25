---
'@jsprismarine/entity-brains': patch
'@jsprismarine/prismarine': patch
---

Document the exports that shipped without a description, so the generated `.d.ts` and the API docs
say what each one does.

`@jsprismarine/entity-brains` carried 101 of them: the `Brain` class itself, the three
`BehaviorControl` implementations in `behavior/control.ts`, `ShufflingList` and `GateBehavior`, the
`MemorySlot` readers, `BrainMobRegistry`, the `TestWorld` doubles, and the `<mob>Activities`
function and `<MOB>_BRAIN` definition of each of the twenty mobs. Each mob's entry now states what
is specific to it rather than repeating its name: that the camel and the happy ghast keep running
goals, that the frog and the goat start with a full cooldown so a fresh one does not act on its
first tick, and that the creaking falls back to its default activity while it cannot move.

In `@jsprismarine/prismarine`, the eight `Scoreboard` readers, `Item.getMeta` and the `ChunkBiomes`
class gain descriptions, and `EXHAUSTION`'s own JSDoc block is back above it after a merge left
`ADVANCEMENT_CHECK_TICKS` sitting between the two.
