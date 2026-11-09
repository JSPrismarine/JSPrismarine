---
'@jsprismarine/prismarine': patch
---

A dimension change for a dead player, such as a `/teleport` into another dimension under the death screen, now waits until the player respawns and then carries the player there. It used to go out to a client that never opened its loading screen, and every later change of world waited behind it for a minute.
