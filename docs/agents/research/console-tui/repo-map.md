# Repo map: console process split and OpenTUI console

Snapshot of the repository at `1990d875c3` (branch `hfi/.../elm`), gathered for the plan to run the
interactive console in its own process and rebuild it on OpenTUI, with the `pnpm run dev` supervisor
notices shown inside the TUI. Paths are repo-relative; line numbers are from this snapshot.

## 1. Everything that touches the console, stdin/stdout or the TTY

### `packages/prismarine/src/Console.ts` (185 lines)

| Lines | What |
| --- | --- |
| 1 | `import type { Server, Service } from './'` (barrel import; `Service` is the abstract class in `src/utils/Service.ts`) |
| 6-8 | `node:process`, `node:readline` (`CompleterResult`) |
| 11-20 | `declare module 'node:readline'` augmentation: `setRawMode?`, `output.write`, `input: any`, `_refreshLine?` |
| 23-28 | `export interface PromptWriter` (the readline subset `writeAbovePrompt` needs) |
| 42-58 | `export const writeAbovePrompt(cli, line)`: `\x1b[2K\r${line}\n`, then `_refreshLine()` or `prompt(true)` + echo of `cli.line` |
| 66-70 | `export const completeCommand(names, line): CompleterResult` |
| 75 | `export default class Console implements CommandExecutor, Service` |
| 78 | `constructor(private readonly server: Server)` |
| 84-143 | `enable()`: returns early when `process.stdin.setRawMode` is not a function (line 88-91, the headless/test guard); `setRawMode(true)`, `setNoDelay`, `setKeepAlive`, `resume()` (93-97); `readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true, prompt: '> ', tabSize: 4, removeHistoryDuplicates: true, completer })` (99-107); subscribes `server.on('chat', ...)` and prints `consoleTextOf(evt.getChat())` through `sendMessage` (109-112); `server.getLogger().setConsole(this)` (113); `keypress` handler: Ctrl+C calls `server.shutdown()` (115-127); `line` handler writes `\x1b[2D` then `commandManager.dispatchCommand(this, this, input)` and logs failures (129-142) |
| 149-152 | `disable()`: `cli.close()`, `cli.removeAllListeners()` |
| 154-159 | `complete()`: names from `server.getCommandManager().getCommands()` |
| 161-168 | `write(line)`: `process.stdout.write` when no readline, else `writeAbovePrompt` |
| 170-184 | `CommandExecutor` members: `getName()` returns `'CONSOLE'`, `getFormattedUsername()` returns `'[CONSOLE]'`, `sendMessage()` routes to `logger.info`, `getServer()` |

Exported from the package barrel: `packages/prismarine/src/index.ts:15,23` (`export { ..., Console, ... }`).

### `packages/prismarine/src/Console.test.ts` (87 lines)

Pure unit tests, no TTY. `fakeCli()` builds a `PromptWriter` recording writes (8-17).

- `writeAbovePrompt` (20-69): erases the row before writing (21-29); calls `_refreshLine` once and never `prompt` (31-41); falls back to `prompt(true)` plus echo of the buffer without `_refreshLine` (43-50); echoes nothing when nothing typed (52-56); 50-line burst produces 50 writes, each starting with `\x1b[2K\r`, 50 refreshes (58-68).
- `completeCommand` (71-86): prefix matching, all names when nothing matches, dedupe keeping last occurrence.

### `packages/logger` (`@jsprismarine/logger` 0.15.2)

- `src/transport.ts:5-7` `export type ConsoleLike = { write: (input: string) => void }`.
- `src/transport.ts:13-21` `LogRecord { level, message, namespace, timestamp, formatted }`; `:24-27` `LogTransport { log(record); close?() }`.
- `src/transport.ts:34-55` `PrismarineTransport`: public `console: ConsoleLike | undefined`; buffers records until a console is set, replays in order on the next `log`, swallows write errors.
- `src/transport.ts:66-92` `FileTransport` (strips ANSI and `§` codes, appends to a file).
- `src/logger.ts:33` `private readonly consoleTransport = new PrismarineTransport()`; `:46` it is always the first transport.
- `src/logger.ts:81-84` `setConsole(console?: ConsoleLike)`: no-op when `undefined`, otherwise assigns `consoleTransport.console`.
- `src/logger.ts:73-75` `onLine(listener: (line: string) => void)` receives the raw (unformatted, no level) message. Nothing in the repo calls it today.
- `src/logger.ts:90-106` `emit()` builds `formatted` as `[HH:mm:ss LEVEL namespace]: message` with ANSI colors through `colorParser`.
- `src/logger.ts:61-66` `disable()` marks closed and calls `transport.close?.()`.
- `src/index.ts` re-exports both modules.
- README (`packages/logger/README.md:6`) still says "Custom transport for `winston` to deal with `readline` cli I/O"; stale. `packages/logger/CHANGELOG.md:1` is titled `# @jsprismarine/color-parser` (pre-existing mistake).

Consequence: the logger's console path is already a one-method interface (`write(formatted)`). An out-of-process console only needs a `ConsoleLike` that forwards formatted lines over IPC; nothing in `Logger` knows about readline.

### `packages/prismarine/src/Server.ts` (899 lines)

| Lines | What |
| --- | --- |
| 3 | `import Console from './Console'` |
| 87 | `private readonly console: Console \| undefined` |
| 161 | `private readonly headless: boolean` |
| 186 | `constructor({ logger, config, headless = false })` |
| 202 | `if (!this.headless) this.console = new Console(this);` |
| 215-230 | `enable()` order: `config`, `console?.enable()` (217), `logger.enable()`, managers..., then `this.logger.setConsole(this.console)` (229) |
| 237-249 | `disable()` order: managers in reverse, `config.disable()`, `logger.disable()`; the console is not disabled here |
| 512-521 | once per second, when `config.getEnableProcessTitle()` and not headless: `process.title = 'TPS: x \| Tick: n \| <original title>'` |
| 602-636 | `shutdown({ crash?, stayAlive? })`: guard `stopping`, log `Stopping server`, `await this.console?.disable()` (607), `clearInterval(tickerTimer)`, kick players with `DisconnectReason.SHUTDOWN`, `disable()`, `raknet?.kill()`, `removeAllListeners()`, `console.debug('Server stopped, Goodbye!\n')` (630, the global `console`, which the dev smoke test waits for), then `process.exit(crash ? 1 : 0)` unless `stayAlive` (632); on error `console.error` + `process.exit(1)` (634-635) |
| 856-858 | `getConsole()` returns `Console \| undefined` (no annotation) |
| 888-897 | `getTick(): number`, `getTPS(): number` |

`Service` (`src/utils/Service.ts:1-13`) is an abstract class with `enable(): Promise<void>` and `disable(): Promise<void>`; `Console` uses it structurally via `implements`.

### Callers that assume a console exists

All four build a `Chat` whose `sender: CommandExecutor` is `server.getConsole()!`; in headless mode this is `undefined` behind a non-null assertion:

- `packages/prismarine/src/command/CommandManager.ts:309` (command feedback to `*.ops`)
- `packages/prismarine/src/Player.ts:324` and `:844`
- `packages/prismarine/src/network/handler/ResourcePackClientResponseHandler.ts:267`

`Chat` keeps `sender: CommandExecutor` (`src/chat/Chat.ts:38,56`). If `Console` leaves the server process, these need a server-side `CommandExecutor` (a "system"/console sender) that is always present, independent of any attached UI.

### `CommandExecutor` and what `dispatchCommand` needs

- `packages/prismarine/src/command/CommandExecutor.ts:13-40`: `sendMessage(message): Promise<void> | void`, `getName()`, `getFormattedUsername()`, `getServer()`. `:47-48` `isCommandExecutor()` checks `'sendMessage' in target`.
- `packages/prismarine/src/command/CommandManager.ts:249-346` `dispatchCommand(sender, target, input)`: strips a leading `/`; parses with brigadier against `target`; permission check only when `sender instanceof Player` (271-286), so a non-player executor is trusted unconditionally (comment 268-270); alias re-dispatch (290-292); executes; reads the `sendCommandFeedback` game rule from `sender.getWorld()` for players, else `worldManager.getDefaultWorld()` (299-301); broadcasts feedback as a `Chat` from `getConsole()!` to channel `*.ops` (306-317); errors are reported through `sender.sendMessage` (320-345).
- `getCommands()` on the manager backs tab completion (`Console.ts:155`).

### Chat delivery to the console

- `Console.ts:109-112` listens to the `'chat'` server event, not to `ChatManager`.
- `packages/prismarine/src/chat/ConsoleText.ts:80` `consoleTextOf(chat: Chat): string` and `:58` `translateForConsole(key, parameters)`.
- `packages/prismarine/src/chat/ChatManager.ts:12` `async send(chat: Chat)`.

### Other stdout/TTY writers inside the server process

- `packages/prismarine/src/utils/Progress.ts:45-46`: defaults to `process.stdout` and `Boolean(process.stdout.isTTY)`; interactive mode redraws one line with `\x1b[2K\r` (`:80`); non-interactive mode logs at 10 percent milestones through the injected logger. Only call site: `packages/prismarine/src/world/World.ts:420` (start-region preload). In a split, the server process must treat stdout as non-interactive or the bar's control codes will land in the pipe.
- `Server.ts:520` `process.title` (see above).
- `Server.ts:630,634` global `console.debug` / `console.error` after the logger is closed.

### `packages/server/src/Server.ts` (97 lines, the `prismarine` bin entry)

| Lines | What |
| --- | --- |
| 10-15 | `parseServerArgs(process.argv.slice(2))`; on failure writes to `process.stderr`, sets `process.exitCode = 2` |
| 17 | returns early for `--help`, `--version` and the `completion` positional |
| 19 | `process.title = 'JSPrismarine'` |
| 23-29 | `process.loadEnvFile` for `.env.local`, `.env`, `.env.development.local`, `.env.development` |
| 31-44 | log file name: `jsprismarine-development.log` under `NODE_ENV=development`, else timestamped |
| 46-54 | `new Config({ serverPort: args.port })`; `new Logger(level, [new FileTransport({...})])`, file at `path.resolve(cwd, JSP_DIR, 'logs', logFile)` |
| 55 | `new Server({ config, logger })` (not headless) |
| 57-72 | `SIGSEGV`, `SIGHUP`, `SIGINT`, `SIGTERM`, `uncaughtException` handlers: second signal does `process.exit(1)`; first calls `server.shutdown({ crash: error === 'uncaughtException' })` |
| 76-92 | `bootstrap()` in a function (SEA runs the entry as CommonJS, so no top-level await); after `server.bootstrap()` a `setInterval(() => {}, 1 << 30)` keeps a headless process alive (84-89) |

`packages/server/src/index.ts:1` is `export * from './Server'`; the `bin` (`package.json:30-32`) is `"prismarine": "./dist/index.es.js"`.

### `packages/server/src/cli/Cli.ts` (31 lines)

`parseServerArgs(argv)` with yargs 18: `scriptName('prismarine')`, `usage('$0 [options]')`, one option `--port/-p` (number), `.help('help')`, `.version('version', ..., pkg.version)`, `.completion('completion')`, `.strict()`, `.check()` that throws on any positional (`_.length > 0`, line 19) and validates the port range, `.exitProcess(false)`, `.fail()` rethrows, `.parseSync()`.

Fitting new modes:

- A boolean flag such as `--no-tui` / `--headless` is one more `.option(...)`; `Server.ts:55` would pass `headless` through and skip the console entirely.
- A `console` subcommand (attach a TUI to a running server) needs `.command('console', ...)` and the positional check at line 19 relaxed to allow it. The `completion` positional is already special-cased at `Server.ts:17`, so there is precedent for a positional that bypasses the server start.
- `packages/client/src/cli/Cli.ts:69-77` is the richer yargs example in the repo: an injectable `CliIo { out, err }` and `run(argv): Promise<number>` returning an exit code, with `packages/client/src/cli.ts` as a thin bin entry setting `process.exitCode`. There is a `Cli.test.ts` beside it. `packages/server` has no CLI test.

### `packages/server/scripts/dev.mts` (187 lines, the watch supervisor)

- 1-19: rationale: `node --watch` kills stdin after a restart (nodejs/node#35536), `tsx watch` eats stdin; so the supervisor never touches stdin and spawns the child with `stdio: 'inherit'`.
- 33-35: `DEBOUNCE_MS = 150`, `FORCE_KILL_MS = 10_000`.
- 45-47: `shouldIgnore` (tests, bedrock-data resources/generated).
- 49: `log()` prints `\x1b[33m[dev] ...\x1b[0m` with `console.log` (colors `31` red, `32` green, `33` yellow, `36` cyan). These are the notices the TUI should display: `change detected: <path>`, `restarting...`, `server exited with code N, waiting for changes...`, `graceful shutdown timed out, killing...`, `generating bedrock-data...`, `bedrock-data generation failed`, `watching <dir> for changes`.
- 55-56: server args pass through after an optional `--`.
- 58-82: `start()` spawns `node --import tsx ./src/Server.ts ...args` in `serverDir`; on exit restarts if queued, exits on clean exit or shutdown, otherwise waits.
- 88-90: `restoreTerminal()` does `process.stdin.setRawMode(false)` when `isTTY` after every child exit.
- 92-100: `stopChild()` sends `SIGTERM`, `SIGKILL` after 10 s.
- 117-137: bedrock-data regeneration (`spawnSync('pnpm', ['run', 'generate'])`) holds restarts while running.
- 141: `ensureSubmodules()` from `scripts/ensure-submodules.mts`.
- 145-165: `fs.watch` recursive on `packages/*/src`, plus the resources submodule and `bedrock-data/utils`.
- 173-179: `SIGINT`/`SIGTERM`/`SIGHUP` handlers: mark shutting down, forward to the child, exit when no child.
- 184-187: generate once, log, `start()`.

Compiled under `tsconfig.scripts.json` (`erasableSyntaxOnly`, `verbatimModuleSyntax`, NodeNext); runs via Node type stripping, so no enums, namespaces, or parameter properties here.

`packages/server/scripts/dev-smoke.exp` (expect script) boots `node ./scripts/dev.mts`, waits for `listening on port`, types `version` and expects `issued server command`, touches `../prismarine/src/Console.ts` and `./src/Server.ts` to force restarts, types `help`, then `stop` and waits for `Goodbye`. Manual only; not run in CI. Its path references (`Console.ts`, the `Goodbye` string from `Server.ts:630`) will need updating.

### Repo-wide stdin/stdout/readline/raw-mode usage (non-test)

- `packages/prismarine/src/Console.ts` (all of it, above).
- `packages/prismarine/src/utils/Progress.ts:45-46` (stdout, `isTTY`).
- `packages/prismarine/src/Server.ts:520` (`process.title`), `:632,:635` (`process.exit`).
- `packages/server/src/Server.ts:12-13` (stderr, exit code), `:19` (title), `:58-72` (signals, `process.exit(1)`).
- `packages/server/scripts/dev.mts:77,89,94,173-177`.
- `packages/client/src/cli.ts:30` (`process.exitCode`), `packages/client/src/cli/Cli.ts:75-76` (stdout/stderr), `packages/client/src/cli/commands.ts:46-52` (`SIGINT`/`SIGTERM` once-handlers).
- Root scripts (`scripts/*.mts`) call `process.exit` for their own failures only.
- `vite.config.ts:50,56` lists `readline` and `tty` as externals for library builds.
- `packages/prismarine/package.json` still has `@types/terminal-kit` in `devDependencies` (unused leftover).

Bun: `Console.ts:94-96` guards `setNoDelay`/`setKeepAlive` because Bun lacks them; see section 7.

## 2. How `packages/server` is built and shipped

- `packages/server/package.json` (0.15.2): `"type": "module"`, `bin.prismarine = ./dist/index.es.js`, `files: [dist, CHANGELOG.md, README.md]`, dev `exports` point at `src/*.ts`; `publishConfig.exports` points at `dist/*.es.js` + `dist/*.d.ts` (ESM only, no `require` entry, unlike the library packages). Scripts: `build` = `vite build && node ../../scripts/emit-dts.mts`; `start` = `cross-env NODE_ENV=production node --unhandled-rejections=strict --import tsx ./src/Server.ts`; `dev` = `cross-env NODE_ENV=development node ./scripts/dev.mts`. Dependencies: `@jsprismarine/{color-parser,logger,minecraft,prismarine,raknet}`, `yargs 18.2.0`; dev: `@types/yargs`, `tsx 4.23.15`, `cross-env`, `glob`, `rimraf`, `vite 8.3.5`, `vitest 5.0.5`, `typescript 7.0.2`.
- `packages/server/vite.config.ts`: every `src/**/*.{ts*,json}` except tests becomes an entry (11-19); `formats: ['es']` only (31); externals are `pkg.dependencies` (36) on top of the root externals; `codecovVitePlugin` (40-44). Root `vite.config.ts`: `target: 'esnext'`, `minify: false`, `sourcemap: 'inline'`, `preserveModules: true`, `exports: 'named'`, externals include `/^@jsprismarine/`, `/^node:.*/`, and bare Node built-ins (`readline`, `tty`, ...). Note the glob is `*.ts*`, so `.tsx` files would also be picked up as entries.
- `scripts/emit-dts.mts`: runs `tsc-ts -p tsconfig.dts.json` in the package dir (27-28), copies hand-written `src/**/*.d.ts` into `dist/`, and writes `*.json.d.ts` shims for JSON imports. Every package therefore needs a `tsconfig.dts.json`.
- `scripts/package-sea.mts`: requires Node >= 25.5 (19-23); rolldown bundles `packages/server/src/Server.ts` with `platform: 'node'` and the `yargsCjsImportMetaPlugin` (30-34), writes `dist/sea/server.cjs` with `format: 'cjs'`, `inlineDynamicImports: true` (35-39); then `node --build-sea=dist/sea/sea-config.json` (43-56) and `codesign` on macOS (58-62). Output `dist/prismarine[.exe]`. Implications for a TUI: the whole console must bundle into one CJS file, so native addons or `import.meta`-dependent packages need checking; a separate console process would mean either a second bundle or spawning the same executable with a subcommand. `scripts/yargs-cjs-import-meta.ts` patches `yargs/build/lib/utils/apply-extends.js` to avoid `import.meta.resolve` in CJS.
- Root `package.json` scripts: `build` = `turbo run build --env-mode=loose`; `server:build` filters `@jsprismarine/server`; `package` = `node scripts/package-sea.mts`; `package:scriptc` = `scriptc build ./packages/server/src/Server.ts --npm-static auto --out ./dist/prismarine-scriptc`; `typecheck` = `turbo run typecheck && tsc-ts -p tsconfig.scripts.json`; `test` = `vitest run --coverage`; `lint` = concurrently `lint:prettier` (`prettier --check .`), `lint:biome` (`node scripts/check-american-filenames.mts && biome lint .`), `lint:jsdoc` (`node scripts/check-jsdoc.mts`), `lint:encoding` (`node scripts/check-unicode-escapes.mts`). `packageManager: pnpm@12.15.0`, `engines.node >= 22.18.0`; `.nvmrc` is `26.x`.
- `turbo.json`: `build` depends on `^build`, outputs `**/dist/**`, `**/docs/**`, `**/src/generated/**`; `build:watch` and `dev` persistent/no cache; `typecheck` no cache. `globalDependencies`: `tsconfig.json`, `tsconfig.build.json`, `package.json`, `vite.config.ts`, `.env`.
- `tsconfig.build.json` (shared by every package): `module: ESNext`, `moduleResolution: Bundler`, `target: ESNext`, `lib: [ESNext, Decorators]`, `strict`, `noUncheckedIndexedAccess`, `isolatedModules`, `experimentalDecorators` + `emitDecoratorMetadata`, `useDefineForClassFields`, `resolveJsonModule`, `types: [node]`, `typeRoots` includes `packages/**/src/@types`. No `jsx` setting anywhere (`grep '"jsx"' tsconfig*.json packages/*/tsconfig*.json` is empty). No `verbatimModuleSyntax` or `erasableSyntaxOnly` for packages; both are set only in `tsconfig.scripts.json` (for `scripts/**/*.mts` and `packages/*/scripts/**/*.mts`, `module: NodeNext`). `tsconfig.test.json` adds `types: [vitest/globals]`. An OpenTUI package using JSX would need `jsx`/`jsxImportSource` in its own `tsconfig.json` and `tsconfig.dts.json`; `useDefineForClassFields: true` and `experimentalDecorators: true` are inherited.
- `biome.json` (2.6.x, formatter off, Prettier formats): recommended preset plus: `style/noCommonJs: error`, `style/useExportType: error`, `style/useImportType: error` with `style: separatedType` (so `import type { X } from` on its own line, not inline `type` specifiers), `correctness/noUnusedImports: error`, `suspicious/noConsole: error` allowing only `console.debug/warn/error` (off under `scripts/**`), `noExplicitAny: off`, `noNonNullAssertion: off`, `noConstEnum: off`, `noDuplicateEnumValues: off` (so enums are allowed). Files covered: `packages/*/src/**`, `scripts/**`, `packages/*/scripts/**`, root `*.ts`/`*.mts`, `packages/*/*.ts`; JSON excluded. Plugins: `.biome/no-barrel-imports.grit` (value imports from `.`/`..`/`index` are errors; `import type` is fine) and `.biome/no-british-spellings.grit` (identifiers and string literals). No import-ordering rule.
- Prettier: `@nordcom/prettier` (`node_modules/@nordcom/prettier/prettier.json`): `printWidth 120`, `tabWidth 4`, spaces, `singleQuote`, `trailingComma: none`, `arrowParens: always`, `endOfLine: lf`. `.prettierignore` skips `dist`, generated data, `*.yml`/`*.yaml`.
- Hooks: `.husky/pre-commit` runs `lint-staged`; `.lintstagedrc.json` runs `biome lint --write` and `prettier --write` on staged `js|mjs|mts|ts` (not tests, not `.d.ts`). `.husky/commit-msg` runs commitlint; `commitlint.config.mts` enforces `header-max-length 72`, kebab-case scope, lowercase subject without trailing period, body lines <= 100, and a custom rule requiring file names, member names, function calls and `--flags` in backticks.
- Vitest: root `vitest.config.ts` (`globals: true`, `pool: 'forks'`, `isolate: false`, `bail: 2`, `passWithNoTests: true`, setup file `.test/vitest.setup.ts` stubbing `JSP_DIR=jsp`, reporters `verbose` + `github-actions`/`junit` on CI; coverage provider v8 with `all: true`, reporters `json`, `json-summary`, `text-summary`; `exclude` list drops `**/src/index.ts`, `**/*.js*`, config files, `dist`, `docs`). No coverage thresholds; `codecov.yml` sets project and patch status off. `vitest.workspace.ts` = `packages/**/vitest.config.ts`. Each package's `vitest.config.ts` merges the base with `defineProject({ root, test.typecheck.tsconfig: <pkg>/tsconfig.test.json })` (that per-package `tsconfig.test.json` does not exist in `logger`, `color-parser`, or `server`; vitest tolerates it).
- `scripts/check-jsdoc.mts`: scans `packages/*/src/**/*.ts` (not `.tsx`, not tests, not `@types`, not generated data). Requires a JSDoc block on every exported function, class, interface, type alias, enum and `const`, and on every public (non-private, non-protected) method of an exported class. Findings keyed as `"<file> <kind> \`<name>\`"` in `scripts/jsdoc-baseline.json` (2089 entries). Entries for the code being moved: lines 424-427 (`ConsoleLike`, `FileTransport.close/log`, `PrismarineTransport.log`) and 492-496 (`Console.getFormattedUsername/getName/getServer/sendMessage/write`). Moving a file changes its key, so the moved symbols must gain JSDoc or the baseline must be regenerated with `node scripts/check-jsdoc.mts --update`.
- `scripts/check-american-filenames.mts`: rejects tracked paths containing British spellings (words split on case and separators), exit code 1.
- `scripts/check-unicode-escapes.mts`: rejects `\uXXXX` escapes for readable non-ASCII characters in tracked text files; control characters like `\u001b` stay allowed.

## 3. What a new workspace package needs

Reference packages: `packages/color-parser` (no deps) and `packages/logger` (depends on color-parser). Both are at `0.15.2`, as is every package in the repo (`auth`, `bedrock-data`, `binaryutils`, `brigadier`, `client`, `color-parser`, `errors`, `leveldb`, `logger`, `math`, `minecraft`, `nbt`, `prismarine`, `protocol`, `raknet`, `server`, and `tools/docs`). Per `docs/versioning.md`, below `1.0.0` a feature is `patch`, a breaking change is `minor`. `.changeset/config.json` has one `fixed` group covering all `@jsprismarine/*` except `color-parser`, `brigadier`, `bedrock-data`; `updateInternalDependencies: patch`. Pending changesets: 14 `prismarine` patches, one `prismarine` minor (`tender-items-say.md`, UUID-keyed permissions), two `brigadier` patches, one `server` patch.

Files in each package (identical scaffolding, copy from `packages/logger`):

| File | Notes |
| --- | --- |
| `package.json` | `name`, `version` (match 0.15.2), `description`, `sideEffects: false`, `type: module`, `files: [dist, CHANGELOG.md, README.md]`, `main` (`./dist/index.cjs.cjs`), `module`, `types`, dev `exports` to `./src/index.ts` / `./src/*.ts` / `./package.json`, `publishConfig.access: public` + `publishConfig.exports` (`types`, `import`, `module`, `require` per entry), scripts `clean`, `build` (`vite build && node ../../scripts/emit-dts.mts`), `build:watch`, `typecheck` (`tsc-ts --noEmit`), `repository`, `keywords`, `author`, `license: MIT`, `homepage`, devDependencies pinned to the same versions (`@types/node 24.19.2`, `glob 13.0.6`, `rimraf 6.1.3`, `typescript 7.0.2`, `vite 8.3.5`, `vitest 5.0.5`), workspace deps as `workspace:*` |
| `tsconfig.json` | extends `../../tsconfig.build.json`; `outDir ./dist`, `rootDir ../../`, `typeRoots` incl. `./src/@types`; excludes tests |
| `tsconfig.dts.json` | extends `./tsconfig.json`; `rootDir ./src`, `declaration`, `emitDeclarationOnly`, `paths: { "@jsprismarine/*": ["../*/dist/index.d.ts"] }` |
| `vite.config.ts` | copy verbatim; `formats: ['es', 'cjs']` for libraries, `['es']` for the server bin |
| `vitest.config.ts` | copy verbatim |
| `README.md` | title, Discord and npm badges, one-line description |
| `CHANGELOG.md` | heading `# @jsprismarine/<name>`; Changesets appends releases |
| `.npmignore` | present in logger/color-parser (copy) |
| `src/index.ts` | barrel; excluded from coverage |

Root registration:

- `pnpm-workspace.yaml`: `packages/**` and `tools/*` globs, nothing to add. `onlyBuiltDependencies`/`allowBuilds` list `esbuild`, `scriptc`, `core-js-pure`; a dependency with a postinstall or native build (an OpenTUI native renderer, for instance) must be added here or pnpm 12 skips its build.
- `tsconfig.build.json:48-66`: add `{ "path": "./packages/<name>/tsconfig.json" }` to `references`.
- `tools/docs/typedoc.json`: `entryPoints: ["../../packages/*"]`, `entryPointStrategy: packages`, and `packageOptions.entryPoints: ["src/index.ts"]`. VitePress uses TypeDoc's generated sidebar, so a package with `src/index.ts` appears in the API docs without package-specific TypeDoc config. The docs build (`tools/docs/package.json`, TypeDoc 0.28 on TypeScript 6.0.3) must still type-check each package; TSX and JSX runtime types need to be configured if a package uses them.
- `.changeset/config.json`: nothing to add; a new package automatically joins the `fixed` glob unless excluded.
- `turbo.json`: nothing to add.
- `turbo/generators/config.ts` + `turbo/generators/template/*`: `pnpm turbo gen Package` scaffolds `package.json`, `README.md`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, and `src/index.ts`. It does not produce `tsconfig.dts.json` or `CHANGELOG.md`, and its `updateTsConfig` action is a TODO, so the reference must be added by hand.
- `scripts/check-jsdoc.mts` only reads `.ts`; `biome.json` covers `packages/*/src/**` regardless of extension.

## 4. Status-bar data sources in `packages/prismarine`

| Metric | Accessor |
| --- | --- |
| TPS | `Server.getTPS(): number` (`Server.ts:896`), rolling over the last second; `Server.getTick(): number` (`:888`) |
| Tick event | `server.on('tick', (e: TickEvent) => ...)`; `TickEvent.getTick()` |
| Late-tick diagnostics | logged at `verbose` under namespace `Server/tick` (`Server.ts:565-575`), not exposed as data |
| Player count / list | `Server.getSessionManager().getAllPlayers(): Player[]` (`SessionManager.ts:37`), `getPlayerList(): Map<string, PlayerListEntry>` (`:25`), `findPlayer`, `getPlayerByExactName`, `getPlayerById`; `Player.getName()` (`Player.ts:620`), `getAddress()` (`:616`), `getNetworkSession()` (`:611`) |
| Player join/leave | typed events `playerConnect`, `playerDisconnect`, `playerSpawn`, `playerDespawn` (`events/EventEmitter.ts:22-42` `EventTypes`; `events/Events.ts` exports the classes) |
| Max players | `Config.getMaxPlayers()` (`config/Config.ts:265`); `RakNetListener.getMaxConnections()` (`raknet/src/ServerSocket.ts:205`) |
| Worlds | `Server.getWorldManager().getWorlds(): World[]` (`WorldManager.ts:216`), `getDefaultWorld()` (`:224`), `getWorldByName()` (`:209`); `World.getName()` (`World.ts:1201`), `getFormattedName()` (`:1204`), `getPlayers()` (`:1152`), `getEntities()` (`:1123`) |
| MOTD / server name | `Config.getMotd()` (`Config.ts:301`); live value via `Server.getRaknet()?.serverName` (`ServerName` from `packages/raknet/src/utils/ServerName.ts`: `getMotd()`, `getName()`, `getProtocol()`, `setOnlinePlayerCount` is called by the socket); `Server.getMetadata()` returns the same object and throws before `bootstrap` |
| Version | `Server.getVersion(): string` (`Server.ts:678`, package version); `Server.getIdentifiers().MinecraftVersions.at(-1)` and `.Protocol` |
| Config | `Server.getConfig()` (`Server.ts:835`): `getServerPort()`, `getServerIp()`, `getLevelName()`, `getGamemode()`, `getDifficulty()`, `getViewDistance()`, `getOnlineMode()`, `getEnableProcessTitle()`, `getEnableTicking()`, `getLogLevel()` |
| Memory / uptime | nothing in the server; use `process.memoryUsage()` and `process.uptime()` in whichever process reports them. `utils/Timer.ts` wraps `process.hrtime` for ad-hoc timings only |
| Chat | `server.on('chat', (e: ChatEvent) => consoleTextOf(e.getChat()))` as in `Console.ts:109-112` |
| Log lines | `Logger.setConsole(ConsoleLike)` for formatted lines; `Logger.onLine()` for raw messages |

Event bus: `Server extends EventEmitter` (`events/EventEmitter.ts:149-190`): `on(id, cb)`, `once`, `emit(id, event): Promise<void>` (awaited, handlers run inside the tick), `post([id, event])` (fire and forget).

## 5. Tests touching the console path and the test fixtures

- `packages/prismarine/src/Console.test.ts` (section 1): `writeAbovePrompt` and `completeCommand` only; no readline, no TTY.
- `packages/logger/src/transport.test.ts`: `PrismarineTransport` buffers until `console` is assigned, replays in order, and writes once per record afterwards (21-50).
- `packages/logger/src/logger.test.ts`: uses `logger.setConsole({ write })` as the sink (line 10); asserts suppressed levels never reach the transport, enabled levels do, lowering the level emits everything, `getNamespace` is not called for suppressed messages, and the stack-depth assumption of `getNamespace` holds (14-74).
- `packages/prismarine/src/command/CommandManager.test.ts:97` documents that the console bypasses permissions by not being a `Player` (no `isConsole()`).
- `packages/prismarine/src/Server.test.ts`: mocks `@jsprismarine/raknet` `RakNetListener` (13-23); `debugConfig(levelName)` subclasses `Config` with `enable()` as a no-op and overrides for IP, world, preload radius 0, ticking off, process title off (52-111); `beforeAll` points `JSP_DIR` at a temp dir (28-36). Two cases: `new Server({ logger, config })` (not headless, 113-122) and `new Server({ ..., headless: true })` (124-133); both `bootstrap('0.0.0.0', 12345)` then `shutdown({ stayAlive: true })`. The non-headless case passes under vitest because `Console.enable()` bails when `process.stdin.setRawMode` is absent (`Console.ts:88-91`); a console that spawns a process or opens a renderer must keep an equivalent guard or default to headless when stdin is not a TTY.
- Headless servers elsewhere: `packages/client/src/Login.test.ts:32`, `packages/client/src/cli/Cli.test.ts:91`, `packages/client/src/bot/Fleet.test.ts:26`, all `new Server({ logger, config: new Config(), headless: true })`.
- `packages/prismarine/src/testing/`: `stub.test.helper.ts` (`stub<T>(members)`, `stubOf`, `StubMembers<T>`) and `blockTarget.test.helper.ts` (`LoggedLines`, `sessionNearBlocks`). No server fixture lives there; `Server.test.ts` builds its own.
- `.test/vitest.setup.ts` stubs `JSP_DIR=jsp` before each test.
- `packages/server/scripts/dev-smoke.exp`: manual PTY smoke test of console input across restarts (section 1).

## 6. Docs to update

- `docs/running.md:30-37` (`pnpm run dev` / `pnpm run start`), `:85-96` ("How the development server works": supervisor, "the interactive console keeps working across restarts"), `:107,120-123` (env vars with `pnpm run dev`). New flags or a `console` subcommand belong here.
- `docs/log-levels.md`: level list only; mention if the TUI filters by level.
- `tools/docs/site/index.md:18`: feature blurb "pnpm run dev starts the server from source and restarts it when any package changes, with a working interactive console."
- `tools/docs/site/.vitepress/config.mts:14-20`: guide sidebar lists `running` and `log-levels`; `tools/docs/assemble.mts:23-26` copies only top-level `docs/*.md` into the site, so a new guide page needs a sidebar entry and `docs/agents/**` stays out of the site.
- `README.md:46-49` ("Run the server (use `pnpm run dev` for development)").
- `packages/logger/README.md:6` (stale `winston`/`readline` wording).
- `packages/server/README.md` and `packages/prismarine/README.md` do not mention the console.
- `packages/server/scripts/dev.mts:1-19` and `dev-smoke.exp:1-12` header comments describe the current stdin-inheritance design.
- `Dockerfile:25-27`: runs `node --import tsx ./src/Server.ts` as PID 1 with no TTY; the server must keep starting headless there without flags.

## 7. Bun and CI

Bun is not used. `bunfig.toml` only sets the npm registry and `$BUN_AUTH_TOKEN`; the other mentions are prose (`packages/prismarine/README.md:18`, `packages/brigadier/README.md:22`, `packages/leveldb/README.md:15` noting there is no `bun build --compile`) and the compatibility comment at `Console.ts:94`. Node is the runtime everywhere (`.nvmrc` `26.x`, Dockerfile `node:26-slim`, SEA needs >= 25.5).

CI (`.github/workflows/`), all using the composite `.github/common/install` (setup-node from `.nvmrc`, pnpm from `packageManager`, `pnpm install --no-frozen-lockfile`):

| Workflow | Jobs and commands |
| --- | --- |
| `lint.yml` | `pnpm run lint` (Prettier check, American filenames + Biome, JSDoc check, unicode escapes) |
| `test.yml` | matrix ubuntu/macos/windows: `pnpm run build`, `pnpm run typecheck`, `pnpm run test`; vitest coverage report action, Codecov upload |
| `commitlint.yml` | `commitlint` over the PR range |
| `nightly.yml` | matrix ubuntu/macos/windows: `pnpm run build`, `pnpm run package` (SEA), upload artifact |
| `scriptc.yml` | `pnpm run package:scriptc:coverage`, `pnpm run package:scriptc` |
| `release.yml` | submodule init, `pnpm run build`, `changesets/action` (version PR / publish), `.github/scripts/create-github-releases.mjs` |
| `docs.yml` | `pnpm run build:docs` (TypeDoc + VitePress), deploy to gh-pages |
| `codeql.yml` | CodeQL analysis |
| `pull-request.yml` | `dependency-changesets-action` for Renovate PRs |

A new package must therefore pass: Prettier, Biome (plus the two grit plugins), the JSDoc check on every exported `.ts` symbol, `tsc-ts --noEmit`, `vite build` + `emit-dts` on three OSes, vitest, the TypeDoc build under TypeScript 6, and (if it ends up in the server bundle) rolldown-to-CJS bundling for the SEA and `scriptc`.
