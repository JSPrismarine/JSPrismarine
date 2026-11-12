---
'@jsprismarine/prismarine': patch
---

The command host's `max_health` attribute now reads and writes the maximum of the store entity's `health` attribute, for players and mobs alike, so the change log records the write and `getMaxHealth` answers it. It used to write a table nothing read while the entity was in a store.
