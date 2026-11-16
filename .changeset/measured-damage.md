---
'@jsprismarine/entities': patch
---

Add `measured` to `DamageEvent`. A measured blow is already what the entity's own rules make of its cause, so a `minecraft:damage_sensor` trigger leaves its amount alone, whatever its `deals_damage`, `damage_multiplier` or `damage_modifier`, and still fires its event. Immunities still turn it aside.
