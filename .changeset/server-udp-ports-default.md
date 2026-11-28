---
'@jsprismarine/prismarine': patch
---

Write `"server-udp-ports": "19132"` to a fresh `config.json`, so the file shows where NetherNet's UDP goes. A config without the key gains it with its own `server-port`, so its NetherNet UDP stays where it was. While the setting equals the file's `server-port`, a port given with `--port` moves NetherNet's UDP with it.
