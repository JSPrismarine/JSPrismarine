---
"@jsprismarine/prismarine": patch
---

Player events, permissions and bans can now name a player by its runtime id and login identity, without a `Player` object.

- Every player event (`PlayerChangeDimensionEvent`, `PlayerConnectEvent`, `PlayerDespawnEvent`, `PlayerDisconnectEvent`, `PlayerMoveEvent`, `PlayerSetGamemodeEvent`, `PlayerSpawnEvent`, `PlayerToggleFlightEvent`, `PlayerToggleOperatorEvent` and `PlayerToggleSprintEvent`) extends the new `Events.PlayerEvent`, which adds `getRuntimeId()` and `getIdentity()` (name, XUID and UUID). `getPlayer()`, the constructors and each event's own accessors are unchanged.
- `PermissionManager.getPermissions` and `setPermissions` take a login identity (`{ uuid }`) as well as a player. An operator's extra grants come from the operator list by that UUID, which is what `Player.isOp` already read. The new `PermissionHolder` type names what they accept, and `PermissionSubject` is now structural: anything with `isOp()` and `getPermissions()`.
- `BanManager.isBanned` takes a login identity (`{ name }`) as well as anything with `getName()`.
- `CommandManager` exports `PlayerCommandSender`, the structural type it reads a player sender through. It tells a player sender from the console by the runtime id the sender stands at, where it checked the `Player` class before.

Nothing a player sees changes.
