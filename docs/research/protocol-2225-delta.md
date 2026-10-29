# Protocol 2193 to 2225 delta

Research note, 2026-10-29. Question: what changed on the wire between protocol 2193 (Minecraft Bedrock 1.26.50/51, what this server speaks) and protocol 2225 (the next release), and which of those changes `Codec2225` has to carry.

## Which release speaks 2225

Minecraft Bedrock **1.26.60**, released 2026-10-27 (BDS 1.26.60.6). The 1.26.60 preview chain walked protocols 2207, 2208, 2211, 2216, 2223 and 2225; preview.30 and the retail build both answer 2225, and Mojang's changelog records "0 changes" between them.

## How the delta was derived

Two independent primary sources, which agree everywhere they overlap:

1. **Mojang's own changelog** at [bedrock-protocol-docs/changelog](https://mojang.github.io/bedrock-protocol-docs/changelog/) chains per-build diffs. The 1.26.60-preview.21 section names "Previous build: 1.26.51", so summing the sections for 2207 → 2225 is the exact 2193 → 2225 delta.
2. **The release schemas themselves.** The v1.26.51 `metadata.zip` (sha256 `a364a6f6…`, the pin `packages/minecraft/datagen/manifest.json` already carries) against the v1.26.60 `metadata.zip` (sha256 `a030a45d825b9ec8ea6bb744283648d5db1c0111592a8fd5eb0096ff05a0464b`), compared field-by-field through each schema's `x-ordinal-index`.

Cross-checked against gophertunnel v1.63.0 (`CurrentProtocol = 2225`, "1.26.60") and CloudburstMC/Protocol's 3.0 branch. pmmp/BedrockProtocol is archived and never shipped 2225; PrismarineJS bedrock-protocol's 1.26.60 support is still an open issue.

## New packets (eight), removed packets (none), renumbered ids (none)

No packet was removed and no existing id moved. 1.26.60 added:

| Id    | Packet                            | Added in   |
| ----- | --------------------------------- | ---------- |
| 0x161 | ClientboundMatchmakingState       | preview.21 |
| 0x162 | ServerboundStonecutterSetRecipe   | preview.21 |
| 0x163 | ClientboundStonecutterSetRecipe   | preview.21 |
| 0x164 | ServerboundMatchmakingCancel      | preview.21 |
| 0x165 | SetPassengerOfBlock               | preview.28 |
| 0x166 | ServerboundCursorItemDrag         | preview.29 |
| 0x167 | ClientboundPlayAudioContent       | preview.29 |
| 0x168 | ServerboundRegisterAudioContent   | preview.29 |

The retail `MinecraftPacketIds.json` omits the two stonecutter packets and SetPassengerOfBlock from its enum while the changelog and gophertunnel's `id.go` both carry them at 0x162, 0x163 and 0x165; the two sources that state values agree, so the table above keeps all eight. `v2225.ts` lists the ids; none has a packet class in this repository yet, so the codec decodes them to `null` and the dispatcher drops them with a warning, the same treatment every other unimplemented id gets.

## Layout changes implemented in Codec2225

Each is verified against both the v1.26.60 schema ordinals and gophertunnel v1.63.0's marshal order, implemented as a subclass with both wire directions, and round-trip tested in `Codec2225.test.ts`.

- **AnimatePacket** — trailing `Hand` uint8 (plain, no presence byte) after the optional swing source. The changelog's "changed" Action values (WakeUp 3, CriticalHit 4, MagicCriticalHit 5) are the values a 2193 client already sends; `AnimatePacket.ts` records that the 2193 docs page printed list positions, so nothing moves.
- **LevelChunkPacket** — trailing `Is Client Biome Update` boolean after the serialized chunk data.
- **StartGamePacket** — `Editor Level Migration Version` int8 inserted into LevelSettings at ordinal 11, between `Is Exported From Editor` and `Day Cycle Stop Time`; every later LevelSettings field moves one field later. New `EditorLevelMigrationVersion` enum (Legacy 0, EditorAchievements 1).
- **AddActorPacket** — trailing optional `Passenger Block Data` (`PassengerOfBlockArguments`: BlockPos, Vec3 offset, float rotation, float rotation limit, uint8 emote type).
- **AddPlayerPacket** — the same optional `Passenger Block Data`, inserted between the actor links and the device id.
- **InventoryTransactionPacket** — `Hand` uint8 inserted into `ItemUseOnActorInventoryTransaction` between the hotbar slot and the item (ordinal 4), and appended to `ItemReleaseInventoryTransaction` after the from-position (ordinal 5). The use-item body keeps the hand byte it already had at 2193.

## Verified but not implemented

These changed at 2225 and are verifiable from the same sources, but are not carried by `Codec2225` yet; a 2225 session inherits the 2193 layout for them. Each needs its own slice because it touches shared serializers or generated enums.

- **PlayerListPacket / PlayerSkinPacket / SerializedSkin** — `PlayerListAddEntry` gains a `PlayFab ID` string before the platform online id, and `SerializedSkin` loses its own `PlayFabID` field (gophertunnel's 1.26.60 update treats this as the release's breaking change). The skin serializer in `utils/skin/Skin.ts` is shared by the player list, the skin packet and login decoding, so moving the field means threading the protocol version through it.
- **ItemStackRequestPacket / PlayerAuthInputPacket** — new `ItemStackRequestReservedAction` variant; `ItemStackRequestActionType` gains `CraftReservedAction = 18`, pushing `CraftNonImplemented` to 19 and `CraftResults` to 20. The enum half is no longer a blocker: `@jsprismarine/minecraft` now generates `generated/v2225/ItemStackRequestActionType.ts` with `CRAFT_RESERVED_ACTION = 18`, `CRAFTING_NON_IMPLEMENTED_DEPRECATED = 19` and `CRAFTING_RESULTS_DEPRECATED = 20` beside the 2193 enum (see the datagen note below). What is left is a version-aware `ItemStackRequest` reader that picks the enum by the session's protocol; until that exists a 2225 client's crafting requests are still read against the 2193 numbering.
- **LevelEventGenericPacket** — an optional trailing int64 `serverHandle` when the event id is 1900/1901.
- **The eight new packets' payloads** — ids are known (above); no class is implemented.

Not applicable: `ClientboundUpdateSoundDataPacket` (reworked into a tagged event variant), `ClientboundAttributeLayerSyncPacket` (payload reworked into a oneOf) and `DimensionDataPacket` (`Cloud Height` added) also changed, but this server implements no class for any of them, so there is nothing to version.

## Enum and data changes outside the packet layer

- `ContainerEnumName`: ReservedContainerA-D = 67-70. `DisconnectFailReason`: `SubClientLoginNotBound` = 150. `ActorType`: `Frostbite` = 199579, `IceBall` = 4194460. `persona::PieceType`: `CoCo` = 28, `Unsupported` moves to 29.
- `LevelEvent` removes SoundPaintingPlace (9817), SoundPaintingBreak (9818), CauldronCleanShulkerBox (9819) and CauldronDyeShulkerBox (9820).
- `CurrentCmdVersion`: net change Latest 53 → 55 (a version 55 entry was added in preview.28 and removed again in preview.30).
- Block permutation changes that move hashed runtime ids: chorus plant, fire and redstone dust gained connection/direction states.

The preview.21 section also prints mass "enum value changed" rows (GameType, BuildPlatform, ActorEvent, ContainerEnumName 18-66, `PacketCompressionAlgorithm` None 2 → 65535, and others) and many "is now optional" rows. Mojang's own note for that build says it updated the docs "to accurately reflect optionality of specific fields": these are the documentation being corrected to the engine's real values, not wire renumberings - CloudburstMC made the same read ([Protocol PR #367](https://github.com/CloudburstMC/Protocol/pull/367)), and this repo's 2193 code already uses the "new" values where it met them (`AnimateAction`, the optional swing source). Treat any row from that section as a docs fix unless cross-checked.

## Datagen and bedrock-data inputs

`packages/minecraft/datagen/manifest.json` declares `"2225"`, for its enums only.

**What it has.** The entry pins the v1.26.60 `metadata.zip` (sha256 `a030a45d…`, measured on download). That asset carries `x-enum-binary-value` itself, so unlike 2193 it is its own values release and `values` points back at the same asset. `pnpm --filter @jsprismarine/minecraft run generate` writes `datagen/snapshot/v2225/enums.json` and all 31 enums to `src/generated/v2225/`. Regenerating twice produces byte-identical output, and adding the version changed nothing under `src/generated/v2193/` or the unversioned re-exports — 2193 stays `defaultProtocolVersion` until 2225 is complete.

Five enums differ from 2193 in content; the rest differ only in the `Source:` provenance line.

| Enum                         | Upstream                   | Change at 2225                                                               |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `ItemStackRequestActionType` | `ItemStackRequestActionType` | `CRAFT_RESERVED_ACTION = 18`; `CRAFTING_NON_IMPLEMENTED_DEPRECATED` 18 → 19, `CRAFTING_RESULTS_DEPRECATED` 19 → 20 |
| `ContainerUiId`              | `ContainerEnumName`        | `RESERVED_CONTAINER_A`–`D` = 67–70                                            |
| `WindowTypes`                | `ContainerType`            | `RESERVED_CONTAINER_TYPE = 38`                                                |
| `DisconnectReason`           | `DisconnectFailReason`     | `SUB_CLIENT_LOGIN_NOT_BOUND = 150`                                            |
| `LevelSoundEvent`            | `SharedTypes::Legacy::LevelSoundEvent` | `ICE_BALL_BREAK = 614`; `UNDEFINED` 614 → 615                     |

Every one of these is a change this note already predicted from the changelog, which is the cross-check. No consumer was migrated and no wire behavior changed: the 2225 enums are generated and exported, and reading them is a later slice.

**What it still lacks.** Six enums have no schema in any release and come from the frozen 1.26.40 `enums.html` — `LevelEvent`, `ActorDataIDs`, `ActorFlags`, `ServerAuthMovementMode`, `AbilitiesIndex`, `CraftingDataEntryType`. The 2225 copies of those are 1.26.40 answers carried forward, so the four `LevelEvent` members 1.26.60 removed are still present at 2225. Mojang publishes no newer HTML dump; correcting these needs a second source.

The entry declares neither `blocks` nor `recipes`, because both are captured from a BDS 1.26.60.6 and no such capture exists here. `generate-blocks.js` and `generate-recipes.js` skip a non-default version that declares neither, printing the commands below; the default version still fails closed. To fill them in:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources --protocol 2225
pnpm --filter @jsprismarine/bedrock-data run dump:bedrock -- --pass palette --protocol 2225
pnpm --filter @jsprismarine/minecraft run generate:blocks
pnpm --filter @jsprismarine/minecraft run generate:recipes
```

`merge-block-palette.mjs` finds its output directory by the Minecraft version a capture reports, so declaring `"2225"` is what gives a 1.26.60 capture a home; the merge would have refused one before. BDS is Linux x86-64 only — `packages/bedrock-data/utils/bedrock-dump/runner.ts` runs it in a container from another platform, and that path is not yet validated end to end. Once the two snapshots exist, add `blocks` and `recipes` to the 2225 entry shaped like 2193's.

The same BDS dependency holds for `packages/bedrock-data`, whose versioning plan is in `docs/plans/server-rearchitecture.md`.

## Sources

- [Mojang's protocol changelog](https://mojang.github.io/bedrock-protocol-docs/changelog/) — per-build diffs, 1.26.51 through 1.26.60.
- [Mojang/bedrock-protocol-docs releases](https://github.com/Mojang/bedrock-protocol-docs/releases) — `metadata.zip` for v1.26.51 (sha256 `a364a6f6a4ff3da35e564f94a5089c74703df6fa6bd6bed8555d364c9d9b207f`) and v1.26.60 (sha256 `a030a45d825b9ec8ea6bb744283648d5db1c0111592a8fd5eb0096ff05a0464b`); the per-type JSON schemas with `x-ordinal-index` are what the layout claims above cite.
- [Sandertv/gophertunnel](https://github.com/Sandertv/gophertunnel) v1.63.0 — `protocol.CurrentProtocol = 2225`; `packet/id.go`, `packet/animate.go`, `packet/level_chunk.go`, `packet/start_game.go`, `packet/add_actor.go`, `packet/add_player.go`, `protocol/inventory.go`, `protocol/entity_link.go`. [PR #545](https://github.com/Sandertv/gophertunnel/pull/545) later fixed four packets (StructureBlockUpdate, PlayerVideoCapture, CameraInstruction spline, CameraSpline) against Endstone dumps, a reminder that Mojang's docs have gaps.
- [CloudburstMC/Protocol PR #367](https://github.com/CloudburstMC/Protocol/pull/367) — the matching docs-alignment pass for v2225 optionals.
- [pmmp/BedrockProtocol releases](https://github.com/pmmp/BedrockProtocol/releases) — archived at protocol 2193-era; no 2225 release.
- [PrismarineJS/bedrock-protocol issue #840](https://github.com/PrismarineJS/bedrock-protocol/issues/840) — 1.26.60 support tracking, open.
- [minecraft.wiki: Bedrock Edition 26.60](https://minecraft.wiki/w/Bedrock_Edition_26.60) — release date and version naming.
