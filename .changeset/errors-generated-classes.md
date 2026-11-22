---
'@jsprismarine/errors': minor
---

Generate the error classes ahead of time instead of building them at run time. The catalogs moved to `packages/errors/catalog/`, and `pnpm --filter @jsprismarine/errors run generate` writes each one's module under `src/` as plain class declarations, so an ahead-of-time compiler such as scriptc can compile the package. Throw sites, `code`, `docs`, `params`, the statics and `instanceof` a catalog class or category work as before.

Breaking changes:

- `instanceof JSPrismarineError` now holds only for the errors built on `Error`. An error built on `TypeError`, `RangeError` or `ReferenceError` extends the new `JSPrismarineTypeError`, `JSPrismarineRangeError` or `JSPrismarineReferenceError` root, and stays an instance of the built-in error. Test for any catalog error with `isJSPrismarineError(value)`.
- `defineErrors`, `formatMessage` and the catalog types (`ErrorEntry`, `ErrorBase`, `ErrorClass`, `ErrorCatalog`, `ErrorArgs`, `ErrorParams`, `Placeholders`, `MessageOf`, `BaseOf`) are no longer exported. `CatalogedError` is now the interface every catalog error implements, with `params` typed as a record.
- The static `module` exists only on the classes of a domain split across modules, such as `prismarine/world`.
- The roots are abstract classes that declare `code`, `docs` and `params`, so a TypeScript class that extends a group class, such as `LoggedFieldError`, `RegistryBundleFormatError` or `ConfigSyntaxError`, must now set all three. `isJSPrismarineError` returns false for a JavaScript subclass that leaves them out. A class that extends a catalog entry inherits them, as before.
- Each class keeps its params in a private field behind a `params` getter, so `params` stays out of `util.inspect`. `params` is no longer an own property of the error, reading it through a `Proxy` of the error throws a `TypeError`, and a plain object no longer satisfies `InstanceType<typeof SomeErrors.Entry>`. Type a test double as `CatalogedError`, or construct the real class.
