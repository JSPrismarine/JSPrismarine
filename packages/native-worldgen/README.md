# @jsprismarine/native-worldgen

[![License: MIT OR MPL-2.0](https://img.shields.io/badge/license-MIT%20OR%20MPL--2.0-blue)](https://github.com/JSPrismarine/JSPrismarine#readme)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/native-worldgen)](https://www.npmjs.com/package/@jsprismarine/native-worldgen)

Terrain generation's hot loops in C, loaded through `node:ffi` and `bun:ffi`, with the same bits as `@jsprismarine/worldgen`.

Terrain generation spends most of its remaining time in noise. This package runs those loops in
C, called through `node:ffi` under Node.js and `bun:ffi` under Bun, and gives the same bits as
[`@jsprismarine/worldgen`](../worldgen/README.md)'s TypeScript. Each `f32()` there is one `float`
operation in the C, every other step is a `double`, and the library is compiled with
`-ffp-contract=off` so no multiply and add fuse into one rounding. The
[native noise spike](../../docs/research/spikes/native-noise/README.md) found no mismatch in 1.2
million samples of six vanilla noises.

## Using it

```ts
import { NativeWorldgen } from '@jsprismarine/native-worldgen';

const native = NativeWorldgen.load();
const stack = native.createStack(layers); // each layer: permutation, offsets, frequency, amplitude, smearY
const value = stack.get3(x, y, z); // NoiseStack.get3's value, bit for bit
stack.fill(positions, values); // a buffer of positions in one call
stack.destroy();
```

`NativeWorldgen.load()` throws a `NativeLibraryError` when there is no build for the machine.
The library is optional: a caller keeps its TypeScript noise wherever `load()` throws.

## Installing it

The package carries no library. Its install script downloads the build for the machine from the
GitHub release `native/manifest.json` names and checks its SHA-256, as
[`@jsprismarine/native-library`](../native-library/README.md) describes. In a checkout,
`pnpm --filter @jsprismarine/native-worldgen run build:native` builds it with the system's C
compiler (`CC` names another).

<!-- fact:nativeWorldgen.environment.table -->
| Variable                              | What it does                                                     |
| ------------------------------------- | ---------------------------------------------------------------- |
| `JSP_NATIVE_WORLDGEN_LIBRARY`         | Loads this file instead of the installed build, checked as well. |
| `JSP_NATIVE_WORLDGEN_SKIP_DOWNLOAD=1` | The install script downloads nothing.                            |
| `JSP_NATIVE_WORLDGEN_BASE_URL`        | Downloads from another host, or reads from a directory.          |
<!-- /fact -->

[The error reference](../../docs/errors/native-worldgen.md) lists what it throws.
