# @jsprismarine/leveldb

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/leveldb)](https://www.npmjs.com/package/@jsprismarine/leveldb)

A LevelDB implementation in pure TypeScript, able to read and write the databases that
Minecraft: Bedrock Edition stores its worlds in.

## Why this exists

Bedrock does not use stock LevelDB. Mojang's fork adds two compression types — `Zlib` (2) and
`ZlibRaw` (4) — and writes its table blocks with the latter. Every off-the-shelf Node binding
builds against upstream LevelDB, which knows only `None` (0) and `Snappy` (1) and rejects a
Bedrock table outright. The bindings that do handle it are native modules, which would mean a
toolchain on every platform the server builds for and no `bun build --compile`.

So: no native modules, no dependencies at all. `node:zlib` supplies raw DEFLATE, and the rest —
CRC32C, the table and log formats, the manifest, Snappy decompression — is implemented here.

## Usage

```ts
import { Database, WriteBatch } from '@jsprismarine/leveldb';

const db = await Database.open('/path/to/world/db');

const value = db.get(Buffer.from('~local_player'));

db.write(new WriteBatch().put(key, payload).del(staleKey));

await db.close();
```

Reads are synchronous, backed by a cached file descriptor. `open`, `flush` and `close` are async
because they fsync.

## Compatibility

Reads compression types 0, 1, 2 and 4; writes 4, which is what the game itself writes. Databases
predating the modern chunk formats are rejected rather than guessed at — open such a world in the
game once and let it convert.

Never open a database the game has open. `Database.open` takes the `LOCK` file to make that
loud rather than silently corrupting.
