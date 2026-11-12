# MovePlayer positions after a server teleport

Research note, 2026-11-12. The question: after the server teleports a player, how should it treat
the positions a client reports with `MovePlayerPacket` until the client has applied the teleport?
How did Bedrock Dedicated Server, older clients and other servers handle it?

Values below are as found on this date, at the commits linked. They are not docs facts.

## Answer

No client this server supports moves with `MovePlayer`. Mojang deprecated the client-authoritative
mode that used it in protocol 800 (1.21.80) and removed the setting that selects it from
`StartGame` in protocol 818 (1.21.90). Protocols 2193 and 2225 have no way to ask a client for it.
The only `MovePlayer` senders left are this repository's own bot harness and test clients, and
other third-party tools.

For the old mode, Mojang's answer is explicit: the client sends a `PlayerActionPacket` with action
`HandledTeleport` (30), the `PlayerAction` twin of the `PlayerAuthInput` flag. The `MovePlayer`
packet itself carries no acknowledgment. A client never sends mode Teleport, and its `Tick` cannot
tell a stale report from a fresh one. Servers that predate the flag, or ignore it, used position:
PocketMine-MP 3 (the `MovePlayer` era) and dragonfly drop reports until one arrives within one block
of the target. Nukkit answers each stale report with a correcting `MovePlayer`. Geyser and Java
Edition drop reports and resend the teleport every 20 inputs or ticks. None of them releases a hold
on a timer.

The server takes no movement from a client's `MovePlayer`: `MovePlayerHandler` drops the packet,
and the teleport hold keeps its one rule, the `HandledTeleport` input flag at the target or the
timeout. The bot harness moves with `PlayerAuthInput` and adopts the teleports it is sent (#3041).
This was decided after the research, on 2026-11-12; see [Recommendation](#recommendation). The
research first proposed releasing the hold on a `MovePlayer` within one block of the target, or on
a `PlayerAction` `HandledTeleport`; that rule is kept below as the first of the options weighed.

## 1. Which clients still move with MovePlayer

Mojang's movement modes, from the `ServerAuthMovementMode` comments in the protocol 776 changelog
([changelog_776_1_14_25.md](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/legacy_changelogs/changelog_776_1_14_25.md)):

| Mode | Value | Client's movement packet |
|---|---:|---|
| `LegacyClientAuthoritativeV1` | 0 | `MovePlayerPacket` ("Primary motion and input data") |
| `ClientAuthoritativeV2` | 1 | `PlayerAuthInputPacket` |
| `ServerAuthoritativeV3` | 2 | `PlayerAuthInputPacket`, corrected with `CorrectPlayerMovePredictionPacket` |

The history of the setting:

- Protocol 415 (a 1.16.100 beta) turned `StartGame`'s `mIsServerAuthoritativeMovement` bool into the
  `ServerAuthMovementMode` enum
  ([changeLog_415_9_17_20.md](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/legacy_changelogs/changeLog_415_9_17_20.md)).
  `PlayerAuthInputPacket` is older than the oldest changelog in the repository (407); I did not
  find the version that added it in a primary source.
- Protocol 748 (1.21.40) added `mNewAuthMovementMode` with the three values above
  ([changelog_748_9_24_24.md](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/legacy_changelogs/changelog_748_9_24_24.md)).
- Protocol 800 (1.21.80) renamed value 0 to `LegacyClientAuthoritativeV1_Deprecated`
  ([changelog_800_4_8_25.md](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/legacy_changelogs/changelog_800_4_8_25.md), lines 362 to 364).
- Protocol 818 (1.21.90) removed `mAuthorityMode` from `SyncedPlayerMovementSettings`, removed
  `SetMovementAuthorityMode`, and deprecated `ClientAckServerData` "because only server
  authoritative movement exist"
  ([changelog_818_5_21_25.md](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/legacy_changelogs/changelog_818_5_21_25.md), lines 19, 55 to 56, 89 to 92;
  [developer_notes/us1392604.md](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/developer_notes/us1392604.md)).

Today `SyncedPlayerMovementSettings` holds only `Rewind History Size` and
`Server Authoritative Block Breaking`
([SyncedPlayerMovementSettings.json](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/json/SyncedPlayerMovementSettings.json)),
and this server's `StartGamePacket` writes the same two fields
(`packages/protocol/src/packet/StartGamePacket.ts:164`). The `MovePlayerPacket` page says: "For
client authoritative and server authoritative movement modes, it is only intended as a client-bound
packet"
([MovePlayerPacket.json](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/json/MovePlayerPacket.json)).
The deprecation guide lists packet 19 among "Deprecated client to server motion updates"
([MovementProtocolDeprecation.md](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/additional_docs/MovementProtocolDeprecation.md)).

So a retail client at protocol 2193 or 2225 moves only with `PlayerAuthInput`. I have no capture of
a current retail client sending a `MovePlayer` for its own player, and found no document saying it
does. Geyser notes that Bedrock 1.21.22 "started sending a MovePlayerPacket as soon as it got into
a bed"
([BedrockMovePlayer.java](https://github.com/GeyserMC/Geyser/blob/cbd42b8a0c47cef046b408411508c67f82cd8e3c/core/src/main/java/org/geysermc/geyser/translator/protocol/bedrock/entity/player/input/BedrockMovePlayer.java)),
which predates 818; I could not confirm whether a current client still does that.

The senders in this repository:

- `packages/client/src/bot/behavior/WalkBehavior.ts` and `LookBehavior.ts` send `MovePlayer` mode
  Normal every tick from a position the bot keeps itself. `Bot.ts` sets that position once from
  `StartGame` and registers no `MovePlayer` handler, so a bot never adopts a teleport the server
  sends it.
- `packages/client/src/TeleportChunks.test.ts` sends `MovePlayer` from a loopback client and does
  adopt the teleport: it reports the old position once, then the target.

The question is therefore about the bot harness and third-party tools, not about players.

## 2. What MovePlayer carries

From
[MovePlayerPacketPayload.json](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/json/MovePlayerPacketPayload.json)
and
[MovePlayerTeleportData.json](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/json/MovePlayerTeleportData.json):

- `Position Mode` (Normal 0, Respawn 1, Teleport 2, OnlyHeadRot 3): "When sent to the server this
  is always 'Normal' except when in a vehicle then it's 'OnlyHeadRot'." A client does not echo mode
  Teleport, and `MovePlayerHandler` already drops one (`CLIENT_MODES`).
- `Teleport Data` (`Teleportation Cause`, `Source Actor Type`, both int32) is "Present only when
  Position Mode is Teleport", so it never appears on a server-bound packet.
- `Tick`: "The client tick this movement corresponds to", a `PlayerInputTick`. For client-bound
  packets, "the server should supply the tick value corresponding to the most recently processed
  PlayerAuthInputPacket"
  ([PlayerInputTick.json](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/json/PlayerInputTick.json)).
  Protocol 415 said a server may send 0 when it does not use server-authoritative movement
  ([changeLog_415_9_17_20.md](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/legacy_changelogs/changeLog_415_9_17_20.md)).

The tick cannot mark the acknowledgment. The teleport carries the last tick the server processed,
`T`. The stale reports in flight were sent after `T` and carry `T+1`, `T+2` and so on, as do the
reports made after the client applied the teleport. Both kinds have ticks above `T`.

The acknowledgment for the old mode is a separate packet. Protocol 567 (1.19.60) added
`HandledTeleport` both as `PlayerActionType` 30 and as `PlayerAuthInput` input bit 37
([changelog_567_01_12_23.md](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/legacy_changelogs/changelog_567_01_12_23.md), lines 58 to 64).
The `PlayerActionType` description:

> Used to inform the server that we have received a MovePlayerPacket causing a teleport, and
> re-enable client auth movement. The server should ignore any client predicted positions from the
> moment a MovePlayerPacket was sent until receipt of this action. Corresponds to Player Auth Input
> InputData::HandledTeleport bit 37

([PlayerActionType.json](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/json/PlayerActionType.json), line 54).
"Re-enable client auth movement" fits the `MovePlayer` mode, and `PlayerActionPacket`'s own note
says "The expected actions change depending on the ServerAuthMovementMode"
([PlayerActionPacket.json](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/json/PlayerActionPacket.json)).
I infer, without a capture, that a legacy client from 1.19.60 to 1.21.70 acknowledged a teleport
with this `PlayerAction`. Before 1.19.60 there was no acknowledgment at all, which is why the
servers in section 3 use position. `PlayerActionHandler` here ignores `HandledTeleport`
(`packages/prismarine/src/network/handler/PlayerActionHandler.ts:365`).

## 3. Other servers

| Server | Hold starts | Hold ends | A report during the hold | Timeout |
|---|---|---|---|---|
| PocketMine-MP 3.28 (`MovePlayer`) | any `sendPosition` to the player | report within 1 block, 3D, feet | dropped | none |
| PocketMine-MP 5 (`PlayerAuthInput`) | any `syncMovement` | report within 1 block, 3D, feet | dropped; `MovePlayer` always discarded | none |
| Nukkit, 2020 (`MovePlayer`) | `teleport` | report within about 0.32 blocks, 3D, after the target's chunks are sent | dropped until the chunks are sent, then answered with a mode Reset `MovePlayer` | none |
| Nukkit, current (`PlayerAuthInput`) | `teleport` | as above | as above | none |
| PowerNukkitX | `teleport` | the window ends | dropped if more than 0.1 blocks from the target | 1 second, wall clock |
| dragonfly | `ViewEntityTeleport` for the player | report within 1 block, 3D, feet | dropped; `MovePlayer` has no handler | none |
| Geyser | Java `ClientboundPlayerPosition` | report within 0.1 on each axis | dropped; the teleport is resent every 20 reports | none |
| Java Edition 26.3 | `teleport` | `ServerboundAcceptTeleportation` with the matching id | position ignored, rotation applied; teleport resent after 20 ticks | none |

None of these servers reads `HandledTeleport`, in either form; I searched each file below for it.

### PocketMine-MP

PocketMine-MP 3.28, the last release line that moved players with `MovePlayer`
([Player.php at 3.28.0](https://github.com/pmmp/PocketMine-MP/blob/3.28.0/src/pocketmine/Player.php)):

- `sendPosition` (line 4079) sets `$this->forceMoveSync = $pos->asVector3()` for every mode it
  sends to the player, Teleport, Reset and Normal alike (lines 4093 to 4100).
- `handleMovePlayer` (line 2416) subtracts the eye height (`baseOffset`), then:
  `if($this->forceMoveSync !== null and $newPos->distanceSquared($this->forceMoveSync) > 1)`
  logs "Got outdated pre-teleport movement" and ignores the packet. The comment on that line:
  "Tolerate up to 1 block to avoid problems with client-sided physics when spawning in blocks".
  The first report within one block clears the lock: "treat it as a teleport ACK and remove
  position lock" (lines 2426 to 2434). There is no timeout.

PocketMine-MP 5, `stable` at
[6a7cc02e](https://github.com/pmmp/PocketMine-MP/blob/6a7cc02e9dff59b69241aa0bcffdb9903ce86beb/src/network/mcpe/handler/InGamePacketHandler.php):

- `NetworkSession::syncMovement` sends the `MovePlayer` with tick 0 and sets
  `$this->handler->forceMoveSync = true`
  ([NetworkSession.php](https://github.com/pmmp/PocketMine-MP/blob/6a7cc02e9dff59b69241aa0bcffdb9903ce86beb/src/network/mcpe/NetworkSession.php), lines 1060 to 1082).
- `InGamePacketHandler::handlePlayerAuthInput` applies the same one-block test against the
  player's current location (lines 204 to 215), then applies input flags, and moves the player only
  when not held (line 246).
- `MovePlayerPacket` is silently discarded: "Not needed, noisy debug when landing on ground"
  (line 125).

### Nukkit

Nukkit before it moved to `PlayerAuthInput`, at
[ff200280](https://github.com/CloudburstMC/Nukkit/blob/ff2002807b07ec89ec3a4d16766f86d87c4bb26a/src/main/java/cn/nukkit/Player.java)
(the last commit before 2020-06-01), `case ProtocolInfo.MOVE_PLAYER_PACKET` at line 2318:

- While `teleportPosition` is set the packet is dropped. `teleport` sets it, and
  `checkTeleportPosition` clears it once the 3 by 3 chunks around the target are sent, moving it to
  `forceMovement`.
- While `forceMovement` is set, a report more than `0.1` squared (about 0.32 blocks, 3D, feet) from
  it is answered with `sendPosition(this.forceMovement, ..., MovePlayerPacket.MODE_RESET)`. The
  first report within that distance clears `forceMovement` and moves the player.
- There is no timeout. A client that never reaches the target is corrected on every report.

Current Nukkit, `master` at
[d2d46fff](https://github.com/CloudburstMC/Nukkit/blob/d2d46ffff0b66ba8de0bdf4343fb8adb7df7d7bb/src/main/java/cn/nukkit/Player.java),
keeps the same rule for `PlayerAuthInput` (lines 3253 to 3255 and 3506 to 3518; `teleport` at about
line 6300, `checkTeleportPosition` at about line 6260) and no longer handles `MOVE_PLAYER_PACKET`.

### PowerNukkitX

`beta` at
[5b1618a2](https://github.com/PowerNukkitX/PowerNukkitX/blob/5b1618a2a1739aaa3e5e6f6d2a01ea592c12fb7b/src/main/java/org/powernukkitx/Player.java):
`teleport` stores `lastTeleportMessage = Pair.of(to.clone(), System.currentTimeMillis())`
(line 5990). `offerMovementTask` drops a report more than `movementDistanceThreshold` (default 0.1,
[PlayerSettings.java](https://github.com/PowerNukkitX/PowerNukkitX/blob/5b1618a2a1739aaa3e5e6f6d2a01ea592c12fb7b/src/main/java/org/powernukkitx/config/category/PlayerSettings.java), line 24)
from the destination while less than `POST_TELEPORT_GRACE_MS = 1000L` has passed (lines 247 and
1378 to 1385). It is a filter over a wall-clock window, not a hold released by the client.

### dragonfly

`master` at
[0f9a3a57](https://github.com/df-mc/dragonfly/tree/0f9a3a5736267db60bf46e92d408f81be1de9a64/server/session):

- `ViewEntityTeleport` stores `s.teleportPos` when the entity is the session's own player and sends
  a mode Teleport `MovePlayer` with `TeleportCauseUnknown` (`world.go`, lines 269 to 285).
- `PlayerAuthInputHandler` subtracts 1.62 and, while `teleportPos` is set, ignores a report more
  than 1 block (3D) from it: "Once we get a movement that is close enough to the teleport position,
  we'll allow the player to move around again" (`handler_player_auth_input.go`, lines 50 to 62).
  No timeout.
- `packet.IDMovePlayer: nil` registers no handler (`session.go`, line 603).

### gophertunnel

The `MovePlayer` packet comments
([move_player.go at e2251a60](https://github.com/Sandertv/gophertunnel/blob/e2251a60f71d5faa9784d6a4bc817c117cb6af78/minecraft/protocol/packet/move_player.go))
still describe it as "sent by players to send their movement to the server" and do not describe the
teleport exchange. `InputFlagHandledTeleport` exists in `player_auth_input.go` without a comment.

### Geyser

`master` at
[cbd42b8a](https://github.com/GeyserMC/Geyser/tree/cbd42b8a0c47cef046b408411508c67f82cd8e3c/core/src/main/java/org/geysermc/geyser):

- `JavaPlayerPositionTranslator` stores a `TeleportCache` with Java's teleport id, sends the
  Bedrock `MovePlayer`, and sends Java's `ServerboundAcceptTeleportationPacket` after a
  `NetworkStackLatency` round trip, not after the Bedrock position matches (lines 162 and 197 to
  198).
- `BedrockMovePlayer.translate`: "Ignore movement packets until Bedrock's position matches the
  teleported position" (line 60). Each held `PlayerAuthInput` goes to
  `GeyserSession.confirmTeleport` (line 2154), which clears the cache when `canConfirm` holds and
  otherwise counts it.
- `TeleportCache.canConfirm` needs each axis within `ERROR_X_AND_Z = 0.1f` / `ERROR_Y = 0.1f` of the
  collision-adjusted target. After `RESEND_THRESHOLD = 20` unconfirmed reports the teleport is sent
  again ("Make it one full second with auth input", lines 44 to 50 and 81).

## 4. Bedrock Dedicated Server

The only documented behavior is the `HandledTeleport` sentence quoted in section 2: ignore predicted
positions from the moment the `MovePlayer` was sent until the acknowledgment. The movement overview
adds that a client-bound `MovePlayer` carrying a tick is "Intended for things like teleports, not
quite the same as the correction packet", and that the client rewinds to that tick
([PlayerMovementOverview.md](https://github.com/Mojang/bedrock-protocol-docs/blob/88e783accb32a41f4e756e231c060bcd7b1ec462/additional_docs/PlayerMovementOverview.md)).
I found no changelog entry that describes BDS's timeout, tolerance, or resend behavior.

This repository's notes say the same:
[edition-behavior-differences.md](edition-behavior-differences.md) quotes the flag's description,
and [portals-and-dimension-travel.md](portals-and-dimension-travel.md) applies it to dimension
changes. Commit `3460940cc6` reports a retail client capture in which the first input from the new
place carries `HandledTeleport` and one stale input follows the teleport about one time in three. I
did not find that capture checked in, and there is no BDS capture of the exchange in the repository.
No capture can show BDS's legacy `MovePlayer` handling now: protocol 818 removed the mode.

## 5. Java Edition

From the 26.3 server jar (`net.minecraft.server.network.ServerGamePacketListenerImpl`, read with
`javap -c`; Mojang ships it unobfuscated):

- `teleport(PositionMoveRotation, Set<Relative>)` increments `awaitingTeleport` (wrapping at
  `Integer.MAX_VALUE`), records `awaitingTeleportTime`, and stores `awaitingPositionFromClient`.
- `handleMovePlayer` calls `updateAwaitingTeleport()`. While a position is awaited it applies only
  the packet's rotation and returns. `updateAwaitingTeleport` sends the teleport again when more
  than 20 ticks have passed since the last send.
- `handleAcceptTeleportPacket` acts only when the id equals `awaitingTeleport`. It snaps the player
  to the awaited position, records it as the last good position, clears the wait, and then runs the
  position the packet carries through `handlePlayerPositionChange`.

The hold has no timeout. It ends on an acknowledgment that names the teleport, and in the meantime
the server repeats the teleport.

## Recommendation

**Decided, 2026-11-12:** the server takes no movement from a client's `MovePlayer`, and the rule
below was not kept. No client of a supported protocol moves with the packet, and Mojang's docs name
`PlayerAuthInput`'s predicted vehicle as the server-bound equivalent of the one field a vehicle rider
filled in, so not even the `OnlyHeadRot` case remains. A rule kept for the bot harness alone was
not worth its cost. `MovePlayerHandler` drops the packet with a debug line, the teleport hold keeps
its one rule (the `HandledTeleport` input flag at the target, or the timeout), and the bot moves with
`PlayerAuthInput` and adopts the teleports it is sent (#3041).

### Options weighed

1. **Release on a `MovePlayer` near the target.** This is the rule of every server that saw
   `MovePlayer` clients (PocketMine-MP 3, old Nukkit) and of dragonfly today. One block in 3D is the
   common tolerance. Both this server's teleport and a client's report are eye positions
   (`PlayerSession.ts:170` and `sendMove`), so the comparison needs no offset. A tolerance tighter
   than one block fails a client that has fallen or been pushed out of a block before reporting.
   PocketMine's comment names that case. Its weakness: it cannot tell two teleports sent in a row
   apart when they are less than a block apart. That case costs at most a block of rollback.
2. **Release on a matching `tick` or mode.** Rejected. A client never sends mode Teleport, and the
   ticks of stale and fresh reports are both above the teleport's tick (section 2).
3. **Answer a stale report with a correcting teleport.** Nukkit corrects every stale report; Geyser
   and Java resend every 20. Correcting every report doubles the server's sends for a client that
   is only late. Resending after a delay is the fix for a lost or ignored teleport, but it applies
   to `PlayerAuthInput` as much as to `MovePlayer` and changes `sendMove`'s contract, so it is a
   separate decision. If taken, resend every 20 ticks while held, the Java figure.
4. **Keep the timeout as the only release.** Rejected. A `MovePlayer` client freezes for 100 ticks
   after every teleport. When the timeout fires, the server takes the next report whatever it
   says. A client that never adopted the teleport, as this repository's bot, then moves the player
   back to where it was before the teleport. That is the outcome the hold exists to prevent.

`PlayerAction` `HandledTeleport` is Mojang's acknowledgment for the old mode. It is cheap to accept,
but no supported client is known to send it, so it cannot be the only release.

### The rule

For a `MovePlayer` from the client while `teleportAwaitingAck` is set:

- Release the hold and apply the report when its position is within 1 block of the target in 3D.
- Release the hold on a `PlayerActionPacket` with `HandledTeleport`, then apply later reports.
- Otherwise drop the report, as now.

Leave the `PlayerAuthInput` rule as it is: the flag within 4 blocks on x and z, or the timeout.

### Code changes

- `PlayerSession.teleportAwaitingAck` also records `y`.
- `holdsMovementForTeleport(position, handledTeleport)` takes what the report is instead of a bare
  flag, for example `ack: 'handled-flag' | 'position'`. With `'position'` it releases when the 3D
  distance is at most a new `TELEPORT_MOVE_PLAYER_RADIUS = 1`. The timeout stays for both.
- `applyClientMovement` passes the kind from `ClientMovement`; `MovePlayerHandler.handle` sets
  `'position'` and `PlayerAuthInputHandler` keeps passing the flag.
- `PlayerActionHandler` handles `PlayerActionType.HandledTeleport` by clearing the hold through a
  `PlayerSession` method, in place of the no-op case at line 365.
- In `packages/client`, `Bot` handles a `MovePlayer` for its own runtime id in mode Teleport or
  Respawn by setting `bot.position` to it. Without that, every rule above leaves a bot out of step
  with the server after a teleport. This is a bug in the harness today.

`sendMove` holds only for mode Teleport. PocketMine-MP holds for every server-sent move, and the
mode Respawn reset that `applyClientMovement` sends on a canceled move has the same race. Extending
the hold to Respawn is worth a separate look.

### Tests that pin it

In `PlayerSessionTeleport.test.ts`, or `MovePlayerHandler.test.ts` through the real handler:

1. After a teleport to (100, 65.62, 100), a `MovePlayer` at the old spot is dropped and the player
   stays at the target.
2. A `MovePlayer` at (100.6, 65.62, 100.6) is applied at once, without waiting for the timeout.
   Every later report moves the player.
3. A `PlayerAuthInput` at the target without `HandledTeleport` is still held, so the input rule is
   unchanged.
4. A `PlayerAction` `HandledTeleport` releases the hold, and the next `MovePlayer` moves the player
   wherever it is.

`TeleportChunks.test.ts` can also assert that the server-side player follows the loopback client's
first report after the teleport, which today waits for the timeout. A bot test can check that a bot
reports the target after it receives a teleport.

## Could not verify

- That any 1.21.80 or later retail client sends `MovePlayer` for its own movement in any situation.
  Geyser's bed note is from 1.21.22.
- That a legacy-mode client from 1.19.60 to 1.21.70 sent `PlayerAction` `HandledTeleport`. The
  inference rests on Mojang's description, not on a capture.
- What BDS did with `MovePlayer` reports during the hold: tolerance, timeout, resend. Neither
  Mojang's docs nor a capture in this repository says.
- The retail capture cited in commit `3460940cc6`; it is not in the repository.
- The protocol version that introduced `PlayerAuthInputPacket`, which predates the oldest changelog
  in `bedrock-protocol-docs`.

## Reproduce

```sh
git clone --depth 1 https://github.com/Mojang/bedrock-protocol-docs.git
grep -rn "HandledTeleport\|ServerAuthMovementMode\|mAuthorityMode" bedrock-protocol-docs/legacy_changelogs bedrock-protocol-docs/json
gh api "repos/pmmp/PocketMine-MP/contents/src/pocketmine/Player.php?ref=3.28.0" --jq .content | base64 -d | grep -n forceMoveSync
gh api "repos/df-mc/dragonfly/contents/server/session/handler_player_auth_input.go" --jq .content | base64 -d | grep -n teleportPos
# Java Edition: the bundled jar inside server.jar, then
javap -p -c -cp server-26.3.jar net.minecraft.server.network.ServerGamePacketListenerImpl | grep -n awaitingTeleport
```
