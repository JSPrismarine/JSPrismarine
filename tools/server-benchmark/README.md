# @jsprismarine/server-benchmark

Runs JSPrismarine, [Pumpkin](https://github.com/Pumpkin-MC/Pumpkin) and the pinned Bedrock
Dedicated Server under the same bot workload and records what each one costs. The results feed the
[benchmark page](https://jsprismarine.dev/benchmarks) on the docs site, which also explains the
method and its limits in full.

## What a run does

Every server gets a fresh data directory and the same bots: `@jsprismarine/client` bots speaking the
protocol `packages/bedrock-data/sources.json` names as the default. The bots send an input every
tick and ask for sub chunks when a server streams terrain on request, as a retail client does.

No one transport reaches all three servers. Pumpkin has no RakNet listener, so its bots join over
NetherNet. Bedrock Dedicated Server defaults to NetherNet, but the bots' NetherNet connections to it
fail within seconds ([#3437](https://github.com/JSPrismarine/JSPrismarine/issues/3437)), so it runs
with `transport=raknet`. JSPrismarine listens on both, so the harness can run it once over each
transport. CI runs only the NetherNet one: one JSPrismarine process serves both transports, and a
second JSPrismarine run would make each round a third longer. The page compares Pumpkin with the
NetherNet run, and Bedrock Dedicated Server with the RakNet run when there is one and the NetherNet
run otherwise.

A run has four phases:

1. **Startup**: the server starts and prints that it listens. The startup figures end when the
   first bot stands in the world, and include that bot's login.
2. **Join**: from the listening line, the bots join one at a time, wait for their first view, are
   teleported to the origin and wait again.
3. **Travel**: every bot is teleported outward along its own heading, a fixed distance per step,
   and the harness waits after each step until no terrain has arrived for a quiet period.
4. **Idle**: the bots stand still for a fixed time.

The harness reads the CPU time of the server's whole process tree at each phase boundary, samples
its resident memory throughout, and counts the chunks and bytes the bots receive. It runs two
scenarios, a flat world and each server's default terrain, over several rounds. Each round runs the
servers in a rotated order. Before every run the harness waits, up to a limit, for the one minute
load average to fall to a quarter of the logical CPUs and for the port to be free. The step
distance, step count, idle time, round count and cooldown are options with defaults that
`pnpm run bench:servers --help` lists; every results file records the values its run used.

## Run it

Bedrock Dedicated Server runs only on Linux x86-64. On another host, pass `--skip-unavailable` to
measure the other two.

```bash
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen        # JSPrismarine's terrain; needs a JDK
pnpm --filter @jsprismarine/bedrock-data run ensure:bedrock-pack
pnpm exec turbo run build --filter=@jsprismarine/server --filter=@jsprismarine/client
pnpm run bench:servers
```

JSPrismarine runs from that build on Node.js unless `--jsp-executable <file>` names a packaged
executable. CI passes the Bun AOT build of the measured commit, which
`.github/scripts/build-aot.mjs` compiles, because that is what users run. The harness starts the
executable once on a flat world of its own before the first measured run, so the data it carries is
unpacked and every measured start finds the directory warm.

`pnpm run bench:servers --help` lists the options: the rounds, servers and scenarios to run, the
bot counts, the view distance, the steps and the idle time. The harness downloads the pinned Pumpkin
release into `node_modules/.cache/jsprismarine/pumpkin/` and checks its SHA-256 before every run.

A full run takes more than an hour. The [Server benchmark workflow](../../.github/workflows/benchmark.yml)
runs it on one fixed GitHub-hosted Linux x86-64 runner image when master changes a package, the
harness or the lockfile, every week, and on demand. `BENCHMARK_MAX_RUNS` and
`BENCHMARK_WINDOW_HOURS` at the top of the workflow cap how many push and scheduled runs measure in
a window, so pushes never queue runs back to back; a run past the cap ends without measuring. A
scheduled or push run also ends without measuring when nothing that can move a figure has changed
since the newest results file on master, as [What changed](#what-changed) describes. A dispatch
from the Actions tab always measures and does not count toward the cap. Each run commits its
results file straight to master.

## The results file

The harness writes `docs/research/benchmarks/<start>/results.json`, rewriting it after every run so
an interrupted benchmark keeps what it measured. `<start>` is the UTC time the benchmark started,
to the second and without colons, such as `2026-11-21T031500Z`, so every benchmark on one day keeps
a file of its own. Older benchmarks sit under a directory named by date alone. Whatever the
directory name, the history and the benchmark page order the files by the `startedAt` each one
records. It holds every run's raw measurements, the load
averages before and after each run and round, the host, each server's version, build and command
line, and every setting the harness changed from a server's default, with the reason. The benchmark
page reads the file that started last and computes its medians and ranges with `src/summary.mts`.

A JSPrismarine run that measures nothing, because the server did not start, a bot did not join or
the server disconnected the bots, stops the benchmark at once and fails it. The artifact keeps the
results file and the server logs written so far, and the workflow commits no results file, so the
next run measures again. A failed run of Bedrock Dedicated Server or Pumpkin is recorded and the
benchmark goes on.

The harness turns JSPrismarine's `keep-alive-interval` off. The benchmark does not measure the
keep-alive, and a ping a loaded host answers late would otherwise disconnect a bot.

## What changed

`src/inputs.mts` hashes every committed file that can move a figure: the packages apart from their
Markdown and tests, which hold JSPrismarine and the Pumpkin and Bedrock Dedicated Server pins, the
harness, the lockfile, `.nvmrc` and the workflow. `INPUT_GLOBS` lists them, the same globs as the
workflow's push `paths`, and a test keeps the two equal. Each results file records the hash as
`inputs`, or `null` when an input had uncommitted changes. The workflow runs
`node tools/server-benchmark/src/inputs.mts` before it builds anything, and skips the run when the
hash matches the newest results file's.

## History

Below the newest run, the benchmark page draws every results file as a history, built by
`src/history.mts`:

- **One point per change.** Consecutive runs with the same `inputs` count as one, kept at their
  first quiet run. A file written before `inputs` was recorded is compared by its servers' sources,
  which name JSPrismarine's commit and the other two pins.
- **Quiet runs only.** A run with a round that was not quiet is listed in the page's table and left
  off the charts, since other work on the runner can move its figures with no server changing.
- **CPU against a pinned server.** GitHub's runners differ in CPU from day to day, so a CPU figure
  from one run does not compare with another's. The history divides JSPrismarine's CPU figures by
  those of the pinned server that ran the same workload on the same runner in the same run, against
  the JSPrismarine run the page compares that server with. The runner's speed divides out. A line breaks
  where the pinned server's version changed, and a rule marks each change of CPU model.
- **Counts as measured.** Memory and bytes per chunk are the same on any machine, so they are drawn
  as they were measured. Wall clock figures move with the runner's load, which no ratio cancels, so
  the history leaves them out.

## Updating Pumpkin

`pumpkin.json` pins the Pumpkin release. To move to a newer one, set `tag` and `commit`, and copy
each asset's SHA-256 from the release's `checksums.sha256`. Check that the release still accepts the
protocol in `packages/bedrock-data/sources.json`; Pumpkin prints the Bedrock protocol it speaks when
it starts.
