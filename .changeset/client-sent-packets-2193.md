---
'@jsprismarine/prismarine': patch
---

Decode the packets a 1.26.51 client sends during play instead of warning `Packet 0x.. isn't implemented` and dropping them.

Twenty-three client-to-server packets gain a class, a handler, and a registry entry: `ServerboundLoadingScreenPacket`, `ServerboundDiagnosticsPacket`, `NetworkStackLatencyPacket`, `UpdateClientOptionsPacket`, `ClientCacheBlobStatusPacket`, `ResourcePackChunkRequestPacket`, `RequestAbilityPacket`, `RequestPermissionsPacket`, `ClientMovementPredictionSyncPacket`, `PlayerLocationPacket`, `EmotePacket`, `SetDifficultyPacket`, `ModalFormResponsePacket`, `BookEditPacket`, `LecternUpdatePacket`, `CommandBlockUpdatePacket`, `ServerboundPackSettingChangePacket`, `PlayerToggleCrafterSlotRequestPacket`, `BlockPickRequestPacket`, `ActorPickRequestPacket`, `MapInfoRequestPacket`, `AnvilDamagePacket`, and `SubChunkRequestPacket`. Each decodes the full protocol 2193 layout and logs at debug level. `EmotePacket` is also relayed to the other online players under the sender's runtime id with the server-side flag set; the rest change no server state yet, and each handler names the gap it leaves. `Identifiers` gains the ten ids that were missing.
