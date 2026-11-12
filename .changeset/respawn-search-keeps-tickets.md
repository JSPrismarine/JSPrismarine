---
"@jsprismarine/prismarine": patch
---

A waiting respawn search keeps every chunk it has asked for until it answers. Each attempt used to replace the player's chunk ticket with only the chunks that attempt lacked, so a chunk read by an earlier attempt could unload. A bed on a chunk border could then alternate between its two chunks and leave the player on the death screen. `RespawnSearch.release` is now public, so a caller that stops asking before the answer can give up the player's tickets.
