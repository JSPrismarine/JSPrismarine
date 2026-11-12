---
'@jsprismarine/binaryutils': patch
---

`BinaryStream.read()` refuses a length that is negative or not an integer. A negative length used to move the read index backward, so a length read off the wire could make a parser revisit the same bytes without end.
