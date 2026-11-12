---
"@jsprismarine/client": patch
---

Bots move with `PlayerAuthInputPacket`, one per tick, as a client of a supported protocol does, and no longer send `MovePlayerPacket`, which the server now drops. A bot adopts the position of a `MovePlayerPacket` in mode Teleport or Respawn that names its own runtime id, and its next input carries `HandledTeleport`, so a teleported bot no longer snaps back to where it was. Behaviors ask for the tick's input with the new `BehaviorContext.input`, `Bot.tick` is public so a test can step a bot, and `BotOptions` takes a `transport`.
