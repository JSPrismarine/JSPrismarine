---
'@jsprismarine/prismarine': patch
---

Print join, leave and death announcements on the console in English instead of as raw translation keys.

These chats are sent to players as a `%`-prefixed key and parameters, which each client renders in its own language. The console has no client and logged `%multiplayer.player.joined` with the name dropped. It now fills the English text for the keys the server sends; an unknown key is printed with its parameters in brackets. The packets players receive are unchanged.
