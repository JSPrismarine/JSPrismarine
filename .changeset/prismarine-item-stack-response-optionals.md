---
'@jsprismarine/prismarine': patch
---

`ItemStackResponsePacket` writes its two optionals the way the 1.26.51 docs define them. `Containers` is present exactly when the result is `Success`, so an accepted request that changed nothing now carries an empty list instead of an absent one; before, the client read a success in the shape of a refusal. A slot's `Item Stack Net Id` is present exactly when `Amount` is above zero rather than when the id is positive. A container's `Dynamic ID` is written as an unsigned 32-bit integer, and a `Durability Correction` outside the int16 range is refused with a `RangeError` instead of being sent.
