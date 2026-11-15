---
'@jsprismarine/protocol': minor
---

Add the seven packets Minecraft Preview protocol 2259 introduced: `ChatPacket`, `ServerboundRequestOnlineMusicPlaybackPacket`, `ClientboundOnlineMusicPlaybackResponsePacket`, `PlayerToggleArmorVisibilityRequestPacket`, `ClientboundMusicPlaybackFailurePacket`, `VirtualContainerOpenPacket` and `VirtualContainerClosePacket`. The data store packets carry 2259's variable-name records under `variableUpdates` and `variableUpdate`; `ServerboundDataStore.update` is now `null` from 2259. Attribute values gain a `String` alternative, which `ClientboundAttributeLayerSyncPacket` refuses to write before 2259.
