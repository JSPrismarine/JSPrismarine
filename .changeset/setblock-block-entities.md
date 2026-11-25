---
'@jsprismarine/prismarine': patch
---

`/setblock` and `/fill` give a block the block entity it carries, as Java's do. Before, a chest, spawner, beacon, sign or any other block-entity block placed by command had none, so `/data` refused it and a spawner never ran. `/clone` copies each source block's block entity with it, and a cloned double chest pairs with its copied half. An item frame block files its block entity as `ItemFrame` or `GlowItemFrame`, the ids Bedrock uses.
