---
'@jsprismarine/prismarine': patch
---

Stop a join from stalling the server while the player's chunks are lit. A join, a teleport or a dimension change into chunks already in memory made the world take every chunk of the light ring into the light model inside one tick, and the first light read after it, such as a mob checking for daylight, then flooded the whole light queue inside another: 441 chunks and over a million light nodes in broken terrain. The world now takes a few chunks into the light model each tick and floods a fixed number of light nodes, nearest a player first. A chunk's mobs, random ticks and natural spawns wait until its first light and its neighbors' is done, as Java ticks a chunk only once it is lit, and a light read finishes only the nine chunks around it. The per-tick light budget rises from 4096 to 16384 nodes, since it now decides how soon the chunks around a player start to move.
