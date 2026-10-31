---
"@jsprismarine/prismarine": patch
---

Finish wiring custom dimension types (Bedrock ids 1000 and up). A custom dimension's chunk payload is sent at the bounds `DimensionData` declared instead of padded to the Overworld's, the player record carries its `DimensionId` and `SpawnDimension` through the level's types, and the content adapter reads its bounds and sky light from the live world's type.
