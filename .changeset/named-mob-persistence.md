---
'@jsprismarine/entities': patch
'@jsprismarine/prismarine': patch
---

Keep a named mob loaded: neither `minecraft:despawn` nor the despawn pass removes a mob with a name tag, as Java's `Mob.setPersistenceRequired` keeps it.
