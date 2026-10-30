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

## Why a 1.26.60 client was disconnected with "Terracotta"

Diagnosis, 2026-10-29, from the report that a retail 1.26.60 client could not join and was
shown the coded error name **Terracotta**.

### What "Terracotta" means

It is not one reason. Bedrock's Ore UI maps `DisconnectFailReason` values onto a hand-curated
set of material names, many reasons to one name, and Terracotta is the leftover bucket: 17 of
the 157 reason indices display under it. The index-by-index mapping is
[GeyserMC's support-bot tag set](https://github.com/GeyserMC/GeyserDiscordBot/tree/master/src/main/resources/tags/disconnect)
(one `.tag` file per index, added in
[PR #392](https://github.com/GeyserMC/GeyserDiscordBot/pull/392)), whose ordinals agree with
[CloudburstMC's `DisconnectFailReason`](https://github.com/GeyserMC/Protocol/blob/3.0/bedrock-codec/src/main/java/org/cloudburstmc/protocol/bedrock/data/DisconnectFailReason.java)
and with [gophertunnel's constant block](https://github.com/Sandertv/gophertunnel/blob/master/minecraft/protocol/packet/disconnect.go).

The useful half of the mapping is what Terracotta is **not**. Each failure class worth
suspecting has its own name, and none of them is this one:

| Failure class                                    | Name shown  |
| ------------------------------------------------ | ----------- |
| Outdated client or server, version mismatch       | Chain       |
| Resource pack rejected, missing or incompatible   | Rabbit      |
| Bad, unknown or unexpected packet                 | Block       |
| Login chain, JWT or authentication failure        | Guardian    |
| Timeout                                           | Kelp        |
| Block palette mismatch, bad chunk heights/widths  | Boat, Lead, Ladder |

Of the 17 Terracotta reasons, the ones a live connection can realistically reach are 66
`ConnectionLost`, 69 `ReasonNotSet` and 62 `DisconnectPacket` (deprecated). Gophertunnel leaves
66 and 67 as holes in its constant block precisely because they are client-internal: a server
never sends them. So Terracotta on a direct connect means **the session died without either
side naming a reason** — the client tore the link down itself, or the link simply stopped.

That rules out most of the candidates and points at one shape of bug: the client hits something
fatal while parsing the join, aborts locally, and reports a lost connection rather than a
protocol error.

Caveat on secondary sources: consumer guides uniformly describe Terracotta as a Microsoft
account login failure. They are all tracking
[MCPE-142234](https://bugs-legacy.mojang.com/browse/MCPE-142234), a 1.17.3x bug fixed in
1.17.34, from before the Ore UI code table existed. They disagree with the enum data; prefer the
enum data. Separately, the index 149 `UnsupportedTransport` tag carries a note that from 26.60
it also appears when the NetherNet signaling server is unreachable — a real 1.26.60-specific
Terracotta, but it applies to Realms and friends-list joins, not to a direct RakNet connect.

### Ranked causes

**1. `PlayerListPacket` was sent in the 2193 layout. [confirmed, fixed]**

This is the one. At 2225 the PlayFab id changes owner: `PlayerListAddEntry` gains a `PlayFab ID`
string at ordinal 5, between `XBL XUID` and `Platform Online ID`, and `SerializedSkin` loses its
own `PlayFabID` from ordinal 1. Confirmed field for field by diffing `PlayerListAddEntry.json`
and `SerializedSkin.json` between the v1.26.51 and v1.26.60 `metadata.zip` releases, and it is
the change gophertunnel calls its 1.26.60 breaking change.

Why it kills the join rather than garbling a name:

- The server sends `PlayerList` during the join burst, from
  `ResourcePackClientResponseHandler` (`addToPlayerList` then `sendPlayerList`), after
  `AvailableCommands` and before `PlayStatus(PlayerSpawn)`. The client parses it while still
  joining.
- Reading 2193 bytes with the 2225 layout, the client is one string ahead of itself by the time
  it reaches `Build Platform`. That field is a fixed four-byte little-endian int, not a varint,
  so the client reads its bytes as a string length and gets an enormous one. The read runs off
  the entry and into the skin.
- A client that blows up mid-parse drops the connection without sending a `Disconnect`, which
  is reason 66 `ConnectionLost` — Terracotta.

The codebase has already been bitten by exactly this packet in exactly this way. `Skin.networkSerialize`
carries a note that a missing tail field meant "the entry after this one in the player list is
read from the wrong place, and the client drops the join", and #2582 records a 1.26.51 client
with a character-creator skin dropping the join over a persona-piece layout error. Same packet,
same mechanism, same symptom class.

Fixed: `PlayerListPacket2225` and `PlayerSkinPacket2225`, registered in `Codec2225`, with the
layout threaded through `Skin.networkSerialize` as a `SkinWireLayout` flag rather than a
protocol version — only this one field has ever moved. Covered in `Codec2225.test.ts`, including
a test that a 2225 reader cannot parse 2193 entry bytes.

**2. Nothing else the server sends during a join has an unimplemented 2225 layout. [confirmed]**

Diffing every schema in both `metadata.zip` releases by `x-ordinal-index` gives a complete
structural delta of 18 types, and no type was removed. After the fix above, the remainder splits
into types `Codec2225` already carries (`LevelSettings`, `AddActorPacketPayload`,
`AddPlayerPacketPayload`, `AnimatePacketPayload`, `LevelChunkPacketPayload`,
`ItemUseOnActorInventoryTransaction`, `ItemReleaseInventoryTransaction`), `DimensionDefinition`
(carried by `DimensionDataPacket`, whose 2225 layout is implemented below but which the server
never sends), and types this server implements no packet for at all (`AttributeLayerData`,
`EnvironmentAttributeData`, `ClientboundUpdateSoundDataPacketPayload`, `Fade`, `SeekTo`,
`SetPitch`, `SetVolume`, `NoiseAlignment`). None of the latter is on a join path.

This is the strongest statement available from the docs: the layout surface for a 2225 join is
now complete, and any remaining failure is data, not layout.

**3. Stale item registry and crafting data from 2193-era captures. [speculative, not a
login-time disconnect; measured since]**

`ItemRegistryPacket`, `CraftingDataPacket` and the creative contents are built from
bedrock-data tables captured at 2193. These are server-authoritative: the client adopts the
numbering the server sends rather than checking it against its own, which is the entire reason
the registry is on the wire. A stale table shows up as missing or wrong items in a session that
joined successfully, not as a refused join. Rank it low for this symptom, real for behavior
afterwards.

Measured on 2026-10-29 against a real 1.26.60.6 capture: the item table gains four names
(`minecraft:disc_press`, `minecraft:frostbite_spawn_egg`, `minecraft:ice_crystal`,
`minecraft:icicle`), loses none, and moves 82 runtime ids. The recipes are unchanged — 1.26.60
ships no recipe layer. The 2225 table is published as `@jsprismarine/bedrock-data/v2225`.

Selected per session since: `ProtocolCodec` carries a `ProtocolItemData` beside its packet
layouts, so the version fixes the numbering the same way it fixes a field order.
`ItemRegistryPacket` picks its table from the version the codec stamps on an outbound packet,
`contentPayloads` takes the table as an option and caches one build per version, and an item
stack reads it off the packet it is written to or read from — the stack numbers and the
registry's have to agree or the 82 resolve to the wrong item. Server-side membership questions
(`CreativeInventory`'s catalog filter, `RecipeManager.isKnown`, the `items` generator) still read
the canonical 2193 table, since they ask whether Bedrock has an item rather than what number to
write for it. 2193's `ItemRegistryPacket` bytes are unchanged, which `ItemRegistryPacket.test.ts`
asserts directly, and the `registry.items-2225` parity family now checks what a session is sent
rather than only what the package publishes.

**4. Stale block palette. [speculative, ruled out as a login-time cause]**

With hashed runtime ids the block palette is not on the wire at all — `StartGamePacket` carries
only the blocks the server invented, and the client resolves everything else through its own
palette by hash. A 1.26.60 client therefore cannot reject the server's palette at login. The
2225 permutation changes (chorus plant, fire, redstone dust gained states) move those blocks'
hashes, so chunks containing them resolve wrongly, but that is a post-spawn rendering fault and
would surface as `BlockMismatch` (Boat), not Terracotta.

**5. Biome definitions. [speculative]**

`BiomeDefinitionListPacket` is sent during the burst, so a malformed one could kill a join. But
no biome type appears in the 2225 structural delta, so there is no known layout reason for it to
be malformed, and its data is not version-gated the way the item registry is. No evidence either
way; listed for completeness.

**6. The six enums frozen at 1.26.40. [speculative, not login-time]**

`LevelEvent`, `ActorDataIDs`, `ActorFlags`, `ServerAuthMovementMode`, `AbilitiesIndex` and
`CraftingDataEntryType` have no schema in any release and are carried forward from the 1.26.40
`enums.html`, so the 2225 copies still contain the four `LevelEvent` members 1.26.60 removed.
Those are gameplay events, not join packets.

### What is not blocked on a BDS capture

Everything above. The fix, and the completeness argument behind it, rest on Mojang's published
schemas and gophertunnel, both of which are already pinned here. A real 1.26.60 BDS capture
(item registry, block palette, recipes, biomes) is needed for causes 3 to 5 — correct item
numbering, correct block hashes, correct recipes for a 1.26.60 session — but none of those is
what shows a client Terracotta at login.

### What could not be reproduced

No retail Bedrock client is available here, and `packages/client` cannot stand in for one. It
speaks 2225 now — `Client` takes a `protocolVersion`, reports the matching `GameVersion`, and
reads `StartGamePacket` with `StartGamePacket2225`, which is what the 1.26.60 data capture
needed — but it decodes with the `@jsprismarine/protocol` stack rather than with `Codec2225`,
and that stack carries the one 2225 layout the capture needs and no others. It is a data
capture client, not a conformance client. The reproduction here is therefore at the codec seam
rather than over a socket: `Codec2225.test.ts` asserts that a 2225 reader cannot
consume the bytes the unfixed server produced. A socket-level reproduction needs the client to
grow a codec-aware decoder, which is its own slice.

## Layout changes implemented in Codec2225

Each is verified against both the v1.26.60 schema ordinals and gophertunnel v1.63.0's marshal order, implemented as a subclass with both wire directions, and round-trip tested in `Codec2225.test.ts`.

- **AnimatePacket** — trailing `Hand` uint8 (plain, no presence byte) after the optional swing source. The changelog's "changed" Action values (WakeUp 3, CriticalHit 4, MagicCriticalHit 5) are the values a 2193 client already sends; `AnimatePacket.ts` records that the 2193 docs page printed list positions, so nothing moves.
- **LevelChunkPacket** — trailing `Is Client Biome Update` boolean after the serialized chunk data.
- **StartGamePacket** — `Editor Level Migration Version` int8 inserted into LevelSettings at ordinal 11, between `Is Exported From Editor` and `Day Cycle Stop Time`; every later LevelSettings field moves one field later. New `EditorLevelMigrationVersion` enum (Legacy 0, EditorAchievements 1).
- **AddActorPacket** — trailing optional `Passenger Block Data` (`PassengerOfBlockArguments`: BlockPos, Vec3 offset, float rotation, float rotation limit, uint8 emote type).
- **AddPlayerPacket** — the same optional `Passenger Block Data`, inserted between the actor links and the device id.
- **PlayerListPacket / PlayerSkinPacket / SerializedSkin** — the PlayFab id moves out of the skin and onto the entry: `PlayerListAddEntry` gains a `PlayFab ID` string at ordinal 5, between `XBL XUID` and `Platform Online ID`, and `SerializedSkin` loses its own `PlayFabID` from ordinal 1. Gophertunnel treats this as 1.26.60's breaking change. `Skin.networkSerialize` takes a `SkinWireLayout` flag rather than a protocol version, because this is the only field the skin has ever moved. Sending the 2193 layout here is what disconnected a 1.26.60 client with "Terracotta"; see the diagnosis above.
- **InventoryTransactionPacket** — `Hand` uint8 inserted into `ItemUseOnActorInventoryTransaction` between the hotbar slot and the item (ordinal 4), and appended to `ItemReleaseInventoryTransaction` after the from-position (ordinal 5). The use-item body keeps the hand byte it already had at 2193.
- **DimensionDataPacket / DimensionDefinition** — `Cloud Height` (ZigZag varint32, ordinal 6) and `Render Clouds` (bool, ordinal 7) appended to `DimensionDefinition` after `Default Biome`. Implemented as a declarative field list in `wire/structures/DimensionDefinition.ts` gated by `SINCE_2225`, not a subclass; the packet hands the stamped protocol version to the definition. Round-trip tested at both versions in `DimensionDefinition.test.ts` and `DimensionDataPacket.test.ts`. The schema ordinals are the only source: gophertunnel has no `DimensionDefinition` marshaller to compare against, and the server never sends the packet, so a live client has not confirmed the order.

## Verified but not implemented

These changed at 2225 and are verifiable from the same sources, but are not carried by `Codec2225` yet; a 2225 session inherits the 2193 layout for them. Each needs its own slice because it touches shared serializers or generated enums.

- **ItemStackRequestPacket / PlayerAuthInputPacket** — new `ItemStackRequestReservedAction` variant; `ItemStackRequestActionType` gains `CraftReservedAction = 18`, pushing `CraftNonImplemented` to 19 and `CraftResults` to 20. The enum half is no longer a blocker: `@jsprismarine/minecraft` now generates `generated/v2225/ItemStackRequestActionType.ts` with `CRAFT_RESERVED_ACTION = 18`, `CRAFTING_NON_IMPLEMENTED_DEPRECATED = 19` and `CRAFTING_RESULTS_DEPRECATED = 20` beside the 2193 enum (see the datagen note below). What is left is a version-aware `ItemStackRequest` reader that picks the enum by the session's protocol; until that exists a 2225 client's crafting requests are still read against the 2193 numbering.
- **LevelEventGenericPacket** — an optional trailing int64 `serverHandle` when the event id is 1900/1901. Changelog only: `LevelEventGenericPacketPayload.json` is byte-identical between the two releases and declares its body as opaque compound tag data, so the schemas neither confirm nor contradict this. Implementing it needs a second source.
- **The eight new packets' payloads** — ids are known (above); no class is implemented.

Not applicable: `ClientboundUpdateSoundDataPacket` (reworked into a tagged event variant) and `ClientboundAttributeLayerSyncPacket` (payload reworked into a oneOf) also changed, but this server implements no class for either, so there is nothing to version. `DimensionDataPacket` was listed here while its class did not exist; it now carries the 2225 `DimensionDefinition` layout (see above).

## Enum and data changes outside the packet layer

- `ContainerEnumName`: ReservedContainerA-D = 67-70. `DisconnectFailReason`: `SubClientLoginNotBound` = 150. `ActorType`: `Frostbite` = 199579, `IceBall` = 4194460. `persona::PieceType`: `CoCo` = 28, `Unsupported` moves to 29.
- `LevelEvent` removes SoundPaintingPlace (9817), SoundPaintingBreak (9818), CauldronCleanShulkerBox (9819) and CauldronDyeShulkerBox (9820).
- `CurrentCmdVersion`: net change Latest 53 → 55 (a version 55 entry was added in preview.28 and removed again in preview.30).
- Block permutation changes that move hashed runtime ids: chorus plant, fire and redstone dust gained connection/direction states.

The preview.21 section also prints mass "enum value changed" rows (GameType, BuildPlatform, ActorEvent, ContainerEnumName 18-66, `PacketCompressionAlgorithm` None 2 → 65535, and others) and many "is now optional" rows. Mojang's own note for that build says it updated the docs "to accurately reflect optionality of specific fields": these are the documentation being corrected to the engine's real values, not wire renumberings - CloudburstMC made the same read ([Protocol PR #367](https://github.com/CloudburstMC/Protocol/pull/367)), and this repo's 2193 code already uses the "new" values where it met them (`AnimateAction`, the optional swing source). Treat any row from that section as a docs fix unless cross-checked.

## Datagen and bedrock-data inputs

`packages/minecraft/datagen/manifest.json` declares `"2225"`, for its enums only.

**The pin is correct.** Re-verified 2026-10-29 by downloading the asset fresh: `v1.26.60`'s
`metadata.zip` hashes to the pinned `a030a45d…`, and every schema inside it declares
`"x-protocol-version": 2225`. This is the retail 1.26.60 release (published 2026-10-27, the
same day as BDS 1.26.60.6), not a preview. Two things that look like discrepancies are not:

- The `v1.26.60-preview.25` asset also named in the manifest belongs to the **2193** entry, as
  its `values` source — the first release whose schemas carry `x-enum-binary-value`, at protocol
  2211. It is not the 2225 entry's schema pin and does not need correcting.
- The schemas carry `"x-minecraft-version": "1.26.60-beta.0"`, an artifact of Mojang generating
  the docs from the beta branch. `x-protocol-version` is the field that decides, and it is 2225.

A `v1.26.61` release has since appeared (2026-10-29). Its `metadata.zip` extracts to a
byte-identical tree — same schemas, same `x-protocol-version: 2225` — differing only in zip
container metadata, so there is nothing to re-pin.

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

**What it still lacks.** Six enums have no schema in any release and come from the frozen 1.26.40 `enums.html` — `LevelEvent`, `ActorDataIDs`, `ActorFlags`, `ServerAuthMovementMode`, `AbilitiesIndex`, `CraftingDataEntryType`. The same six are absent from the v1.26.51 and v1.26.60 schema sets alike; re-reading both `metadata.zip` files by member name rather than by title, 1014 schemas each, finds no enum carrying any of them under another name, and the only other release asset is `developer_notes.zip`, which is build notes. Mojang publishes no newer HTML dump.

Since these are the same numbers at every protocol, they are no longer written per version. `pnpm generate` emits one copy to `src/generated/unversioned/`, headed `NOT VERSIONED` with the gaps `manifest.json` records under `legacy.knownGaps`, and each `v<protocol>/` directory re-exports it. Before that, 2193 and 2225 each carried a copy that differed only in its `Source:` line — which read as a value checked against that release, and was not.

The gap at 2225 is narrower than the removals above suggest, because the 1.26.40 dump predates the additions as well: `SoundPaintingPlace` 9817 through `CauldronDyeShulkerBox` 9820 arrived after 1.26.40 and left again at 1.26.60, so this package never carried them and nothing references them. What it does miss is `ParticleCreakingHeartTrail = 9816`. Separately, the dump printed `AllPlayersSleeping`, a deprecated member and `9800` as 3617, 3618 and 3619 — list positions rather than values, where gophertunnel reads 9800 and 9801. Nothing here sends any of the four, so no wire behavior turns on it.

`AbilitiesIndex` is the one of the remaining five that was cross-checked: gophertunnel v1.63.0's `protocol/ability.go` lists the same twenty members in the same order, ending at `AbilityCount`. The other four were not checked against anything, and the generated header says as much rather than implying they were. A third-party table is an oracle that says where to look here, never a source to copy from — this package takes its numbers from Mojang.

The entry declares `recipes` and still declares no `blocks`. Recipes were generated on 2026-10-29 against the pinned BDS 1.26.60.6 and reproduce; the output is 2193's recipe set exactly apart from the `minecraftVersion` header, because `vanilla_1.26.60` ships no recipe layer at all. The block palette is the half that is missing, and it is missing for a reason upstream of the manifest: the `palette` pass does not reproduce run to run — 54 blocks are neighbor-sensitive or randomized and three need a support block the place pass does not give them. Capturing it now would pin unstable data. `generate-blocks.js` skips a non-default version that declares no `blocks`; the default version still fails closed. To fill it in, once the palette producer imposes an order:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources --protocol 2225
pnpm --filter @jsprismarine/bedrock-data run dump:bedrock --pass palette --protocol 2225
pnpm --filter @jsprismarine/minecraft run generate:blocks
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
