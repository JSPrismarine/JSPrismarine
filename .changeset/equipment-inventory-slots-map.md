---
'@jsprismarine/prismarine': minor
---

`DataEntity.equipmentInventorySlots` is now a `Map<MobEquipmentSlot, number>` instead of a partial record. Read a slot with `get`, set one with `set` and clear one with `delete`. Saved entities keep the same on-disk shape. The new `withoutEquipmentSlot` helper in `entity/equipment` copies an equipment set with one slot emptied.
