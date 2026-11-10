---
"@jsprismarine/prismarine": patch
---

Block updates stop on a count only. A world no longer stops its block updates 20 ms into a tick: it runs up to `BLOCK_UPDATE_BUDGET_PER_TICK` due updates and carries the rest to the next tick, so a slow host ticks slower instead of running fewer of them. `BlockUpdateScheduler.defer`, which only the time limit used, is removed.
