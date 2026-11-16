---
'@jsprismarine/prismarine': patch
---

Count the ticks players spend near each chunk, Java's `InhabitedTime`, and save the count with the chunk under a key of this server's own, which Bedrock Dedicated Server ignores. A chunk counts a tick while a player who is not a spectator stands within 128 blocks of its middle, as Java's `ServerChunkCache` does, and regional difficulty now reads the count where a mob spawns, so the gear and pickup rolls ramp up in chunks players live in.
