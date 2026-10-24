---
'@jsprismarine/mapping': patch
---

Add `bedrockBlockPropertiesOf`: the Java-sourced per-state block property table (hardness, blast
resistance, friction, light emission and dampening, correct-tool requirement, random tick, push
reaction, fire odds) keyed by Bedrock block state, with `BEDROCK_ONLY_BLOCKS` naming the blocks
that have no Java source and `BLOCK_PROPERTY_CONFLICTS` listing the reviewed collapse
disagreements.
