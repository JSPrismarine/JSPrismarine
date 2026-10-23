---
name: typescript-advanced-types
description: Use when writing or changing generic, conditional, mapped or template-literal types in this repository, such as types derived from declarations or preserved literal values.
---

# Advanced types in this repository

The repository uses advanced types to keep callers' types aligned with runtime declarations. Use
them when a declaration already exists and callers should get compile errors for names it doesn't
contain. Don't add type machinery that nothing derives from; a plain interface is easier to read and
to change.

Code samples follow [`biome.json`](../../../biome.json) and [ESLint](../../../eslint.config.js). Use
`import type` for type-only imports. Prefer `unknown` for untrusted values when callers should narrow
them. The [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
covers the language features themselves.

## Keep literals from a declaration

Declare lists of names `as const` and derive the union from the value. Check object literals with
`satisfies` so they keep their literal types instead of widening to the annotation.

```typescript
/** Every color the package can show. */
export const COLORS = ['red', 'green', 'blue'] as const;
/** One of `COLORS`. */
export type Color = (typeof COLORS)[number];

/** Whether a string from a player or a file names a known color. */
export function isColor(value: string): value is Color {
    return (COLORS as readonly string[]).includes(value);
}
```

When a function returns its argument for later inference, use `const` type parameters so callers
don't need `as const`.

## Derive types from a declaration

Mapped and conditional types turn a declaration into the shape code works with.

Use `infer` with an `extends` constraint when the inferred type must satisfy a shape. To make
options mutually exclusive, use a union whose members mark the other keys `?: never`.

Keep these types next to the runtime code that reads the same declaration, and export only the ones
callers name. Types check code at compile time only: validate data from files, the network, or other
runtime sources.

## Test the types

Type-level behavior that callers depend on needs a test. Use Vitest's `expectTypeOf` for the
derived type and `// @ts-expect-error <reason>` for inputs that must not compile. Check that the
package's typecheck configuration includes those tests; `packages/prismarine/tsconfig.json` excludes
`src/**/*.test.*`.

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
