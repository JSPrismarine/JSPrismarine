# @jsprismarine/native-library

[![License: MIT OR MPL-2.0](https://img.shields.io/badge/license-MIT%20OR%20MPL--2.0-blue)](https://github.com/JSPrismarine/JSPrismarine#readme)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/native-library)](https://www.npmjs.com/package/@jsprismarine/native-library)

Finds, verifies and installs the prebuilt native libraries JSPrismarine's packages load.

JSPrismarine's packages that call C through `node:ffi`, such as
[`@jsprismarine/native-network`](../native-network/README.md),
[`@jsprismarine/script-host`](../script-host/README.md) and
[`@jsprismarine/native-worldgen`](../native-worldgen/README.md), publish their library as one prebuilt file
per platform on a GitHub release. This package holds what they share to get that file onto a
machine and check it before it is loaded.

## What a package gets

A package describes its library once:

```ts
import { NativeLibrary } from '@jsprismarine/native-library';

import manifest from '../native/manifest.json' with { type: 'json' };

export const library = new NativeLibrary({
    packageName: '@jsprismarine/example',
    library: 'libjsp_example',
    envPrefix: 'JSP_EXAMPLE',
    packageDir: packageRoot(),
    manifest,
    buildScripts: ['scripts/build-native.mts']
});
```

From that, `library.install({ packageDir: library.packageDir })` is the package's install script: it downloads the build for the
machine from the release the manifest names, checks its SHA-256, and stores it under
`prebuilds/<platform>/`. `library.locate()` finds that file, or the one the package's `_LIBRARY`
variable names, and checks its digest against the manifest or the `build.json` a local
`build:native` wrote beside it. Locating never downloads. When there is no file, the error says
how to let the install script run under npm, pnpm and Bun.

`library.forPlatform()` and `library.provideEmbedded()` let a single-file executable carry the
library and write it out on first start.

| Variable                      | What it does                                                    |
| ----------------------------- | --------------------------------------------------------------- |
| `<envPrefix>_LIBRARY`         | Loads this file instead of the installed build, checked as well. |
| `<envPrefix>_SKIP_DOWNLOAD=1` | The install script downloads nothing.                            |
| `<envPrefix>_BASE_URL`        | Downloads from another host, or reads from a directory.          |

## Other modules

- `@jsprismarine/native-library/ffi` opens a library through `node:ffi` under Node.js and
  `bun:ffi` under Bun, from one table of C signatures, so a package binds its interface once for
  both runtimes.
- `@jsprismarine/native-library/platform` names a machine's platform key, such as
  `linux-x64-musl`, and a library's file names on each operating system.
- `@jsprismarine/native-library/manifest` parses a package's `native/manifest.json`.
- `@jsprismarine/native-library/nativeHash` hashes a checkout's native sources, the hash a
  release of builds is named after.

[The error reference](../../docs/errors/native-library.md) lists what it throws.
