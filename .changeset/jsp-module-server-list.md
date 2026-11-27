---
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
'@jsprismarine/script-types': patch
---

Behavior pack scripts that import `@jsprismarine/server` get `serverList`. Its `motd`, `levelName`, `onlinePlayers` and `maxPlayers` read what a server list shows now, and `serverList.update(options)` changes them on every transport at once: Bedrock's server list and LAN, the query protocol and Java Edition's multiplayer screen. `serverList.reset()` takes the pack's changes back, and they also go when its scripts stop, as on `/reload`. Where two packs change one property, the one that changed it last shows. A MOTD or second name with a `;` throws a `TypeError`, as does a count that is not a whole number from 0 to 2147483647. `maxPlayers` changes only what the list shows; the server still turns players away at `max-players`. `JsprismarineServerMembers.serverList` and `ScriptServerListMembers` are the embedder's side.
