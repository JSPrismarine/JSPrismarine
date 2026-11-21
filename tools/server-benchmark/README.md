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
with `transport=raknet`. JSPrismarine listens on both, so the harness runs it twice, once over each
transport, and the page compares each of the other two with the JSPrismarine run over its own
transport.

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

`pnpm run bench:servers --help` lists the options: the rounds, servers and scenarios to run, the
bot counts, the view distance, the steps and the idle time. The harness downloads the pinned Pumpkin
release into `node_modules/.cache/jsprismarine/pumpkin/` and checks its SHA-256 before every run.

A full run takes more than an hour. The [Server benchmark workflow](../../.github/workflows/benchmark.yml)
runs it on one fixed GitHub-hosted Linux x86-64 runner image when master changes a package, the
harness or the lockfile, every week, and on demand. `BENCHMARK_MAX_RUNS` and
`BENCHMARK_WINDOW_HOURS` at the top of the workflow cap how many runs measure in a window; a run
past the cap ends without measuring, and a dispatch from the Actions tab always measures. Each run
replaces the branch of one standing pull request with its results file.

## The results file

The harness writes `docs/research/benchmarks/<date>/results.json`, rewriting it after every run so
an interrupted benchmark keeps what it measured. It holds every run's raw measurements, the load
averages before and after each run and round, the host, each server's version, build and command
line, and every setting the harness changed from a server's default, with the reason. The benchmark
page reads the newest file and computes its medians and ranges with `src/summary.mts`.

## Updating Pumpkin

`pumpkin.json` pins the Pumpkin release. To move to a newer one, set `tag` and `commit`, and copy
each asset's SHA-256 from the release's `checksums.sha256`. Check that the release still accepts the
protocol in `packages/bedrock-data/sources.json`; Pumpkin prints the Bedrock protocol it speaks when
it starts.
