---
'@jsprismarine/prismarine': patch
---

`LevelSoundEventPacket` now carries `Fire At Position` through a decode and encode as `fireAtPosition` instead of reading it and dropping it, and resolves a sound name through a prebuilt map rather than scanning the enum. `LevelSoundEventHandler` drops a client sound attributed to an actor other than the sender, in addition to one reported out of the sender's reach.
