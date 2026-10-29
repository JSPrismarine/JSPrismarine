---
'@jsprismarine/prismarine': minor
---

Consolidate the single-version protocol machinery into a `ProtocolCodec` layer. `Codec2193` owns
the packet id table and builds inbound packets; each session carries a codec, assigned from the
codec registry when `RequestNetworkSettings` announces the client's protocol version.

Breaking for consumers of the old statics: packet classes no longer carry `static NetID` (read
ids through a codec's `netIdOf`, or an instance's `getId()`), handlers declare
`static PacketName` instead of `static NetID`, and `PacketRegistry` keys handlers by packet class
name. `Identifiers` remains exported but deprecated, derived from `Codec2193`, and its
`MinecraftVersions` is now `readonly`.
