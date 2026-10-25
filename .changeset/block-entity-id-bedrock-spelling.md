---
'@jsprismarine/prismarine': patch
---

File a block entity under the id Bedrock uses. `blockEntityIdFor` pascal-cased the block's name
and kept the result only when this server had a class for that type, which is a different question
from what Bedrock calls it. A sign came out `jsprismarine:standing_sign`: Bedrock files all twelve
sign blocks under `Sign`, and nothing here models a `StandingSign`. A client ignores an id it does
not recognize, so no sign this server ever wrote drew its text, in the chunk payload or in an
update. Banners, heads, lit furnaces, suspicious sand, enchanting tables and pistons were wrong the
same way.

The id now comes from `blockentity/bedrockBlockEntityIds.ts`, a table of Bedrock's own spellings
read out of the pinned Dedicated Server binary and keyed by the pinned block palette, with the wood
types, the dye colors and the copper weathering stages handled by suffix. A block Bedrock keeps no
block entity on still gets a namespaced id, because a record this server invented is better named
after this server.
