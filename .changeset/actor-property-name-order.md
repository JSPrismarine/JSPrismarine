---
'@jsprismarine/prismarine': patch
---

Send an entity type's synced properties in name order and number them that way, as BDS 1.26.60.6 does. They went out in the order the entity file declares them, so a creaking or a copper golem, whose files do not declare them by name, had each synced value read as another property.
