---
'@jsprismarine/protocol': patch
---

Add the `EduSharedUriResource` structure, the `Button Name` and `Link Uri` string pair that `EduUriResourcePacket` and `LevelSettings` carry, with the `EduSharedUriResourceData` type for its fields. `LevelSettings` now takes that type for `eduSharedUriResource` instead of its own private copy.
