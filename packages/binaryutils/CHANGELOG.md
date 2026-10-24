# @jsprismarine/binaryutils

## 0.15.0

### Patch Changes

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0) Thanks [@filiphsps](https://github.com/filiphsps)! - Move JSBinaryUtils into the monorepo as `@jsprismarine/binaryutils`.
  
  It was developed in its own repository and consumed here as a pinned npm dependency, which meant a
  change to the binary stream needed a release there before it could be used here. It now lives in
  `packages/binaryutils` and every consumer resolves it through the workspace, so it builds, typechecks
  and tests together with the packages that use it.
  
  The published name changes: `@jsprismarine/jsbinaryutils` is deprecated on npm and its last release
  re-exports this package, so existing installs keep working. The API is unchanged.
  
  Two things came along with the jump from the pinned 5.5.3 to current: `write()` accepted a
  `Uint8Array` in its signature but called `Buffer#copy` on it, so anything not already a `Buffer`
  threw at runtime — it now uses `set`. And the single internal `buffer` field is split into a read and
  a write buffer, so code reaching past the public API to assign `.buffer` no longer populates the read
  side; use `setReadBuffer()`.
  
  `@jsprismarine/protocol` also gained the dependency in its manifest — it imported the package while
  relying on it being hoisted into the root `node_modules`.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.
