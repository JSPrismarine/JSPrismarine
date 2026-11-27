---
'@jsprismarine/entities': patch
'@jsprismarine/prismarine': patch
---

Knock a flying ender dragon back when a blow or an arrow lands on it, as Java does. The dragon now takes Java's knockback resistance of 0, where it kept Bedrock's, and the server skips the knockback while a sitting phase runs, as Java's `EnderDragon.knockback` does. The goal world hands the dragon's flight the velocity a knockback left, and a `noPhysics` entity such as the dragon is never counted as standing on the ground.
