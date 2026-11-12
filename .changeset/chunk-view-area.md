---
'@jsprismarine/prismarine': patch
---

A player's chunks are sent and forgotten by one area, a circle of the view distance, defined in `ChunkViewArea`. The server used to send by a circle and forget by a square, so a chunk in a corner of the square stayed counted as held after the client had dropped it, and was not sent again when the player walked back: a hole in the world at the edge of view.
