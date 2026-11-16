---
'@jsprismarine/entities': patch
---

Read a `minecraft:attack` damage written as a `[min, max]` list. The hoglin and zoglin adults write theirs that way, and the component read it as 0, so neither mob hurt anything.
