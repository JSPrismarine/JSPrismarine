---
'@jsprismarine/prismarine': patch
---

`UUID` accepts unsigned 32-bit words in its constructor. A word above `2^31 - 1`, such as `0x8899aabb`, used to throw a `RangeError` when the uuid was serialized or printed; it is now wrapped to the signed form `fromString` and `fromBinary` produce, so such a uuid equals, prints, and serializes the same either way.
