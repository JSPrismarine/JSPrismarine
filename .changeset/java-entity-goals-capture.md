---
'@jsprismarine/bedrock-data': patch
---

Export `java_entity_goals`, the goals each Java mob registers and the arguments it passes them, read from the pinned 26.3 server jar's bytecode by the new `dump:java-goals` script. A class literal lists every entity type it covers, and an item predicate lists the item tags and items its code reads.
