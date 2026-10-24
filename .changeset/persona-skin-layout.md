---
'@jsprismarine/prismarine': patch
---

Fix a 1.26.51 client with a character-creator skin being dropped right after joining with `InitialConnection-90` (#2582).

The player list carries every player's skin, and a persona skin's pieces and tints were still written in a layout the client stopped reading long ago. The piece type and pack id went out as strings and the tint colours as a counted list of strings. Protocol 2193 reads the piece type as a 32-bit id, the pack id as a 16-byte UUID, and each tint as a short name followed by exactly four 4-byte colours. Every field after the skin was read from the wrong offset, so the join failed for anyone whose skin came out of the character creator. Classic skins were not affected. The skin colour now goes out in the byte order the client reads, and a `#rrggbb` skin colour is read as opaque.
