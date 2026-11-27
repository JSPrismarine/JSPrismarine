---
'@jsprismarine/mapping': patch
---

Add `bedrockBlockSupportOf(name, states?)`, which answers Java's legacy solid flag (`BlockState.isSolid`) for a Bedrock block state and whether each of its faces is sturdy for the full, center and rigid support types (`isFaceSturdy`). The facts come from running Java's own code over every block state of the pinned 26.3 jar, and a Bedrock state answers as the Java state `bedrockBlockStateToJava` maps it back to.
