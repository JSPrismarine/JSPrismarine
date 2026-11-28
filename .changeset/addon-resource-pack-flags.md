---
'@jsprismarine/packs': patch
'@jsprismarine/prismarine': patch
---

A Bedrock client applies an addon's resource pack. The server now offers it as a Bedrock Dedicated Server does: a pack whose manifest's `metadata.product_type` is `addon` is marked as an addon pack and named by its UUID, and `Has Addon Packs` is set when any installed pack is one. A client used to leave such a resource pack unapplied when it depended on the addon's behavior pack, which stays on the server, so the addon's blocks, such as Bedrock Dynamic Lights' light block, were drawn with the missing texture. `parseManifest` reads `metadata.product_type` as `productType`.
