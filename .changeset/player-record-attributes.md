---
"@jsprismarine/prismarine": patch
---

A player record whose attribute table holds an entry that is not an object, such as `null` in a hand-edited fallback file, no longer stops the player from joining: the entry is skipped. A table without a health entry takes the record's `health` instead of leaving the player at full health.
