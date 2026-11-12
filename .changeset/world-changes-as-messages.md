---
'@jsprismarine/prismarine': minor
---

A change of world that a command or a client packet starts no longer runs inside the input that asked for it. A `/tp` into another dimension, the `changeWorld` command and a change held behind a pending one or behind a death are filed with `DimensionTravel.moveTo` or `DimensionTravel.move`, and a later input step carries them out once the destination is ready. A dimension nobody has entered is built outside every tick, as is a world a command writes into first. Each player's later move waits behind an earlier one, so they land in the order they were filed. A change of the default game type writes the sender's world at once and sends each other world a message that its input step applies (`WorldMessages`). The client sees the same packets in the same order, one input step later than before. A shutdown applies the inputs and the messages still waiting before it kicks and saves the players, including a message filed again for a player who changed world in those inputs.

Breaking: `PlayerSession.setWorld` and `PlayerSession.releaseChangeHeldOverDeath` return nothing instead of a promise, `HandlerServices` has a required `messages` member, and the command layer's `worldFor` helper is gone. `WorldManager.stemFor`, `MoveTarget`, `stemTarget`, `spawnTarget` and `arrivalTarget` are new.
