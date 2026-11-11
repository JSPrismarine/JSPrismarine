---
"@jsprismarine/prismarine": minor
---

Player events carry the player's session instead of the `Player`.

Breaking: `PlayerEvent.getPlayer()` is gone from every player event: `playerChangeDimension`, `playerConnect`, `playerDespawn`, `playerDisconnect`, `playerMove`, `playerSetGamemode`, `playerSpawn`, `playerToggleFlight`, `playerToggleOperator` and `playerToggleSprint`. To name the player, read `event.getRuntimeId()` or `event.getIdentity()`, which give the entity id and the name, XUID and UUID the player logged in with. To act on the player, use the new `event.getSession()`, which returns its `PlayerSession`: it sends to the client (`sendMessage`, `kick`, `send`), and `getSession().getPlayer()` reaches the player's state while it is connected. `event.getPlayer().getName()` becomes `event.getIdentity().name`.

Each event's constructor takes the session, or anything with a `getNetworkSession()` that returns one, in place of the `Player`. `PlayerMoveEvent.getFrom()` still reports where the player stood when the event was built.
