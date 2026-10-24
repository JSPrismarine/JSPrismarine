---
'@jsprismarine/prismarine': patch
---

`PlayerAuthInputHandler` drops, at debug level and without throwing, an input whose flags, input mode, play mode, interaction model, position, rotation or block actions hold a value the docs do not allow, and acts on the item use, item stack request and block action sections only when the `Input Data` flag the docs gate each on is set.
