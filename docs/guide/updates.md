---
title: Updates
description: How a JSPrismarine server finds out about a newer build, who it tells, and how to follow a fork or turn it off.
group: Documents
category: Guides
---

# Updates

A JSPrismarine server checks now and then whether a newer build is out. When it finds one, it
logs the version and a link to its release notes in the console, tells the operators in game, and
shows it in `/version`. It doesn't download or install anything: to update, replace the executable
as [Running JSPrismarine](running.md#run-the-prebuilt-server) describes. Installing a new build
from the server itself comes later.

## What the server checks

A server follows one of two channels:

- `release`, the tagged releases. Every build follows this channel by default, except a nightly.
- `nightly`, the prereleases built from `master`. A nightly build follows it by default. A server
  on this channel hears about each newer nightly and about each newer release, so a nightly server
  hears about the release its nightly led up to.

Each channel has a feed: a small JSON file that names the newest build, its release notes and its
executables. JSPrismarine's builds read the feeds from <!-- fact:updates.source -->`https://jsprismarine.dev/updates/v1`<!-- /fact -->,
such as <!-- fact:updates.releaseFeed -->`https://jsprismarine.dev/updates/v1/release.json`<!-- /fact -->.

The first check runs <!-- fact:updates.firstCheck -->1 minute<!-- /fact --> after the server starts,
so it never slows the start down, and the next ones every
<!-- fact:updates.interval -->360 minutes<!-- /fact -->. A check that fails, because the server is
offline or the site doesn't answer within <!-- fact:updates.timeout -->10 seconds<!-- /fact -->, is
logged at the `debug` level, and the server tries again at the next interval.

A server that runs from a checkout, with `pnpm run dev` or `pnpm run start`, doesn't check: you
update a checkout with `git pull`. It doesn't load the update checker's code either, unless you
set `updates.enabled` to `true` or run `update check`.

## What the request sends

Each check is one `GET` request per feed file, with the `User-Agent`
<!-- fact:updates.userAgent -->`JSPrismarine/<version>`<!-- /fact -->. It sends no server UUID, no
player data and none of your settings. The site, and GitHub, which serves the files, see the
address the request comes from, as any web server does.

## Who hears about an update

When a check finds a version no earlier check on this start found, the server:

- logs it once at the `info` level, with the version you run and the link to the release notes,
- tells every player online who holds <!-- fact:updates.notifyPermission -->`jsprismarine.updates.notify`<!-- /fact -->.

A player who holds the node and joins later sees the same line once they have spawned. Operators
hold the node through `*`, so they hear about updates without any setup. To keep an operator from
hearing about them, negate the node for them or their group in `permissions.json`.

`/version` shows the result of the last check under the version line: up to date, the newer
version, or that the last check failed and why.

## Console commands

Two commands help with updating. Only the console runs them, unless a player's permission entry
names the command's node itself. An operator's `*` doesn't count, because restarting the server is
a decision for whoever runs the machine.

| Command        | Node                                                                                   | What it does                                                                                               |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `update check` | <!-- fact:updates.updatePermission -->`jsprismarine.command.update`<!-- /fact -->       | Checks the feed now and prints the result, even when the server doesn't check on its own.                  |
| `restart`      | <!-- fact:updates.restartPermission -->`jsprismarine.command.restart`<!-- /fact -->     | Stops the server, saving the worlds, and starts it again in a new process.                                 |

`restart` works when the server runs under the `prismarine` command or the prebuilt executable,
which start it in a host process that can start it again. A server embedded in another program has
no host, so `restart` says it can't and leaves the server running.

## Settings

The server writes an empty `updates` section into `config.json`, with a comment that lists its
keys. A key you leave out follows the build:

<!-- fact:updates.settings -->
| Setting            | What it does                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `updates.enabled`  | Whether the server checks for updates. Unset, it does unless it runs from a checkout.        |
| `updates.channel`  | Which builds to hear about: `release` or `nightly`. Unset, the channel of the running build. |
| `updates.source`   | Where the feed is: `owner/repo`, or the https URL of a folder that holds the feed files.     |
| `updates.interval` | Minutes between checks; values under 60 read as 60.                                          |
<!-- /fact -->

`updates.interval` defaults to <!-- fact:updates.intervalMinutes -->`360`<!-- /fact --> and can't go
below <!-- fact:updates.intervalMinimum -->60 minutes<!-- /fact -->, since every server shares the
feed's host. A value the server can't use is logged as a warning when it starts. An `enabled` or
`source` it can't use turns checks off, so the server never reads a feed you didn't choose.

## Turning it off

Set `updates.enabled` to `false` in `config.json`:

```jsonc
{
    "updates": {
        "enabled": false
    }
}
```

In a container or a CI job, set <!-- fact:updates.optOut -->`JSP_UPDATE_CHECK=0`<!-- /fact --> in
the environment instead. It turns checks off whatever the config says.
<!-- fact:updates.optOutVariable -->`JSP_UPDATE_CHECK`<!-- /fact --> takes these values, in any case:

- <!-- fact:updates.optOutValues -->`0`, `false`, `off`, `no`<!-- /fact --> turn checks off.
- <!-- fact:updates.optInValues -->`1`, `true`, `on`, `yes`<!-- /fact --> leave the decision to
  `config.json`, as an unset variable does.
- Any other value turns checks off, and the server logs a warning that lists the values above.

The server also doesn't check when the `CI` environment variable is set, or under the Vitest test
runner.

## Following a fork

A fork's builds read the fork's own feed. The release and nightly workflows write the feed files,
<!-- fact:updates.files -->`release.json` and `nightly.json`<!-- /fact -->, to a GitHub release
tagged <!-- fact:updates.releaseTag -->`updates`<!-- /fact --> in the repository they run in, and
the build records that repository, so a fork that runs the workflows publishes a feed and its
executables read it without any setting.

To follow another feed, set `updates.source`:

- `owner/repo` reads the files from <!-- fact:updates.repositoryFeed -->`https://github.com/<owner>/<repo>/releases/download/updates/`<!-- /fact -->.
- An `https:` URL reads them from that folder, for a feed hosted somewhere else.

```jsonc
{
    "updates": {
        "source": "someone/jsprismarine-fork",
        "channel": "release"
    }
}
```

### Publishing a feed for a fork

The workflows run `scripts/write-update-feed.mts` after they upload a build's executables. It
records each executable's SHA-256 and size, and replaces a channel's file only with a higher
version, so rebuilding an old release leaves the feed as it was. To point a channel back at an
older build, such as after pulling a bad nightly, run it by hand with `--allow-older`.

With the repository secret `UPDATE_FEED_SIGNING_KEY` set to an Ed25519 private key in PEM, it also
uploads a signature beside each file, such as `release.json.sig`. Servers don't check signatures
yet; the updater that installs builds will. Without the secret, the feed goes up unsigned and the
workflow logs a warning.
