---
'@jsprismarine/prismarine': patch
---

A Java Edition player sees boss bars, such as the TPS bar and the dragon fight's: `BossBar` now shows itself through each player's session presenter, which gains `showBossBar`. A Bedrock client gets the same `BossEvent` packets as before. A Java client gets `Boss Event` under a UUID made from the bar, with Bedrock's rebecca purple drawn as purple and a title that is a translation key sent as a translation.
