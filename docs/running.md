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

## 4. Configuration

New servers keep their settings in `config.json` in the working directory
(`jsp/` during development). The server creates it on first start, with every
setting preceded by a comment explaining it and a `$schema` URL for the
matching package version. Existing `config.yaml` files remain in use when
`config.json` is absent; if both files exist, `config.json` takes precedence.

The file is yours to edit. The server only ever changes the key it is
writing: your comments, blank lines and the order of the keys stay as they
are. When a new version adds a setting, the server adds that key and its
comment to the end of your file and leaves the rest alone, so there is no
need to regenerate the file after an upgrade.

The same applies to the JSON files beside it (`banned-players.json`,
`ops.json`, `permissions.json`) and to each world's `level.json` and player
data: the server changes the entry it means to and leaves your comments in
place. All of them may hold `//` and `/* */` comments and trailing commas.

The published `@jsprismarine/prismarine` package includes Draft 7 JSON
Schemas under `schemas/`. Each reference uses the exact package version that
wrote the file, served from UNPKG, so a standalone server or binary does not
need a separate npm install to make the schema available. Object files such as
`config.json`, `permissions.json`, `level.json`, and fallback player data contain
a `$schema` property. The root of `ops.json` and `banned-players.json` is an array, so those
files instead start with a `JSPrismarine schema` comment holding the versioned
URL. To validate those arrays in VS Code, map the file names in
`settings.json` and replace the URL placeholders with each file's exact URL:

```json
{
    "json.schemas": [
        { "fileMatch": ["ops.json"], "url": "<copy the JSPrismarine schema URL from ops.json>" },
        {
            "fileMatch": ["banned-players.json"],
            "url": "<copy the JSPrismarine schema URL from banned-players.json>"
        }
    ]
}
```

The schemas allow comments and trailing commas in editors that support JSONC.

A file that does not parse stops the server with an error naming the file
rather than being replaced by the defaults, so a typo costs a restart, not
the config.

## 5. How the development server works

`pnpm run dev` runs the server from TypeScript source under a small supervisor.
No build step is needed: every `@jsprismarine/*` package resolves straight to
its `src/`, so an edit in any package takes effect on the next restart.

The supervisor watches the source of all workspace packages and restarts the
server gracefully (saving the world first) whenever a file changes. The
interactive console keeps working across restarts. If the server crashes while
you are mid-edit, the supervisor stays up and starts it again on your next
change. Changing the `bedrock-data` resources or its generator regenerates the
data before the restart.

### Dropping packets to find a bad one

When a client leaves during the join without a `Disconnect` or
`PacketViolationWarning`, the server log alone does not say which packet it
choked on. Set `JSP_DEBUG_DROP_PACKETS` to a comma-separated list of packet
class names and the server never sends those, logging a warning for each one
it withholds:

```bash
    $ JSP_DEBUG_DROP_PACKETS=LevelChunkPacket,CraftingDataPacket pnpm run dev
```

Drop one type at a time and watch whether the client's behavior changes. A
batch of several packets is dropped whole when any packet in it is named.

Once a packet type is implicated, `JSP_DEBUG_DUMP_PACKETS` takes the same
kind of list and writes each named packet's encoded bytes, header included,
to a file of its own under `JSP_DEBUG_DUMP_DIR` (default: a
`jsprismarine-packets` directory in the system temp directory). That is the
exact byte sequence the client was given, ready to decode against the
protocol documentation. A packet can be dumped and dropped at the same time.

The variables are read when a connection is made, so they can also go in
`packages/server/.env.development.local`, which the server loads at startup.
Remove them when done; a server with packets missing is not one players can
use.
