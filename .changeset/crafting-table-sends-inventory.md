---
'@jsprismarine/prismarine': patch
---

Send the player's inventory under window 0 after opening a crafting table, which is what a Bedrock
Dedicated Server 1.26.52 sent after a click on one. The other workstations still send only their
open, since none of them was recorded.
