---
'@jsprismarine/prismarine': patch
---

`CraftingDataPacket` numbers recipes from one when no `netIdOf` function is given, instead of sending every recipe as net id 0. The packet's ingredient and result layouts are documented and pinned by byte-exact tests for smithing transform recipes and tag ingredients.
