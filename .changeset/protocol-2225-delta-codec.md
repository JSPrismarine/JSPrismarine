---
'@jsprismarine/prismarine': patch
---

Speak protocol 2225 (Minecraft 1.26.60) alongside 2193, through the first delta codec.
`Codec2225` extends `Codec2193` with the eight packet ids 1.26.60 added and subclasses for the
six implemented layout changes - `AnimatePacket`'s trailing hand, `LevelChunkPacket`'s client
biome update flag, `StartGamePacket`'s editor level migration version, the optional passenger
block data on `AddActorPacket` and `AddPlayerPacket`, and the hand byte in two
`InventoryTransactionPacket` bodies - each with both wire directions and a round-trip test,
verified against Mojang's v1.26.60 protocol schemas and gophertunnel v1.63.0. A client of
either version negotiates its own codec at `RequestNetworkSettings`; the handshake codec, the
MOTD and `Identifiers` advertise the newest registered version. The remaining 1.26.60 changes
a 2225 session still reads with 2193 layouts are recorded in
`docs/research/protocol-2225-delta.md`.
