---
"@jsprismarine/blocks": patch
"@jsprismarine/block-behaviors": patch
---

Send `minecraft:end_gateway` to the `jsprismarine:portal` family instead of `jsprismarine:inert`, which used to claim it first, and drop `nether_portal` from `PORTAL_BLOCK_NAMES` because the Bedrock palette only has `minecraft:portal`. The family tallies in both READMEs now match `vanilla_overlay/report.json`.
