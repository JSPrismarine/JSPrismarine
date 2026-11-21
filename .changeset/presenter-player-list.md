---
'@jsprismarine/prismarine': minor
---

`SessionManager.getPlayerList` holds a plain `ListedPlayer` per player in place of Bedrock's `PlayerListEntry`, and `playerListEntryOf` is now `listedPlayerOf`. The session's presenter sends a joining client the whole list.
