---
"@jsprismarine/prismarine": patch
---

The dragon fight keeps a death that waits for its chunks honest. A save taken before the portal, gateway, egg and experience ran now stores where the dragon died as `DragonFightState.dragonDeathPosition`, and the fight runs the death after the load instead of spawning a new dragon. A death whose unit was undone, which adds the dragon back, no longer opens the portal under a live dragon. A death whose consequences throw is kept too: what they wrote is taken back, and the next tick takes the death again from the start, instead of leaving a fight with no dragon and no kill that spawned a second dragon over a half-placed portal.
