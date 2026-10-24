---
title: Molang
group: Documents
category: Guides
---

# Molang

Molang is the expression language Bedrock behavior packs embed wherever a number or condition is
data-driven: ambient sound probabilities, spawn conditions, feature placement, experience rewards.
`@jsprismarine/molang` parses, compiles, and evaluates those expressions on the server.

## Compiling and evaluating

Create one `Molang` engine and compile expressions through it. Compilation parses the source once
and produces a closure you can evaluate as often as you like:

```ts
import { Molang } from '@jsprismarine/molang';

const molang = new Molang();
const compiled = molang.compile('query.is_baby ? 0.02 : 0.001', { minEngineVersion: [1, 21, 0] });
const value = compiled.evaluate({ entity: myEntityContext });
```

`compile(source, options)` returns a `CompiledMolang`: the source, the parsed AST, any
diagnostics, and an `evaluate(scope)` function. `evaluate` returns a `MolangValue`: a number (with
booleans as 0.0 and 1.0), a string, or one of the structured values (struct, scope reference,
actor array). Source that fails to parse still compiles, to a constant 0 with a `syntax-error`
diagnostic, which matches how the engine turns a broken expression into a content error rather
than a crash.

## Scopes

A scope is everything one evaluation can see. All of its members are optional; supply the ones
your expression needs:

| Member      | What it carries                                                           |
| ----------- | ------------------------------------------------------------------------- |
| `entity`    | Entity state: `isBaby`, `variant`, `playerLevel`, properties, variables   |
| `block`     | Block permutation state and block tags                                    |
| `item`      | Item durability and item tags                                             |
| `world`     | Time of day, day, moon phase and brightness, timestamp                    |
| `placement` | Worldgen queries: heightmap, noise, biome tags                            |
| `context`   | Read-only values the game supplies, such as `context.other`               |
| `variables` | `variable.*` storage when no entity carries it                            |

Each context interface declares optional methods, so an entity implementation only answers the
queries it can. `variable.*` reads and writes go to the entity's `variables` map when the scope
has an entity, and to the scope's own `variables` map otherwise. `temp.*` storage lives for one
evaluation.

## Queries

The engine ships the 21 queries the vanilla behavior pack uses server-side: `above_top_solid`,
`all_tags`, `anger_level`, `any_tag`, `block_state`, `equipment_count`, `had_component_group`,
`has_any_family`, `has_biome_tag`, `head_is_in_water`, `heightmap`, `is_baby`, `is_on_ground`,
`is_using_item`, `last_hit_by_player`, `max_durability`, `noise`, `player_level`, `property`,
`remaining_durability`, and `variant`.

Queries live in a `QueryRegistry`, keyed by bare name without the `query.` prefix. Each `Molang`
engine starts with a fresh vanilla registry, or takes one through its options. Register your own:

```ts
import { Molang, QueryRegistry } from '@jsprismarine/molang';

const queries = new QueryRegistry();
queries.register('my_custom_value', {
    context: 'entity',
    evaluate: (scope) => scope.entity?.variant?.() ?? 0
});

const molang = new Molang({ queries });
```

A query definition declares which scope member it reads (`entity`, `block`, `item`, `world`,
`placement`, `tags`, or `pure`), so a loader can validate that an expression only uses queries its
evaluation site can answer, and an `evaluate` function that receives the scope and the
already-evaluated arguments.

## Versions and precedence

Pass the containing pack's `min_engine_version` as `minEngineVersion` when you compile. This
matters because Molang's grammar changed over time and the engine versions each expression by the
manifest of the pack it came from:

- At 1.18.10 the ternary operator became right-associative.
- At 1.18.20 `&&` started binding tighter than `||`, and comparisons tighter than equality.
- At 1.19.60 division by a dynamically determined negative value stopped dividing by its absolute
  value.

An expression like `a || b && c` from an old pack therefore parses differently than the same text
from a new one. The existing JavaScript Molang evaluators get the 1.18.20 precedence change wrong
and model no versions at all, which silently changes results for older packs; that defect is why
this package exists and why the option is worth passing. When you omit it, the latest rules apply.

## Diagnostics and the 0.0 rule

The compiler reports problems instead of throwing, in `CompiledMolang.diagnostics`, and the
compiled closure still evaluates with the broken part replaced by 0.0. That mirrors the engine,
which raises a content error and keeps going. The diagnostic codes:

- `syntax-error`: the source failed to parse; the whole expression evaluates to 0.
- `unknown-query`: a `query.*` name is not in the registry; that call evaluates to 0.
- `unknown-math-function`: a `math.*` name is not one of the known math functions.
- `client-only-resource`: a `texture.*` or similar client resource; it evaluates to 0 on the
  server.

Check `diagnostics` at pack load time if you want to surface these to the pack author rather than
let an expression quietly return 0.

## Caching

A `Molang` engine caches compilations by the pair of source text and engine version. Compiling the
same string twice for the same version returns the same `CompiledMolang` object, so compile freely
at evaluation sites; the parse cost is paid once per distinct expression. Two different
`minEngineVersion` values for the same text compile separately, since the version can change the
parse. There is no cache eviction; the cache lives as long as the engine.

## Out of scope today

This evaluator covers the server-side subset. Client-side resources (`texture.*`, `material.*`,
`geometry.*`) compile to 0 with a `client-only-resource` diagnostic rather than evaluating.
Queries beyond the vanilla server-side 21 are not built in; register them yourself as the systems
that back them land. See the [data-driven vanilla plan](../plans/data-driven-vanilla.md) for where
the evaluator fits in the runtime.
