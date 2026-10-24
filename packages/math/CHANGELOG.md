# @jsprismarine/color-parser

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

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove constructs that ahead-of-time compilation with scriptc cannot lower, keeping runtime behavior the same.
  
  - `@jsprismarine/bedrock-data` exports `creativeitems` from a generated, explicitly typed module (`CreativeItemEntry[]`) instead of the raw JSON.
  - `@jsprismarine/brigadier` keeps each argument builder in the module of the node it builds (the old paths re-export), declares `literal` and `argument` as functions, and its exception types call message factories positionally.
  - `@jsprismarine/errors` declares its `Error` base without a type parameter.
  - `@jsprismarine/math` exposes `Vector2.ZERO` and `Vector3.ZERO` as shared immutable instances, and `Vector3` subclasses keep their class through `withX` and friends by overriding `create`.
  - `@jsprismarine/minecraft` exports `blockSchemas` from a generated, typed module (`BlockSchemaCatalog`).
  - `@jsprismarine/prismarine` replaces the `evt`-based event bus with its own `EventEmitter` (same `on`, `once`, `removeListener`, `removeAllListeners`, `emit` and `post`), carries inventory transaction data as a discriminated union (`kind`), exposes `allBlocks()`, `allItems()` and `allEntities()` registries, and drops the `heap`, `evt`, `fast-jwt` and `confbox` dependencies.
  - `@jsprismarine/raknet` declares `sendPacket` without a type parameter.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`95c1def`](https://github.com/JSPrismarine/JSPrismarine/commit/95c1defed96f389f944c2b61a70d4fe356d271c7) Thanks [@filiphsps](https://github.com/filiphsps)! - Drop dependencies and constructs that block ahead-of-time compilation with scriptc.
  
  - `@jsprismarine/logger` no longer wraps winston. The `Logger` API is unchanged; transports now implement the package's own `LogTransport` interface, and a `FileTransport` replaces winston's file transport.
  - `@jsprismarine/color-parser` declares its ANSI sequences directly instead of reading them out of chalk-cjs. The emitted escapes are identical; the chalk-specific exports are gone.
  - `@jsprismarine/prismarine` decodes login JWTs with plain base64url instead of fast-jwt, parses config files with json5 and js-yaml instead of confbox, and drops the debug-only `Symbol.toStringTag` accessors on `Entity`, `Block` and `BlockState`.
  - `@jsprismarine/brigadier` merges the exception classes into one module to remove an import cycle; the old module paths re-export from it.
  - `@jsprismarine/math` widens `Vector3.equals` to accept `Vector2` (returning `false`), matching the base signature.
  - `@jsprismarine/server` reads env files with `process.loadEnvFile` instead of dotenv.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`fae2f4f`](https://github.com/JSPrismarine/JSPrismarine/commit/fae2f4f9952bd5ede5c0bdceaca9bffb11195029) Thanks [@filiphsps](https://github.com/filiphsps)! - Send positional packets only to the players near them, and stop sending several of them to the entire server.
  
  Nothing filtered by distance. Two players ten thousand blocks apart still received each other's movement, each other's block updates and each other's sounds, and each other's arm swings. The code knew: `World.sendWorldEvent` and `World.sendActorEvent` both carried a `// TODO: Limit distance`, the second of them reading "as with every other broadcast here".
  
  Several of those broadcasts were worse than world-wide. Block placement, the animate handler, the disconnect despawn loop, the pairwise spawn at join and `Player.sendSettings` all went through `SessionManager.getAllPlayers()`, so they reached every player on the server regardless of which world they were in. Latent while only one world is loaded, and a wall in front of any multi-world work.
  
  Recipients are now chosen in one place. `World.getViewers(position, options)` answers "who should be told about this", and `World.broadcast` and `World.broadcastAround` are the two ways to reach them; `Server.broadcastPacket` stays as the genuinely global channel for the player list, the command tree and shutdown. Chat, the time of day and the command tree are unchanged.
  
  The test is done in chunk space against the recipient's own negotiated view distance, not against a fixed radius and not against the set of chunks the server believes it has sent. That last option is nominally the most accurate and is the wrong trade: `loadedChunks` is only marked once a batch has finished compressing and is never marked if that compression fails, so building entity visibility on it makes a compression failure show up as permanently invisible mobs. Being slightly too generous costs a packet the client discards on its own; being too stingy costs an entity that is never drawn. The chunk test is circular rather than square because `needNewChunks` loads terrain on `dx² + dz² > viewDistance²` — what a client holds is a disc, so a square test would send updates for four corners it has no ground for. Both cost the same arithmetic.
  
  Entity visibility follows vanilla in being per type rather than one radius for everything. `Entity.getTrackingRange` and `getTrackingInterval` default to 8 chunks and 3 ticks; players override to 32 chunks — past any view distance, so the viewer's own radius decides — and dropped items to 6 chunks and 20 ticks. Items are the reason this matters: they are the most numerous entity in any world and the least worth seeing at a distance, and one mob farm at the generic radius streams thousands of them to everybody nearby.
  
  Each session now tracks which entities its client actually holds, reconciled when the player crosses a chunk boundary and every few ticks otherwise, with hysteresis between the radius at which an entity appears and the one at which it goes away — with a single radius a player standing on the boundary produces an `AddActor` and a `RemoveActor` for everything out there on alternating passes. Entities are recorded as tracked only after their spawn has reached the wire, so a failed spawn is retried rather than being remembered as delivered and never sent again. Movement is gated on that tracked set rather than on distance: a `MoveActorAbsolutePacket` for a runtime id a client was never given is discarded at the other end anyway, which makes tracking both the correct gate and a set lookup instead of arithmetic on the hottest path in the server.
  
  `proximity-broadcast: false` turns the filtering off. It restores world-wide delivery, not the server-wide fan-out, which was a bug rather than a behavior. `entity-tracking-hysteresis` and `entity-tracking-interval` tune the rest.
  
  Three bugs came out of the audit that had nothing to do with distance:
  
  `Player.sendSettings` sent one player's `UpdateAdventureSettingsPacket` to every other client. That packet has no target actor field at all — it describes the client receiving it — so a single spectator set `worldImmutable`, `noAttackingPlayers` and `noAttackingMobs` on everybody else on the server. `PlayerSession.sendSpawn` had the same defect the other way round, pushing the *viewer's* settings onto the player being spawned on every spawn. Adventure settings now go to their own client only; `UpdateAbilitiesPacket`, which does carry `targetActorUniqueId`, still reaches everyone who can see the player.
  
  The chat listener was never unregistered. It was registered with `this.chatHandler.bind(this)` and removed by passing the naked method, which is a different function object, so every disconnected player stayed subscribed to chat for the life of the process.
  
  `CoordinateUtils.fromBlockToChunk` was `v >> 4`, and `>>` converts through `ToInt32`, which truncates towards zero. Entity positions are floats, so anything standing between -1 and 0 was placed in chunk 0 rather than chunk -1.
  
  Performance, alongside the reduction in recipients:
  
  Broadcasts compress once. `Server.broadcastPacket` was a serial `await` in a loop that built a fresh `BatchPacket` per recipient, so one `UpdateBlockPacket` going to twenty players was twenty runs of zlib over identical bytes, each waiting on the one before it. `MinecraftSession.sendSharedBatch` frames bytes somebody else encoded, through the same ordering chain so it cannot overtake a chunk batch still compressing.
  
  `needNewChunks` no longer runs every tick. It rebuilt a heap of a few hundred candidates twenty times a second per player, for a player who had not moved a block; it now runs when the player changes chunk, which is the same signal that drives entity visibility.
  
  A tick's movement is deduplicated per entity. `Entity.setX`, `setY` and `setZ` each announce a move of their own, so a single diagonal step queued three identical packets naming the same destination.
  
  `SetTimePacket` goes out once a second instead of twenty times a second. The client runs its own day cycle in between, which is why the packet is in the default `log-excluded-packets` in the first place.
  
  Dead code removed: `Player.chunkSendQueue`, a `Set<Chunk>` never read or written that shadowed the real queue on `PlayerSession` by name; `PlayerSession.sendChunk`, which had no callers and was superseded by `flushChunkBatch`; and `DataPacket.getAllowBatching`, which read a field nothing ever set. `PlayerSession.send` now returns its send instead of dropping the promise, so awaiting a broadcast means something and framing errors are no longer swallowed. `PlayerSession.broadcastMove` is renamed `sendMove`, since it sends to one session and the fan-out of that name lives on `World`. `SessionManager.getAllPlayers` now filters on `isOnline()` as `World.getPlayers` already did, so a connection still in the login handshake is no longer among the recipients of every broadcast.
  
  `Vector3` gains `distanceTo` and `distanceSquaredTo`. There were five hand-rolled copies of that arithmetic across the server using three different metrics.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.
- Updated dependencies [[`6b60a88`](https://github.com/JSPrismarine/JSPrismarine/commit/6b60a88e40ad9751ea177f4273779869486de7e0), [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36), [`95c1def`](https://github.com/JSPrismarine/JSPrismarine/commit/95c1defed96f389f944c2b61a70d4fe356d271c7), [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a)]:
  - @jsprismarine/binaryutils@0.15.0
  - @jsprismarine/color-parser@0.15.0

## 0.14.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/color-parser@0.14.2

## 0.14.1

### Patch Changes

- [`53eb2f6`](https://github.com/JSPrismarine/JSPrismarine/commit/53eb2f605a8a90bee72788ac785fd4046ecce2b2) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump Vite to 8.0.12 across the root, every workspace package, and the turbo generator template, and roll in the follow-up fixes needed to keep the codebase happy under Vite 8 (Rolldown):
    - Drop the `vite-tsconfig-paths` plugin in favor of Vite 8's native `resolve.tsconfigPaths: true` option, rename `build.rollupOptions` to `build.rolldownOptions` in the shared root config, drop the no-longer-supported output options (`hoistTransitiveImports: true`, `indent: false`, `interop: 'auto'`, `validate: true`), and remove the dropped `rollupTypes` option on `vite-plugin-dts`.
    - Untangle the `BuiltInExceptions -> SimpleCommandExceptionType -> CommandSyntaxException -> BuiltInExceptions` module load cycle that Rolldown refused to swallow the way the previous esbuild-based bundler did:
        - Defer `CommandSyntaxException.BUILT_IN_EXCEPTIONS` construction to a lazy getter and wrap every `BuiltInExceptions` static field in a memoized factory so no `new SimpleCommandExceptionType(...)` / `new DynamicCommandExceptionType(...)` runs during the class's static-initialization phase.
        - Add named exports for `SimpleCommandExceptionType` and `DynamicCommandExceptionType` alongside their existing default exports and switch the in-package call sites (`BuiltInExceptions`, `BuiltInExceptionProvider`, the brigadier barrel, and `SimpleCommandSyntaxExceptionType.test.ts`) to the named imports so they side-step Rolldown's stricter default-binding resolution while external default-import call sites keep working unchanged.
    - Hoist `vi.mock('@jsprismarine/raknet', ...)` out of the `describe` block in `Server.test.ts` so vitest stops warning about runtime hoisting (it will become an error in a future vitest release).
    - Replace the `fs.readdirSync` block enumeration in `Block.test.ts` with an eager `import.meta.glob` so vite's `dynamic-import-vars` plugin stops complaining about the missing static file extension.
    - Teach typedoc about the `@todo` block tag (plus the rest of TSDoc's standard tags) via a `blockTags` allow-list in `typedoc.json` so internal todo comments stop emitting "unknown block tag" warnings, and re-point Logger's `@document` to `../../../docs/log-levels.md` so the path resolves from the source file (`packages/logger/src/logger.ts`) up to the repo root's `docs/log-levels.md`.
    - Add `packages/bedrock-data/src/generated/*` to `.prettierignore` so the auto-generated JSON blobs don't trip prettier formatting checks.

- Updated dependencies [[`53eb2f6`](https://github.com/JSPrismarine/JSPrismarine/commit/53eb2f605a8a90bee72788ac785fd4046ecce2b2)]:
    - @jsprismarine/color-parser@0.14.1

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

### Patch Changes

- Updated dependencies [[`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a), [`3aa7813`](https://github.com/JSPrismarine/JSPrismarine/commit/3aa78132d3805cefe776d8de835b0b1081ca3095)]:
    - @jsprismarine/color-parser@0.14.0

## 0.13.5

### Patch Changes

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

- Updated dependencies [[`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51)]:
    - @jsprismarine/color-parser@0.13.5

## 0.13.2

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.13.2

## 0.13.1

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

- Updated dependencies [[`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72)]:
    - @jsprismarine/color-parser@0.12.1

## 0.12.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.11.0

## 0.10.0

### Patch Changes

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

- Updated dependencies [[`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a), [`a7f7e16`](https://github.com/JSPrismarine/JSPrismarine/commit/a7f7e16c3b5ee8415a9561b8eb388d81bd23fd9c)]:
    - @jsprismarine/color-parser@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.9.0

## 0.8.0

### Minor Changes

- [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a) Thanks [@filiphsps](https://github.com/filiphsps)! - - Update to latest bedrock edition.

### Patch Changes

- [`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7) Thanks [@filiphsps](https://github.com/filiphsps)! - - Replace `assert` with `with`.

- Updated dependencies [[`15b5fe1`](https://github.com/JSPrismarine/JSPrismarine/commit/15b5fe169a7917d199de273d1906a78c4b768cb7), [`d8d45e8`](https://github.com/JSPrismarine/JSPrismarine/commit/d8d45e838af9e5a15269064c7cf24de87f10ab6a)]:
    - @jsprismarine/color-parser@0.8.0

## 0.7.0

### Minor Changes

- [#1520](https://github.com/JSPrismarine/JSPrismarine/pull/1520) [`142c6e1`](https://github.com/JSPrismarine/JSPrismarine/commit/142c6e1ca4f8961271d1c8caa8fbf0c71dc315b6) Thanks [@enricoangelon](https://github.com/enricoangelon)! - Properly implement Position, Vector2 & Vector3

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.6.0

## 0.5.0

### Patch Changes

- [#1486](https://github.com/JSPrismarine/JSPrismarine/pull/1486) [`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade `typescript` to `v5.5.2`.

- Updated dependencies [[`02aaf4b`](https://github.com/JSPrismarine/JSPrismarine/commit/02aaf4b0082e76f4f438f59dacd373a04959df53)]:
    - @jsprismarine/color-parser@0.5.0

## 0.4.5

### Patch Changes

- [#1460](https://github.com/JSPrismarine/JSPrismarine/pull/1460) [`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe) Thanks [@filiphsps](https://github.com/filiphsps)! - Slightly revamp build system to allow for way better dev UX.

    Fix error getting thrown on first run due to missing the `level.json`
    file. We no longer try to read it if it doesn't exist.

    Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
    `pid` validation.

- [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3) Thanks [@filiphsps](https://github.com/filiphsps)! - Upgrade turbo to v2.

- Updated dependencies [[`07bc603`](https://github.com/JSPrismarine/JSPrismarine/commit/07bc603b887eb5cf0b69646bd7799abd035a21fe), [`204a9b4`](https://github.com/JSPrismarine/JSPrismarine/commit/204a9b4c142fe89d5d63e2f72ba3cb89f9b375e3)]:
    - @jsprismarine/color-parser@0.4.5

## 0.4.4

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.4.4

## 0.4.3

### Patch Changes

- Updated dependencies []:
    - @jsprismarine/color-parser@0.4.3

## 0.4.2

### Patch Changes

- [#1315](https://github.com/JSPrismarine/JSPrismarine/pull/1315) [`941fb74`](https://github.com/JSPrismarine/JSPrismarine/commit/941fb74a7818afd21e87804f62e004cf8465e0c4) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/logger` package.

- Updated dependencies []:
    - @jsprismarine/color-parser@0.4.2

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
