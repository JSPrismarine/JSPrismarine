---
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
---

Behavior packs that declare `@minecraft/server-gametest` can now register GameTests and spawn simulated players. `/gametest run <testName>`, `/gametest runset [tag]`, `/gametest stopall` and `/gametest clearall` run them as Bedrock Dedicated Server does: tests that name a batch first, a test's delays, `idle` and `succeedWhen` on the ticks counted from its start, and a test that does not end within `maxTicks` fails. A simulated player is a player of the level with no client, so commands, chat, other players and scripts see it as any other player, and it saves no player record. Its `chat` goes through the chat guards, and `world.afterEvents.chatSend` now fires for a player's line that goes out. A GameTest's `.mcstructure` is placed at the test's location.
