# Profiling loop

Use [`profile.mjs`](../profile.mjs) and [`analyze.mjs`](../analyze.mjs) for a before-and-after
measurement: capture a baseline, change code, capture the same scenario again, compare. Run both
from the repository root; `--help` on either lists every option and its default.

Every CPU share, tick time, thread time and load average these scripts print comes from a wall
clock. Read [Measuring performance](../../../../AGENTS.md#measuring-performance) before you claim
anything from them. The counts in a capture's `meta.json` (ticks, chunks loaded, generation tasks
settled, steps that timed out) are what the code decided; lead with those, and report the shares as
indicative, with the load average and command beside them.

## Steps

1. **Pick the scenario.** Name the change you expect and the count that should move. Keep the
   default flat world unless the work is about world generation, as AGENTS.md's
   [Running a test server](../../../../AGENTS.md#running-a-test-server) says; then pass
   `--preset normal --seed <seed>`. Done when you can write the full `run` command line.
2. **Capture the baseline** on the unchanged code:

   ```bash
   node .agents/skills/chrome-devtools/profile.mjs run --build --out jsp/profiles/loop/baseline \
     --view-distance 10 --steps 8 --step 32
   ```

   `run` starts a server with its own data directory and a free port, joins one bot, waits for its
   view to load, profiles the main thread while the workload runs, then stops the bot and server and
   deletes the session. Done when the command exits 0 and its `counts:` line shows 0 steps timed
   out. A timed-out step means the workload did not finish its work, so the capture does not count.
3. **Read the baseline** to find where the time goes:

   ```bash
   node .agents/skills/chrome-devtools/analyze.mjs summary jsp/profiles/loop/baseline
   node .agents/skills/chrome-devtools/analyze.mjs stretches jsp/profiles/loop/baseline --min-ms 50
   node .agents/skills/chrome-devtools/analyze.mjs categories jsp/profiles/loop/baseline
   ```

   Narrow down with `subtree`, `callers` and `stacks`, which take a regex over frame labels.
4. **Change the code.**
5. **Capture again** with the identical scenario flags, `--build`, and a new `--out`. `run` refuses
   an `--out` that already holds a capture, so a baseline is never overwritten.
6. **Compare**:

   ```bash
   node .agents/skills/chrome-devtools/analyze.mjs compare jsp/profiles/loop/baseline jsp/profiles/loop/after
   ```

   The comparison is usable when it warns about neither different workloads nor different server
   settings, and neither capture printed a load-average warning. Otherwise capture both sides again at a quieter moment. A share that moves less than run-to-run noise is no result:
   capture the baseline twice and compare it with itself to see that noise.
7. **Report** the counts that moved, the indicative shares with their load averages, the commands
   from each `meta.json`, and the capture paths.

## Captures

`jsp/` is ignored by git, so `jsp/profiles/loop/<name>` keeps captures out of commits. A capture
directory holds:

- `main.cpuprofile`, and `worker-N.cpuprofile` with `--workers`. DevTools' Performance panel opens
  them too.
- `steps.jsonl`: per step, the target, the player's chunk counts and generation task counters, and
  the `--sample` result.
- `meta.json`: the command, git SHA and changed files, CPU count, load average before and after,
  timestamps, the written and effective server config, the workload, the counts, the server's own
  tick summary and the main thread's event-loop and CPU time.
- From `run` only: `server.log`, `bot.log`, `config.json`, and the server's timing
  `.trace.json`.

## Running the steps separately

To capture several workloads on one server, or to probe it between captures, split `run` into
`start`, `capture` and `stop`:

```bash
node .agents/skills/chrome-devtools/profile.mjs start --session /tmp/jsp-loop --chunk-host in-process
node .agents/skills/chrome-devtools/profile.mjs capture --session /tmp/jsp-loop --out jsp/profiles/loop/walk --workers
node .agents/skills/chrome-devtools/profile.mjs stop --session /tmp/jsp-loop
```

`session.json` in the session directory holds the inspector URL for `cdp.mjs`, and the PID and start
time of each process. `stop` signals only those processes and their process groups, so it never
matches another server by command line. Run `stop` even after a failed capture.

`capture --inspector <url> --player <name>` profiles a server the script did not start, such as
`pnpm run dev -- --devtools`.

## Gotchas

- `--workers` profiles the threads the main thread's inspector sees. Generation workers are among
  them only with `--chunk-host in-process`; the default `process` host runs them in a separate
  process.
- `settle` reads private `PlayerSession` fields. If they are renamed, capture fails and asks for a
  fixed `--step-wait 6s`; update `statusExpression` in `profile.mjs` instead.
- The flat generator reports no generation task counters, so those counts stay empty on flat worlds.
- `start` warns when a package's sources are newer than its build. Pass `--build`, or the capture
  profiles the old code.
- `categories.json` matches function names. When a function in it is renamed, its time moves to
  `other`; update the pattern in the same change.
- `--nice 19` keeps a capture from slowing other work on the host, and slows the capture with it.
  Use the same value on both sides of a comparison.
- `--sample <file>` evaluates the file's JavaScript expression in the server after each step, for
  a count the status line does not carry. Keep it read-only.
