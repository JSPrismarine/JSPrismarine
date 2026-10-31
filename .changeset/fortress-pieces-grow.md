---
"@jsprismarine/prismarine": patch
---

Generate the nether fortress. `minecraft:fortress` has a builder that reproduces Java's
`NetherFortressPieces`: the bridges, crossings, stairs and blaze thrones grown from the bridge
weight table, the castle corridors, turns, balconies and nether wart rooms grown from the castle
table, and the bridge end fillers that close an exit nothing else fits. The layout matches the
pieces Java lays out for the same seed, and the chests roll the `nether_bridge` loot table.
