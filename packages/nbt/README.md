# @jsprismarine/nbt

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/nbt)](https://www.npmjs.com/package/@jsprismarine/nbt)

Reads and writes NBT, the tag format Minecraft stores worlds, items and entities in.

## Binary NBT

`NBTReader`, `NBTWriter` and `NBTTagCompound` read and write the binary format in either byte
order, with or without the varint lengths Bedrock's network protocol uses.

## Typed tags, SNBT and paths

Three modules handle NBT that commands edit:

- `@jsprismarine/nbt/tag` models every tag as immutable plain data: `{ type: 'int', value: 3 }`,
  with lists as arrays, compounds as records and longs as `bigint`s.
- `@jsprismarine/nbt/snbt` reads and prints stringified NBT in Java Edition's grammar.
- `@jsprismarine/nbt/path` reads NBT paths such as `Items[{id: "minecraft:stone"}].Count`, and
  edits a compound at a path the way `/data modify` does. Each edit returns a new root and leaves
  the old one unchanged.

```ts
import { parseNbtPath, setAtPath } from '@jsprismarine/nbt/path';
import { formatSnbt, parseSnbt, parseSnbtCompound } from '@jsprismarine/nbt/snbt';

const root = parseSnbtCompound('{Items: [{id: "minecraft:stone", Count: 3b}]}');
const { root: edited, changed } = setAtPath(root, parseNbtPath('Items[].Count'), parseSnbt('64b'));

formatSnbt(edited); // '{Items: [{Count: 64b, id: "minecraft:stone"}]}'
changed; // 1
```

Errors are `NbtErrors` from `@jsprismarine/errors/nbt`. Their messages are the text Java Edition
shows for the same mistake.
