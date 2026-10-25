---
'@jsprismarine/prismarine': patch
---

Write a chest's pair under Bedrock's own `pairx`, `pairz` and `pairlead` tags. The
`jsprismarine:container` family records the other half under `pairedWith`, which travels under
this project's own JSON tag, so the client was never told the two blocks were one chest: a double
chest was 54 slots on the server and 27 on the screen.

`blockEntityRecord` also reads the pair back off those tags when the record has none of its own,
so a double chest the game itself paired is a double chest here without being paired again.
`pairlead` goes on the half with the lower `x` and then `z`, which is the half the server orders
the 54 slots from.
