# @jsprismarine/nbt

## 0.14.1

### Patch Changes

- [`53eb2f6`](https://github.com/JSPrismarine/JSPrismarine/commit/53eb2f605a8a90bee72788ac785fd4046ecce2b2) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump Vite to 8.0.12 across the root, every workspace package, and the turbo generator template, and roll in the follow-up fixes needed to keep the codebase happy under Vite 8 (Rolldown):
    - Drop the `vite-tsconfig-paths` plugin in favour of Vite 8's native `resolve.tsconfigPaths: true` option, rename `build.rollupOptions` to `build.rolldownOptions` in the shared root config, drop the no-longer-supported output options (`hoistTransitiveImports: true`, `indent: false`, `interop: 'auto'`, `validate: true`), and remove the dropped `rollupTypes` option on `vite-plugin-dts`.
    - Untangle the `BuiltInExceptions -> SimpleCommandExceptionType -> CommandSyntaxException -> BuiltInExceptions` module load cycle that Rolldown refused to swallow the way the previous esbuild-based bundler did:
        - Defer `CommandSyntaxException.BUILT_IN_EXCEPTIONS` construction to a lazy getter and wrap every `BuiltInExceptions` static field in a memoized factory so no `new SimpleCommandExceptionType(...)` / `new DynamicCommandExceptionType(...)` runs during the class's static-initialization phase.
        - Add named exports for `SimpleCommandExceptionType` and `DynamicCommandExceptionType` alongside their existing default exports and switch the in-package call sites (`BuiltInExceptions`, `BuiltInExceptionProvider`, the brigadier barrel, and `SimpleCommandSyntaxExceptionType.test.ts`) to the named imports so they side-step Rolldown's stricter default-binding resolution while external default-import call sites keep working unchanged.
    - Hoist `vi.mock('@jsprismarine/raknet', ...)` out of the `describe` block in `Server.test.ts` so vitest stops warning about runtime hoisting (it will become an error in a future vitest release).
    - Replace the `fs.readdirSync` block enumeration in `Block.test.ts` with an eager `import.meta.glob` so vite's `dynamic-import-vars` plugin stops complaining about the missing static file extension.
    - Teach typedoc about the `@todo` block tag (plus the rest of TSDoc's standard tags) via a `blockTags` allow-list in `typedoc.json` so internal todo comments stop emitting "unknown block tag" warnings, and re-point Logger's `@document` to `../../../docs/log-levels.md` so the path resolves from the source file (`packages/logger/src/logger.ts`) up to the repo root's `docs/log-levels.md`.
    - Add `packages/bedrock-data/src/generated/*` to `.prettierignore` so the auto-generated JSON blobs don't trip prettier formatting checks.

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

## 0.13.5

### Patch Changes

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

## 0.13.2

## 0.13.1

## 0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

## 0.12.0

## 0.11.1

## 0.11.0

## 0.10.0

### Patch Changes

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

## 0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

## 0.7.0

## 0.6.0

## 0.5.0

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

## 0.4.4

## 0.4.3

## 0.4.2

## 0.4.1

## 0.4.0

### Patch Changes

- [#1279](https://github.com/JSPrismarine/JSPrismarine/pull/1279) [`4ca96b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4ca96b59696dbe67e39b7f46d85fe421a74d23d5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add Codecov bundler plugin to vite.

## 0.3.0

## 0.2.0

### Patch Changes

- [#1259](https://github.com/JSPrismarine/JSPrismarine/pull/1259) [`c9d207f`](https://github.com/JSPrismarine/JSPrismarine/commit/c9d207f03417a8961557d569ec60b1091e9114c1) Thanks [@renovate](https://github.com/apps/renovate)! - Deps: Update dependency @types/node to v20.12.3.

## 0.1.1

### Patch Changes

- [`80e23e1`](https://github.com/JSPrismarine/JSPrismarine/commit/80e23e17c0111eac2df98f73cdeec5730bd9abf5) Thanks [@filiphsps](https://github.com/filiphsps)! - Include CHANGELOG.md with releases.

## 0.1.0

### Patch Changes

- [#1226](https://github.com/JSPrismarine/JSPrismarine/pull/1226) [`20b3cb1`](https://github.com/JSPrismarine/JSPrismarine/commit/20b3cb1ee1e2a2c5c45275f9c2a23c9c2507dcf5) Thanks [@filiphsps](https://github.com/filiphsps)! - - Migrated to vite.
    - The build system has been refactored to support both esm and cjs.
    - Releases are now managed by changeset.
