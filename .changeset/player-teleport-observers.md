---
'@jsprismarine/prismarine': patch
---

Other players now see a teleported or respawned player snap to the new position. The move reached them as ordinary movement, so their clients slid the player across the distance. `Player.setPosition` also honors the `teleport` option it inherits from `Entity`, which it ignored before.
