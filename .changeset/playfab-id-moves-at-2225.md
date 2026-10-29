---
'@jsprismarine/prismarine': patch
---

Send the player list in the protocol 2225 layout, so a Minecraft 1.26.60 client can join.

At 2225 the PlayFab id changes owner: `PlayerListAddEntry` gains a `PlayFab ID` string between
`XBL XUID` and `Platform Online ID`, and `SerializedSkin` loses the one it carried. The server
kept sending the 2193 layout, which left a 1.26.60 client one string ahead of itself by the
time it reached `Build Platform` - four fixed little-endian bytes it then read as a string
length. The read ran off the entry and the client dropped the join without sending a reason,
which its disconnect screen reports as the error code "Terracotta".

`PlayerListPacket2225` and `PlayerSkinPacket2225` carry the new layout, selected by `Codec2225`,
and `Skin.networkSerialize` and `Skin.networkDeserialize` take an optional `SkinWireLayout`
that defaults to 2193's. Protocol 2193 sessions are unchanged.
