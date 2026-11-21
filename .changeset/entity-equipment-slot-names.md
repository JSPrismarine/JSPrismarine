---
'@jsprismarine/entities': patch
---

`ENTITY_EQUIPMENT_SLOT_NAMES` lists the seven Bedrock equipment slot names an entity component takes, and `EntityEquipmentSlot` is read from it. `minecraft:on_equipment_changed` and `minecraft:burns_in_daylight` check a slot against that one list.
