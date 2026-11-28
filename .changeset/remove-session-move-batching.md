---
'@jsprismarine/prismarine': minor
---

`PlayerSession.sendMoveActor`, `queueMoveActor` and `flushQueuedMoves`, and the `MovedActor` type, are removed. Nothing in the server called them: a world's replicator batches its actors' moves, one pose an actor a tick.
