---
'@jsprismarine/bedrock-data': patch
---

Add the Java Edition property and attribute dumper and its goldens. `pnpm run dump:java` fetches
the pinned 26.3 server jar, verifies its sha1, compiles `utils/java-dump/DumpJavaData.java`
against it and writes `src/jsp/java/block_properties.json` (per-state properties for all 1286
blocks and 35723 states) and `src/jsp/java/entity_attributes.json` (2619 default attribute
values, dimensions and category for 93 entity types).
