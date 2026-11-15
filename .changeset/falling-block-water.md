---
'@jsprismarine/prismarine': patch
---

Sink a falling block through water to the floor, as Java does. It used to land on the surface, where the gravity check made it fall again every other tick for as long as the chunk stayed loaded, so gravel over a cave pool kept spawning falling-block entities and burned server-thread time indefinitely.
