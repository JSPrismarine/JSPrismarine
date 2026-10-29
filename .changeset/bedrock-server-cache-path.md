---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/minecraft': patch
---

Resolve the unpacked Bedrock Dedicated Server from one place. `fetch:sources` writes the
cache path, and the Bedrock capture and the datagen generators now read it back from the
fetch instead of each building it themselves, so the writer and its readers cannot drift
apart over how the directory is keyed.
