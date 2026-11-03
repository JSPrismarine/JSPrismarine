# @jsprismarine/server

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/server)](https://www.npmjs.com/package/@jsprismarine/server)

The `prismarine` command line: argument parsing, the host process that runs the server as a child, the `--watch` file watcher, and the choice between the terminal UI and the plain line console.

Run `prismarine` in a terminal on Node 26.9 or newer (or 26.4 with `--experimental-ffi`) and it
loads `@jsprismarine/console` and shows the UI. Anywhere else it runs the server in-process with
the plain console, where each stdin line is a command and each log record is a stdout line.
`--no-tui` or `JSP_NO_TUI=1` forces the plain console, `--headless` attaches no console at all,
and `--watch` restarts the server when workspace source or loaded content pack data changes
(`pnpm run dev` passes it). The flags and keys are documented in
[Running JSPrismarine](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/running.md#4-console).

## Native TypeScript loader prototype

`pnpm --filter @jsprismarine/server run dev:native-prototype` runs the source entry with Node's
built-in type stripping and a synchronous resolver for extensionless relative imports. The
prototype currently stops at runtime TypeScript syntax that needs code generation, including
`enum` declarations and parameter properties. The November 2026 source audit counted about 230
enums and 80 parameter properties; [Node's TypeScript support](https://nodejs.org/api/typescript.html#typescript-features)
does not transform them. The server-entry probe stops first at `ErrorKind` in
[`packages/errors/src/index.ts`](../errors/src/index.ts:3); a separate workspace import reaches a
parameter property in [`packages/packs/src/load.ts`](../packs/src/load.ts:55). Keep using
`pnpm --filter @jsprismarine/server run dev` with `tsx` until the source graph is erasable or those
files have a separate transform step.

`pnpm --filter @jsprismarine/server run bench:native-typescript` compares elapsed time and process
CPU while each loader imports the same server entry and handles `--help`. This checks module
startup without starting a world or opening the server socket. It does not measure a successful
native server startup while the syntax blockers remain. `pnpm run typecheck` remains a separate
required step because Node's type stripping does not type-check.
