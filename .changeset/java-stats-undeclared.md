---
'@jsprismarine/entities': patch
---

Give an entity every stat Java decides, at Java's value, even when its Bedrock file declares no component for it. Bedrock's zombie declares no `minecraft:follow_range`, so it ran with the fallback 16 rather than Java's 35 and stood still when its target was further away than 16 blocks.
