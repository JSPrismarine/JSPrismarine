---
"@jsprismarine/prismarine": patch
---

Run each store actor's update in a world tick as a unit of the change log, as the entity pass runs each entity's update. An actor whose update throws now loses only that update's writes and is skipped by the entity pass for the rest of the tick. Its portal cooldown, portal contact and status effect clock are put back too, and a portal trip the update started is not filed. The other actors, the entity pass and replication still run. After three failures in a row the entity is removed, or a player is disconnected. Before, a single actor that threw on every tick stopped the rest of its world's tick and its replication on every tick.
