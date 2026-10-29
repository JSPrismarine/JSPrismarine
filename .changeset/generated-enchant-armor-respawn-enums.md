---
'@jsprismarine/minecraft': patch
'@jsprismarine/prismarine': minor
---

Generate `EnchantType`, `ArmorSlot` and `PlayerRespawnState` into `@jsprismarine/minecraft` from
the pinned bedrock-protocol-docs schemas, the way `ActorEvent` already is. All three are defined
in the v1.26.51 release schemas - `Enchant::Type`, `SharedTypes::Legacy::ArmorSlot` and
`PlayerRespawnState` - and the generated values match the hand-written ones exactly. `EnchantType`
also gains the upstream sentinels `NUM_ENCHANTMENTS` (42) and `INVALID_ENCHANTMENT` (43).

The prismarine packet files (`PlayerEnchantOptionsPacket`, `PlayerArmorDamagePacket`,
`RespawnPacket`) now import the generated enums and keep deprecated re-exports, so existing import
paths still resolve. Member names follow the generated convention, which renames them from
PascalCase to SCREAMING_SNAKE (`EnchantType.Protection` is now `EnchantType.PROTECTION`,
`ArmorSlot.Head` is `ArmorSlot.HEAD`, `PlayerRespawnState.ReadyToSpawn` is
`PlayerRespawnState.READY_TO_SPAWN`); the wire values are unchanged.
