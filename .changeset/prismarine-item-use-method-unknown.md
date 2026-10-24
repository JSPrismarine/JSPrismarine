---
'@jsprismarine/prismarine': patch
---

`ItemUseMethod` gains `Unknown = -1`, the value Mojang's enum snapshot lists ahead of `EquipArmor`, so a `CompletedUsingItemPacket` carrying it decodes to a named member.
