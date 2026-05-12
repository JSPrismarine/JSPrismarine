---
'@jsprismarine/bedrock-data': patch
---

Include `src/generated/**` in turbo build outputs so cache hits restore the JSON files that typedoc needs to resolve `@jsprismarine/bedrock-data` source.
