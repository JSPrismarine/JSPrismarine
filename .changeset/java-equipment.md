---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

A Java Edition player sees what the mobs and players around them hold and wear, when they come into view and whenever it changes. An entity's shown facts carry its equipment, the session presenter gains `showEquipment`, and the replicator's sends to an entity's trackers reach Bedrock viewers only, with other editions shown the change through their presenter. `@jsprismarine/protocol` gains Java's `Set Equipment` packet and `JavaEquipmentSlot`.
