---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

An `.mcaddon` or `.mcpack` placed in the server's `addons/` folder now installs on the next start or `/reload`, under a local name made from its file name. Replacing the file installs the new one, and deleting it removes the addon. `addon install` also takes a path to an `.mcaddon`, and installs its behavior pack; the console says which of its other packs, such as a resource pack, it left out. The server now creates `addons/` at startup even when no addon is installed.
