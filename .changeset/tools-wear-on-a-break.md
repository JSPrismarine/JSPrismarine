---
'@jsprismarine/prismarine': patch
---

Wear tools as a Bedrock Dedicated Server 1.26.52 does. Nothing raised an item's `onMineBlock` hook,
so a tool never lost durability on a break. A survival or adventure break now runs it: a wooden
pickaxe wears by one a block on cobblestone and on dirt and by none on short grass, and a wooden
sword wears by two a block on dirt, which is what BDS measured.

The item behaviors now see a stack's durability spent and its enchantments, so a hoe, axe, shovel
or pair of shears that runs out breaks and Unbreaking applies. A tool that breaks leaves the hand
empty instead of staying on screen. Every item with durability sends its `Damage` tag, 0 while
unused, byte for byte as BDS sends it; `ItemUserData.damage` is undefined for an item with none.
