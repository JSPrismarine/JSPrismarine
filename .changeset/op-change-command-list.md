---
"@jsprismarine/prismarine": patch
---

`PermissionManager.setOp` sends the player's command list after it changes their operator status, not before. A player who was just made an operator was sent the commands of a non-operator, and one who lost the status kept the operator commands, until something else resent the list.
