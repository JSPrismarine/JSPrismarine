---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
'@jsprismarine/errors': patch
---

A Java Edition player who joins is shown the default world around spawn, lit from the server's light engine, and kept connected with keep-alives. Blocks and biomes go through a new two-way edition translation that joins the Java and Bedrock mappings to each side's ids. `@jsprismarine/protocol` gains the Java chunk encoding (paletted containers, heightmaps, light), the play packets the join uses, and `JavaBlockStates.stateOf`, the inverse of `idOf`.
