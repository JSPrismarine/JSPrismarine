---
'@jsprismarine/protocol': minor
'@jsprismarine/prismarine': patch
'@jsprismarine/client': patch
---

Every packet in `@jsprismarine/protocol` now takes its body from a declarative wire layout, and each layout was checked field by field against Mojang's protocol docs for 1.26.50 (protocol 2193) and 1.26.60 (protocol 2225). Where the code departs from the docs, a test loads the captured server bytes or Mojang's enum dump that backs it.

Packets whose wire bytes change:

- `CraftingDataPacket` decodes a real server's packet, with all eleven recipe lists typed.
- `AvailableCommandsPacket` writes chained subcommand pairs and chained parameters the way a real server does.
- `ClientboundAttributeLayerSyncPacket` and `ClientboundUpdateSoundDataPacket` gain their protocol 2225 layouts.
- `PlayerSkinPacket` and `PlayerListPacket` number persona piece types per protocol.
- `MovePlayerPacket` writes teleport data exactly when the mode is a teleport.
- `InventorySlotPacket` writes its container id as one byte.
- `PartyChangedPacket`, `ServerPresenceInfoPacket`, `ServerStoreInfoPacket`, `ServerboundDiagnosticsPacket`, `SyncWorldClocksPacket` and `ClientboundMatchmakingStatePacket` carry presence bytes on the fields the docs mark optional, and `CameraInstructionPacket`, `CameraSplinePacket` and `StartGamePacket` drop the ones the docs do not.

Payload changes for consumers: `DisconnectPacket` nests its messages under `messages`, `MovePlayerPacket` carries `teleportData`, `ResourcePacksInfoPacket` names its list `resourcePackEntries`, `CameraSplinePacket` holds plain objects, and `EmoteListPacket`, `EducationSettingsPacket` and `ClientMovementPredictionSyncPacket` take their payload through the constructor.
