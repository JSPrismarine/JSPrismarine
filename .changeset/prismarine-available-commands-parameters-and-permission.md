---
'@jsprismarine/prismarine': patch
---

Describe brigadier arguments and permission levels in `AvailableCommandsPacket`. Commands built on brigadier's `string()`, `greedyString()` and `integer()` (`/say`, `/me`, `/time`, the reason of `/ban` and `/kick`) went out with empty overloads because those types were checked after the prismarine-argument guard had returned; they are now sent under their node names as `Message`, `String` and `Int` parameters. Overloads two branches spell the same way are folded into one. Every command also reported permission level `any`; a command the default permissions allow is `any` and anything else `gamedirectors`, capped at the recipient's own level so the client never hides a command the server would run for them.
