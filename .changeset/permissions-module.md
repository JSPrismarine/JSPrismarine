---
'@jsprismarine/script-host': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/script-types': patch
---

Add `permissions` to `@jsprismarine/server`: `has`, `groupsOf`, `primaryGroupOf` and `metaOf` read a player's resolved permissions, `grant`, `revoke`, `addToGroup` and `removeFromGroup` write them as `/perms` would, and `afterEvents.permissionsChange` fires after any write to the permission files, from a script, a command or an edit of the file, with the player and group it touched. The server registers the `perms` placeholder namespace with `primary_group`, `groups`, `prefix`, `suffix` and `weight`. `@jsprismarine/script-types` declares the member, its event and its types.
