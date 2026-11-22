---
'@jsprismarine/protocol': minor
---

`Vec2`, `Vec3` and `BlockPos` now read and write their fields with `read` and `write`, which accept any `BinaryStream`. Their `serialize` and `deserialize` methods take a `NetworkBinaryStream`, the same as `NetworkStructure`, so a vector can stand in wherever its base class is expected. Code that passed a plain `BinaryStream` to `serialize` or `deserialize` should call `write` or `read` instead.
