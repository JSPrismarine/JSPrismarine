---
'@jsprismarine/blocks': patch
---

Stop the overlay generator from shaping the package's source.

`src/overlay.ts` imported `./families.ts` with the extension so that
`utils/generate-overlay.ts` could load it under plain `node`. The cost landed on consumers: every
package that resolves `@jsprismarine/blocks` to its source had to set `allowImportingTsExtensions`
and `rewriteRelativeImportExtensions` to typecheck, which `@jsprismarine/block-behaviors` and
`@jsprismarine/engine-systems` both did.

The generator is now `utils/generate-overlay.mjs`, plain JavaScript over the built `dist/`, and
`generate:overlay` builds the package first. `src/overlay.ts` writes an ordinary extensionless
import, and both flags are gone from this package's tsconfig. The generated overlay is unchanged
byte for byte; no public API moved, so this is a `patch`.
