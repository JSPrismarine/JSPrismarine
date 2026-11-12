---
"@jsprismarine/entities": patch
---

The shipped `minecraft:item` definition is no longer summonable, as Bedrock Dedicated Server advertises it. `/summon` supplies no item stack, so a summoned dropped item was refused as invalid.
