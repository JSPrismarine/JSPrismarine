# Faster GitHub workflows

Started 2026-11-20 on `perf/optimize-ci-workflows`. Phases 0 to 7 are done, phase 10 is part
done, and phase 8 is planned. [What we know](#what-we-know) records what was measured on
2026-11-20, [Decisions](#decisions) what the maintainer settled that day, and
[Open questions](#open-questions) what is still open.

## Goal

Shorten the time from a push to a pull request's checks reporting, and keep it short as CI grows,
without paying for runners.

Hosted runners give different times on every run, and [Measuring performance](../../AGENTS.md#measuring-performance)
rules out a duration as evidence. So every target here is a count that the workflow files, a run's
job list or the repository's history decide, and that comes out the same on any runner:

| Count                                                  | 2026-11-20  | Target      | Phase |
| ------------------------------------------------------ | ----------- | ----------- | ----- |
| Scenarios one client e2e runner plays                  | 60          | about 12    | 4     |
| Client e2e protocol and transport runs per PR push     | 3           | 1           | 4     |
| Parity package runs in the dashboard job per PR push   | 2           | 0 (done)    | 3     |
| Jobs that only plan or merge, per PR push              | 7           | 2 (done)    | 1, 6  |
| Jobs in a row before unit tests report                 | 4           | 2 (done)    | 6     |
| Windows and macOS jobs per PR push, Script host aside  | 4           | 0           | 7     |
| Renovate branch pushes per day                         | 34          | under 10    | 2, 7  |
| Release pull request pushes per day                    | 15          | under 5     | 2     |
| Full test runs per merged pull request                 | 2           | 1           | 7     |
| Client draw passes per e2e scenario, screenshots aside | every frame | 0           | 8     |

Each phase's pull request reports the counts it changes, measured from a real run's job list or the
day's runs.

## What we know

Measured on 2026-11-20 through the GitHub Actions API. Times are from that day's hosted runners and
are here to show where the waiting is, not as targets.

### One pull request push starts 46 jobs

The push of `feat/addons` to pull request #3336 started 46 jobs. Twelve were Script host jobs, which
ran because the pull request touched `packages/script-host`. Of the jobs that finished, 21 ran for
less than a minute, and 8 ran on Windows or macOS.

Every job pays for its own checkout and install, 20 to 40 seconds in the runs we read, and waits for
a runner of its own first. The 18 jobs of Unit & Integration Tests on that push waited 1,441 seconds
for runners in total and ran for 2,387. Across the repository, the 575 jobs that ran between 17:00
and 21:00 UTC waited a median of 48 seconds from becoming ready to starting, one in ten waited 286
seconds or more, and at the busiest moment 30 ran at once.

The unit tests report after four jobs in a row: `changes`, `plan`, `tests-shard` and `tests`. Each
waits for a runner again. On master run 44789732455 the unit shards waited about ten minutes before
they started.

### Bots make two in five of the runs

Of the 828 workflow runs started on 2026-11-20, Renovate branches started 206 from 34 pushes and the
release pull request (`changeset-release/master`) started 130 from 15 pushes. Master started 178
from 22 pushes, and all other pull requests 314 from 35 pushes.

Branch protection on master requires a branch to be up to date before it merges (`strict`). Every
merge to master therefore sends every pull request that is ready to merge, Renovate's included,
back through a rebase and a full pull request run. Changesets rewrites the release pull request
after every push to master, which is where its 15 pushes came from.

Between 2026-11-06 and 2026-11-20, 139 pull requests merged, a little over 9 a day and 21 on the
busiest day. Renovate merged 66 of them, all through `:automergeMajor`. Most hours that had a merge
had one or two, and 8 hours had five to eight.

### Client e2e is the longest job

A pull request that reaches the server starts one client e2e job per protocol and transport: 2193
over RakNet, 2225 over RakNet and 2225 over NetherNet. In run 44808017545 they took 1,734, 1,772 and
1,051 seconds. Each job boots a server, joins it with the cinnabar client, and plays every scenario.
The client draws every frame on the CPU through Mesa's lavapipe driver, so the workflow sizes the
run to two suites at a time on the runner's four cores.

`tools/client-e2e/src/suites.mts` defines 60 scenarios in 7 suites, and `gameplay-and-dimensions`
holds 53 of them. A suite is one server and one client that play its scenarios in order, and the
comments there record ordering rules, such as `farmland` running last because it leaves tilled
ground behind. `run.mts` takes scenario names as arguments and runs only the suites that hold them,
and `--concurrency` sets how many suites run at once. `run.mts` notes that a fresh client's loading
screen takes about 80 seconds on protocol 2193.

`scripts/check-client-e2e-coverage.mts` checks only that a run's lcov report covers some package
lines, so it works on a part of the scenarios as well as on all of them.

### Cinnabar has no mode that skips drawing

Read at the two pinned commits, `485c246` for protocol 2193 and `ae1c207` for 2225, and at
upstream `a429c74` of 2026-11-20:

- The only switches that lower drawing cost are saved settings, and `client.mts` already uses the
  cheapest: a 30 fps cap (`max_framerate`, kept above the 20 Hz game tick), render distance 5, the
  world drawn at half resolution, and the expensive effects off. Every scenario still draws every
  frame it runs.
- The harness's frame waits count Bevy's `FrameCount`, which counts app updates, not drawn frames.
  `wait_for` `chunks_loaded` reads the client's world stream, not the GPU. Both keep working with
  drawing off.
- Ten scenarios take screenshots, as evidence only. No assertion reads pixels. Screenshots go
  through `FrameCapture` in `app/src/hud_tools/screenshot.rs`, which hands a consumer the next drawn
  frame.
- Pointing and picking are CPU math (`app/src/camera/freeform_pick.rs`). One GPU readback exists in
  `app/src/runtime/network/entity_pack/mob_motion_report/gpu.rs`, which a patch has to check.
- Cinnabar is under the PolyForm Noncommercial License 1.0.0, which allows changing it for a
  noncommercial project such as this one.

The harness clones each pinned commit in `ensureCinnabar` (`tools/client-e2e/src/cinnabar.mts`) and
keys the build cache on `BUILD_FORMAT` and the commit (`buildCacheKey`), so a patch has a place to
be applied and a key to join.

### The parity dashboard runs the parity tests twice more

The test shards already run the parity package's tests. The `parity-dashboard` job then runs
`pnpm --filter @jsprismarine/parity run dashboard`, which spawns Vitest over the whole parity
package with the JSON reporter. The tests also write side files the dashboard reads, through
`PARITY_PROGRESS_FILE` and `PARITY_CASES_DIRECTORY`. On a pull request the job then checks out the
base commit, installs, fetches sources, runs the Java data generator, builds, and runs the dashboard
again for the base, to compare the two. In run 44809192387 the two dashboard runs took 278 and 279
seconds and the base build 34.

`packages/parity/vitest.config.ts` merges the root config and sets `bail: 0`, so a failure does not
cut the report short. The parity package has no `performance` tests.

### Real-data shards finish far apart

`vitest --shard` splits files by count. On pull request #3336 the four real-data shards ran for 320,
203, 146 and 92 seconds, and the results report only when the slowest finishes. The `plan` job sizes
shards from file counts: one unit shard per 300 files and one real-data shard per 15, at most four.

### How results and caches reach master

Pull requests merge by rebase only, with linear history required. `.github/scripts/pr-job-results.mjs`
lets a push to master skip a job the merged pull request passed, when the pushed commit's tree
equals the pull request head's tree. It compares trees because a rebase merge gives the pushed
commit a new SHA. Typecheck and client e2e use it. The Vitest jobs never do, because a pull request
runs only the tests its diff reaches.

A pull request never saves the pnpm store or the cinnabar build, since only that pull request could
read the entry. Master saves them. Vitest's `forceRerunTriggers` in `vitest.config.ts` lists the
data inputs, such as `packages/bedrock-data/sources.json`, so a change to them makes `--changed` run
every suite.

### Branch rules and runners

Master requires four checks: `📃 Lint`, `📝 Lint commit messages`, `📖 Validate docs` and
`✅ Client E2E`. No test job is required. It also requires reviews, linear history and an up-to-date
branch. Every job runs on GitHub-hosted runners since commit 8370d717251.

### What GitHub documents about merge queues

From [Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
and [Events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#merge_group):

- A workflow that reports a required check must trigger on `merge_group`, or the queue never sees
  the check and the merge fails. `merge_group` is separate from `pull_request` and `push`, and its
  one activity type is `checks_requested`.
- The queue's settings are the merge method (merge, rebase or squash), build concurrency (1 to 100
  merge groups building at once), minimum and maximum group size (1 to 100), a wait time after
  which a group merges below the minimum size, whether to merge only pull requests that pass their
  required checks, and a status check timeout.
- Moving a pull request to the top of the queue rebuilds every group in progress.
- Each pull request in the queue gets a merge group build of its own, which holds it and every pull
  request ahead of it. The group size limits how many pull requests merge in one push, not how many
  builds run, so a burst of five queued pull requests is five full runs.
- The documentation does not say whether the commit that lands on master is the one the merge group
  tested. A rebase merge outside the queue always writes new commit SHAs. The plan matches runs by
  tree, as `pr-job-results.mjs` already does, so it works either way.

## Decisions

Settled on 2026-11-20:

- Failed tests block merges. The unit, real-data, Bedrock Dedicated Server and parity results
  become required checks, through a `✅ Tests` gate in phase 1 and `✅ CI` in phase 6.
- No paid runners. The project is open source, and Blacksmith cost too much, which is why commit
  8370d717251 moved every job to GitHub-hosted runners. GitHub's larger runners are ruled out for the
  same reason.
- Cinnabar has no mode that skips drawing, so phase 8 adds one as a patch the harness applies, and
  offers it upstream.
- The merge queue uses the settings in [phase 7](#phase-7-run-the-full-suite-once-in-a-merge-queue).

Settled on 2026-11-21:

- No self-hosted runners. Every job stays on GitHub-hosted runners, so the plan dropped its phase 9,
  which would have added one; the phases keep their numbers.

Earlier decisions:

- Measure by counts, as the [goal](#goal) table sets out.
- Keep history linear. The merge queue merges by rebase.
- Phases 1 to 5 are small and independent and can land in any order. Phase 6 comes before phase 7,
  because the merge queue needs one workflow to trigger and one check to require.

## Phases

### Phase 0: agent guidance (done)

`AGENTS.md` has a GitHub workflows section that asks every workflow change to count jobs started,
jobs in a row, repeated test runs and Windows and macOS jobs, and to keep each level or lower. It
points here for the current counts. Phase 7 updates it to name the merge queue as the place for
work that runs once per merge.

### Phase 1: one required test gate, and shard results straight to Codecov (done)

Landed in #3350. Making `✅ Tests` a required check is left to a repository admin.

Replace the `tests` and `real-data` merge jobs in `test.yml` with one gate, and make it required.

1. In `vitest.config.ts`, give a CI shard the `junit` and `github-actions` reporters beside `blob`,
   with a `junit.xml` per shard.
2. Each shard uploads its own `coverage/lcov.info` and `junit.xml` to Codecov, under the flags the
   merge jobs use today (`unit` or `unit-changed`, `real-data` or `real-data-changed`). Codecov
   combines every upload of a commit with the same flag, and `codecov.yml` needs no change.
3. Drop `vitest-coverage-report-action`. Codecov's pull request comment covers coverage.
4. Add a `✅ Tests` job that needs the unit and real-data shards, the Bedrock Dedicated Server suites,
   typecheck, the generation host jobs and the parity dashboard. Like `✅ Client E2E`, it checks out
   nothing, passes when each passed or was skipped on purpose, and fails otherwise.
5. Keep uploading the blob reports as artifacts, since phases 3 and 5 read them.
6. Ask a repository admin to add `✅ Tests` to master's required checks.

Done when a pull request push runs one gate job and no merge job, a failing test blocks the merge
button, and Codecov shows one `unit` and one `real-data` report for a master commit that matches the
previous one in files covered.

### Phase 2: fewer pushes from bots (done)

Landed in #3349.

Renovate and the release pull request start two in five of all runs.

1. Group Renovate's non-major updates into one pull request and give Renovate a schedule, in
   `renovate.json`. Keep security updates unscheduled.
2. Stop rewriting the release pull request after every push. Today `release.yml` runs
   `changesets/action` on every push, which rewrites the branch whenever changesets are pending. A
   push now publishes when `@jsprismarine/server`'s version is not on npm, or when no changesets
   are pending, which retries a publish that failed. It sets pending changesets aside while it
   publishes, since a release commit can carry changesets that landed after the release pull
   request's last refresh. Every push with pending changesets opens or updates the release pull
   request, so it holds every changeset on master and merging it leaves none behind. Refreshing
   it at most every six hours, on a schedule and then on pushes, left changesets on each release
   commit, and the run that published it opened the next release pull request at once. A release
   pull request that falls behind master is still tested against master when it merges, by the
   `strict` rule now and by the merge queue after phase 7.

Done when a day's runs show fewer than 10 Renovate pushes and fewer than 5 release pull request
pushes. Phase 7 lowers the Renovate count further, since a branch no longer has to be up to date to
merge.

### Phase 3: build the parity dashboard from results that already exist (done)

The dashboard job stops running tests on pull requests, and master's job stops running them twice.
Landed in two parts, with one change to the steps below: the shards keep Vitest's JSON report
(`vitest-report.json`, a `json` reporter beside `junit`) rather than blob reports, and the plan job
chooses `since` as the newest commit within reach whose run kept complete inputs, so `--changed`
and the overlay always speak of the same commit; a run that finds none runs every file. The
nightly, a manual run and a merge group run every file and need no base. The first, #3356, keeps master's `tracker.json` and `dashboard.md` as a
`parity-report` artifact and has a pull request download its base commit's instead of building the
base (step 4, without the raw report and side files). The second builds the pull request's own
dashboard from the shards (the remaining steps).

1. Give the shards the parity side files. A shard sets `PARITY_PROGRESS_FILE` and
   `PARITY_CASES_DIRECTORY` to paths under `.vitest/` and uploads them with its blob report.
2. Teach `packages/parity/scripts/dashboard.ts` to read a merged JSON report and side files from
   paths it is given, instead of spawning Vitest. Keep the spawning path for local use.
3. The dashboard job downloads the shards' blob reports, runs
   `vitest --merge-reports --reporter=json` over them, keeps the parity package's files, and renders
   the dashboard. On master this is the whole report, since master runs every file.
4. Master uploads an artifact named after the commit SHA that holds `tracker.json`, `dashboard.md`,
   the merged JSON report of the parity package's files and the parity side files. A pull request
   downloads its base commit's artifact instead of building the base.
5. On a pull request, first drop from the base report and side files every test file the diff
   deletes or renames away, so a family whose last test was removed does not keep its base
   results. Then overlay the files the shards ran. A file `--changed` left out is one the diff
   cannot reach, and a change to the data inputs reruns every file through `forceRerunTriggers`, so
   the base result still holds for it. Add the overlay to `packages/parity` with unit tests, and run
   `familiesWithoutTests` on the overlaid report.
6. Fall back to today's base build when the base artifact is missing, for example while the base
   commit's master run is still going.

Check before building it that the merged report names test files the way `buildTrackerData`
expects, since the shards run from the repository root and the dashboard from the package.

Done when a pull request's dashboard job runs no Vitest test and builds no base commit, master's job
runs no Vitest test, and the dashboard and pull request comment match today's output for the same
commits.

### Phase 4: split client e2e across runners (done)

Landed in #3353, with four suites cut from `gameplay-and-dimensions`. Its own run played the four
shards of protocol 2225 in 309, 497, 538 and 818 seconds, against about 1,770 for the one job before
(one run on hosted runners, so a picture, not a target). Scenario counts balance the shards poorly,
since some suites boot heavier worlds; phase 5's recorded durations can split them too.

1. Split `gameplay-and-dimensions` in `suites.mts` into four or five suites of similar scenario
   counts. Keep each ordering rule the comments record inside the suite it applies to.
2. Add a `--shard <index>/<total>` option to `run.mts` that assigns whole suites to shards, largest
   first, by scenario count. The assignment depends only on `suites.mts`, so every runner computes
   the same split.
3. In `client-e2e.yml`, add a shard axis to the matrix. Each shard uploads its own coverage under
   the `client-e2e` flag and its own evidence.
4. Run only the newest protocol over RakNet on pull requests. `pin-matrix.mts` already has
   `--latest-only`.
5. Make master reuse protocol-aware. `pr-job-results.mjs` lists `🎮 Client E2E` as passed when every
   matrix entry passed, and a pull request that ran one protocol would then let master skip the
   others. Master has to run every protocol the pull request did not, until phase 7 moves them to
   the merge queue.

Done when each e2e runner plays about 12 scenarios, a pull request push runs one protocol and
transport, and master still runs all three.

### Phase 5: split shards by recorded duration (Vitest done)

Built for Vitest as planned, with one change: the shard count keeps the 300 and 15 file rules, and
only the assignment uses the recorded times, so no time in seconds sizes anything. Each master
shard keeps its `junit.xml` for 14 days, and the plan reads the newest successful nightly run's.

1. Each master shard writes the time each of its test files took, read from its own report, and
   uploads it as an artifact.
2. A script under `scripts/` assigns files to shards longest first from those times. Every shard
   runs the same script with its own index and passes Vitest its file list instead of `--shard`, so
   no job output has to carry the lists.
3. The `plan` job downloads the times from the last completed master run and picks the shard count
   from them, replacing the 300 and 15 file rules. A file with no recorded time counts as the median.

Done when the shards' recorded totals differ by less than the longest single file, checked in a unit
test of the assignment script, and the workflow carries no file-count constants.

The same now applies to client e2e: each shard of a full run on master keeps a `suite-times.json`
for 14 days, the `changes` job reads the newest run's, and `--suite-times` makes `--shard` weigh
each suite by its seconds, scaled to the scenarios a selection plays, instead of by scenario count.

### Phase 6: one CI workflow with one planning job (done)

Built as one file rather than reusable workflows: `.github/workflows/ci.yml` replaces `test.yml`,
`client-e2e.yml`, `lint.yml` and `commitlint.yml`. Its `🧭 Plan` job does what their first jobs did
(the two change detectors, the shard sizing, the real-data cache check and preparation, the e2e
selection, matrix and build lookup) and runs the four checks that need no runner of their own:
commit messages, lint, docs validation and typecheck. Each of the four reports its outcome without
failing the job, so the tests still run beside a lint failure, and `✅ CI` fails on the outcomes.
`✅ CI` folds in `✅ Tests` and `✅ Client E2E`. The workflow also triggers on `merge_group`, where
every tier runs in full, ready for phase 7. `codeql.yml`, `docs.yml`, `pull-request.yml` and
`nightly.yml` stay separate: CodeQL has its own permissions and runs two minutes, and the others
run on master or on a path filter.

The first master run of `ci.yml` finds no earlier `ci.yml` run, so it tests every suite, builds the
parity base once more for the pull requests based on it, and splits the shards by count; the runs
after it have what they need.

Branch rules now require `✅ CI` alone. Each pull request push starts 2 jobs that only plan or
merge, and the unit tests report after 2 jobs in a row.

### Phase 7: run the full suite once, in a merge queue (done)

1. Add `merge_group` to `ci.yml` (done with phase 6). The planning job picks the tier from the
   event: a pull request runs lint, typecheck, the unit and real-data tests its diff reaches and one
   e2e protocol; a merge group runs everything in `ci.yml`, including every e2e protocol and
   transport, the Bedrock Dedicated Server suites and the Windows and macOS jobs. The executables
   and CodeQL keep their own workflows.
2. A repository admin turns on the merge queue for master and turns off the up-to-date requirement,
   which the queue replaces. Every queued pull request gets one full run of its own, so the queue
   saves the second full run master does today, not runs within a burst. The settings, sized to
   about 9 merges a day that arrive in bursts of up to 8 an hour:

   | Setting                              | Value      | Why                                                                                   |
   | ------------------------------------ | ---------- | ------------------------------------------------------------------------------------- |
   | Merge method                         | Rebase     | Keeps history linear, as branch protection requires.                                  |
   | Build concurrency                    | 2          | Each build runs the full suite. Two at once leaves runners for pull requests.         |
   | Minimum group size                   | 1          | A quiet hour merges each pull request as soon as its build passes.                    |
   | Maximum group size                   | 5          | Pull requests whose builds passed merge in one push instead of one push each.         |
   | Wait time for the minimum group size | 0 minutes  | With a minimum of 1 there is nothing to wait for.                                     |
   | Merge only non-failing pull requests | Yes        | A failing pull request leaves the queue, and the ones behind it rebuild without it.   |
   | Status check timeout                 | 90 minutes | Covers the whole build: planning, runner waits and the client e2e job's 60 minutes.   |

   Revisit build concurrency after a week. A failing pull request rebuilds every build queued
   behind it, so a higher concurrency costs more runners when failures are common.
3. Teach `pr-job-results.mjs` to find the merge group run whose head commit has the pushed commit's
   tree, so master reuses all of it and runs only release and docs. Done: it searches the twenty
   newest merge group runs by head SHA and tree before it looks at the pull request's run.
4. A merge group run saves caches under its temporary ref, where nothing else reads them. Add a
   master job that looks up each cache key and rebuilds only a missing entry.
5. Master pushes no longer run the parity dashboard, so the `parity-report` artifact a pull request
   compares with comes from the merge group run instead. Done for the lookups that search by commit
   (the parity report and the scenario coverage map accept a push or a merge group run of the
   commit) and for the recorded times (the newest merge group run stands in when master's run kept
   none). They match by SHA, not by tree: whether the queue lands the SHA it tested is to be read
   from the first merges through it, and a tree match added if it does not.
6. Renovate enqueues through GitHub's auto-merge, which works with the queue. With the up-to-date
   requirement gone, set Renovate to rebase only on a conflict. Done: `rebaseWhen` is `conflicted`.
7. Update the GitHub workflows section of `AGENTS.md` to name the merge queue as where work that runs
   once per merge goes. Done.

Step 2 was done on 2026-11-21: ruleset 27780795, "Merge queue for master", holds the settings
above, and master's branch protection no longer requires an up-to-date branch. The commands, for
the record:

```
gh api -X POST repos/JSPrismarine/JSPrismarine/rulesets --input ruleset.json   # merge_queue rule, see the settings table
gh api -X PATCH repos/JSPrismarine/JSPrismarine/branches/master/protection/required_status_checks -F strict=false
```

The required checks and the up-to-date requirement live in master's branch protection, not in a
ruleset: the one ruleset, "Historical Branches", locks an old branch. Should they move to a
ruleset, the second command becomes a `PUT` of that ruleset by id with
`strict_required_status_checks_policy: false` on its `required_status_checks` rule, keeping the
check list.

If the merge queue has to wait, master can run `--changed` against the last master commit whose run
passed, with a full run each night. The baseline is a fixed commit, so it is the same on every runner.

The 5 Executable jobs left pull request pushes ahead of the queue: a pull request builds the
executables only when it changes the build scripts, the embedded files or the dependencies, and
master builds them when a nightly is due. The 2 generation host jobs left too: a pull request
starts them only when it changes `packages/chunkgen`, the test workflow, the install action, the
lockfile or `.nvmrc`, and master still runs them on every push.

Done when 9 jobs leave each pull request push (the 5 Executable jobs, the 2 generation host jobs,
CodeQL and the Bedrock Dedicated Server suites), a merged pull request costs one full run, its merge
group build, master pushes start no test job, and a pull request is never rebased only to catch up
with master.

### Phase 8: a cinnabar patch that draws only for screenshots

Cinnabar has no such mode, so the harness carries one as a patch, and the same change goes upstream
as a pull request to `cinnabar-mc/cinnabar`. The patch stays only until every pinned commit includes
the upstream change.

The change, behind an environment variable such as `CINNABAR_DRAW=on-demand` so a normal client is
untouched:

1. A new module adds one system that sets `Camera::is_active` to false on every camera, and back to
   true while `FrameCapture` holds a request, a recording runs, or for the two frames before a
   screenshot is taken, so the captured frame is current. Bevy skips an inactive camera's render
   graph, while app updates, and with them `FrameCount`, game ticks and the world stream, keep
   running.
2. `screenshot.rs` gains a `pub(crate)` method that says whether a capture is pending. `app.rs` gains
   one line that adds the module's plugin.
3. Before it lands, confirm that the loading screen's completion and the entity motion readback in
   `mob_motion_report/gpu.rs` do not wait on a drawn frame, by running every scenario with the patch.

The harness side:

1. `tools/client-e2e/patches/` holds the patch. `ensureCinnabar` applies it with `git apply --3way`
   after the checkout, and fails with the patch's name when it does not apply, so a pin bump that
   breaks it fails loudly instead of building an unpatched client.
2. `BUILD_FORMAT` and the build stamp include a hash of the patches, so a changed patch rebuilds the
   client and an unchanged one restores the cached build.
3. `client.mts` sets the variable for clients that are not recorded, beside `lightweightSettings`.

Keeping it working: the patch adds one file and changes two existing ones. Across the 396 upstream
commits between the two pins, `app.rs` changed by 30 lines and `screenshot.rs` and `capture.rs` not
at all. Across the 127 commits from the 2225 pin to upstream on 2026-11-20, `app.rs` changed by 2
lines. A pin bump should rarely need the patch refreshed, and when it does, the conflict is in a
plugin list.

Done when an e2e scenario that takes no screenshot runs no camera render graph, counted by a
counter the patch adds to the client's `state` reply, and the suites per runner rise from 2.

### Stale runs (done)

Added on 2026-11-21, after 136 queued runs were found that no longer tested anything: 51 for
master commits a newer one had passed, and 61 for pull requests already merged or closed. Master's
`ci.yml` runs share one concurrency group again, so a newer push replaces the run waiting behind
the running one, and the newest commit's run covers the rest. `ci.yml`, `codeql.yml` and
`nightly.yml` also run on `pull_request: closed`, in the pull request's group, which cancels its
queued or running run; every job skips on that event, so the run takes no runner. `docs.yml`
already did. Giving each master push a group of its own, which #3434 did, multiplied the full runs
in a burst of merges instead.

That left most master commits without a Codecov report, since a replaced run uploads nothing and a
push that reuses its pull request's `✅ CI` runs no test. `coverage.yml` runs on every push to
master, outside that group, and uploads the reports of the pull request run that tested the same
tree. The pull request's unit, real-data and client e2e shards keep those reports as
`codecov-<flag>.<label>` artifacts for it.

`docs.yml` cancelled its running master build on every push, so on 2026-11-21 none of the 30
master pushes between 08:50 and 12:07 published the site or its parity tracker. Its master builds
now queue the way `ci.yml`'s do: the running build finishes, and the newest push's run starts after
it. Pull request previews still cancel on each push.

### Phase 10: run only the tests a change reaches (part done)

Added on 2026-11-20. Every run should test only what its changes can reach.

1. Vitest on master: a push passes `--changed` the last master commit whose run passed, and a
   nightly run tests every suite. Landed in #3357.
2. Client e2e coverage map: the server snapshots V8 coverage right before and right after each
   scenario, and the runner writes which functions each scenario ran. Code that runs outside every
   scenario belongs to all of them. In #3359.
3. Client e2e selection: a pull request runs the scenarios whose functions its diff touches, when
   the base commit kept a complete map. In #3360.
4. Master e2e: a push could select by coverage against the last passing master commit too. It still
   plays every pin in full, partly because those runs are what keep the maps complete.

Done when a pull request that changes one server function some scenarios run plays only those
scenarios, and a master push runs only the Vitest suites its commits reach.

## Open questions

- Does Renovate's grouping in phase 2 hide which update broke a build often enough to matter? If so,
  group only development dependencies.
- Will cinnabar take the phase 8 change upstream, and under what name?
