---
title: Running JSPrismarine
group: Documents
category: Guides
---

# Running JSPrismarine

## 1. Prerequisites

*   1.1 node `lts` and `pnpm`,

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
