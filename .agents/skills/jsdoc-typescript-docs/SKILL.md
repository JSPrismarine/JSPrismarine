---
name: jsdoc-typescript-docs
description: Use before any code-writing task in this repository to apply JSDoc guidance; also use for explicit JSDoc, API documentation, TypeDoc, or inline documentation work.
---

# JSDoc TypeScript Documentation

This guide follows this repository's [code style](../../../docs/code-style.md) and
[documentation site setup](../../../docs/documentation-site.md). Those documents define the
repository contract; this skill gives practical guidance for writing comments that fit it.

## Repository requirements

- Add a meaningful JSDoc description to exported functions, classes, interfaces, type aliases,
  enums and constants, and to public methods of exported classes.
- A description should explain purpose or behavior, not repeat the symbol's name or TypeScript
  signature.
- TypeScript provides parameter and return types. Do not repeat those types in JSDoc. Add
  `@param` or `@returns` only when the text adds meaning the signature cannot express, such as
  units, ordering, a default, or what a result represents. A `@param` name must match the actual
  parameter.
- Use `@throws` when callers need to know which condition causes an error. Use other tags when they
  add useful API information; tags are not a checklist.
- Tests, test folders, configuration files, generator templates and private helpers do not need
  JSDoc under the repository lint rules.
- Do not add `{Type}` annotations to `@param` or `@returns`; TypeScript is the source of type
  information, and ESLint rejects JSDoc type annotations.

The root `pnpm lint` command runs Biome and ESLint. ESLint checks JSDoc descriptions on the public
source API described above. The docs site collects API references from source comments and builds
them with TypeDoc; its setup is already in place. A source comment change does not require new
TypeDoc configuration, a CI job, or committed generated pages. Generated API pages are build
output.

## Examples

Examples are optional. Add one when it makes non-obvious usage or behavior easier to understand.
Every code sample below is illustrative: its names and domain are examples, not Pumpkin API
recommendations. Adapt examples in source comments to the real API and repository formatting.

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

/** Reads state maintained by the plugin. */
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
- Run the repository's applicable checks. For source JSDoc, `pnpm lint` includes the JSDoc rules;
  follow [documentation site guidance](../../../docs/documentation-site.md) when a change requires
  rebuilding or editing documentation.
