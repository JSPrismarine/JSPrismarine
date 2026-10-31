---
"@jsprismarine/prismarine": patch
---

Give the end crystal and the ender dragon their runtime behavior. A spawn can carry a beam target, base-plate visibility and invulnerability, which reach the client as the `BLOCK_TARGET` and `SHOW_BOTTOM` actor data and persist with the actor record. A killing hit's zero-fuse `minecraft:explode` now runs before removal, so a hit crystal explodes at power 6 without fire, while a crystal an explosion destroyed does not explode again. The dragon takes damage under Java's rules: only players and explosions count, and a body hit lands at a quarter of the amount plus the amount capped at one.
