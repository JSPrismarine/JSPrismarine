---
'@jsprismarine/prismarine': minor
---

Query answers for both editions. `server-port` answers for Bedrock beside the game, as PocketMine-MP does, whatever `query-port` says. `query-port` now defaults to 25565 and answers there for Java Edition while `java-enabled` is on, with `game_id` `MINECRAFT`, the Java release as `version` and `java-port` as `hostport`. A full stat's `plugins` lists the installed addons after the software, as Spigot and PocketMine-MP write it: `JSPrismarine v1.0.0: warps 1.2.0; tps-bar 0.3.0`. `AddonManager` adds `loadedAddons()`.
