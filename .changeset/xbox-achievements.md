---
'@jsprismarine/prismarine': minor
---

Let Bedrock players earn Xbox achievements. The new `xbox-achievements` setting in `config.json` is on by default: `StartGame` then says achievements are on and cheats are off, as a Bedrock Dedicated Server with `allow-cheats=false` does. Every command goes out marked as not a cheat, so the client still sends `/gamemode`, `/give` and the rest, and the server's permissions decide who may run them. Operators keep their achievements too, and a player in creative mode costs nobody else theirs. Set `xbox-achievements` to `false` to announce cheats on and achievements disabled, as before.

`HandlerConfig` gains `getXboxAchievements`, so code that builds one by hand has to supply it.
