# Java Edition clients over one world

Plan, 2026-11-21. The server speaks Bedrock over RakNet and NetherNet, holds three Bedrock protocol
versions at once and accepts a window of them ([ADR 0025](../adr/0025-older-protocols-are-a-window-relative-to-the-newest-release.md)).
Nothing speaks to a Java Edition client. This plan adds Java as a second protocol family over the
same world ([ADR 0026](../adr/0026-java-is-a-second-protocol-family-over-one-world.md)), and
rebuilds packet handling so that game behavior exists once for both editions
([ADR 0027](../adr/0027-player-inputs-are-decoded-into-intents.md)). The work lands as a series of
pull requests that each merge on their own with the Bedrock client suite green.

The values below are as they were on this date and stay unmarked, as the repository rules say for
dated plans.

## Progress

Branch `docs/java-multiprotocol-plan`, 2026-11-21.

| PR | Slice | State |
| --- | --- | --- |
| 1 | This plan, ADR 0026 and ADR 0027 | Done, [#3402](https://github.com/JSPrismarine/JSPrismarine/pull/3402). |
| 2 | `@jsprismarine/protocol` reshuffle: neutral root, `bedrock/` | Done, [#3408](https://github.com/JSPrismarine/JSPrismarine/pull/3408). |
| 3 | The intent table, decoder shape and dispatcher, with three Bedrock handlers migrated as proof | Done, [#3418](https://github.com/JSPrismarine/JSPrismarine/pull/3418). |
| 4 | Remaining Bedrock handlers migrated, one PR per area: interaction, session settings, block interfaces, movement and inventory | Interaction, session settings and block interfaces done ([#3421](https://github.com/JSPrismarine/JSPrismarine/pull/3421), [#3429](https://github.com/JSPrismarine/JSPrismarine/pull/3429), [#3431](https://github.com/JSPrismarine/JSPrismarine/pull/3431)). Block mining moved to the `mineBlock` intent with PR 10b. Movement and inventory wait for their slices. |
| 5 | The presenter seam: `PlayerSession` edition-neutral, the Bedrock presenter extracted | In progress. 5a, the contract and the sends intent handlers made themselves (time, game mode, default game mode, container close), done ([#3435](https://github.com/JSPrismarine/JSPrismarine/pull/3435)). 5b, chat and system messages, done ([#3441](https://github.com/JSPrismarine/JSPrismarine/pull/3441)). 5c, abilities, interaction settings and other players' game modes, done ([#3444](https://github.com/JSPrismarine/JSPrismarine/pull/3444)). 5d, position and look, done ([#3448](https://github.com/JSPrismarine/JSPrismarine/pull/3448)). 5e, the player list, done ([#3449](https://github.com/JSPrismarine/JSPrismarine/pull/3449)). Chunks and keep-alive move to PR 9; see section 4. |
| 6 | Replicator encoders keyed by edition and codec, Bedrock only | Done. Started in 9d: movement hands other-edition viewers plain moves their presenter encodes. Spawns go through the presenter's `showEntity`. 10g added equipment: an entity's facts carry what it holds and wears, and an equipment change reaches another edition's viewers through the presenter's `showEquipment`, while the replicator's tracked sends reach Bedrock viewers alone. 10h added entity state: an entity's facts and every metadata change carry whether it burns, crouches, sprints, swims, glides, sleeps or is invisible, which the Java presenter sends as the shared flags and the pose when they change. PR 6 is done. |
| 7 | TCP transport, Java handshake and status: the server appears in a Java client's server list | Done, [#3456](https://github.com/JSPrismarine/JSPrismarine/pull/3456). |
| 8 | Java login, Mojang session verification, configuration phase, registries and tags | Done: 8a packet ids ([#3458](https://github.com/JSPrismarine/JSPrismarine/pull/3458)), 8b login ([#3467](https://github.com/JSPrismarine/JSPrismarine/pull/3467)), 8c configuration ([#3471](https://github.com/JSPrismarine/JSPrismarine/pull/3471)). |
| 9 | Java play: chunks with light, own movement, chat, keep-alive. The first joinable milestone | In progress. 9a, the HeadlessMC driver and a `join` scenario, done ([#3475](https://github.com/JSPrismarine/JSPrismarine/pull/3475)). 9b, the world around spawn with light, done ([#3480](https://github.com/JSPrismarine/JSPrismarine/pull/3480)). 9c, the Java player joins the world: session, presenter, movement, chat and chunk streaming, done ([#3489](https://github.com/JSPrismarine/JSPrismarine/pull/3489)). 9d, other players and mobs shown to Java players, done ([#3498](https://github.com/JSPrismarine/JSPrismarine/pull/3498)). The first joinable milestone is met. |
| 10 | Java entities and other players, then inventory, then blocks and incremental light, each its own PR | In progress. Entities and other players came with 9d. 10a, block changes shown to Java players, done ([#3514](https://github.com/JSPrismarine/JSPrismarine/pull/3514)): the replicator hands a Java viewer the main-layer changes in its view, and the Java presenter sends `Block Update` or `Update Section Blocks`. A waterlogged block's water, which the world keeps in the liquid layer, reaches a Java client as the block's `waterlogged` state in chunks and in block changes since 10f. 10b, breaking blocks, done ([#3529](https://github.com/JSPrismarine/JSPrismarine/pull/3529)): Bedrock's mining actions and Java's `Player Action` decode into one `mineBlock` intent, the server times every Java break, and `Block Changed Ack` answers each dig after the tick's block changes. Placing blocks waits for the inventory slice, which tells the server what the player holds. 10c, the inventory, done ([#3544](https://github.com/JSPrismarine/JSPrismarine/pull/3544)): the session hands a Java presenter the player's containers as plain stacks, which it sends as window 0 with the held slot, and a Java client's hotbar choice and creative slots decode into `selectHotbarSlot` and a new `setCreativeSlot` intent. Stacks travel without data components, so names, enchantments and damage do not reach a Java client yet, and survival clicks in the window wait for the click-slot protocol. 10d, placing blocks, done ([#3549](https://github.com/JSPrismarine/JSPrismarine/pull/3549)): Java's `Use Item On` decodes into a `useItemOnBlock` intent, whose handler offers the click to the same content path Bedrock's transaction does, and `Acknowledge Block Change` answers it after the tick's block changes. Bedrock's transaction keeps its own route until the inventory protocol moves to intents. 10e, health and respawn, done ([#3564](https://github.com/JSPrismarine/JSPrismarine/pull/3564)): a Java client is shown its health, food and saturation through `Set Health` whenever one changes, a death opens its death screen through `Combat Death`, and its respawn button decodes into a new `pressRespawn` intent, which Bedrock's respawn action now goes through too; the respawn sends `Respawn` into the overworld before the session moves the player. Dimensions, done: a Java player logs in to the dimension their record left them in, which a linked account's Bedrock play may have left in the Nether, and is sent that world's chunks; a change of world, through a portal, a command or a respawn, sends `Respawn` into the new dimension and the chunks around the arrival, and completes at once, since a Java client has no loading screen to close. Boss bars, done: `BossBar` shows itself through each session's presenter, whose `showBossBar` the Java presenter sends as `Boss Event` under a UUID made from the bar, so the TPS bar and the dragon fight's bar reach a Java client. Titles, the scoreboard and the rest of the HUD wait for [#3770](https://github.com/JSPrismarine/JSPrismarine/issues/3770). Experience and effects come later. |
| 11 | Inverse mapping tables in `@jsprismarine/mapping`, landed when PR 9 needs them | Done. The inverse by name, `bedrockBlockStateToJava`, already existed; 11a added Java's block state ids ([#3473](https://github.com/JSPrismarine/JSPrismarine/pull/3473)). |
| 12 | Account linking: one person on a Java and an Xbox account, behind `account-linking`; see section 8 | Done, [#3509](https://github.com/JSPrismarine/JSPrismarine/pull/3509). Existing `permissions.json` files get the link nodes from version 3 of the file migrator, [#3522](https://github.com/JSPrismarine/JSPrismarine/pull/3522). |

Issues for the slices after PR 9 are opened when PR 1 merges and linked from this table.

## 1. What exists today

The Bedrock side is layered, and each layer is a seam the Java side can use or has to split.

| Layer | Where | What it knows about Bedrock |
| --- | --- | --- |
| Transport | `packages/prismarine/src/network/transport/` | Nothing. A frame is opaque bytes; `TransportNames` lists `raknet` and `nethernet`. |
| Framing, compression, encryption | `MinecraftSession`, `BatchCodec`, `EncryptionCodec` | Everything. The `0xFE` batch id, zlib and Snappy, AES-GCM with the Bedrock counter. |
| Codecs | `packages/protocol/src/bedrock/ProtocolCodec.ts`, `prismarine/src/network/codec/Codec2193.ts` and siblings | A codec is a protocol number, packet ids and a `ProtocolContext` of captured tables. Three releases are registered: 2193, 2225 and the 2259 preview. |
| Phases | `SessionPhase.ts` | `handshake`, `login`, `encryption`, `resourcePacks`, `play`. |
| Handlers | `prismarine/src/network/handler/`, 74 files | One handler per packet, registered by packet name, declaring its phases and lane ([ADR 0014](../adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)). Most validate and then call one `PlayerSession` method. |
| Session | `PlayerSession.ts`, about 140 public methods | Most build Bedrock packets: `sendInventory`, `openBlockContainer`, `sendAvailableCommands`, `sendGamemode`. |
| Replication | `NetworkWorldReplicator.ts` | Reads each sealed tick of the change log ([ADR 0016](../adr/0016-replication-reads-the-change-log.md)), decides who sees what, encodes once per Bedrock codec and broadcasts shared batches. |
| Light | `@jsprismarine/lighting` | Sky and block light per block, used by spawning, crops and daylight detectors and never sent, because no Bedrock packet carries light. |
| Content | `@jsprismarine/mapping` | Four total functions from Java identifiers to Bedrock ones, and one inverse for biomes. |
| Identity | `playerIdentity.ts`, and the `Subject` union in [the permissions plan](https://github.com/JSPrismarine/JSPrismarine/pull/3377), which adds `docs/plans/permissions.md` | Keyed by XUID or name. The permissions plan adds a `java` kind with no producer yet. |
| Java releases | `javaServer` in `packages/bedrock-data/sources.json` | One default release, 26.3, and one preview, 26.4-pre-1, with the jar, its data generator output and per-release derived data ([the datapack plan](java-datapack-version-support.md)). |

The Java client itself differs from the Bedrock client in four ways the design has to answer. It
connects over TCP with a length-prefixed frame, zlib above a threshold and AES-CFB8 after login. It
has no server-authoritative movement: it sends positions and accepts teleports. It computes no
light: the chunk packet carries sky and block light arrays. And it is told the registries it will
use during a configuration phase before play: dimension types, biomes, damage types, chat types and
tags.

## 2. The protocol package

`@jsprismarine/protocol` holds both editions. The edition-neutral modules stay at the root:
`NetworkPacket`, `FieldNetworkPacket`, `NetworkBinaryStream`, `NetworkStructure`, `handler/` and
the `wire/` machinery (`define.ts`, `WireLayout.ts`, `fieldTypes.ts`, `formatWireValue.ts`,
`networkUtil.ts`). Everything that names a Bedrock packet, table or version moves under
`src/bedrock/`: `packet/`, `structure/`, `payload/`, `wire/definitions/`, `wire/structures/`,
`wire/versions/`, `wire/wireGates.ts`, `wire/structureTypes.ts`, `ProtocolVersion`,
`ProtocolCodec`, `ProtocolCodecRegistry`, `ProtocolContext`, `PacketIdentifier`, `BatchCodec`,
`CompressionCodec`, `EncryptionCodec`, `HandshakeCodec`, `Snappy` and `BlockRuntimeId`. The codec
and its context move too because `createProtocolCodec` builds from the Bedrock packet classes and
`ProtocolContext` names Bedrock's captured tables; PR 7 lifts the edition-neutral codec interface
to the root when a Java codec gives it a second implementation. Two root modules still reach into
`bedrock/` after PR 2: `NetworkPacket` and `FieldNetworkPacket` take a `ProtocolContext` and
default their protocol to 2193, which PR 7 generalizes. `src/java/` is created in PR 7.

Every import of `@jsprismarine/protocol/bedrock/packet/X` across the repository becomes
`@jsprismarine/protocol/bedrock/packet/X`, and the package's `exports` map, the packet-codec baseline
and the wire-layout baseline move with them. PR 2 changes no behavior and carries a breaking-change
Changeset, which is a minor bump while the package is below 1.0. Bedrock stops being the unnamed
default: a reader of an import path sees which edition it belongs to.

A Java codec has the same `ProtocolCodec` interface. Its `protocolVersion` is Java's protocol number
(777 for release 26.3), its `minecraftVersions` the release ids, and its `ProtocolContext` the
per-release tables of section 6. A snapshot's protocol number has bit 30 set, so the existing rule
that a preview is newer than every release holds without a special case.

## 3. Inbound: intents and decoders

### The table

`packages/prismarine/src/input/intents.ts` declares every intent:

```ts
export const Intents = {
    Move: { lane: 'input', fields: ... },
    Chat: { lane: 'read', fields: ... },
    OpenInventory: { lane: 'input', fields: ... },
    ...
} as const satisfies IntentTable;
```

`Intent` is the union derived from the table, each member carrying its `kind`. The intent handler
registry keys on `kind`, the dispatcher reads the lane from the table, and a `never` check over the
union fails the build when a kind has no handler. The directory is `input/`, not `network/`,
because a script, a command block or a replay can produce an intent without a packet behind it.

### Decoders

A decoder is one pure function per edition and packet:

```ts
decode(packet: InteractPacket, view: SessionView): readonly Intent[]
```

`SessionView` is read-only: the player's runtime id, the actors they have been shown, the open
window, the game mode and the view distance. The interact handler's two checks today, that an
inventory open names the sender and that an NPC open targets a shown actor within reach, move into
its decoder. A check that reads the world, such as whether a block is loaded, stays in the intent
handler. A decoder that returns an empty list drops the packet, and logs why through the view's
logger.

Connection-lane handlers do not decode. Network settings, login, the encryption handshake and the
resource pack exchange on Bedrock, and the handshake, status, login and configuration phases on
Java, stay as handlers in ADR 0014's shape, per edition.

### Plugins

`PacketHandlerRegistry` keeps its packet-name registration, now per edition, and a plugin's packet
handler merges with the built-in decoder as `appendHandler` merges handlers today. A second
registry takes intent handlers by kind with the same merge rule. The scripting and addon surfaces
that expose packet events keep working through the first; behavior written once goes through the
second.

### Migration

PR 3 lands the table, the decoder shape, the dispatcher change and three migrated handlers chosen
for their spread: `InteractHandler` (input lane, with a view-only check in the decoder and a world
check in the intent handler), `AnimateHandler` (input lane, broadcast through the replicator) and
`BossEventHandler` (read lane). `CommandRequestHandler` was the first choice for the read-lane
proof and waits for PR 5: its acknowledgement echoes the request's Bedrock origin data, which is
the presenter's to send, not an intent handler's. PR 4 migrates the remaining 71 in four pull
requests, grouped by area, so a regression names its area. A handler that only logs and drops a
packet, such as the map requests and the pick requests, has no behavior to move and stays a
handler until a behavior exists for it; ADR 0027's rule applies to a packet with game meaning the
server acts on. A Bedrock-only feature with no Java counterpart, such as a skin change, a form
answer or the loading screen edges around a dimension change, also stays a Bedrock handler: an
intent for it would carry a Bedrock structure and have one producer. The handlers whose packets are Bedrock's own inventory protocol, the item stack
request and the inventory transaction, wait for the inventory slice in PR 10, where the neutral
inventory intents are designed with the Java click-slot protocol beside them. Each PR runs the Bedrock
client e2e suite, and the replay traces under `packages/prismarine` keep producing the same
digests, since a decoder plus an intent handler does what the handler did.

### The Java player's session

PR 9c makes a Java player a player session like a Bedrock player's: `createConnectedPlayer` and
`session.join()` as a Bedrock login uses them, over a `ClientConnection` whose transport drops the
Bedrock packets the session still sends, with a `JavaPresenter` for the contract's calls. Java's
`player_loaded` decodes into `playerInitialized`, chat into `chat` and `chat_command` into
`runCommand`, run by the same intent handlers in the same input step as Bedrock's, through one
`InputQueue` both editions share; a move goes through `applyClientMovement`, the movement a Bedrock
input applies, with `Confirm Teleportation` standing for Bedrock's `HandledTeleport`. A Java player
is shown to Bedrock players with their own skin, which the server fetches from Mojang's texture
server as they join, or the auth package's default skin when there is none to fetch.

### Movement

`Move` is one intent. It carries the claimed position, rotation and on-ground flag from both
editions, and the input bits and client tick when the edition sends them, which Bedrock does
through `PlayerAuthInputPacket` and Java does not. One validator applies the physics check, with the
tolerance keyed by edition: Java's "moved too quickly" distance per tick, Bedrock's rewind window.
The correction is the presenter's: Bedrock sends a prediction correction for the client tick, Java
a position synchronization with a teleport id the client echoes.

## 4. Outbound: presenters

`PlayerSession` becomes edition-neutral and owns a `presenter`. The presenter implements the
outbound contract: what the world, the command host and the intent handlers ask a session to show.
PR 5 names the contract by extracting what `PlayerSession` does today into a `BedrockPresenter`,
method by method, and leaves every caller calling the session. No Java presenter exists until PR 9,
and the contract grows slice by slice from what each Java slice needs, rather than all 140 methods
before the first Java client connects.

PR 5a starts the contract with the sends the intent handlers built themselves, the container
close reply and the default game mode, beside time and game mode, so `src/input/` builds no
packet. Two intent handlers still put Bedrock codes into world occurrences: the animation's
action code and the eating event's `FEED`. The occurrences take edition-neutral names with the
replicator encoders in PR 6, since replication is what reads them.

PR 5b moves chat and system messages. A message names its kind in the contract's terms (`raw`,
`chat`, `translation`, `system`, `announcement`, `whisper`, or `rawText` for a JSON text object),
and the Bedrock presenter picks the `Text` type for it, so chat, the command host and the
advancement announcement no longer name a Bedrock type.

PR 5c moves abilities, the settings a game mode decides, and the game mode a client keeps for each
player it knows. The abilities are the plain `AbilityTarget` the replicator already builds them
from, so first sight keeps its own Bedrock packet until PR 6.

PR 5d moves position and look. What produced a move is a `MoveMode` (`normal`, `respawn`,
`teleport`, `headRotation`) in place of Bedrock's `PositionMode`, through `setPlayerPosition`,
`sendMove`, `PlayerMoveEvent` and the command host, and the session keeps the teleport
acknowledgement it waits for.

PR 5e moves the player list. The roster holds a `ListedPlayer`, plain data, rather than Bedrock's
entry, and the presenter sends a joining client the whole list. The roster's own broadcasts, a
player added, removed or renamed, still build one Bedrock packet compressed once per codec: a skin
is large, and compressing it once per receiving player is the cost PR 6's encoders, keyed by
edition and codec, exist to avoid.

The order the first milestone needs is chunks, position and look, chat and system messages, time,
game mode and abilities, the player list, and keep-alive. Entities, windows, inventories, block
changes, forms, trade, maps, books and camera follow in PR 10's slices.

PR 5 closed with every item but chunks and keep-alive. Bedrock's chunk send is Bedrock from top
to bottom: the publisher view, sub chunk request mode, the client blob cache and a batch cache keyed
by codec. Where its seam falls depends on what a Java chunk encoder with light needs, so the chunk
contract is drawn in PR 9 beside that encoder rather than guessed at here. Keep-alive is no
presenter call: RakNet keeps a Bedrock connection alive itself, and Java's keep-alive belongs to
the Java connection, also PR 9.

Composition rather than subclassing: a subclass per edition would push edition checks into every
session method that calls another, and a presenter keeps the edition in one field.

## 5. Replication

`NetworkWorldReplicator` stays one replicator. It reads the sealed tick, decides the audience of
each change once, and hands each change to an encoder keyed by edition and codec. An encoder caches
one shared encoding per key per tick, so a block change seen by five Bedrock 2225 sessions and two
Java 777 sessions is encoded twice. PR 6 introduces the encoder seam with Bedrock only, and the
replica tests assert encode counts per key, as [Measuring performance](../../AGENTS.md#measuring-performance)
asks. Two replicators, one per edition, would compute the audience twice and were not chosen.

PR 9d started the seam where the milestone needed it. A session's presenter names its edition.
The replicator's movement flush keeps its shared, once-per-codec batches for Bedrock viewers and
hands any other viewer the moves it tracks as plain data, which its presenter encodes. An entity
coming into a session's view goes through the presenter's `showEntity`: the Bedrock presenter
queues the entity's own first-sight batch, and the Java presenter reads the entity's plain facts,
which `EntityReplication` offers through `describe()`, to send a player's profile and the spawn.

PR 6 comes after PR 9 rather than before PR 7. The first milestone's sends all go to the joining
player's own session, through its presenter, and the replicator's first Java consumer is PR 10's
other players and entities. The roster broadcasts PR 5e left building one Bedrock packet move with
it.

## 6. The Java transport, login and tables

### Transport

`TransportNames` gains `tcp`. A Java frame is a VarInt length prefix, then a VarInt packet id and
the payload, with zlib above the threshold the server sets after login and AES-CFB8 after the
encryption response. `TransportConnection` already treats a frame as opaque bytes, so the TCP
transport hands the session layer the frames and a Java `MinecraftSession` counterpart owns the
compression and cipher, the way the Bedrock one owns the batch and `EncryptionCodec`. The listener
opens on `java-port`, default 25565, only when `java-enabled` is true.

PR 7 built the transport, `src/java/` with the handshake, status and login disconnect packets, and
a `JavaHandshakes` responder that answers a server list ping and refuses a join. Those packets have
the same ids and layouts in every release, so they are declarative definitions read straight off a
frame, with no codec. The TCP transport shares the server's connection ids but is not one of the
Bedrock dispatcher's transports, since its frames are not Bedrock batches. Lifting the codec
interface to the protocol root, and generalizing `NetworkPacket`'s default protocol, move to PR 8,
where the Java codec first carries per-release packet ids. The layouts were checked by pinging the
pinned 26.3 vanilla server with them: it read the handshake, status request and ping, and they read
its status response, pong and login disconnect.

PR 8b checked the login the same way. Offline, vanilla's `Set Compression` and `Login Success`
decoded, the second only once it had the session id 26.3 added: one UUID for as long as the server
runs, from `ServerConnectionListener.getSessionId`. Online, vanilla read the encryption response
and sent its `unverified_username` refusal encrypted, and the client's cipher read it, so the RSA
and AES/CFB8 halves agree with vanilla's.

### Phases

Java's conversation is handshake, then status or login, then configuration, then play. The server's
`SessionPhase` gains `status` and `configuration`, and each Java handler declares the phases it
accepts, as Bedrock's do. The status handler answers the server list ping with the MOTD, the
advertised Java version and the count of players of both editions. The login handler runs the
Mojang session server check when `online-mode` is on, derives the offline UUID from the name when
it is off, and produces a `java` `Subject` for the permissions plan's identity.

### Configuration

The configuration phase sends the registries the client needs before it can decode play packets:
dimension types, biomes, damage types, chat types, wolf and cat variants, painting variants and the
tags over blocks, items, fluids and entity types.

PR 8c sends them the way vanilla 26.3 does. `capture:java-configuration` runs the pinned server
jar, logs in with this package's packets and records the feature flags, the known packs (vanilla
offers `minecraft:core` at the release's version), each registry's entry ids in order and every tag,
into `java/versions/<release>/configuration.json`. The server replays that: a client that has the
core pack gets every registry as ids alone and takes the data from its own copy, which is what
vanilla does for it too, and a client without the pack is turned away. Order is what gives a
registry entry its network id and tags name entries by those ids, so both come from the server
rather than being rebuilt from the datapack. Content the world adds beyond vanilla's, such as an
addon's biome, needs entries with data, which waits until a Java client can see such content.

### Tables and bring-up

Per-release Java wire tables live under `packages/protocol/src/java/versions/<release>/`: packet ids
per phase and direction, the block state id order, item ids, entity type ids and the registry
contents above. A `dump:java-protocol` script beside `dump:bedrock` generates them from the data
generator output and from a capture of the vanilla client talking to the pinned vanilla server jar, which
`ensure:worldgen` already downloads. Packet layouts are declarative ([ADR 0003](../adr/0003-declarative-wire-layouts.md)),
written from the community protocol page and checked against the capture, as the Bedrock layouts
are checked against a Bedrock Dedicated Server capture. No third-party data dump is a source, which
is [ADR 0019](../adr/0019-bedrock-data-comes-from-bds.md)'s rule applied to Java.

The [java-bringup skill](../../.agents/skills/java-bringup/SKILL.md) gains a protocol stage that
diffs packet ids, re-captures and updates the layouts. The protocol-bringup skill stays Bedrock's,
and its description says so.

## 7. Content for a Java client

### The inverse mapping

The world stores Bedrock block states, and a Java client has to be told Java ones. The forward table
in `@jsprismarine/mapping` is total from Java to Bedrock and lossy: 35723 Java states collapse onto
15953 Bedrock states. PR 11 derives the inverse from the forward table, one canonical Java state per
Bedrock state, picks `waterlogged` from the second block storage layer, and records every Bedrock
state with no Java candidate, such as Bedrock-only blocks, in the loss list with a substitute. The
same inverse is generated for items and entity types, where the forward mapping is nearly one to
one, and the biome inverse already exists.

The inverse by name and properties, `bedrockBlockStateToJava`, had landed by the time PR 11 began,
loss list included. What a Java client needs on top is the number: `dump:java-protocol` writes each
block's first state id and its properties in the order that numbers its states into
`java/versions/<release>/blockStates.json`, and `JavaBlockStates.idOf` turns a name and properties
into the id. The report lists a block's properties in another order than the one that numbers its
states (a chest's `type` before `facing`), so the generator reads the order off the ids, and a test
checks every state the report lists.

### The content setting

The window becomes per edition: `bedrock-protocol-window` and `java-protocol-window`, each counted
back from that edition's newest release, defaults of 1. `protocol-content` keeps its two values and
applies across editions:

- `newest` keeps the newest Bedrock release's content in the world. A Java session gets the loss
  list's substitute for a block, item or entity it cannot express, and the server logs at startup
  which content that affects, as it does today for an older Bedrock session.
- `oldest` sets the content floor to the content every accepted release of both windows has, so no
  session of either edition sees a substitute. A minigame server that wants every client to see the
  same world picks this.

A per-world narrowing of the setting, which ADR 0025 already leaves room for, stays open and gets
an issue with PR 1.

### The edition translation

A value both editions name, a block state or a biome, goes through one `EditionTranslation` with
`toJava` and `toBedrock`, which joins `@jsprismarine/mapping`'s name mappings in both directions to
each side's numbers: Bedrock runtime ids, and Java network ids from `JavaBlockStates.idOf` and its
inverse `stateOf`. Each answer is remembered both ways. A chunk going out uses `toJava`; a block a
Java player places will use `toBedrock`. A Bedrock-only block is sent as stone, and a Java state
the mapping cannot place becomes its listed fallback or air. Items and entity types join the same
interface when their slices need them.

### Light

The Java chunk packet carries the sky and block light arrays from `@jsprismarine/lighting` from
PR 9, so a world is lit on arrival. PR 9b reads them through the world's settled light reads, one
chunk at a time, gives every section above a chunk's highest block one shared full-sky array, and
lists dark sections as empty, as vanilla does; the lighting README says who sees its light now.
A Java client relights a block it is told changed with its own light engine, as it does under
a vanilla server, so PR 10a sends block changes without `Light Update`. A light update from the
server, for light a client cannot work out from the blocks it holds, waits until a scenario shows a
difference.

## 8. Identity

Who a player is across editions is decided in [the permissions plan](https://github.com/JSPrismarine/JSPrismarine/pull/3377), which adds `docs/plans/permissions.md`: a `Subject`
is `xbox` by XUID, `java` by Mojang UUID or `offline` by name, and nothing from an `offline` entry
applies to an `xbox` or `java` subject of the same name. The Java login in PR 8 is the first producer
of the `java` kind.

### Linked accounts

A player who owns both editions can link their Java account and their Xbox account, so either login
is the same person: one saved record, one set of permissions and one live session. The permissions
plan leaves room for this as a `links` section that points one subject at another, so no key
changes when a link is made or undone.

- **Setting.** `account-linking`, on by default, turns the commands and the lookup on. Off, the
  commands are not registered, links on disk are kept but ignored, and each account is its own
  player, as it is today. A server that wants editions kept apart turns it off.
- **Linking.** `/link` on one edition answers with a short code that expires after a few minutes.
  `/link <code>` on the other edition, by the same person, makes the link, so both accounts consent
  and nobody can claim another's. Only verified subjects link: `xbox` and `java` subjects of an
  online-mode server, never an `offline` one, whose name anybody can type.
- **Which account leads.** The account that asked for the code is the primary. The other subject's
  `links` entry points at it, and from then on its saved record, permissions and player key resolve
  to the primary's. Before confirming, `/link <code>` says which record the player keeps. The other
  record is left on disk untouched, so `/unlink` brings it back as it was.
- **One live session.** A linked pair counts as one account in the rule that lets only one session
  per account be live, so a login on the second edition replaces the first, as a second login of
  the same account does now.
- **Names.** Each edition keeps its own name on the wire, since a client checks the name its
  account carries, but chat, the player list and commands show the primary's name.
- **Admins.** `/perms` can make and undo a link between two subjects directly, for support, and a
  link shows on both subjects' entries.
- **Out of scope.** A global link service shared across servers, such as GeyserMC's, is not used:
  links live in the server's own data. An addon can add one later through the link store.

PR 12 keeps the links in `account-links.json`, an `AccountLinks` service the kernel provides,
rather than in a section of `permissions.json`: the link applies at login, where a linked account's
identity becomes the primary's name, XUID and subject, so the permissions, the saved record and the
one-live-session rule all follow without knowing about links. The commands are always registered
and say so while `account-linking` is off, so turning it on needs no restart. `/perms` linking for
admins is left for later. A verified Java account is keyed by its UUID (`java:<uuid>`), so it never
shares a saved record with a Bedrock namesake, and two verified accounts count as one only by
subject, so namesakes of both editions can play at once.

The link store and the lookup are PR 12. They come after PR 9, since linking needs a Java player
who can join, and they change no key the earlier PRs write.

## 9. Verification

### The milestone

PR 9 is done when, on a flat world, a Java client at the pinned release:

- joins and receives the chunks around spawn, lit;
- stands and walks without receiving a position correction;
- sends a chat message a Bedrock player sees, and sees one the Bedrock player sends;
- sees the Bedrock player's entity.

The last item is in because it proves the replicator encoders, which is the architectural risk.

### Drivers

Two drivers, for two jobs. For scripted CI, HeadlessMC with HMC-Specifics runs the real pinned Java
client with LWJGL stubbed, offline accounts allowed for that use, driven over its console. A small
TypeScript harness in `tools/client-e2e` wraps it with `connect`, `chat` and `wait_for`, and world
state is asserted server-side, as the Bedrock scenarios already do. For visual checks and pull
request recordings, mcpfabric runs on a windowed Fabric client: its MCP tools (screenshot with
entity markers, state, entities, chat, movement, interaction) match cinnabar's, and the
[pr-recordings skill](../../.agents/skills/pr-recordings/SKILL.md) gains a Java mode. mcpfabric
releases about seven weeks after a Java release and has no snapshot builds, so a bring-up carries a
local build.

PR 9a built the scripted driver: `pnpm run e2e:java` with `tools/client-e2e/headlessmc.json`
pinning HeadlessMC 3.0.0-RC8, the Fabric loader build and HMC-Specifics for 26.3 by SHA-256, and
everything they download kept under the repository cache. Two things the docs leave out: pinning
the loader build gives the game a directory named for it (`fabric-26.3-0.20.1`), which is where
HMC-Specifics has to go, and a `connect` sent before the client finishes loading its resources
never completes, so the driver polls `gui` until the loading screen is gone. Its first scenario
showed the real 26.3 client accepting PR 8's login and configuration and reaching play.

Not chosen, with the reasons as of this date: `@jsprismarine/client` growing a Java mode would test
our codecs against our codecs. azalea's 26.3 branch has been open for two months. mineflayer and
node-minecraft-protocol stop at 26.1, and a vanilla 26.3 server kicks mineflayer. MCProtocolLib is
current but is a packet library with no client behavior.

### CI

The `client-e2e` workflow gains a Java pin beside the cinnabar pins, one HeadlessMC and
HMC-Specifics version per Java release, running once per Java release and gated by a path filter on
`packages/protocol/src/java`, `packages/prismarine/src/input` and `packages/prismarine/src/network`.
A pull request push that touches none of them starts the same jobs as today. Each PR that touches
the workflow records the before and after job counts in its description.

## 10. Out of scope

- Chat signing, secure profiles and chat session keys. The server accepts unsigned chat and sends
  chat as system messages. This is not deferred and has no issue: there is no plan to add it.
- A Java-shaped world model, and translating Java packets into Bedrock packets at the connection.
  Both rejected in ADR 0026 and ADR 0027.
- Resource packs for Java clients, server-side rendering of Bedrock-only blocks through a Java
  resource pack, and Java-side plugin messaging channels.
- Per-world `protocol-content`, inventory, blocks, forms, trade, maps, books and camera for Java
  sessions, and incremental light updates. These are PR 10's slices and the follow-up issues.
