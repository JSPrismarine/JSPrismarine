---
'@jsprismarine/block-behaviors': patch
---

Place a trapdoor or a lantern into short grass or another block it replaces as Java does. A trapdoor faces away from the placer and takes the top half unless the grass was clicked on top, whichever face was clicked, and a lantern looks for support in the order the placer looks rather than trying the clicked block first. The test harness's `place` takes a `replacingClicked` option.
