---
'@jsprismarine/prismarine': patch
---

Turn a fully oxidized copper golem into a statue, as Java's `CopperGolem.updateWeathering` does: each tick its block is air, a draw at or under 0.0058 puts the oxidized copper golem statue where it stands, facing its way, and the golem is gone. The golem runs on its Java brain, so the Bedrock goal that declares the statue never ran.
