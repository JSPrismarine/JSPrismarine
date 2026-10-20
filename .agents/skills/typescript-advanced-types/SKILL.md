---
name: typescript-advanced-types
description: Use when writing or changing generic, conditional, mapped or template-literal types in this repository, such as typed declarations that keep their literals or types derived from a schema or command tree.
---

# Advanced types in this repository

The repository uses advanced types for one job: derive types from a single declaration so that the
runtime value, the README and the handlers can't drift apart. Use them when a declaration already
exists and callers should get compile errors for names it doesn't contain. Don't add type machinery
that nothing derives from; a plain interface is easier to read and to change.

Code samples follow [`biome.json`](../../../biome.json) and [code style](../../../docs/code-style.md):
no `any` (use `unknown` and narrow it), `import type` for type-only imports, `T[]` instead of
`Array<T>`, and `readonly` on declared data. The [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
covers the language features themselves.

## Keep literals from a declaration

Declare lists of names `as const` and derive the union from the value, as `tools/docs/src/permissions.ts`
does for `PumpkinPermission`. Check object literals with `satisfies` so they keep their literal types
instead of widening to the annotation, as every plugin's `src/info.ts` does with
`satisfies PluginInfo<typeof PLUGIN_NAME>`.

```typescript
/** Every color the plugin can show. */
export const COLORS = ['red', 'green', 'blue'] as const;
/** One of `COLORS`. */
export type Color = (typeof COLORS)[number];

/** Whether a string from a player or a file names a known color. */
export function isColor(value: string): value is Color {
    return (COLORS as readonly string[]).includes(value);
}
```

When a function returns its argument for later inference, use `const` type parameters so callers
don't need `as const`. `defineCommands` in `tools/docs/src/commands.ts` works this way.

## Constrain strings with template literals

Template literal types state a naming rule the compiler can check. Command permission nodes must
start with the plugin name, so `defineCommands` takes the name as a type parameter and constrains the
tree to `` `${Name}:${string}` ``:

```typescript
interface Command<Node extends string> {
    readonly description: string;
    readonly permission: Node;
}

/** Declares commands whose permission nodes start with the plugin name. */
export function defineCommands<
    const Name extends string,
    const T extends Readonly<Record<string, Command<`${Name}:${string}`>>>,
>(_pluginName: Name, tree: T): T {
    return tree;
}

defineCommands('Demo', { demo: { description: 'Shows a demo.', permission: 'Demo:command.demo' } });
// @ts-expect-error the node does not start with "Demo:"
defineCommands('Demo', { demo: { description: 'Shows a demo.', permission: 'Other:command.demo' } });
```

## Derive types from a schema or tree

Mapped and conditional types turn a declaration into the shape code works with:

- `ConfigValues<S>` in `tools/config/src/schema.ts` maps a config schema to its parsed values.
- `CommandArgumentValues` maps declared arguments to handler arguments, using key remapping
  (`as Argument['name']`) and a conditional per argument type.
- `CommandHandlers<T>` walks a command tree recursively and requires one handler per runnable path.

Use `infer` with an `extends` constraint (`infer Nested extends SubcommandTree`) instead of a second
conditional. To make options mutually exclusive, use a union whose members mark the other keys
`?: never`, as `CommandBehavior` does.

Keep these types next to the runtime code that reads the same declaration, and export only the ones
callers name. Types check code at compile time only: validate data from files, the network or the
host at runtime, as the config validators do.

## Test the types

Type-level behavior that callers depend on needs a test. Use Vitest's `expectTypeOf` for the
derived type and `// @ts-expect-error <reason>` for inputs that must not compile, as
`tools/docs/src/commands.test.ts` does. The package's `typecheck` task compiles the test files, and
that compile is what enforces both.

```typescript
import { expectTypeOf, it } from 'vitest';
import { COLORS, type Color } from './colors.ts';

it('derives the color names', () => {
    expectTypeOf<Color>().toEqualTypeOf<'red' | 'green' | 'blue'>();
    // @ts-expect-error not a declared color
    const unknownColor: Color = 'purple';
    expectTypeOf(COLORS).toEqualTypeOf<readonly ['red', 'green', 'blue']>();
    void unknownColor;
});
```
