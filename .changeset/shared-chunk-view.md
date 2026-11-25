---
'@jsprismarine/prismarine': patch
---

Java Edition players are sent chunks the way Bedrock players are: the server's chunk scheduler paces them nearest first, out to `view-distance` rather than at most 8 chunks out, and the session keeps track of what each client holds, whichever edition it plays. A Java client no longer goes back to where it stood before a respawn or teleport when it next turns on the spot.
