---
title: The eight packets protocol 2225 added
group: Documents
category: Research
---

# The eight packets protocol 2225 added

Protocol 2225 (Minecraft 1.26.60) added eight packets and renumbered nothing. Their ids have been
in `packages/protocol/src/wire/versions/v2225.ts` since the delta codec landed, as protocol
surface a codec knows about; this note records the field layout of each so they can be
implemented rather than decoded to `null`.

## Where these layouts come from

Mojang's `bedrock-protocol-docs` release **v1.26.60**, the `metadata.zip` this repository already
pins in `packages/minecraft/datagen/manifest.json` (sha256
`a030a45d825b9ec8ea6bb744283648d5db1c0111592a8fd5eb0096ff05a0464b`). Every schema in it declares
`"x-protocol-version": 2225`. Field order is each property's `x-ordinal-index`; the wire type is
`x-underlying-type` plus `x-serialization-options`.

Two conventions decide the cases a reader would otherwise have to guess at, and both are read off
the schema rather than assumed:

- **`Compression` means a varint.** An `int32` or `int64` carrying
  `"x-serialization-options": ["Compression"]` travels ZigZag-varint encoded, not fixed-width.
  `ActorUniqueID` is an `int64` with `Compression`, which matches how `StartGamePacket` already
  writes `entityId` as `t.varint64`. `Recipe Index` is an `int32` with `Compression`, so it is a
  ZigZag varint32 and **not** a little-endian `li32`.
- **A property absent from `required` is optional on the wire**: a presence `bool`, then the value
  when set. This is the shape `PassengerOfBlockArguments` already travels in where
  `AddActorPacket` carries it.

Unverified against a second implementation: gophertunnel v1.63.0 predates 1.26.60 and carries none
of these packets, and no capture exercises them (a vanilla login sends none, so they are absent
from the wire fixtures). The schemas are the sole source, which is why each definition below
records its ordinals. The first capture that contains one of these packets will check it through
the `protocol.wire-roundtrip` parity family like any other.

## Shared structures

| Structure | Layout |
| --- | --- |
| `ActorUniqueID` | `int64` + Compression → ZigZag varint64 |
| `SignedAudioContent` | `Compact JWT`: one `string` |
| `MatchmakingStateOptions` | `Triggering Player Name` string, `Triggered By Local Player` bool |
| `PassengerOfBlockArguments` | `BlockPos`, `Offset` Vec3, `Rotation` float, `RotationLimit` float, `EmoteType` uint8 |
| `ServerSoundHandle` | one `uint64` |
| `AudioContentRegistrationEntry` | `Audio Content ID` string, then `Shared Metadata`, `Server Content`, `Playback Content`, each a `SignedAudioContent` |
| `PlaySoundPacketPayload` | `Name` string, `Position` BlockPos, `Volume` float, `Pitch` float, `Loop Count` int32+Compression, `Bypass Listener Range Check` bool, `Server Sound Handle` (optional), `Playback Position Seconds` float (optional) |

Enums, with their `x-enum-binary-value` numbering:

- `MatchmakingState` (uint8): Idle 0, Matchmaking 1, MatchFound 2, Canceled 3, PlayerLeftParty 4,
  PlayerLeftServer 5, ServerShutdown 6, TimedOut 7, RequeueAsParty 8.
- `CursorItemDragState` (uint8): Start 0, Stop 1.
- `AudioContentPlaybackType` (uint8): Music 0, Sound 1.
- `PassengerOfBlockArguments::EmoteType` (uint8): Standing 0, Riding 1, Laying 2.

## The packets

| Id | Packet | Fields, in ordinal order |
| --- | --- | --- |
| 0x161 | `ClientboundMatchmakingStatePacket` | `State` uint8; `Destination Name` string; `Options` optional `MatchmakingStateOptions` |
| 0x162 | `ServerboundStonecutterSetRecipePacket` | `Container Id` uint8; `Recipe Index` varint32 |
| 0x163 | `ClientboundStonecutterSetRecipePacket` | `Player Id` varint64; `Container Id` uint8; `Recipe Index` varint32 |
| 0x164 | `ServerboundMatchmakingCancelPacket` | none; the payload schema declares no properties |
| 0x165 | `SetPassengerOfBlockPacket` | `Passenger` varint64; `PassengerOfBlockData` optional `PassengerOfBlockArguments` |
| 0x166 | `ServerboundCursorItemDragPacket` | `State` uint8 |
| 0x167 | `ClientboundPlayAudioContentPacket` | `Shared Metadata` SignedAudioContent; `Playback Content` SignedAudioContent; `Playback Type` uint8; `Play Sound` PlaySoundPacketPayload |
| 0x168 | `ServerboundRegisterAudioContentPacket` | `Registrations` list of `AudioContentRegistrationEntry` |

Note that `ClientboundMatchmakingStatePacket` lists `State` at ordinal 0 and `Destination Name` at
ordinal 1, so the enum travels first despite reading second in the schema's alphabetical property
order. Ordinals, not property order, decide the wire.
