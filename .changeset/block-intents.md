---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

A block pick, an entity pick and a lectern page turn are intents, which both editions decode into: Bedrock's `BlockPickRequest`, `ActorPickRequest` and `LecternUpdate`, and Java's `Pick Item From Block` and `Pick Item From Entity`, which the protocol package now defines. `PickBlockHandler`, `PickEntityHandler` and `TurnLecternPageHandler` under `input/handlers/` replace the three Bedrock packet handlers. An entity pick names the actor by runtime id and is dropped when the player was never shown that actor. Picking still only logs, as before.
