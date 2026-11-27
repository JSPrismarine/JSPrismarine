---
'@jsprismarine/protocol': minor
---

Add Java Edition's `TakeItemEntity` and `SetExperience` packets to `@jsprismarine/protocol/java/packet/play`. `Set Entity Metadata` now carries item stacks, as `JavaEntityDataSerializer.ItemStack`, and `JavaEntityDataIndex` names an item entity's stack and an experience orb's value.

Breaking: `JavaEntityDataEntry` is now a union, and its `value` is a `JavaItemStack | null` for the item stack serializer. Code that reads `value` as a number has to check `serializer` first.
