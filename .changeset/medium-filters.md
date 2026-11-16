---
'@jsprismarine/prismarine': patch
---

Answer the `in_water`, `in_lava`, `in_contact_with_water`, `is_underwater`, `in_water_or_rain` and `in_block` entity filters. An entity out of water now reads as not in water, so a sensor testing `in_water != true` fires for a stranded axolotl or dolphin, and `in_block` names the block an entity's feet are in, so a skeleton in powder snow starts turning into a stray.
