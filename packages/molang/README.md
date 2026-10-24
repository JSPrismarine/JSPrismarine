# @jsprismarine/molang

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/molang)](https://www.npmjs.com/package/@jsprismarine/molang)

Molang parser, compiler and evaluator for Bedrock behavior packs. Parses the full Molang grammar
with a Pratt parser, compiles each expression once per (source, version) into a JavaScript closure,
and evaluates it over a typed scope (entity, block permutation, item, world, placement, `context.*`,
`variable.*`, `temp.*`).

```ts
import { Molang } from '@jsprismarine/molang';

const molang = new Molang();
const compiled = molang.compile('query.is_baby ? 0.02 : 0.001', { minEngineVersion: [1, 21, 0] });
const value = compiled.evaluate({ entity: myEntityContext });
```

Operator precedence is versioned by the containing pack's `min_engine_version`, matching the
engine's rule changes at 1.18.10 (ternary associativity) and 1.18.20 (`&&` over `||`, comparison
over equality). Unknown `query.*` and `math.*` identifiers are reported through the compile
diagnostics and evaluate to 0.0 at run time, as the engine does.
