# Updates

Status: phase 1 built, 2026-11-25. Phase 2 not started.

A server should tell its owner when a newer JSPrismarine is out, in the console and in game to
operators, the way Paper and Spigot do. Later it should also be able to download the new
executable and switch to it. This plan builds the first part, the update checker, and settles
what the checker has to get right so the second part, the updater, fits on top without changing
what servers in the field read.

Both parts follow a channel: `release` for tagged releases and `nightly` for the prereleases built
from `master`. Both read a feed whose address the owner can change, so a server can follow a fork
instead of JSPrismarine.

## What changes for whom

| Who                           | Today                                                         | After the checker                                                                                       |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Owner of a release executable | Finds out about a release from GitHub.                        | The console logs the new version and its release notes once, and `/version` shows it.                    |
| Owner of a nightly executable | Has no way to tell how old their nightly is.                  | Hears about each newer nightly and each newer release.                                                   |
| Operator in game              | Nothing.                                                      | Sees one chat line on join while an update is known, and one when a check finds a new version.          |
| Owner of an npm install       | Nothing.                                                      | Hears about new releases. The server cannot replace an npm install, so the message says what came out.  |
| Someone running a checkout    | Nothing.                                                      | Nothing, unless they turn the checker on. They update with `git pull`.                                   |
| Fork maintainer               | Their users' builds know nothing of the fork's releases.      | A fork that runs the release workflows publishes its own feed, and its builds read it without config.   |

## What we know

Gathered on 2026-11-25.

- **Releases.** `release.yml` publishes the npm packages, then the job "Publish standalone
  executables" uploads `prismarine-<target>` for six targets, `JSPrismarine-arm64.app.zip` and
  `highlights.md` to the GitHub release `jsprismarine@<version>`. A recovery run of an old release
  passes `--latest=false`, so the newest release is not always the one a run just published.
- **Nightlies.** `nightly.yml` publishes at most one prerelease every six hours, and the push after
  a failed run publishes one at once, tagged
  `jsprismarine@<next>-nightly.<yyyymmdd>.<run>`, for Linux x64, macOS arm64 and Windows x64. The
  version is a prerelease of the next release, so it sorts below that release and above the one
  before it under semver precedence.
- **npm.** `@jsprismarine/server` has releases under `latest` and snapshots such as
  `0.21.0-unstable-20261112121906` under `unstable`. These snapshots are not the nightly
  executables and have versions of their own.
- **Build type.** `packages/prismarine/src/version.ts` already tells the builds apart: `buildType()`
  is `release` or `nightly` for an executable (from the `BUILD_TYPE` stamp), `release` or `nightly`
  for the npm package (from its version), and `dev` for a checkout. `set-build-metadata.mjs` also
  stamps `BUILD_FLAVOR`, `BUILD_TIME` and `BUILD_GIT_HASH`.
- **GitHub's release list is crowded.** Changesets moves every package together, and
  `create-github-releases.mjs` makes one GitHub release per package, about 40 per version. On
  2026-11-25 the newest 100 releases held 8 server releases, about a week of them. Finding the
  newest nightly or an older server's release through the REST API means filtering pages of other
  packages' releases.
- **The addon index is the precedent.** Addon publishers upload `index.json` to a release with the
  fixed tag `addons` (`ADDON_RELEASE_TAG`), servers fetch it from
  `https://github.com/<owner>/<repo>/releases/download/addons/index.json`, and an addon source is
  spelled `owner/repo`. `httpsFetch` in `packages/prismarine/src/addons/addonPack.ts` wraps `fetch`
  with an HTTPS-only check and a deadline. Replacing an addon keeps the old folder as
  `.<name>.previous` until the new one is in place.
- **The site.** jsprismarine.dev is a Cloudflare Pages project. `docs.yml` builds and uploads the
  whole site from `master`, one build at a time, and a build takes long enough that pushes queue
  behind it. The VitePress config already writes a `_headers` file in `buildEnd`, and Pages reads a
  `_redirects` file the same way.
- **The host process.** The `prismarine` command in `@jsprismarine/server` runs the server as a
  child process under `Supervisor`, which owns the child across restarts and talks to it over
  `@jsprismarine/console-protocol`. A program that embeds `@jsprismarine/prismarine` has no host.
- **bStats is the precedent for a network call on by default.** It reads a `stats.bstats` section
  of `config.json`, has an environment opt-out (`JSP_BSTATS=0`), stays off when `CI` or `VITEST` is
  set, and has a guide, `docs/guide/usage-statistics.md`, that says what goes out.

## Decisions

### The server reads a feed file, published as a release asset, behind a site URL

The question was whether servers should read GitHub's releases or something on the website. There
are three ways to do it:

| Way                                                   | For                                                                                     | Against                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub REST API                                       | Nothing to publish. A fork works with its `owner/repo`.                                 | 60 unauthenticated requests per hour per address, shared by every server behind one NAT or host. Pages of other packages' releases to filter. A format we don't own, with nowhere to put a checksum we choose, a pulled nightly or a security notice.                      |
| A feed file the docs build writes into the site       | A URL and format we own.                                                                | A nightly would wait for a full site build, which runs only on a push to `master` and queues behind the others. A failed docs build would hide a release from every server.                                                                                              |
| A feed file uploaded as a release asset, with a site URL that redirects to it | A format we own. The workflow that publishes the build writes the feed in the same job, so they cannot disagree. Release asset downloads don't count against the API limit. A fork's workflows publish a feed for the fork. The site URL lets us move the files later. | Two redirects per check. A `--clobber` upload replaces the file in two steps, so a check can land in the gap and fail. The checker tries again at its next interval. |

The third is the plan. The site is part of it as the stable address: servers in the field read
`https://jsprismarine.dev/updates/v1/<channel>.json`, and the site's `_redirects` sends that to
`https://github.com/JSPrismarine/JSPrismarine/releases/download/updates/<channel>.json` with a 302.
If the files later move to object storage or gain signatures from another host, only the redirect
changes. The `v1` in the path is the feed's schema version, so a breaking change gets a new path
and old servers keep reading the old one.

### One feed file per channel

The release workflow writes `release.json` and the nightly workflow writes `nightly.json`. The two
workflows run in different concurrency groups, so a single file holding both channels would need a
read, an edit and an upload from each, and the later upload could drop the earlier one's change.
One file each means each workflow owns its file outright.

A server on the nightly channel reads both files and takes the higher version, so a nightly user
hears about the release their nightly led up to. A server on the release channel reads only
`release.json`.

### The feed format

```json
{
    "schema": 1,
    "channel": "release",
    "version": "0.25.0",
    "published": "2026-11-24T20:23:15Z",
    "commit": "0e3e8864d57…",
    "url": "https://github.com/JSPrismarine/JSPrismarine/releases/tag/jsprismarine%400.25.0",
    "notes": "https://jsprismarine.dev/releases#v0-25-0",
    "assets": {
        "linux-x64": {
            "url": "https://github.com/JSPrismarine/JSPrismarine/releases/download/jsprismarine%400.25.0/prismarine-linux-x64",
            "sha256": "…",
            "size": 104857600
        },
        "darwin-arm64-app": { "url": "…/JSPrismarine-arm64.app.zip", "sha256": "…", "size": 0 }
    }
}
```

- `assets` is keyed by the Bun target without its `bun-` prefix, the name `BUILD_TARGET` already
  uses, so an executable can find its own entry. The checker doesn't use `assets`. It is in the
  first version so that every feed a server will ever read carries what the updater needs.
- A reader ignores keys it doesn't know, as `parseAddonIndex` does. New fields, such as a security
  notice, can then arrive without a schema bump.
- `notes` points at the release's notes on the site, at the anchor `releaseAnchor` in
  `tools/docs/site/.vitepress/theme/releases.ts` gives it. A nightly has none on the site, so its
  `notes` is the GitHub release, which carries `highlights.md`.
- Each file has a detached Ed25519 signature beside it, `release.json.sig` and `nightly.json.sig`,
  over the file's exact bytes. A signature inside the JSON would need both sides to agree on how
  to serialize it first. The checker ignores the signatures; the updater requires them.
- The writer replaces a channel's file only with a higher version. A recovery run of an old release
  then leaves `release.json` alone. To pull a bad nightly, a maintainer reruns the writer by hand
  for the previous one, with a flag that allows going back.

### Fork builds read the fork's feed

`set-build-metadata.mjs` stamps a new `BUILD_UPDATE_SOURCE`: the site URL when
`GITHUB_REPOSITORY` is `JSPrismarine/JSPrismarine`, and the repository's own `owner/repo`
otherwise. A fork that runs the release and nightly workflows publishes its own `updates` release,
and its executables read it without anyone setting anything. Without this, a fork's users would be
told to "update" to upstream builds that lack the fork's changes.

The owner can override the source in `config.json`, in either form:

- `owner/repo`, read from `https://github.com/<owner>/<repo>/releases/download/updates/`. This is
  the spelling addon sources use.
- An `https:` URL of a folder that holds `release.json` and `nightly.json`, for a fork that hosts
  its feed elsewhere.

### Settings

A new `updates` section in `config.json`. The first start writes it empty, with a comment that
lists the keys, so each key follows the build until the owner sets it. Writing the defaults in
would pin a channel that the build later changes.

| Setting           | Default                                          | What it does                                                    |
| ----------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `updates.enabled` | `true`, or `false` for a `dev` build             | Whether the server checks for updates.                          |
| `updates.channel` | The build's channel (see below)                  | `release` or `nightly`.                                         |
| `updates.source`  | The build's stamped source, or the site URL      | Where the feed is: `owner/repo` or an `https:` folder URL.       |
| `updates.interval` | `360`                                           | Minutes between checks. Values under `60` read as `60`, with a warning. |

The default channel is `nightly` for a nightly executable and `release` for everything else. An
npm `unstable` snapshot defaults to `release` too: its version is not in the nightly feed, and
`0.26.0` sorts above `0.26.0-unstable-…`, so it still hears about the release it led up to.

`JSP_UPDATE_CHECK=0` turns the checker off whatever the config says, and it stays off when `CI` or
`VITEST` is set. These follow the bStats rules, and the guide documents them the same way.

### A checkout never loads it

`pnpm dev` and `pnpm start` run a `dev` build, and a `dev` build has nothing to update to: its
owner updates with `git pull`. So the checker is off for a `dev` build unless `updates.enabled` is
set to `true` by hand, and the server loads the `updates` module with a dynamic `import()` only
when the checker is on. A dev server then never loads its code, never registers its timer and never
touches the network for it. The host's updater in phase 2 needs a `BUILD_TYPE` stamp, which a
checkout never has, so it stays out of `pnpm dev` the same way.

Leaving the code out of the build altogether would need a second build of
`@jsprismarine/prismarine` for checkouts, since `pnpm dev` runs the same `vite build` output that
npm ships. The dynamic import gets the same result at run time without that.

The `update` commands below still register on a dev server, so they can be tried. `update check`
runs a one-off check, which is how someone working on the checker tests it.

### What the checker does

The checker runs in the server process, in `@jsprismarine/prismarine`, so an embedded server
checks too and the operator notice has the players to send it to. The host process doesn't fetch
anything in the first phase.

- It checks a minute after the server starts, so a slow or unreachable feed never delays
  startup, then every `updates.interval` minutes. The default of six hours matches how often a
  nightly can be published. The floor of an hour keeps a misconfigured server from polling the
  feed host, since every server shares it.
- The request is one `GET` per feed file through `httpsFetch`, with a short deadline and a
  `User-Agent` of `JSPrismarine/<version>`. It sends no body, no server UUID and no settings. The
  guide says this, and says that the feed host sees the address the request comes from.
- Versions compare by semver precedence, prerelease identifiers included, so
  `0.25.0-nightly.20261124.4484` is newer than `0.25.0-nightly.20261124.4481` and older than
  `0.25.0`. `compareAddonVersions` compares `major.minor.patch` only, so the checker brings its own
  comparison in its module.
- When a check finds a version it has not reported yet, it logs one `info` line with the version,
  the running version and the notes link, and tells online operators. A later check that finds the
  same version stays quiet. A restart reports it again, once.
- A failed request logs at `debug`. A feed that doesn't parse logs one `warn` per start, since it
  means the publisher has a bug.
- `/version` adds a line with the last check's result: up to date, the newer version, or that the
  last check failed and when.

### Operators in game

A player who holds `jsprismarine.updates.notify` sees one chat line on join while an update is
known, with the version and the notes link, sent once the client has a player to show it to.
Operators hold the node through `*`. A check that finds a new version while operators are online
tells them at once.

### Console commands

Three commands, which only the console can run by default:

| Command        | Phase | What it does                                                                                                     |
| -------------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| `update check` | 1     | Checks the feed now, whatever the interval, and logs the result even when nothing is new.                        |
| `update apply` | 2     | Downloads, verifies and swaps in the newest executable, then restarts onto it. Refuses on a build it can't replace, and says why. |
| `restart`      | 1     | Stops the server and starts it again in a new process.                                                           |

A player can run one only when a permission entry names its node exactly:
`jsprismarine.command.update` or `jsprismarine.command.restart`. Restarting the server or replacing
its executable is a host owner's decision, not something an operator account should get by holding
`*`, so the wildcard every operator holds doesn't count. The commands sit at level 0, so the level
check doesn't stop a player who was granted one, and the command list offers them only to such a
player. `update apply` will need its own node in phase 2.

`restart` needs the host. Today the supervisor restarts the child only under `--watch`
(`canRestart`). The command sends a new console-protocol message asking the host to restart the
current generation, and the supervisor honors it whether or not it watches files. A server with no
host, such as one embedded in another program, refuses the command and says so, since nothing
would start it again. `update apply` restarts through the same message, so phase 2 reuses it.

### The updater sits in the host, later

The updater is not part of the first phase, but these decisions fix where it goes so the checker
doesn't block it:

- **It applies only to the executables.** A build with a `BUILD_TYPE` stamp can replace itself. An
  npm install, a checkout or a container image is managed by something else, so those stay
  notify-only.
- **It runs in the host process.** Only the host outlives the server child and is the process the
  owner started. It spawns the next generation already, so a restart onto a new binary is a
  `Supervisor` restart with a different executable path.
- **The server tells the host what it found.** A new console-protocol message carries the checker's
  result to the host, so the host never fetches the feed a second time.
- **It keeps the old executable** as `.<name>.previous` beside the new one until the new one has
  started, as addon replacement does, and puts it back if the new one exits during startup.
- **It never restarts a server on its own** unless the owner asks for that in the config. By default
  it waits for `update apply` from the console.

The updater has problems the checker doesn't, recorded here so they are not discovered late:

- Windows won't overwrite or delete a running executable, but allows renaming it, so the swap
  renames the old one away first.
- The macOS app is a bundle. The updater replaces the whole bundle, and a file our own process
  downloads gets no quarantine flag.
- The executable's folder may not be writable, as under a system service. Then the updater says so
  and stays notify-only.
- A checksum from the same host as the file proves the download wasn't cut short, not that the
  file is ours. The updater checks an Ed25519 signature over the feed, made with a key whose public
  half the build stamps in. Node's `crypto` verifies Ed25519 with no dependency. The private key is
  a repository secret the feed writer reads. A fork signs with its own key, which its builds stamp,
  and an owner who points `updates.source` at another feed sets that feed's public key in
  `updates.public-key`. The checker doesn't need the signature, since it only shows a version, but
  the writer signs from the start so phase 2 changes no feed.
- A new version may migrate `config.json` or a world when it starts (`FileMigrations`). Going back
  to `.previous` after that can leave files the old version can't read.

## Slices

Phase 1, the checker:

Every phase 1 slice is built. The client-e2e scenario in slice 6 is not: the checker reads only
`https:` feeds, and the e2e harness has no TLS server to serve one. The unit tests drive the join
notice and the operator notice through the module instead.

1. **The feed writer.** `scripts/write-update-feed.mts` writes a channel's file from the
   release's assets, with each file's SHA-256 and size, signs it with the key in a new repository
   secret, and uploads both to the `updates` release, creating that release on first use and never
   marking it latest. It lives in `scripts/` rather than `.github/scripts/` so its tests run. It
   refuses to go back a version
   without its override flag. One step in the job "Publish standalone executables" of
   `release.yml` and one in `nightly-release` of `nightly.yml`. No new jobs, and no change to the
   number of jobs a pull request push starts.
2. **The site redirect.** `buildEnd` writes `_redirects` beside `_headers`, built from the feed
   module's source URL, repository and release tag. A test follows the rule.
3. **Feed parsing and the checker.** `packages/prismarine/src/updates/`: parse and compare the feed,
   the `updates` config section with its comment, the environment opt-out, and the checker with an
   injected clock and `fetch`. Tests count requests and log lines against a fake clock, including
   "one log line per new version", and a test runs the writer's output through the parser so the
   two cannot drift. Error catalog entries for anything that throws. Changeset.
4. **The fork stamp.** `BUILD_UPDATE_SOURCE` in `set-build-metadata.mjs` and `buildDefines()`, and
   the checker's default source read from it. Changeset.
5. **Commands.** `update check` and `restart`, console-only, with their nodes. The console-protocol
   restart request and the supervisor honoring it without `--watch`. Tests drive a fake supervisor
   and count the generations it spawns. Changeset for `@jsprismarine/prismarine`,
   `@jsprismarine/server` and `@jsprismarine/console-protocol`.
6. **Operators and `/version`.** The permission node, the join line, the notice to online
   operators and the `/version` line. Unit tests, and a client-e2e scenario that joins as an
   operator against a local feed and checks the chat line arrives. Changeset.
7. **The guide.** `docs/guide/updates.md`: what is checked, what the request sends, the settings
   and the opt-outs, how to follow a fork, and how to publish a feed for one. The settings table,
   the interval, the environment variable, the commands and the default URL are docs facts read
   from the code. "To update" in `running.md` links to it.

Phase 2, the updater, gets a plan of its own once phase 1 has shipped. In outline: the public key stamp
and `updates.public-key`, the console-protocol message carrying the check result, the host's
download, verify and swap, `update apply`, and a terminal UI badge.

## Open questions

- **Security notices.** The feed could carry a list of known security problems, each with the
  versions it affects, a one-line summary and a link. A server running an affected version would
  log a warning every start and tell operators even when it is not behind the newest version,
  such as a nightly user on a pulled build. Readers ignore unknown keys, so this can wait until the
  first time it is needed.
- **npm installs.** They could read npm's dist-tags rather than our feed, which would cover the
  `unstable` snapshots. Our feed covers their releases, so this plan leaves it out until someone
  asks.
- **Counting checks.** Cloudflare can count requests to `/updates/v1/`, which would show how many
  servers run each channel. bStats already reports build types, so this plan doesn't use it, and
  the guide should say whether we look at those counts.
- **The site's download links.** The releases page could show the newest nightly by reading the
  feed in the browser. Whether GitHub's asset download answers a cross-origin request has not been
  checked.
