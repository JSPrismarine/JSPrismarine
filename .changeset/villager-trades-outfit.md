---
'@jsprismarine/packs': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/bedrock-data': patch
---

Villagers of every profession trade, wear their biome's clothes and show their profession on the trade screen. The Bedrock Dedicated Server ships some definitions as binary files the loader cannot read and leaves out others, and an unreadable file shadowed the readable copy of the same path in an earlier pack, so butchers, clerics and stone masons had no trade table at all. The pack stack now puts `bedrock-samples` beneath the server's pack, an unreadable file no longer hides a readable one, and `pnpm dev` downloads both. The client is also sent a villager's `mark_variant` and `skin_id`, which choose its clothes, and the trade screen is titled with the table's `display_name` instead of the entity's type name.
