---
'@jsprismarine/prismarine': patch
---

Register `SubClientLoginPacket` (id 94) and its handler. Both existed but neither was exported from the packet and handler registries, so a split-screen player's login was logged as an unimplemented packet. The handler still only logs the attempt at debug level; the server binds one player per connection and has nowhere to put a second one.
