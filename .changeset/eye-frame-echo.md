---
'@jsprismarine/prismarine': patch
---

Filling an end portal frame with an eye of ender no longer also throws an eye. The client reports one right click on a frame as a block use and as a use in the air, and the server now ignores the air use that follows within two ticks of an eye used on a block.
