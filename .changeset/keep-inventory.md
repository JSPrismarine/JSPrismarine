---
'@jsprismarine/prismarine': patch
---

Read `keepInventory` when a player dies. With it off, the default, everything the player holds drops where they died: the inventory, armor and off hand, the cursor, the crafting grid and the inputs of an open window. A stack cursed with vanishing is destroyed, and seven experience points a level (at most 100) drop as orbs while the rest of the experience is lost. With it on, the player keeps the items and the experience; a respawn used to reset the experience whatever the rule said. The rule is read once, at the death. A death's drop lands even when the world is at its limit of dropped stacks, and a dead player no longer picks its own drop back up while its death screen is up.
