---
'@jsprismarine/bedrock-data': patch
---

`creative_groups` entries carry `icon_block_states`, the block state vanilla draws for a group's icon, so a server can send the icon with the same hashed block runtime id vanilla does. Both `block_states` fields now document what their NBT holds.
