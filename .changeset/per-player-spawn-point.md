---
'@jsprismarine/prismarine': minor
---

Give each player a spawn point of their own. This server modeled none: `getRespawnPoint` answered
with the world spawn for everybody, a bed set nothing, and `/spawnpoint` was one of the nine
commands the registry left out because there was nothing behind it.

`world/RespawnPoint.ts` holds the rules, which are Java's. A point `/spawnpoint` set is used
whatever is standing there, which is what Java calls a forced spawn. A point a bed or a respawn
anchor set is only used while that block is still there, and the player stands in the first of the
eight neighboring columns with two free blocks; a bed that is gone or walled in sends them to the
world spawn with `tile.bed.notValid`, and the stored point is cleared so they are told once.

`/spawnpoint` is out of `UNWIRED_COMMANDS` and wired to `WorldCommandHost.setSpawnPoint`, which
moves the named players' points and sends each of them a `SetSpawnPosition` of type
`PlayerRespawn`. That leaves eight commands unwired. `/setworldspawn` already worked and is
unchanged. Clicking a bed or a respawn anchor also moves the point, through `useItemOnBlock`,
because a block behavior has no player to move the spawn of and no client to tell.

The point rides on `WorldPlayerData.spawn` and is written under Bedrock's own `SpawnX`, `SpawnY`
and `SpawnZ`, with the dimension and the forced flag beside them under this project's own tag
because Bedrock has no schema for either.

A login also lands in the world the player logged out of. Each world keeps its own player records
and the login built the player in the default world, so a player who left from the nether came
back in the overworld holding whatever that world's stale record carried.
`WorldPlayerData.savedAt` is the instant a record was written, and `Player.enable` reads every
loaded world and takes the newest.
