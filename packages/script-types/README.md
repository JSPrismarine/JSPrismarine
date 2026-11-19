# @jsprismarine/script-types

TypeScript declarations for `@jsprismarine/server`, the module a behavior pack script imports to
use what only JSPrismarine has. The module itself is built into the server: a pack never bundles
it, and leaves it out of its `manifest.json`. This package only tells your editor and compiler
what the import gives you.

The npm name `@jsprismarine/server` already belongs to the server package, so the declarations
live here and declare the module by name. Install the package as a development dependency, and
name it in your `tsconfig.json`'s `types`:

```bash
npm install --save-dev @jsprismarine/script-types
```

```json
{
    "compilerOptions": {
        "types": ["@jsprismarine/script-types"]
    }
}
```

Then import the module with `import()` inside `try`, so the pack still runs on Bedrock Dedicated
Server, where the import rejects:

```ts
const loadJsprismarine = async () => {
    try {
        return await import('@jsprismarine/server');
    } catch {
        return undefined;
    }
};
```

[The JSPrismarine script module](../../docs/guide/jsprismarine-module.md) lists every member and
walks through the pattern.

## How the declarations are made

`pnpm run build` writes `dist/index.d.ts` from the module's definition in
`packages/script-host/src/host/jsprismarineServer.ts`, the same definition the server builds each
pack's module from, so the two cannot drift apart. `pnpm run typecheck` builds it and compiles
`test/pack.ts`, a pack script that uses it.
