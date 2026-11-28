---
'@jsprismarine/prismarine': patch
---

`Block.getSkyLightLevel` and `getLightLevel` follow the time of day and the weather as BDS does: 15 at noon and 4 at midnight under the open sky. They used to read 15 all night, so Bedrock Dynamic Lights, which places a light only where it outshines the sky, placed none outdoors at night.
