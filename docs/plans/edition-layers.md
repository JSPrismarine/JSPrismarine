# Edition layers: generic game logic, per-edition adapters, per-version wire

Status: accepted direction, started 2026-11-25. Slices land as stacked pull requests, one each.

Progress:

- Slice 1, the player layer: merged in [#3737](https://github.com/JSPrismarine/JSPrismarine/pull/3737).
- Slice 2, the edition folders: merged in [#3738](https://github.com/JSPrismarine/JSPrismarine/pull/3738).
  The handler contexts went to `player/context/` rather than an edition, since the intent handlers
  use them, and `BlockTarget` and `contentUseOnBlock` to `input/handlers/`. `applyClientMovement` and `replaceOtherLogins`, which both editions call,
  came out of their Bedrock handlers into `player/`.
- Slice 3.1, movement: merged in [#3754](https://github.com/JSPrismarine/JSPrismarine/pull/3754). A move, a jump, a sprint, a sneak, a flight, a bed and the held
  buttons are intents. Bedrock's `PlayerAuthInput` and `PlayerAction` decode into them, and so do
  Java's move packets, `Player Command` and `Player Input`. Java sends no jump, so a Java move that
  leaves the ground going up is one, as vanilla's `handleMovePlayer` decides. Bedrock's input mode
  stays Bedrock's, since only Bedrock has touch, mouse and gamepad modes.
- Slice 3.2, blocks: merged in [#3837](https://github.com/JSPrismarine/JSPrismarine/pull/3837). Mining was already the `mineBlock` intent, so what was left is
  a block pick, an entity pick and a lectern page turn. Each is an intent, decoded from Bedrock's
  `BlockPickRequest`, `ActorPickRequest` and `LecternUpdate` and from Java's `Pick Item From Block`
  and `Pick Item From Entity`. Java turns a lectern's page with a container button, which waits for
  the screens slice. Picking still only logs, as it did. A sign edit arrives as Bedrock's
  `BlockActorData`, which no handler reads yet, and Java's `sign_update`
  ([#3775](https://github.com/JSPrismarine/JSPrismarine/issues/3775)), so it is a feature to build
  rather than a handler to move.
- Slice 3.3, item use: merged in [#3845](https://github.com/JSPrismarine/JSPrismarine/pull/3845). `InventoryTransaction`'s bodies are intents: a use on a block,
  a use at nothing, a hit, a use on an actor and a release, beside the client-timed break that is
  `mineBlock`'s `finish`. Java decodes `Use Item`, `Attack`, `Interact` and `Player Action`'s
  release into the same ones. The Bedrock handler keeps what only Bedrock has: checking the
  transaction against the docs, the hand slot it names, the mismatch report and the legacy
  two-action drop. `ItemStackRequest`, which moves stacks between Bedrock's windows, is not in this
  slice: Java moves them with `Container Click`, by slot and button, so the two need a shared
  model of a stack move before either decodes into it, and that is a slice of its own after the
  screens.
- Slice 3.4, screens: merged in [#3851](https://github.com/JSPrismarine/JSPrismarine/pull/3851). An anvil's wear, a crafter's slot toggle, a lab table action
  and a recipe book's settings are intents. Bedrock's `AnvilDamage`, `PlayerToggleCrafterSlotRequest`,
  `LabTable`, `SetPlayerFurnaceOptions` and `SetPlayerInventoryOptions` decode into them, and Java's
  `Change Recipe Book Settings` into the recipe book's. Java toggles a crafter's slot, turns a
  lectern's page and picks a villager's trade by container id, inside a screen the server has
  opened. The server opens no screen for a Java client yet, so those wait until one does, with
  `Container Click`. The trade and workstation rules, `tradeScreen` and `workstation`, are game
  logic that only `ItemStackRequest` uses, so they move with it.
- Slice 3.5, forms, books and commands: merged in [#3854](https://github.com/JSPrismarine/JSPrismarine/pull/3854). A form's answer, a book edit and a command
  block's or a command block minecart's edit are intents. Bedrock's `BookEdit` and
  `CommandBlockUpdate` decode into them, and `ModalFormResponse` hands its answer to
  `answerForm` once it has checked the answer is JSON, which disconnects a client when it is not,
  as BDS does. Java's `Edit Book`, `Set Command Block` and `Set Command Minecart` decode into the
  same intents. A Java screen sends no command block name or tick delay, so an edit that leaves a
  field out keeps the block's own. `CommandRequest` already runs the shared command manager, and
  its reply echoes Bedrock's request origin, so it stays Bedrock's. The data-driven screens are
  Bedrock's own UI, kept in the Bedrock session's screen state, and stay too. Structure blocks
  move with what remains, slice 3.6. The `network/` aliases are gone.
- Slice 3.6, what remains: under review. A structure block's settings and its save, load, scan or
  query are intents, which Bedrock's `StructureBlockUpdate` and `StructureTemplateDataRequest` and
  Java's `Set Structure Block` decode into. What is left in `editions/bedrock/handler/` is
  Bedrock's own, and stays:
  - The connection and the join: login, the handshake, network settings, the packs, the client
    cache, sub-chunks, the loading screen, latency, disconnects and violation warnings.
  - Packets only a Bedrock client sends about itself or its own features: the skin, the emote
    list, client options, diagnostics, aim assist, the old `MovePlayer`, and a player location a
    client has no business sending.
  - Education Edition and Marketplace features: multiplayer settings, photos, receipts, NPCs and
    world templates (`SimpleEvent`).
  - Requests a Java client makes some other way or not at all, which wait for the feature behind
    them: map data and locked copies (Java is sent a map's data unasked), riding links, the
    lodestone database and a difficulty change from the settings menu.
  - The handlers that wrap Bedrock's protocol around an intent: `PlayerAuthInput`, `PlayerAction`,
    `InventoryTransaction`, `ModalFormResponse` and `CommandRequest`, and `ItemStackRequest`, which
    waits for its own slice beside Java's `Container Click`.
- Slice 4.1, the player's own state: merged in [#3871](https://github.com/JSPrismarine/JSPrismarine/pull/3871). `showAttributes`, `showMotion`,
  `showActorData`, `showRespawned` and `showGameRules` are presenter calls, and `showDeath`
  carries where the player comes back, so Bedrock's presenter sends the death screen's `Respawn`
  and `DeathInfo` itself. Two of `PlayerSession`'s six edition checks are gone, the attributes' and
  the death screen's.
- Slice 4.2, the player's own inventory: merged in [#3875](https://github.com/JSPrismarine/JSPrismarine/pull/3875). `showInventory` and `showOwnSlot` are
  `BedrockPresenter`'s to send now, read from the session's inventory with the stack ids Bedrock
  names stacks by, and `openOwnInventory` opens the player's inventory screen under a window the
  session records. `ShownContainer` names the cursor too, which Java does not show. Two more of
  `PlayerSession`'s edition checks are gone, the inventory's and the slot's, and its
  `sendHandItem` and `sendArmorFor` with them.
- Slice 4.3, block containers and trades: merged in [#3876](https://github.com/JSPrismarine/JSPrismarine/pull/3876). `openContainer`, `showTradeOffers`,
  `showContainerData` and `showContainerSlots` are presenter calls. The session keeps the window
  table, the open container and which of its properties the client already has, and the
  presenter sends the packets. `sendContainerSlot`, which only Bedrock's handlers call, is
  `editions/bedrock/containerSlot.ts` now. A Java client is opened no screen yet
  ([#3769](https://github.com/JSPrismarine/JSPrismarine/issues/3769)).

## Problem

`packages/prismarine/src/network/` holds the transport and the wire, and also most of what a
player is and does: the session, which chunks a client has, which entities it sees, keep-alives,
admission, boss bars, trades, maps. About 50 Bedrock packet handlers under `network/handler/` run
game logic themselves rather than handing it on. A behavior written there exists for Bedrock only,
and the Java Edition support ([the Java plan](java-multiprotocol.md)) has to write it again or go
without.

[ADR 0027](../adr/0027-player-inputs-are-decoded-into-intents.md) started the split for inputs:
an edition decodes a packet into an intent, and one intent handler runs it for both. Outbound,
[ADR 0026](../adr/0026-java-is-a-second-protocol-family-over-one-world.md)'s `SessionPresenter` is
the contract both editions implement. This plan finishes the split and moves the code to match.

## The three layers

1. **Generic.** What a player asks for is an intent, run by one handler for both editions
   (`input/`). What a player is shown is a `SessionPresenter` call. The session, its chunks, its
   entities, its keep-alive, admission and arrival are game logic with no edition in them
   (`player/`).
2. **Per edition.** An edition decodes its packets into intents, implements the presenter, and
   owns its join exchange (`editions/bedrock/`, `editions/java/`). An edition's code holds no game
   rule: when it decides something about the world, the decision moves to the generic layer.
3. **Per version.** Inside an edition, a version is a wire concern: Bedrock's per-protocol codecs
   and wire gates ([ADR 0003](../adr/0003-declarative-wire-layouts.md)), Java's per-release packet
   tables and handler lookup. A decoder or a presenter that differs by version asks the version's
   table or gate; it is never copied per version.

`network/` keeps what is network: transports, codecs, the dispatcher, the connection, batching,
compression, encryption and packet traces.

## Target layout

| Now                                                                                                                                        | Moves to                            |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `PlayerSession`, `ChunkView`, `ChunkSender`, `EntityTracker`, `KeepAlive`, `playerAdmission`, `playerArrival`, `BossBar`, `carriedMaps`, `sessionPlayers`, `createConnectedPlayer` | `player/`                           |
| `presenter/SessionPresenter` and the `shown*` shapes                                                                                       | `player/presenter/`                 |
| `InputQueue`                                                                                                                               | `input/`                            |
| `decoder/`, the Bedrock packet handlers in `handler/`, `BedrockPresenter`, the join burst, `startGameData`, `contentPayloads`, `joinPacketCache` and the other Bedrock packet builders | `editions/bedrock/`                 |
| `network/java/`                                                                                                                            | `editions/java/`                    |
| Game logic inside a Bedrock handler                                                                                                        | an intent and its handler, `input/` |

A moved or replaced module's old public subpath is removed, not kept as a deprecated alias or a
shim, and its changeset names the replacement. Removing a subpath that a release published is a
breaking change, with the bump [the versioning policy](../guide/versioning.md) gives it. Slice 3.5
removed the `network/` aliases slices 1 and 2 had left.

## Slices

1. **Player layer.** Move the edition-neutral modules in the first row of the table, and their
   tests, to `player/`, and `InputQueue` to `input/`. Mechanical: no behavior changes.
2. **Edition folders.** Move `network/java/` to `editions/java/`, and the Bedrock decoders,
   presenter, join burst and packet builders to `editions/bedrock/`. Mechanical.
3. **Bedrock handlers into intents**, one area per slice. Java decodes into the same intents where
   it has the packet.
   1. Movement: `PlayerAuthInput`, `MovePlayer`.
   2. Blocks: `PlayerAction`, `BlockPickRequest`, block entity updates.
   3. Inventory: `InventoryTransaction`, `ItemStackRequest`, `MobEquipment`.
   4. Screens: anvil, lab table, crafter, furnace options, trading.
   5. Forms, books and commands: `ModalFormResponse`, `BookEdit`, `CommandRequest`, command and
      structure blocks.
   6. What remains in `handler/`.
4. **Outbound.** `PlayerSession` still sends Bedrock packets itself in many places, which a Java
   connection drops. Each becomes a `SessionPresenter` call, so the session holds no edition.
   `BedrockPresenter` is built with a small `BedrockSessionState`, the session state Bedrock's
   packets carry beside what the contract hands it, so the shown types stay plain.
   1. The player's own state: attributes, motion, actor data, the death screen, coming back
      alive and game rules.
   2. The player's own inventory: its contents, one of its slots, the held item and the armor,
      and the screen the player opens on it. Bedrock names every stack by a network id it
      assigns on the inventory, which `BedrockSessionState` grows to reach.
   3. Block containers and trades: the screen a block or a trader opens, its offers, its
      properties and its slots.
   4. The world change, the respawn exchange and Bedrock's chunk path, which becomes a
      `ChunkWire` beside Java's, and the creative inventory and the crafting data, which only
      Bedrock's join sends and which move with the join burst.

## Where new code goes

- A rule of the game: `player/`, `world/`, `entity/` or `input/handlers/`, never an edition folder.
- Something a client sends: a decoder in its edition that produces an intent.
- Something a client is shown: a `SessionPresenter` method, implemented by each edition.
- Something only one version of one edition has: a gate or a version table entry in that
  edition's wire, never a branch in game logic.
