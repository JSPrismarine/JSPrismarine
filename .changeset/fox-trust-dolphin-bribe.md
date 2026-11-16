---
'@jsprismarine/entities': patch
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Run `minecraft:trust` and `minecraft:bribeable`. A bred fox trusts the players who fed its parents, which the `trusts` filter test and `minecraft:behavior.defend_trusted_target` now read; the `trusts` test asks the entity about the subject, as Bedrock documents, rather than the other way round. A grown dolphin eats any item of Java's `fishes` tag and leads its player to treasure only while it holds that bribe, spending it when the swim ends. Item interactions now carry the used item's Java tags.
