---
'@jsprismarine/prismarine': patch
---

Run RakNet on a worker thread by default. A tick that overruns, such as a large `/fill`, no longer stops the server answering keepalives and acknowledgements, so connected players keep their session through it. Set `use-raknet-worker` to `false` to run it on the game thread as before; an existing `config.json` keeps the value it already holds.
