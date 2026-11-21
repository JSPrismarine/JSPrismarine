---
'@jsprismarine/prismarine': patch
---

A Java Edition connection reads its next packet while an earlier input waits for the input step, and streams chunks without holding up packets. Before, it waited a tick on each move and on the join's whole first batch of chunks, so a server under load read a Java player's packets seconds late. The player's `player_loaded` could then arrive too late to put them in the world, and selectors such as `@a` found nobody.
