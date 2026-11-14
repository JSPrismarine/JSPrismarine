---
title: Usage statistics
description: What a JSPrismarine server reports to bStats, when it reports, and how to turn it off.
group: Documents
category: Guides
---

# Usage statistics

A JSPrismarine server sends usage statistics to [bStats](https://bstats.org) unless you turn it
off. The numbers tell the JSPrismarine developers how many servers run JSPrismarine, which
versions they run and how many players they have. bStats is a separate project by Bastian
Oppermann. It shows the combined numbers for every server on a public page,
<!-- fact:bstats.servicePage -->[JSPrismarine on bStats](https://bstats.org/plugin/server-implementation/JSPrismarine/35257)<!-- /fact -->.

The server logs a notice on the start that writes the `stats.bstats` section into `config.json`, if
that start reports. The notice names the setting that turns reporting off. Later starts don't repeat
it, and a first start that doesn't report, such as one in a CI job, logs no notice at all.

## What the server sends

Each report is one JSON request to <!-- fact:bstats.endpoint -->`https://bStats.org/api/v2/data/server-implementation`<!-- /fact -->, for the
<!-- fact:bstats.service -->`JSPrismarine`<!-- /fact --> service (ID <!-- fact:bstats.serviceId -->`35257`<!-- /fact -->). It holds:

- The host's operating system, its CPU architecture and the number of CPUs the server may use.
  bStats draws its own charts from these.
- The <!-- fact:config.serverUuidKey -->`server-uuid`<!-- /fact --> from `config.json`, a random
  UUID the server generates on its first start. bStats uses it to count each server once.
- The version of the bStats client built into the server.
- These charts, each left out when it has nothing to report, such as the player charts on an
  empty server:

<!-- fact:bstats.charts -->
| Chart               | ID                | What it sends                                                                   |
| ------------------- | ----------------- | ------------------------------------------------------------------------------- |
| Players Online      | `players`         | How many players are online.                                                    |
| Build Type          | `buildType`       | Whether the server is a `dev`, `nightly` or `release` build, then its version.  |
| Memory              | `memory`          | The host's memory in whole gigabytes, such as `8 GB`.                           |
| Online Mode         | `onlineMode`      | Whether `online-mode` is on, as `online` or `offline`.                          |
| Enabled Transports  | `transports`      | Which transports the server accepts players over: RakNet, NetherNet or both.    |
| Player Platform     | `playerPlatform`  | How many online players play on each platform, such as Android, iOS or Windows. |
| Player Game Version | `playerProtocol`  | How many online players use each Minecraft release, then each protocol number.  |
| Player Transport    | `playerTransport` | How many online players joined over each transport.                             |
<!-- /fact -->

The operating system goes out in the form bStats' Java clients send it, so JSPrismarine servers
sit beside other servers in bStats' OS chart. Linux is sent as it is. macOS is sent with the macOS
version rather than the Darwin kernel release, and Windows as its edition, such as Windows 11.
For example:

<!-- fact:bstats.osExamples -->
| Host       | OS name sent | OS version sent   |
| ---------- | ------------ | ----------------- |
| Linux      | `Linux`      | `6.1.0-18-amd64`  |
| macOS 14.5 | `Mac OS X`   | `14.5`            |
| Windows 11 | `Windows 11` | `10.0`            |
| FreeBSD    | `FreeBSD`    | `13.1-RELEASE-p9` |
<!-- /fact -->

The <!-- fact:bstats.playerPlatformChart -->Player Platform<!-- /fact --> chart counts players
under these names: <!-- fact:bstats.playerPlatforms -->`Android`, `iOS`, `macOS`, `Fire OS`, `Windows`, `Dedicated Server`, `PlayStation`, `Nintendo Switch`, `Xbox`, `Linux`, `Unknown`<!-- /fact -->. A
player whose client reports a device the server doesn't know counts as `Unknown`.

The player charts carry counts only. The server sends no player names, Xbox account IDs, chat,
world data or seeds, and none of its settings beyond the ones in the table. bStats sees the
address the request comes from, as any web server does, and fills its location chart from it. The
[bStats page for server owners](https://bstats.org/docs/server-owners) explains what bStats does
with the data.

## When it sends

The first report goes out a random <!-- fact:bstats.firstSubmit -->3 to 6 minutes<!-- /fact --> after the server
starts. The next follows up to <!-- fact:bstats.secondSubmit -->30 minutes<!-- /fact --> later, and from then on the
server reports every <!-- fact:bstats.period -->30 minutes<!-- /fact -->. bStats asks every client to keep this
timing. A report that fails is dropped, and the server carries on. bStats keeps one report per
server in each <!-- fact:bstats.period -->30 minutes<!-- /fact -->, so it now and then turns one
away as a duplicate. The server doesn't count that as a failure.

The server decides once per start whether to report, and reading the config again with `/reload`
decides anew. It doesn't report when:

- <!-- fact:bstats.enabledKey -->`stats.bstats.enabled`<!-- /fact --> in `config.json` is anything
  other than `true`. A missing or misspelled key, or a value that isn't a boolean such as
  `"false"`, also turns reporting off, and the server logs a warning that names the problem.
- <!-- fact:bstats.optOutVariable -->`JSP_BSTATS`<!-- /fact --> in the environment turns it off,
  as [Turning it off](#turning-it-off) describes.
- The `CI` environment variable is set, as every CI service sets it.
- The server runs under the Vitest test runner.
- `config.json` could not store <!-- fact:config.serverUuidKey -->`server-uuid`<!-- /fact -->,
  because a new UUID on every start would count the server more than once.
- `config.json` could not store the bStats settings, because the server would then report without
  its settings, and the notice about them, ever being written.

Each time it stays off, the server logs why. A setting it cannot read, an unrecognized
`JSP_BSTATS` value and a UUID it could not store are logged where the default log level shows them.
An opt-out you chose, through the config, `JSP_BSTATS`, `CI` or the test runner, is logged at the
`debug` level, which the default log level hides.

## Turning it off

Set <!-- fact:bstats.enabledKey -->`stats.bstats.enabled`<!-- /fact --> to `false` in `config.json`:

<!-- fact:bstats.optOutConfig -->
```jsonc
{
    "stats": {
        "bstats": {
            "enabled": false
        }
    }
}
```
<!-- /fact -->

The change takes effect when the server next starts or reloads. In a container or a CI job, set
<!-- fact:bstats.optOut -->`JSP_BSTATS=0`<!-- /fact --> in the environment instead. It turns bStats off whatever
the config says. <!-- fact:bstats.optOutVariable -->`JSP_BSTATS`<!-- /fact --> takes these values,
in any case:

- <!-- fact:bstats.optOutValues -->`0`, `false`, `off`, `no`<!-- /fact --> turn bStats off.
- <!-- fact:bstats.optInValues -->`1`, `true`, `on`, `yes`<!-- /fact --> leave the decision to
  `config.json`, as an unset variable does. They don't turn on a server the config turned off.
- Any other value turns bStats off, and the server logs a warning that lists the values above.

## Settings

The server writes these settings into `config.json` on its first start, with a comment above
them that says what they are for:

<!-- fact:bstats.settings -->
| Setting                                 | Default | What it does                                             |
| --------------------------------------- | ------- | -------------------------------------------------------- |
| `stats.bstats.enabled`                  | `true`  | Whether the server sends anonymous usage data to bStats. |
| `stats.bstats.log-errors`               | `false` | Whether a failed submit is logged.                       |
| `stats.bstats.log-sent-data`            | `false` | Whether each submitted payload is logged.                |
| `stats.bstats.log-response-status-text` | `false` | Whether the text bStats answers a submit with is logged. |
<!-- /fact -->

To see exactly what the server sends, turn on
<!-- fact:bstats.logSentDataKey -->`stats.bstats.log-sent-data`<!-- /fact -->. Each report is then
logged at the `info` level with its JSON. A failed report is logged as a warning only with
<!-- fact:bstats.logErrorsKey -->`stats.bstats.log-errors`<!-- /fact --> on, and a report bStats
turned away as a duplicate is then logged at the `info` level.

## Embedding the server

A program that [embeds `@jsprismarine/prismarine`](extending.md#embed-the-server) reports too.
The same switches apply to the `config.json` its `Config` reads: set
<!-- fact:bstats.enabledKey -->`stats.bstats.enabled`<!-- /fact --> to `false` in that file, or
set <!-- fact:bstats.optOut -->`JSP_BSTATS=0`<!-- /fact --> in the program's environment.

To send the server's numbers somewhere else as well, pass your own providers in the `Server`
constructor's `statsProviders` option. Each one implements the exported `StatsProvider`
interface. The server starts them after the bStats provider on every start and stops them before
it, and each reads the same metrics through the `StatsRegistry` it receives. Turning bStats off
leaves your providers running.
