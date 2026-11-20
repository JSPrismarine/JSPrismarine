---
'@jsprismarine/prismarine': patch
'@jsprismarine/script-host': patch
'@jsprismarine/script-types': patch
---

Behavior pack scripts that import `@jsprismarine/server` get `playerList`. `playerList.setDisplayName(player, name)` changes the name every client, and every later joiner, shows for the player in its player list, and nothing else: chat and the name above the head keep the login name. `playerList.reset(player)` gives the entry its login name back, and every name a pack set reverts when its scripts stop, as on `/reload`. An empty name throws. `PlayerSession.setPlayerListName()` is new, and `playerListEntryOf` takes the name to show.
