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
- Slice 3.2, blocks: under review. Mining was already the `mineBlock` intent, so what was left is
  a block pick, an entity pick and a lectern page turn. Each is an intent, decoded from Bedrock's
  `BlockPickRequest`, `ActorPickRequest` and `LecternUpdate` and from Java's `Pick Item From Block`
  and `Pick Item From Entity`. Java turns a lectern's page with a container button, which waits for
  the screens slice. Picking still only logs, as it did. A sign edit arrives as Bedrock's
  `BlockActorData`, which no handler reads yet, and Java's `sign_update`
  ([#3775](https://github.com/JSPrismarine/JSPrismarine/issues/3775)), so it is a feature to build
  rather than a handler to move.

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

A moved module's old public subpath, such as `@jsprismarine/prismarine/network/PlayerSession`,
stays in `package.json` as an alias of its new file, so the move breaks no consumer. The aliases
are marked deprecated in the changeset and removed in a later breaking release.

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

## Where new code goes

- A rule of the game: `player/`, `world/`, `entity/` or `input/handlers/`, never an edition folder.
- Something a client sends: a decoder in its edition that produces an intent.
- Something a client is shown: a `SessionPresenter` method, implemented by each edition.
- Something only one version of one edition has: a gate or a version table entry in that
  edition's wire, never a branch in game logic.
