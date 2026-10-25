---
'@jsprismarine/prismarine': patch
'@jsprismarine/mapping': patch
---

Translate what a Java block entity holds, so a block entity a structure template saved arrives
furnished rather than named. A structure template saves the whole compound and the generator read
three fields out of it, the loot table, the spawner's mob and the end gateway's exit, and dropped
everything else.

A census of Java 26.3's 1511 templates decided what to write and where to stop. They declare 1124
block entities once the jigsaws and the structure blocks consumed during placement are set aside,
and 149 of those carry contents. The translation covers all 149: 107 banners, 48 containers with
stacks or timers, 19 comparators, 14 trial spawners, 5 signs, 5 decorated pots, 2 vaults and 2
monster spawners. The census also said where not to go. Every one of the 128 campfires is empty and
all their cooking timers are zero, no lectern holds a book, and the bells, skulls, ender chests and
sculk sensors carry nothing at all.

None of it is a copy. Bedrock keeps a banner's color in the block entity where Java keeps it in the
block, and counts the sixteen dyes backwards, so a brown banner is 12 on one side and 3 on the
other. It draws the raid banner from one `Type` field and refuses patterns beside it, which is how
a pillager outpost banner comes out blank when both are sent. It joins a sign's four text
components into one newline-separated string, packs the text color into one ARGB integer and calls
the glow flag `IgnoreLighting`. It orders a decorated pot's sherds back, left, right, front where
Java names the four faces. It takes a trial spawner's configuration inline where Java may write a
reference, and defaults the spawn interval to 20 ticks where Java defaults it to 40.

`@jsprismarine/mapping` gains the three vocabularies this needs: Bedrock's short code for each of
Java 26.3's 43 banner patterns, checked for totality against the pinned Java census; the Bedrock dye
index, derived from the generated item table rather than listed again; and the packed ARGB a Bedrock
sign draws each dye in.

Six fields are reviewed losses rather than omissions, listed in `BLOCK_ENTITY_CONTENT_LOSSES` and
counted on the parity dashboard: a sign's operator-click permission and its Realms-filtered text, a
furnace's per-recipe experience tally, a trial spawner configuration written as a registry reference
with nothing loaded to resolve it, a banner pattern a datapack shipped, and a named potion, which
Bedrock tells apart by a data value no pinned source publishes.
