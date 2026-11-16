---
'@jsprismarine/entity-brains': patch
---

`interactWithDoor` now runs Java's `InteractWithDoor`: it opens a closed `#mob_interactable_doors` door at the node a mob last left or the one it walks to, and closes the doors it opened once it has passed them, while it is within 3 blocks and no mob of its type stands within 2, rechecking a node 20 ticks after it last changed. It used to wait on a `PATH` memory nothing wrote, so no brain mob ever opened a door. `BrainNavigation.pathStep`, `BrainWorld.isDoorOpen` and `BrainWorld.setDoorOpen` are the new optional host members it reads, and the test doubles answer them.
