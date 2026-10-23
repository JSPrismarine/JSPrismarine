---
name: jsdoc-typescript-docs
description: Use before any code-writing task in this repository to apply JSDoc guidance; also use for explicit JSDoc, API documentation, or inline documentation work.
---

# JSDoc TypeScript Documentation

This guide follows this repository's [contribution guidance](../../../CONTRIBUTING.md) and
[ESLint configuration](../../../eslint.config.js). Those files define the repository conventions;
this skill gives practical guidance for writing comments that fit them.

## Repository requirements

- Add a meaningful JSDoc description to exported functions, classes, interfaces, type aliases,
  enums and constants, and to public methods of exported classes.
- A description should explain purpose or behavior, not repeat the symbol's name or TypeScript
  signature.
- TypeScript provides parameter and return types. Add `@param` or `@returns` when the text adds
  meaning the signature cannot express, such as units, ordering, a default, or what a result
  represents. Follow the affected package's existing style for JSDoc type annotations, and keep them
  consistent with the TypeScript signature. A `@param` name must match the actual parameter.
- Use `@throws` when callers need to know which condition causes an error. Use other tags when they
  add useful API information; tags are not a checklist.
- Tests, test folders, configuration files, generator templates and private helpers do not need
  JSDoc under the repository lint rules.

The root `pnpm lint` command runs ESLint and Prettier. ESLint checks JSDoc syntax, alignment, type
expressions, property names, and parameter names; parameter-name mismatches are warnings. It requires
a hyphen before `@param` descriptions.

## Examples

Examples are optional. Add one when it makes non-obvious usage or behavior easier to understand.
Every code sample below is illustrative. Adapt examples in source comments to the real API and
repository formatting.

A fenced snippet inside a JSDoc `@example` should be valid in its declared language and follow the
applicable rules in [`biome.json`](../../../biome.json). Keep Biome as the source of truth for
formatting; do not copy its settings into comments.

### Function

The signature and summary are enough when they already explain the contract:

```typescript
/**
 * Returns the first item that matches the predicate.
 */
export function findFirst<T>(items: readonly T[], matches: (item: T) => boolean): T | undefined {
    return items.find(matches);
}
```

Add tags when they explain semantics that types alone do not convey:

```typescript
/**
 * Returns the first section that matches the predicate.
 *
 * @param sections - Sections to search, in priority order.
 * @param matches - Returns true for a matching section.
 * @returns The first matching section in input order, or undefined when none match.
 */
export function findFirstMatchingSection<T>(sections: readonly T[], matches: (section: T) => boolean): T | undefined {
    return sections.find(matches);
}
```

### Types and classes

Describe exported types by their role. Add comments to individual properties when they clarify
semantics that are not clear from the property name and type.

```typescript
/** Configuration for filtering visible sections. */
export interface SectionFilter {
    /** Minimum section radius to include. */
    minRadius: number;
}

/** Reads state maintained by the package. */
export class StateReader {
    /** Returns the known state for one player. */
    readPlayer(playerId: string): string | undefined {
        return this.players.get(playerId);
    }

    private players = new Map<string, string>();
}
```

## Practical checks

- Read the changed descriptions aloud against the implementation and public signature; remove
  duplicate or stale information.
- Keep parameter names synchronized with the declaration when using `@param`.
- Run the repository's applicable checks. For source JSDoc, `pnpm lint` includes the JSDoc rules.
