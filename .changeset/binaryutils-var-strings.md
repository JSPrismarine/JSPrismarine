---
'@jsprismarine/binaryutils': patch
---

`BinaryStream` reads and writes varuint32-length-prefixed values: `readLengthPrefixed` and `writeLengthPrefixed` for bytes, and `readVarString` and `writeVarString` for UTF-8 strings, the form Bedrock writes strings in. `NetworkBinaryStream` in `@jsprismarine/protocol` now inherits them instead of defining its own, so a package that needs Bedrock strings without the protocol package can use them.
