---
'@jsprismarine/prismarine': patch
---

Turn a mob toward its waypoint by at most the degrees its Java move control allows each tick: 90 for most mobs and 10 for the axolotl, dolphin, frog, nautilus and tadpole. A mob that has to turn further moves along the heading it reached, as Java's mobs do, instead of snapping round and walking backwards. Flyers and swimmers climb or dive toward the waypoint while they turn.
