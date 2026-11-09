---
'@jsprismarine/errors': patch
---

`GametypeInvalidError` now reports `ErrorKind.GAMETYPE_INVALID`. It reported `PLAYER_NOT_FOUND`, so code that switched on `code` read an invalid game type as a missing player.
