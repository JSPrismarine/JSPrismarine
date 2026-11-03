---
'@jsprismarine/commands': minor
---

Keep a bare block-state literal on the type Bedrock's grammar gives it: `=7` parses as an integer and `=true` as a boolean, with quoted values staying strings. The block catalog hashes a state with its types, so a `"7"` where an `int` property stands named no block and `/setblock minecraft:farmland ["moisturized_amount"=7]` reported success while placing nothing. `/testforblock` compares `true` and a stored `1` as the same byte.
