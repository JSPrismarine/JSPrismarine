---
title: Running JSPrismarine
group: Documents
category: Guides
---

# Running JSPrismarine

## 1. Prerequisites

*   1.1 node `>=22.18` and pnpm `>=12`.

pnpm is the only supported package manager. Installs with npm or yarn fail
with a message pointing back to pnpm, and repository tooling runs one-off
tools through `pnpm dlx` (or `pnpx`) rather than `npx`.

The Bedrock resources live in a Git submodule. You don't need to initialize it
yourself: `pnpm install`, `pnpm run dev` and the bedrock-data build all fetch
it when it is missing.

## 2. Install dependencies

```bash
    # Install npm dependencies
    $ pnpm install
```

## 3. Running

```bash
    # Development
    $ pnpm run dev

    # Production (you should probably be using the prebuilt version however)
    $ pnpm run build
    $ pnpm run start
```

## 4. How the development server works

`pnpm run dev` runs the server from TypeScript source under a small supervisor.
No build step is needed: every `@jsprismarine/*` package resolves straight to
its `src/`, so an edit in any package takes effect on the next restart.

The supervisor watches the source of all workspace packages and restarts the
server gracefully (saving the world first) whenever a file changes. The
interactive console keeps working across restarts. If the server crashes while
you are mid-edit, the supervisor stays up and starts it again on your next
change. Changing the `bedrock-data` resources or its generator regenerates the
data before the restart.
