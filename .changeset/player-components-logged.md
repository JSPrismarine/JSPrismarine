---
"@jsprismarine/prismarine": patch
---

Log a player's inventory and components in the world's change log. Every write to a slot of a player's main inventory, armor, off hand, ender chest, cursor or crafting grid appends one `inventory-slot` entry carrying the stack's saved form before and after, and the hand slot is logged as `inventory.handSlot`. `PlayerComponents` holds a player's vitals, experience, flying and movement flags, spawn point, credits flag and item use, each written through a setter that appends one `<component>.<field>` entry. An undone unit writes each of them back, and the replay digest now hashes a player's components through `Player.componentSnapshot`, so it changes for any world that holds a player.

New API: `Inventory.observe`, `HumanInventory.observeCarried` and `restoreSlot`, `CraftingInput.observe`, `Item.withDurability`, `Player.getExperience` and `Player.componentSnapshot`, and `Entity.restoreLoggedField` and `restoreLoggedSlot`.
