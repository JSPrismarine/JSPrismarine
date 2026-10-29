---
'@jsprismarine/prismarine': patch
---

Implement the missing wire direction for the 13 packets the codec baseline still permitted as
one-way: `AddActorPacket`, `AddItemActorPacket`, `AddPlayerPacket`, `AvailableCommandsPacket`,
`CraftingDataPacket`, `ItemRegistryPacket`, `ItemStackResponsePacket`, `LevelChunkPacket`,
`NetworkChunkPublisherUpdatePacket`, `PlayerListPacket`, `SetActorDataPacket` and
`UpdateSoftEnumPacket` gain `decodePayload`, and `ItemStackRequestPacket` gains `encodePayload`.
Entity metadata and `PropertySyncData` gain the deserializers those packets read through, and the
packet codec baseline is now empty.
