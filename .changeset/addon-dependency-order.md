---
'@jsprismarine/prismarine': patch
---

Load an addon's behavior pack after the behavior packs it depends on, and warn about a missing pack dependency only once every addon has installed. A startup that installed `furniture-bp` warned that it needed the resource pack in `furniture-rp`, which installed next or was already installed.
