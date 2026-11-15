---
'@jsprismarine/client': patch
---

`ClientSession.send` sends packets that keep their body in fields, such as `AnimatePacket`, `EmotePacket` and `LevelSoundEventPacket`. It threw `Cannot serialize packet without data` for every one of them.
