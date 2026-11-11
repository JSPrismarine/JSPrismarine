# Contributing to JSPrismarine

Thanks for helping. This page covers reporting a problem, suggesting a change, and sending code.
Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Report a bug

Search the [existing issues](https://github.com/JSPrismarine/JSPrismarine/issues?q=is%3Aissue) first,
open and closed. If yours is already there, add what you know to it rather than opening another.

Otherwise [open a bug report](https://github.com/JSPrismarine/JSPrismarine/issues/new?template=bug_report.md).
A report we can act on has:

- **What you did**, as steps someone else can follow, starting from how you started the server.
- **What you expected** and **what happened instead**. For a crash, paste the error and its stack
  trace in a code block.
- **Versions**: the JSPrismarine version the server prints when it starts, the Minecraft version
  you joined with, and your operating system.
- **Your `config.json`**, if you changed it, and any packs you load.

## Suggest a change

[Open a feature request](https://github.com/JSPrismarine/JSPrismarine/issues/new?template=feature_request.md)
that says what you want to do and why the server cannot do it today. Say whether vanilla Minecraft
does it, and in which edition: the project's goal is vanilla parity, so a change that matches
vanilla behavior is easier to accept. Check first whether a pack could do it; see
[Extending JSPrismarine](docs/guide/extending.md).

## Send code

### Set up

You need Node.js and [pnpm](https://pnpm.io/installation) in the versions `package.json` names under
`engines`, and a JDK for the default overworld; [Running JSPrismarine](docs/guide/running.md#run-from-source)
lists them.

```bash
git clone https://github.com/JSPrismarine/JSPrismarine.git
cd JSPrismarine
pnpm install
pnpm run dev
```

`pnpm run dev` builds the workspace, starts the server and restarts it when you change a file.

### Find something to work on

Issues labeled
[Good First Issue](https://github.com/JSPrismarine/JSPrismarine/issues?q=is%3Aissue+is%3Aopen+label%3A%22Good+First+Issue%22)
are small and well described. The [parity tracker](https://jsprismarine.dev/parity)
lists every vanilla behavior that does not match yet, each a possible change.

### Make the change

- **Keep it focused.** One behavior per pull request, with the change made in the package that owns
  it.
- **Test it.** Tests are Vitest files beside the code they cover. A bug fix comes with a test that
  fails without the fix. `pnpm run test` runs them all.
- **Check it.** `pnpm run lint` runs Prettier, Biome and the repository's own checks, and
  `pnpm run typecheck` type-checks every package. Prettier and Biome check only the files your
  branch changed, and `pnpm run format` fixes those; `pnpm run lint:all` and `pnpm run format:all`
  cover every file, as CI does.
- **Describe releases.** A change to a published package needs a Changeset: run `pnpm changeset`
  and pick each package's bump from the [versioning policy](docs/guide/versioning.md).
- **Keep the docs true.** Update the pages that describe what you changed. A value the docs quote
  from code, such as a version or a count, is marked as a docs fact rather than typed in; see
  `tools/docs/facts.mts`.

### Commit

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are
checked by commitlint, both in the `commit-msg` hook and in CI, so a message that breaks the
rules is rejected before it lands. A typical subject looks like this:

```
feat(labels): sync CodeRabbit labels
```

- Start with a lowercase type (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`,
  `build`, `perf`, `style`, `revert`) and an optional lowercase scope, usually the package.
- Write the subject in the imperative mood ("add", not "added" or "adds"), starting with a
  lowercase letter. Proper names such as `CodeRabbit` keep their capitals.
- Leave out the trailing period, and keep the whole first line to 72 characters.
- Wrap code in backticks: file names, functions, identifiers and flags, as in
  ``fix(server): read `.env` with `process.loadEnvFile` ``.
- Reference issues and pull requests after the first line, in the body.

History stays linear: bring your branch up to date by rebasing onto `master`, not by merging it in.

### Open a pull request

Push your branch and open a pull request against `master`. Say what changed and why, and link the
issue it closes. CI runs the tests, the lint and the type check; if a check fails for a reason
unrelated to your change, say so in a comment and a maintainer will look.

## TypeScript style

All TypeScript code is formatted with [Prettier](https://prettier.io/) and linted with
[Biome](https://biomejs.dev/). Type checking and declaration output use TypeScript 7 through
[`tsc-ts`](https://github.com/vercel-labs/tsc-ts); `pnpm run typecheck` runs it for every package.

In VS Code, install the recommended TypeScript Native Preview extension. The workspace settings
point it at the TypeScript 7 package in `node_modules`, which works on every platform because the
extension picks the native binary for your OS itself. `tsc-ts` has no language server mode yet, so
the editor runs the official TypeScript 7 server while the command line uses `tsc-ts`.

Declaration files come from `scripts/emit-dts.mts`, which also runs on `tsc-ts`. `vite-plugin-dts`
cannot replace it yet: as of `unplugin-dts` 1.1.2 it still drives the old TypeScript JavaScript API
and falls back to the side-by-side `@typescript/typescript6` package in a TypeScript 7 repository,
so declarations would come out of TypeScript 6 again. Revisit once Volar reads the TypeScript 7.1
API (tracked in vuejs/language-tools#5381).

Let TypeScript infer types, and carry them through annotations, generics, `satisfies` and narrowing
rather than `as` casts.

## Questions

Ask on [Discord](https://discord.gg/kZZCDyCBbW) or in a
[GitHub issue](https://github.com/JSPrismarine/JSPrismarine/issues/new).
