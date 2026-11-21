---
'@jsprismarine/features': patch
---

Place ore veins without allocating per neighbor read. The air-exposure check read a candidate's six neighbors through six new positions; it now moves one position between them, as Java's `MutableBlockPos` does. The set of tested positions is a byte array over the same key, as Java's `BitSet` is, with a set kept for any key past the vein's bounding box. The blocks a vein places are the same.
