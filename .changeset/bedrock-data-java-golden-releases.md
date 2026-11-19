---
'@jsprismarine/bedrock-data': patch
---

The Java goldens moved under `src/jsp/java/<release>/`. `dump:java` and `dump:java-goals` write the release `--java` names, or the default when the flag is absent. The `java_entity_*` exports still read the default release.
