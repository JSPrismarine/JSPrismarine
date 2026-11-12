---
"@jsprismarine/entities": patch
---

Run `minecraft:mob_effect` and `minecraft:spell_effects` through their own factories. `registerEntityComponents` registered both names as data-only components first and then skipped the factories that apply the effects, so a puffed-up pufferfish poisoned nothing and a component group's spell effects were never added or removed.
