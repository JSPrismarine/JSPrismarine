---
'@jsprismarine/binaryutils': patch
---

`BinaryStream.writeFloat` and `writeFloatLE` now write positive and negative infinity as 32-bit floats instead of refusing them. Bedrock stores an infinite float for a script vector part a float cannot hold. `NaN` and finite values outside the float range are still refused.
