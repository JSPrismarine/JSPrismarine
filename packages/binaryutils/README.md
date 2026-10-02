[![npm](https://img.shields.io/npm/v/@jsprismarine/jsbinaryutils?style=flat-square)](https://www.npmjs.com/package/@jsprismarine/jsbinaryutils)
[![Dependents (via libraries.io)](https://img.shields.io/librariesio/dependents/npm/@jsprismarine/jsbinaryutils?style=flat-square)](#)
![npm](https://img.shields.io/npm/dw/@jsprismarine/jsbinaryutils?style=flat-square)
[![Documentation](https://img.shields.io/badge/docs-typedoc-blue?style=flat-square)](https://jsprismarine.github.io/JSBinaryUtils/)

# JSBinaryUtils

A high-performance TypeScript library for binary data manipulation in Node.js applications. JSBinaryUtils provides efficient buffer management without the overhead of repeated allocations, making it ideal for real-time applications and network protocols.

## Features

- **Zero-copy operations** - Optimized buffer management with automatic capacity growth
- **Comprehensive API** - Read/write support for all standard binary data types
- **Variable-length encoding** - Built-in VarInt and VarLong support
- **Endianness control** - Big-endian and little-endian operations
- **Type-safe** - Full TypeScript support with type definitions
- **Well-tested** - Extensive test coverage

## Installation

```bash
npm install @jsprismarine/jsbinaryutils
```

## Quick Start

### Reading Binary Data

```typescript
import BinaryStream from '@jsprismarine/jsbinaryutils';

const buffer = Buffer.from([0xFF, 0x00, 0x7F, 0x80]);
const stream = new BinaryStream(buffer);

const byte = stream.readByte();           // 255
const signed = stream.readSignedByte();   // 0
const short = stream.readShort();         // 32640
```

### Writing Binary Data

```typescript
import BinaryStream from '@jsprismarine/jsbinaryutils';

const stream = new BinaryStream();

stream.writeByte(255);
stream.writeShort(32640);
stream.writeVarInt(12345);

const result = stream.getWriteBuffer();
```

## API Overview

### Byte Operations
- `readByte()` / `writeByte(v)` - Unsigned byte (0-255)
- `readSignedByte()` / `writeSignedByte(v)` - Signed byte (-128 to 127)
- `readBoolean()` / `writeBoolean(v)` - Boolean value

### Integer Operations
- `readShort()` / `writeShort(v)` - 16-bit signed integer (BE)
- `readShortLE()` / `writeShortLE(v)` - 16-bit signed integer (LE)
- `readUnsignedShort()` / `writeUnsignedShort(v)` - 16-bit unsigned integer (BE)
- `readInt()` / `writeInt(v)` - 32-bit signed integer (BE)
- `readUnsignedInt()` / `writeUnsignedInt(v)` - 32-bit unsigned integer (BE)

### Triad Operations (24-bit)
- `readTriad()` / `writeTriad(v)` - 24-bit signed integer (BE)
- `readTriadLE()` / `writeTriadLE(v)` - 24-bit signed integer (LE)
- `readUnsignedTriad()` / `writeUnsignedTriad(v)` - 24-bit unsigned integer (BE)

### Floating Point Operations
- `readFloat()` / `writeFloat(v)` - 32-bit float (BE)
- `readFloatLE()` / `writeFloatLE(v)` - 32-bit float (LE)
- `readDouble()` / `writeDouble(v)` - 64-bit double (BE)
- `readDoubleLE()` / `writeDoubleLE(v)` - 64-bit double (LE)

### Long Operations (64-bit)
- `readLong()` / `writeLong(v)` - 64-bit signed BigInt (BE)
- `readLongLE()` / `writeLongLE(v)` - 64-bit signed BigInt (LE)
- `readUnsignedLong()` / `writeUnsignedLong(v)` - 64-bit unsigned BigInt (BE)

### Variable-Length Operations
- `readVarInt()` / `writeVarInt(v)` - 32-bit zigzag-encoded VarInt
- `readUnsignedVarInt()` / `writeUnsignedVarInt(v)` - 32-bit unsigned VarInt
- `readVarLong()` / `writeVarLong(v)` - 64-bit zigzag-encoded VarLong
- `readUnsignedVarLong()` / `writeUnsignedVarLong(v)` - 64-bit unsigned VarLong

### Buffer Operations
- `read(length)` - Read raw bytes
- `write(buffer)` - Write raw bytes
- `skip(length)` - Skip bytes
- `readRemaining()` - Read all remaining bytes
- `getReadBuffer()` / `getWriteBuffer()` - Get underlying buffers

### Stream Management
- `setReadBuffer(buffer, index?)` - Set read buffer
- `setWriteBuffer(buffer, index?)` - Set write buffer
- `getReadIndex()` / `setReadIndex(index)` - Manage read position
- `getWriteIndex()` / `setWriteIndex(index)` - Manage write position
- `clear()` - Reset stream
- `reuse(buffer)` - Reuse stream with new buffer
- `feof()` - Check end of buffer

## Documentation

Full API documentation with detailed method descriptions and examples is available at:
[https://jsprismarine.github.io/JSBinaryUtils/](https://jsprismarine.github.io/JSBinaryUtils/)

## Performance

JSBinaryUtils uses a dynamic buffer allocation strategy that minimizes memory overhead:
- Initial allocation: 256 bytes or required size
- Growth strategy: 2x current capacity when needed
- No intermediate allocations during writes

This approach significantly outperforms naive `Buffer.concat()` operations in high-throughput scenarios.

## License

ISC

## Contributing

Contributions are welcome. Please open an issue or submit a pull request on [GitHub](https://github.com/JSPrismarine/JSBinaryUtils).
