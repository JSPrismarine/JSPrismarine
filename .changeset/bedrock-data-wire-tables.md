---
'@jsprismarine/bedrock-data': minor
---

Build the item versions, item components, creative menu and actor list from the join packets a Bedrock Dedicated Server sent, captured under `src/jsp/v<protocol>/wire/`, instead of from CloudburstMC/Data. A creative entry's `block_states` and a group's `icon_block_states` now hold a compound with only the `network_id`, because the packet carries the hashed block runtime id and nothing else. The compound no longer has `name`, `states`, `version`, `block_id` or `name_hash`.
