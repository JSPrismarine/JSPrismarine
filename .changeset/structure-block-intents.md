---
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
---

A structure block's settings and its save, load, scan or query are intents, run by `EditStructureBlockHandler` and `UseStructureBlockHandler` under `input/handlers/`. Bedrock's `StructureBlockUpdate` and `StructureTemplateDataRequest` packets decode into them, replacing their packet handlers, and a Java client's `Set Structure Block` decodes into the same ones, which the protocol package now defines.
