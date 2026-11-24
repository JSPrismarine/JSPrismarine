---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/mapping': patch
'@jsprismarine/items': patch
---

The Java preview is now 26.4 Pre-Release 1 (`26.4-pre-1`), data pack format 128.1, in place of 26.4 Snapshot 10. `sources.json` pins its server jar, `fetch:sources --java 26.4-pre-1` downloads it, and the mapping and item type tables for the preview move to `26.4-pre-1`, still mapped onto Bedrock preview protocol 2259. A server whose `content-java-version` names `26.4-snapshot-10` now stops at startup and needs `26.4-pre-1`.

The preview's Java goal capture lists no goals for the camel and camel husk, as Java's `Camel.registerGoals` registers none.
