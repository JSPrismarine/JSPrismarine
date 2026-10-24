---
'@jsprismarine/prismarine': patch
---

`/op` and `/deop` change only the affected player's line in `ops.json`, and a fresh `permissions.json` is written with a comment above each key explaining it. Both files may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted. Entries without a `name`, and permission lists that are not lists of strings, are skipped instead of being taken as they are. `PermissionManager` now takes a `PermissionManagerServer`, the part of the server it uses.
