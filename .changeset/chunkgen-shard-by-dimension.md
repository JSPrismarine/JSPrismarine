---
'@jsprismarine/chunkgen': minor
---

`GenerationTask` gains a required `dimension`, the Bedrock id of the dimension the chunk is in,
and `ShardedGenerationPool` mixes it into the shard hash. A pool shared between dimensions no
longer sends chunk (0, 0) of the Overworld and the Nether to the same worker. The Overworld's term
in the hash is zero, so every Overworld region stays on the worker it had, and a test pins that
mapping. The worker pipeline may ignore the field; `@jsprismarine/prismarine` fills it from the
generator's dimension definition.
