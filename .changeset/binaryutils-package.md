---
'@jsprismarine/binaryutils': minor
'@jsprismarine/prismarine': patch
'@jsprismarine/protocol': patch
'@jsprismarine/raknet': patch
'@jsprismarine/math': patch
'@jsprismarine/nbt': patch
---

Move JSBinaryUtils into the monorepo as `@jsprismarine/binaryutils`.

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
