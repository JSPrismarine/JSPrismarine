---
'@jsprismarine/nbt': patch
---

Fix six encoding bugs that made NBT unusable for anything but the narrow subset the network path happened to exercise, and add the package's first tests.

- `TAG_Short`, `TAG_Int` and `TAG_Long` were written through unsigned writers, which assert on negative input — so writing any negative number threw outright. String byte counts, which really are unsigned, moved to their own reader and writer.
- Writing a list of any type resolved the element type from `Set.entries()`, whose entries are `[value, value]` pairs, so every list was typed `TAG_Int_Array` and writing one always threw.
- `TAG_Int_Array` inside a compound was handed to the scalar int writer.
- `TAG_Byte_Array` inside a list was written as a double.
- `TAG_Byte` inside a list was read as a short, corrupting both the values and the read cursor.
- `expectInput` allocated a Buffer view of the entire remaining payload, then rewound, once per tag read.

Block runtime ids are unchanged: for non-negative values the signed and unsigned writers emit identical bytes.
