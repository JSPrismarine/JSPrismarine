---
"@jsprismarine/prismarine": minor
---

The packet handlers that change a player read it through small ports instead of the whole `Player`, and log the name the session holds. `network/handler/playerPorts.ts` holds the ports more than one handler shares. Packet handling is unchanged, except for a session whose player has already left: its disconnect still closes the connection, and its input or inventory transaction is dropped, where each threw before.

Breaking: `selectTrade` in `network/handler/tradeScreen.ts` takes the server's content as a fourth argument, and its player argument is a `Trader`, which needs only `getExperience()`.
