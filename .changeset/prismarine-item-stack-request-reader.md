---
'@jsprismarine/prismarine': patch
---

`ItemStackRequestPacket` reading follows the 1.26.51 docs more closely. A deprecated crafting result's `Stack size` is read as a uint16 and its item descriptor accepts all four descriptor kinds; an auto craft keeps its `Recipe Net Id`; a `Dynamic ID` is read unsigned; and a packet or request naming more than the documented 100 requests or actions is refused with a `RangeError` instead of being allocated for.
