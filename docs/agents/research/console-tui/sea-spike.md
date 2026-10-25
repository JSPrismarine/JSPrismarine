# SEA spike: one executable as OpenTUI host and IPC server child

Date: 2026-10-25. Machine: macOS 27.2 (Darwin), arm64, Node 26.12.1. Packages: `@opentui/core`
0.6.8 (with `@opentui/core-darwin-arm64` 0.6.8 as its optional dependency), `rolldown` 1.2.15
(the root `package.json` pin). Work directory `/tmp/sea-spike/`, scripts in
`/tmp/sea-spike-scripts/`. About 25 minutes of work.

Question: can one Node single-executable application (SEA) be both the host that renders with
OpenTUI and the server child it spawns with an `'ipc'` stdio channel?

Answer: yes. The ESM SEA with embedded OpenTUI assets renders a box on macOS arm64, the SEA
spawns itself as an IPC child, the `node:ffi` failure path is a normal exception, and the whole
run takes 0.2 to 0.4 seconds of wall time.

## What the spike program does

`src/main.mts`, bundled to `dist/main.mjs`.

- Child role (`--role=child`): `process.send({ type: 'hello', pid })`, wait for one message,
  reply, exit 0 on `'disconnect'`. Exit 3 if `process.send` is missing.
- Host role: spawn `process.execPath` with `stdio: ['ignore', 'pipe', 'pipe', 'ipc']`, await the
  hello, send a ping, await the reply. In a SEA, read the asset list from an embedded
  `otui-manifest.json`, write every asset with `sea.getRawAsset(key)` into `mkdtemp(tmpdir()/otui-)`,
  set `process.env.OTUI_ASSET_ROOT`. Then `await import('@opentui/core')` inside `try`,
  `createCliRenderer({ useAlternateScreen: false, useMouse: false, exitOnCtrlC: false })`, add a
  `BoxRenderable` holding `SEA OK <child pid>`, `requestRender()`, `await renderer.idle()`,
  `destroy()`, `child.disconnect()`, wait for the child's exit, exit 0. Every step logs to stderr.
- `--break-assets` points `OTUI_ASSET_ROOT` at a missing directory; `--no-extract` skips
  extraction so Core falls back to importing the platform package by name.

The SEA check is `process.getBuiltinModule('node:sea').isSea()`, which does not throw outside a
SEA.

## Steps, commands, results

### 1. Install

`npm init -y && npm install @opentui/core@0.6.8 rolldown@1.2.15`. 16 packages, 2 seconds.
`node_modules/@opentui/` contains `core` and `core-darwin-arm64` only.

`@opentui/core/node-assets` exports `getNodeAssets({ platform, arch, libc? })` returning
`{ key, source }[]`. For darwin-arm64 it lists 16 entries: `@opentui/core-darwin-arm64/libopentui.dylib`,
twelve Tree-sitter `.scm` and `.wasm` files, `@opentui/core/parser.worker.js`, and
`web-tree-sitter/tree-sitter.wasm`.

### 2. Run under plain Node

`node src/main.mts`. IPC worked on the first try. The TUI step failed with
`renderer.renderOnce is not a function`. Fix: `renderer.d.ts` has no `renderOnce`; the one-shot
sequence is `requestRender()` then `await idle()`. One fix, passed afterwards.

Side observation: the renderer began drawing on its own right after `createCliRenderer`, before
the explicit request, so the box appeared even on the failed run.

### 3. Bundle

`rolldown({ input, platform: 'node' })`, `write({ format: 'es', inlineDynamicImports: true })`.
Output 1.88 MB. Rolldown 1.2.15 prints
`WARN inlineDynamicImports option is deprecated, please use codeSplitting: false instead.`
No other warnings. The bundle includes `index.node.js` (the `node` export condition) and keeps
`await import(specifier)` for the platform package and `createRequire(import.meta.url)` for
`node:ffi`, both of which work inside the SEA.

### 4. SEA config keys on Node 26.12.1

A probe config with `"bogusKey": 1` built without any complaint, so `--build-sea` does not reject
unknown keys. Strings in the `node` binary confirm these keys: `main`, `output`, `mainFormat`,
`disableExperimentalSEAWarning`, `useSnapshot`, `useCodeCache`, `assets`, `execArgv`,
`execArgvExtension`, plus the messages
`"mainFormat" field of %s must be one of "commonjs" or "module"` and
`"mainFormat": "module" is not supported when "useSnapshot" is true`.

Config used:

```json
{
  "main": "/tmp/sea-spike/dist/main.mjs",
  "output": "/tmp/sea-spike/dist/spike",
  "mainFormat": "module",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "useCodeCache": false,
  "execArgv": ["--no-warnings"],
  "execArgvExtension": "none",
  "assets": { "otui-manifest.json": "...", "<each getNodeAssets key>": "<its source>" }
}
```

`--experimental-ffi` was left out because Node 26.9+ enables `node:ffi` by default; the SEA
imported it without the flag. `--no-warnings` suppressed the FFI `ExperimentalWarning`, which the
plain Node run printed.

### 5. Build and sign

`node --build-sea=dist/sea-config.json` then `codesign --sign - --force dist/spike`. Build takes a
few seconds. Sizes: 147.3 MB with no assets, 152.0 MB with the dylib only, 157.2 MB with all 16
assets. An unsigned copy died with exit 137 before printing anything, as the repo script's comment
says.

### 6. Run in a pseudo-terminal

Harness: python3 `-I`, `pty.fork()`, `TERM=xterm-256color`, replies `\x1b[1;1R` to every
`\x1b[6n`, 20 second limit.

First run, failure: the child's argv was
`[spike, spike, "--no-warnings", "/tmp/sea-spike/dist/spike", "--role=child"]`. Two causes:

- In a SEA `process.argv[1]` is the executable path again (it occupies the script slot), so user
  arguments start at index 2 in both SEA and plain Node. The host had used `slice(1)` for the SEA.
- `process.execArgv` inside the SEA contains the baked-in `--no-warnings`, and with
  `execArgvExtension: "none"` the child treats a forwarded copy as an ordinary argument. The host
  must forward `execArgv` only when running under plain Node.

The run still completed and exit was 0 because the child ignored the stray arguments; the fix was
for correctness. Second run with the fix, `--extra-flag` added to check forwarding:

```
[sea:host] spawning /private/tmp/sea-spike/dist/spike --extra-flag --role=child
[sea:child] argv=["/private/tmp/sea-spike/dist/spike","/private/tmp/sea-spike/dist/spike","--extra-flag","--role=child"]
[sea:host] hello from child pid=18063
[sea:host] reply {"type":"reply","echo":{"type":"ping"}}
[sea:host] extracted 16 assets to /var/folders/.../T/otui-gkwyWZ
[sea:host] opentui imported
[sea:host] renderer created 80x24 tty=true
┌────────────────────────────┐ │SEA OK 18063 │ └────────────────────────────┘
[sea:host] renderer destroyed
[sea:child] disconnect, exiting
[sea:host] child exited; host exit 0
--- wall time 0.4s, exit code 0
```

The renderer sent `\x1b[6n` twice during startup and continued after the harness answered. The
first harness attempt misreported a timeout because it treated the pty EIO at child exit as a
hang; the process itself had finished. Fixed by calling `waitpid` after the read error.

The dylib-only build (one asset) also rendered the box, exit 0, 0.2 seconds. A console that never
mounts `Code` or `Markdown` needs only `libopentui.dylib`.

### 7. Run with stdout redirected to a file

`./dist/spike > out 2> err`. Exit 0. `process.stdout.isTTY` is `undefined`, and the renderer
still created an 80x24 frame and wrote 3160 bytes of escape sequences and the box to the file,
including terminal queries (`\x1b]10;?`, `\x1b[?1016$p`, Kitty and iTerm capability probes). OpenTUI
does not refuse a non-TTY stdout on its own. The TUI gate in `plan.md` (stdin and stdout TTY,
`TERM` not `dumb`, `CI` and `JSP_NO_TUI` unset) has to stay in front of the import.

### 8. Failure paths

`--break-assets` (root set to `/nonexistent-otui`): `import('@opentui/core')` succeeded;
`createCliRenderer` threw
`Failed to initialize OpenTUI render library: Missing OpenTUI asset "@opentui/core-darwin-arm64/libopentui.dylib" at "/nonexistent-otui/@opentui/core-darwin-arm64/libopentui.dylib"`.
The `catch` ran, the host logged "continuing in plain mode", disconnected the child, and exited 0.

`--no-extract` (no `OTUI_ASSET_ROOT`): the import succeeded; `createCliRenderer` threw
`Failed to initialize OpenTUI render library: No such built-in module: @opentui/core-darwin-arm64`
because a SEA resolves bare specifiers as built-ins. Same clean recovery, exit 0.

So the failure is not in the lazy `import()` itself but in the first native call. Both are
ordinary rejected promises; the gate's `await import('node:ffi')` check will not catch a missing
asset, so the host needs the `try` around renderer creation too.

### 9. Temp directory residue

Each run left a fresh `otui-XXXXXX` directory under `$TMPDIR` (4.2 MB for the dylib only, 9.2 MB
for all 16 assets); six runs left six directories. The real host should extract into a stable
directory keyed by a hash of the asset bytes (or the server version) and skip the write when the
files already exist, and should clean up the directory on exit if it uses `mkdtemp`.

## Conclusions

ESM SEA with embedded OpenTUI assets on macOS arm64: yes. Build, ad-hoc signature, extraction,
`node:ffi` load, and a rendered frame all worked. Not tested: Linux, Windows, Node 26 before
26.9 (needs `--experimental-ffi` in `execArgv`), and `useCodeCache: true` with `mainFormat: "module"`.

`'ipc'` to a SEA child: yes. `spawn(process.execPath, userArgs, { stdio: [..., 'ipc'] })` gives
the child a working `process.send`, `'message'`, and `'disconnect'`. The only SEA-specific rules
are to omit the script path, read user arguments from `process.argv.slice(2)`, and not forward
`process.execArgv`.

Changes `scripts/package-sea.mts` needs:

1. Bundle output `format: 'es'` instead of `'cjs'`, and `codeSplitting: false` instead of the
   deprecated `inlineDynamicImports`. Check whether `yargsCjsImportMetaPlugin` is still needed;
   it exists for CommonJS output, and `import.meta.resolve` is unavailable inside a SEA, so it
   may still be required with ESM output.
2. Set `mainFormat: "module"`, `useSnapshot: false`, `useCodeCache: false`,
   `execArgvExtension: "none"`, and `execArgv: ["--no-warnings"]` (add `--experimental-ffi` only
   if the packaging Node is older than 26.9).
3. Add `assets`: call `getNodeAssets({ platform, arch, libc })` from `@opentui/core/node-assets`
   at build time, filter to the dylib unless the console uses Tree-sitter features, and embed a
   manifest listing the keys. The build runs per OS in `nightly.yml`, so `process.platform` and
   `process.arch` of the packaging job select the right platform package; the install step must
   fetch the matching `@opentui/core-<platform>-<arch>` optional dependency on each runner.
4. Add a startup step to the host code (not the script) that reads the manifest, extracts with
   `getRawAsset`, and sets `OTUI_ASSET_ROOT` before the lazy OpenTUI import, with the stable
   directory from section 9.
5. Keep the `codesign` step; it is still required.
6. Raise the version check from 25.5 to 26.9 (or 26.4 with `--experimental-ffi`) because the
   console needs `node:ffi`.

Recommended fallback: unchanged from `plan.md`. Plain mode runs the server in-process whenever the
TTY gate fails, and this spike confirms that when the gate passes but the native library is
missing or unloadable, the error from `createCliRenderer` is an ordinary exception; wrapping the
import and renderer creation in one `try` lets the host print one line naming the reason and
continue in plain mode with exit code 0. Build the TUI gate so that a non-TTY stdout never reaches
OpenTUI, since OpenTUI writes escape sequences to a file without complaint.
