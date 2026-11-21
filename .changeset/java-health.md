---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

A Java Edition player sees their health, food and saturation, gets a death screen when they die and comes back with its respawn button. The death screen's button, on either edition, decodes into a new `pressRespawn` intent. The session presenter gains `showVitals`, `showDeath` and `showRespawn`. `@jsprismarine/protocol` gains Java's `Set Health`, `Combat Death`, `Client Command` and `Respawn` packets, and `Respawn` shares the login's spawn fields.
