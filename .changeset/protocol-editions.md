---
'@jsprismarine/protocol': minor
---

Move every Bedrock module under `bedrock/`, so that an import path names the edition it belongs to and the package can hold a second one. `@jsprismarine/protocol/packet/X` is now `@jsprismarine/protocol/bedrock/packet/X`, and the same move applies to `structure`, `payload`, `wire/definitions`, `wire/structures`, `wire/versions`, `wire/wireGates`, `wire/structureTypes`, `ProtocolVersion`, `ProtocolCodec`, `ProtocolCodecRegistry`, `ProtocolContext`, `PacketIdentifier`, `BatchCodec`, `CompressionCodec`, `EncryptionCodec`, `HandshakeCodec`, `Snappy` and `BlockRuntimeId`. The package root still exports everything it did, and `NetworkPacket`, `NetworkBinaryStream`, `handler/` and `wire/networkUtil` keep their paths.
