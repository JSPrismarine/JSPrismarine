[![npm](https://img.shields.io/npm/v/@jsprismarine/binaryutils?style=flat-square)](https://www.npmjs.com/package/@jsprismarine/binaryutils)
[![Dependents (via libraries.io)](https://img.shields.io/librariesio/dependents/npm/@jsprismarine/binaryutils?style=flat-square)](#)
![npm](https://img.shields.io/npm/dw/@jsprismarine/binaryutils?style=flat-square)
[![Documentation](https://img.shields.io/badge/docs-typedoc-blue?style=flat-square)](https://jsprismarine.github.io/JSPrismarine/)

# @jsprismarine/binaryutils

A high-performance TypeScript library for binary data manipulation in Node.js applications. `@jsprismarine/binaryutils` provides efficient buffer management without the overhead of repeated allocations, making it ideal for real-time applications and network protocols.

## Features

- **Zero-copy operations** - Optimized buffer management with automatic capacity growth
- **Comprehensive API** - Read/write support for all standard binary data types
- **Variable-length encoding** - Built-in VarInt and VarLong support
- **Endianness control** - Big-endian and little-endian operations
- **Type-safe** - Full TypeScript support with type definitions
- **Well-tested** - Extensive test coverage

## Installation

```bash
npm install @jsprismarine/binaryutils
```

> **Renamed from `@jsprismarine/jsbinaryutils`.** The package used to live in its own repository and
> was published under that name; it now develops here, inside the JSPrismarine monorepo. The old name
> is deprecated on npm and its last release re-exports this one, so existing installs keep working —
> but it receives no further changes. Switch the dependency and the import path; the API is unchanged.

## Quick Start

### Reading Binary Data

```typescript
import BinaryStream from '@jsprismarine/binaryutils';

const buffer = Buffer.from([0xff, 0x00, 0x7f, 0x80]);
const stream = new BinaryStream(buffer);

const byte = stream.readByte(); // 255
const signed = stream.readSignedByte(); // 0
const short = stream.readShort(); // 32640
```

### Writing Binary Data

```typescript
import BinaryStream from '@jsprismarine/binaryutils';

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
- `write(buffer)` - Write raw bytes (accepts `Buffer` or `Uint8Array`)
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

### Reuse & Zero-Allocation Encoding

- `new BinaryStream(buffer?, offset?, initialCapacity?)` - Pre-size the write buffer
- `reserve(capacity)` - Grow the write buffer up front, skipping the growth ladder
- `resetWrite()` - Rewind the write cursor, keeping the allocated capacity
- `copyOut()` - Encoded bytes as an exactly-sized standalone `Buffer`
- `copyInto(target, offset?)` - Copy into a caller-owned buffer, returns the new offset

## Documentation

Full API documentation with detailed method descriptions and examples is available at:
[https://jsprismarine.github.io/JSPrismarine/](https://jsprismarine.github.io/JSPrismarine/)

## Performance

`@jsprismarine/binaryutils` uses a dynamic buffer allocation strategy that minimizes memory overhead:

- Initial allocation: 256 bytes or required size
- Growth strategy: 2x current capacity when needed
- No intermediate allocations during writes

This approach significantly outperforms naive `Buffer.concat()` operations in high-throughput scenarios.

### Encoding in bulk

The workload this library is built for is a server draining a send queue inside a tick budget, so
the benchmark (`pnpm --filter @jsprismarine/binaryutils run bench`) reports **packets encoded per
10 ms window** — median _and_ worst window, because the worst window is what drops a tick.

Encoding a Bedrock-shaped movement packet on Node 24:

| strategy                         | packets / 10 ms | worst window | max GC pause |
| -------------------------------- | --------------: | -----------: | -----------: |
| a fresh stream per packet        |          19,008 |        6,976 |      0.80 ms |
| reused stream + `copyInto` arena |          25,088 |       11,392 |      0.50 ms |

The fast path allocates nothing per packet:

```typescript
const stream = new BinaryStream(undefined, 0, 4096); // pre-sized once
const arena = Buffer.allocUnsafeSlow(1 << 20);
let offset = 0;

for (const packet of queue) {
    stream.resetWrite(); // keeps the capacity, no reallocation
    encode(stream, packet);
    offset = stream.copyInto(arena, offset);
}
```

### Buffers returned by `getWriteBuffer()` are views

`getWriteBuffer()` returns a _view_ over the stream's internal buffer, so it is only valid until
the next write — `resetWrite()`, `clear()` and `reuse()` all rewind the cursor without
reallocating, and the next packet silently overwrites whatever you were holding. It also keeps the
whole pooled 64 KB chunk it was carved from alive, so retaining scattered small packets can pin
megabytes.

If you queue, retain or resend the result, use `copyOut()` (standalone buffer) or `copyInto()`
(caller-owned arena) instead.

## License

ISC

## Contributing

Contributions are welcome. Please open an issue or submit a pull request on [GitHub](https://github.com/JSPrismarine/JSPrismarine).
