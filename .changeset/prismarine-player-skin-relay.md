---
'@jsprismarine/prismarine': patch
---

`PlayerSkinHandler` relays a skin change as a packet the server writes itself instead of forwarding the bytes the client sent, so a client's `TrustedSkinFlag` claim no longer reaches other players. It also replaces the sender's player list entry, so a player who joins later receives the new skin, and it drops a skin whose image bytes do not fill its size, whose image is more than 4096 pixels a side, or whose geometry is not JSON. `PlayerListEntry.withSkin` returns a copy of an entry carrying another skin.
