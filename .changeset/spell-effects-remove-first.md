---
'@jsprismarine/entities': patch
---

Apply `minecraft:spell_effects`'s `remove_effects` before its `add_effects`, so a component that names one effect in both refreshes it instead of ending it. A bee fed an open eyeblossom or a wither rose took no poison or wither at all, because its feeding groups list the effect under both keys.
