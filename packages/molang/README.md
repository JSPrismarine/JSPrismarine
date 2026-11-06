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

## Examples

These expressions are exported as `MOLANG_EXAMPLES`, each with the scopes it is shown under and the
value it produces. The test suite compiles every one with no diagnostics and checks the values, and
fails if this section drifts from the list, so they are safe to copy.

```ts
import { MOLANG_EXAMPLES, Molang } from '@jsprismarine/molang';

const molang = new Molang();
for (const example of MOLANG_EXAMPLES) {
    const compiled = molang.compile(example.source);
    for (const { label, scope, expected } of example.cases) {
        console.log(example.title, label, compiled.evaluate(scope), expected);
    }
}
```

### A chance that depends on age

A ternary picks between two numbers, as an ambient sound probability does.

```molang
query.is_baby ? 0.02 : 0.001
```

a baby: `0.02`; an adult: `0.001`.

### A value kept in range

The `math` functions take and return numbers; `clamp(value, min, max)` bounds a variant index.

```molang
math.clamp(query.variant, 0, 3)
```

variant 2: `2`; variant 9: `3`.

### A spawn condition

Booleans are 1 and 0, so conditions combine with `&&`, `||` and `!`.

```molang
query.head_is_in_water && !query.is_on_ground
```

swimming: `1`; standing in the shallows: `0`.

### A string property

Strings compare with `==` and `!=`, and `query.property` reads an entity property.

```molang
query.property('example:color') == 'red'
```

red: `1`; blue: `0`.

### Worn-out tools

An item expression reads durability; the result is 1 once less than a tenth is left.

```molang
query.remaining_durability / query.max_durability < 0.1
```

almost broken: `1`; nearly new: `0`.

### Interpolating between two numbers

`math.lerp(start, end, t)` blends linearly.

```molang
math.lerp(10, 20, 0.25)
```

no scope needed: `12.5`.

### A reward that grows with level

Arithmetic follows the usual precedence, so the multiplication happens before the cap.

```molang
math.min(10 + query.player_level * 5, 100)
```

level 4: `30`; level 40: `100`.

### A terrain condition

Worldgen queries take coordinates and read the placement context.

```molang
query.heightmap(0, 0) > 62
```

above sea level: `1`; under water: `0`.

### A complex expression with a loop

Statements end in `;`, `v.` is `variable.`, and a complex expression yields what `return` gives it.

```molang
v.total = 0; loop(5, { v.total = v.total + 2; }); return v.total;
```

five rounds of two: `10`.

### Stopping a loop early

`break` leaves the loop; the loop is capped at 1024 rounds either way.

```molang
v.n = 0; loop(100, { v.n = v.n + 1; (v.n >= 7) ? break; }); return v.n;
```

stops at seven: `7`.
