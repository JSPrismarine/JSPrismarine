# Protocol 2225 to 2259 delta

Research note, 2026-11-15. Question: what changed on the wire between protocol 2225 (Minecraft 1.26.60 to 1.26.62, the newest release) and protocol 2259 (Minecraft Preview 1.26.70.24), and which of those changes the server's preview codec has to carry.

2259 is a preview protocol. The server negotiates it with a client that announces it and advertises 2225. The next preview or the 1.26.70 release replaces it. A gate is a lower bound, so every `SINCE_2259` layout carries over to that release unless the release moves the field again.

## How the delta was derived

Two primary sources, which agree everywhere they overlap:

1. **The schemas.** The v1.26.60 `metadata.zip` (sha256 `a030a45d…`) against the v1.26.70-preview.24 `metadata.zip` (sha256 `25894ed1d026410cf504b9cae9703068368424ca819c9af73d72c6fd9229ccc4`), compared field by field through `x-ordinal-index`. Every schema in the second declares `x-protocol-version` 2259.
2. **Mojang's [changelog](https://mojang.github.io/bedrock-protocol-docs/changelog/).** 1.26.61 and 1.26.62 list no packet changes. The preview chain runs 2225 → 2235 (preview.20) → 2238 (.21) → 2239 (.22) → 2250 (.23) → 2259 (.24), and summing its sections gives the delta below.

gophertunnel has no preview release to cross-check against.

The changelog adds two facts the schemas do not show. `Editor Pack Types` is a set of bit flags (0x1 core, 0x2 annotation), not a plain enum. Removing `IceBallBreak` from `LevelSoundEvent` moved the ids after it down by one.

## Packets

Removed: `AddVolumeEntityPacket` (0xa6), `RemoveVolumeEntityPacket` (0xa7). No id was renumbered.

Added, each with a packet class and a declarative layout in `wire/definitions/added2259.ts`:

| Id    | Packet                                      | Added in   |
| ----- | ------------------------------------------- | ---------- |
| 0x169 | ChatPacket                                  | preview.20 |
| 0x16a | ServerboundRequestOnlineMusicPlaybackPacket | preview.21 |
| 0x16b | ClientboundOnlineMusicPlaybackResponsePacket | preview.21 |
| 0x16c | PlayerToggleArmorVisibilityRequestPacket    | preview.23 |
| 0x16d | ClientboundMusicPlaybackFailurePacket       | preview.23 |
| 0x16e | VirtualContainerOpenPacket                  | preview.24 |
| 0x16f | VirtualContainerClosePacket                 | preview.24 |

## Layout changes the codec carries

| Packet or structure | Change | Join path |
| --- | --- | --- |
| NetworkSettings | `SCTP Recovery Profile` uint8 appended (Default 0, Fast 1, Balanced 2). A client rejects the packet without it. | yes |
| ResourcePackStack | `Include Editor Packs` bool replaced by `Editor Pack Types` uint8 flags, same position | yes |
| StartGame `server_config` | optional `managedChat` appended, one plain `Enabled` bool | yes |
| Text `MessageAndParams` | plain `Queue?` bool appended to the translate, popup and jukebox-popup variants | no |
| PlaySound (and the payload `ClientboundPlayAudioContent` embeds) | optional `Start Delay Seconds` float, then optional `Attach Options` (actor runtime id) | no |
| CommandOutput `CommandOutputMessage` | optional `Raw Message` string appended | no |
| CommandBlockUpdate | `Last Output Is Raw Message` bool appended | no |
| StructureBlockUpdate | `KeepStructureVoid` bool appended | no |
| Transfer | optional `Server Transfer Settings` appended, seven optional members | no |
| `PassengerOfBlockArguments` (AddActor, AddPlayer, SetPassengerOfBlock) | `BlockType` little-endian uint64 and `PackUUID` appended | no |

The changelog's preview.24 developer notes say `Attach Options` "replaced the `Entity To Attach To` field". No such field exists at 2225 or at 2259, so it was added and replaced within the preview chain. The 2259 schema is the source here.

## Reshaped structures

- `ClientboundDataStorePacket` and `ServerboundDataStorePacket`. The records were flattened to variable names (preview.23): `Variable Name` replaces the store name, property and path, and a change's value became the same three-way `Data` an update carries. The entries travel under `variableUpdates` and `variableUpdate` from 2259, beside the earlier keys, as the attribute-layer sync's two layouts do.
- `StringAttributeData`, a fourth alternative of the attribute oneOfs in `ClientboundAttributeLayerSyncPacket`. `ClientboundAttributeLayerSyncPacket` refuses to write one to a session before 2259.

## Verified but not implemented

- Enum renames with unchanged values, which need no code: `CraftReservedAction` → `CraftDiscPress` (18, payload unchanged), `InternalUpdate` → `SwapOffhand` (38 and 65), the reserved container names → `DiscPress*`. New members: `DisconnectFailReason` 151–159, `InputMode.GamePadAndMouse`, `ContainerEnumName.VirtualContainer` 71, `AudioContentPlaybackType.ConcurrentMusic`.
- `maxItems` limits added to `PlayerFog`, `EmoteList`, `ContainerRegistryCleanup` and `ServerboundDiagnostics`, which constrain values and leave the wire layout unchanged.

## Transport

BDS 1.26.70.24 drops the `transport` and `server-portv6` settings and speaks only NetherNet. The capture and bring-up stage a server without the setting over NetherNet, advertising 127.0.0.1 and publishing TCP 19132 for signaling. `pnpm run bringup --protocol 2259` reaches spawn over that path.
