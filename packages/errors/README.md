# @jsprismarine/errors

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/errors)](https://www.npmjs.com/package/@jsprismarine/errors)

Every error the JSPrismarine packages throw, each with a stable code and a link to its entry in the
[error reference](https://jsprismarine.dev/errors/). The errors live here rather than in the
packages that throw them, so the reference can list all of them and a log line can point at the
one that went wrong.

## Catching an error

A package's errors are classes on its catalog, such as `LeveldbErrors` for `@jsprismarine/leveldb`.
Import the catalog from the module named after the package and test with `instanceof`:

```ts
import { LeveldbErrors } from '@jsprismarine/errors/leveldb';
import { Database } from '@jsprismarine/leveldb';

try {
    await Database.open(directory);
} catch (error) {
    if (error instanceof LeveldbErrors.DatabaseLockedByRunningProcess) console.log(error.params.pid);
}
```

Every error carries its `code`, such as `LEVELDB_DATABASE_LOCKED_BY_RUNNING_PROCESS`, its `docs`
link, and the `params` its message was built from. Most errors also extend `Error`, `TypeError`,
`RangeError` or `ReferenceError`, as the code threw before the catalog existed, and some extend a
group class that catches every error of one kind, such as `CorruptionError` in the `leveldb`
catalog.

To catch any catalog error, use `isJSPrismarineError` from `@jsprismarine/errors/JSPrismarineError`:

```ts
import { isJSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

if (isJSPrismarineError(error)) console.log(error.code, error.docs);
```

`instanceof JSPrismarineError` holds only for the errors built on `Error`. An error built on
`TypeError`, `RangeError` or `ReferenceError` extends `JSPrismarineTypeError`,
`JSPrismarineRangeError` or `JSPrismarineReferenceError` instead, so that it stays an instance of the
built-in error. Biome rejects `instanceof JSPrismarineError` in the other packages for this reason.
`isJSPrismarineError` also holds for an error that another installed copy of this package built,
such as one an addon bundles, where `instanceof` fails.

The logger prints the code and the link after the stack trace, and `util.inspect` shows both beside
the stack, so an uncaught error reaches the console with its link.

## Adding an error

Each package has a catalog under `catalog/`: `catalog/<package>.ts`, or a folder of them when the
package throws many errors, such as `catalog/prismarine/`. Add an entry to the package's catalog:

```ts
export const LeveldbErrors = defineErrors('leveldb', {
    /** Explain what causes the error and what to do about it; the reference shows this text. */
    TableTooShort: { message: 'Table {file} is {size} bytes, shorter than its footer', base: CorruptionError }
});
```

Then generate the classes and commit both files:

```sh
pnpm --filter @jsprismarine/errors run generate
```

`scripts/generate-error-classes.mts` reads each catalog and writes the module at the same path under
`src/`, such as `src/leveldb.ts`, which is the module the package publishes. There each entry is an
ordinary class declaration, and the catalog object maps each key to its class. The generator copies
everything else in the catalog, such as group classes and helpers, unchanged. Do not edit the
generated modules: `pnpm run lint:error-classes`, part of `pnpm run lint`, fails when one differs
from what its catalog generates.

The key names the class, and the code is the domain and the key in capitals:
`LEVELDB_TABLE_TOO_SHORT`. The message is a template, and each `{name}` in it is a value the throw
site passes, checked by the type of the class's constructor. A name uses only letters, digits and
`_`, and the generator rejects a message with any other text in braces:

```ts
throw new LeveldbErrors.TableTooShort({ file, size: bytes.length });
```

An entry with no placeholders takes no values, and either kind takes `{ cause }` last, as `Error`
does. Give `base` when the error should extend `TypeError`, `RangeError`, `ReferenceError` or a
group class; the default is `Error`. A group class extends `JSPrismarineError` or one of the other
roots. The roots declare `code`, `docs` and `params` as abstract, so only the generated entries set
them, and a class that extends a group class directly must set all three. When a class needs fields of its own, such as the chunk coordinates on
`ChunkStepOutOfOrderError`, define it in its package and extend the catalog entry with it.

A catalog in a package's folder names the module after a slash, as
`defineErrors('prismarine/world', { ... })` does in `catalog/prismarine/world.ts`. The code still
starts with the domain alone, `PRISMARINE_`, but the reference gives each module its own page, so
changes to different modules edit different pages.

The JSDoc on an entry is its description in the reference, and the generator copies it onto the
class. After a change, run `pnpm run docs:facts` to rewrite the pages under `docs/errors/`. A package
with no catalog yet, or a new module in a package's folder, also needs a page there, which
`pnpm run lint:docs-facts` asks for.

A `new Error(...)`, or a class that extends `Error`, anywhere in a package's `src/` outside this
package fails the lint. The rule is `.biome/no-raw-errors.grit`.
