---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
'@jsprismarine/errors': patch
---

A Java Edition player sees their inventory, armor and off hand, and the hotbar slot they hold. A Java client's hotbar choice decodes into `selectHotbarSlot`, and a creative player's slot changes into the new `setCreativeSlot` intent. The session presenter gains `showInventory` and `showOwnSlot`, and `javaItemTranslation` maps items both ways. `@jsprismarine/protocol` gains Java's container content, container slot, held item and creative slot packets, the `Short` wire type, and item stacks without data components.
