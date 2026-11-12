---
"@jsprismarine/prismarine": patch
---

A respawn search that throws on the player's own spawn point, such as one whose world fails to build, is reported and asked again for the world spawn. The request used to be dropped, so the death screen and the respawn never went out and the client could not leave the death screen. A world spawn search that fails is reported once and started again, and the respawn waits for it instead of being dropped. An answer that fails to apply is reported and is not asked again for the world spawn, which would have applied a second answer over the first.
