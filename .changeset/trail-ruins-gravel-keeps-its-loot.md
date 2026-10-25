---
'@jsprismarine/prismarine': patch
---

Take a block entity's type from its block when a structure processor made the compound, so a
trail ruins suspicious gravel reaches a chunk with a loot table on it. A rule's `append_loot`
modifier writes a compound holding a loot table and nothing else. Java needs no more than that,
because the suspicious gravel block already has a block entity and the rule only adds the table
to it. The conversion to a block entity request required an `id` on the compound and dropped the
whole compound without one, so all three trail ruins archaeology processor lists came to nothing.

In a generated world at seed 1234, the trail ruins at chunk -113,50 placed 76 suspicious gravel
across its chunks and no block entities at all. It now places 76, carrying
`loot_tables/archaeology/trail_ruins_common.json` and
`loot_tables/archaeology/trail_ruins_rare.json` between them.

`bedrockBlockEntityIds.ts` answers the type, from the Bedrock block identifier through the Bedrock
id to the Java `block_entity_type` a request names. The inverse of the Java table is derived
rather than written out, and is not quite a function, because Bedrock files a trapped chest under
the same `Chest` as a plain one. Nothing downstream can tell, since the answer is turned straight
back into the id both types share.

Nothing else in the game data writes a compound without a type. All 5597 block entities Java
26.3's 1511 structure templates save name one, and `append_loot` is the only processor that builds
a compound at all.

Suspicious sand is unchanged, because none of it reaches a generated chunk today. A comment in
`javaStructureScattered.ts` records that the desert pyramid leaves its four corridors out. Java's
ocean ruin templates carry no suspicious block. The desert well's feature holds the only other
`append_loot` in the game data and places its template through `placeJavaTemplate`, which writes
blocks and no block entities, and which reads a processor list only by name where the desert well
writes one inline.
