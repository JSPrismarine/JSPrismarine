---
'@jsprismarine/mapping': patch
---

`bedrockBlockStateToJava` returns one frozen result per Bedrock state instead of building a new one on every call. Fluid searches and tag checks ask about the same few states thousands of times a tick. The returned objects were already typed read-only; they are now frozen too.
