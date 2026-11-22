---
'@jsprismarine/server': patch
'@jsprismarine/native-network': patch
---

`pnpm dev` runs the new `ensure:native` script, which downloads the NetherNet library build the manifest pins when the installed one is older, as after a `git pull` that moved the pin. The server no longer stops with a checksum error after such a pull.
