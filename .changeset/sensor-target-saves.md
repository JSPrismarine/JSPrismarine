---
"@jsprismarine/prismarine": patch
---

A reloaded mob's `minecraft:target_nearby_sensor` starts with no target, as it did before component state was saved, because its state names the target by a runtime id the next session draws again. `docs/data-driven/entities.md` and `docs/data-driven/engine-systems.md` describe the entity store, its change log and how a failed update is undone.
