---
"@jsprismarine/entities": patch
---

The shipped `jsprismarine:item` component no longer declares `lava_damage` and `void_depth`. The dropped item never read either: hazard damage and the void depth come from the server's shared tables, so a pack that changed them changed nothing.
