---
'@jsprismarine/bedrock-data': patch
---

`datagen:java` writes `version.json` beside the vanilla datapack's `pack.mcmeta`, with the release id, JDK, data pack format and data version the jar declares, and `@jsprismarine/bedrock-data/sources` exports `readGeneratedJavaVersion` to read it.
