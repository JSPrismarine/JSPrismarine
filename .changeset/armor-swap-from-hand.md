---
'@jsprismarine/item-behaviors': patch
'@jsprismarine/prismarine': patch
---

Right-clicking armor to wear it now swaps it with the hand instead of copying it. The worn piece leaves the hand, and armor already in the slot goes to the hand, or to the inventory when the hand holds more than one. The armor keeps its durability, enchantments and name. `EquipAction` has a new `fromHand` flag that asks the world for this swap.
