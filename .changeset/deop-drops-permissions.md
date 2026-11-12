---
'@jsprismarine/prismarine': patch
---

Fix a deopped player keeping operator permissions until they reconnect. `Player.getPermissions()` now reads the player's current grants from the new `PermissionManager.permissionsOf()` on every call instead of a list cached at join, so revoking operator status or replacing a player's grants applies to their next command. `/op` and `/deop` also send the command list after the status changes rather than before.
