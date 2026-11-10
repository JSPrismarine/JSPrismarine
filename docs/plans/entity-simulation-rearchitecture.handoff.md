# Handoff: entity and tick re-architecture

Written 2026-11-10, when the work moved to another machine. This page tells whoever picks the program up what has landed, what is half done, and what to do next. The design is in [the plan](entity-simulation-rearchitecture.md) and in ADRs 0006 to 0018. Read the plan's "Progress" section and the paragraphs between its phase B table and its phase D heading first, because they record what each landed package left for later ones.

## Where the code is

The program branch is `t3/subagent-architecture-review`, open as draft pull request #2948. Its head when this was written is the commit that adds this page, on top of `646dd8a4f3`, rebased onto `master` at `9a2c1d5af5`. Every CI check passed on `46a1d6977a`, including Client E2E on both protocols and both transports, the real-data suites and the parity suite.

Three packages were stopped partway. Each one's work is on its own branch, pushed to `origin`, ending in one `broken!: WIP ...` commit that holds everything the agent had not committed yet. That commit fails commitlint on purpose so it cannot land by accident. None of these branches is validated. Each starts from the program branch at `646dd8a4f3`.

| Branch | Package | Committed before the stop | In the `broken!` commit |
| --- | --- | --- | --- |
| `refactor/item-entities-to-store` | C2: items and the eye of ender in the store | Built-in definitions for `minecraft:item` and `minecraft:eye_of_ender_signal`, and dropped items as store entities | `Item.ts` deleted, `itemBodies.ts` added, item paths in `World.ts`, `live.ts`, `entityIndex.ts`, `EntitySerializer.ts`, `PlayerSession.ts`, `inTickChunkLoads.ts` and their tests |
| `refactor/store-owned-mob-damage` | C3: staged damage, the mirror deleted | Damage sensing split from applying damage in `@jsprismarine/entities` | `damagePipeline.ts`, `damageStages.ts`, `legacyDamage.ts`, `knockback.ts` added, damage paths in `Entity.ts`, `Combat.ts`, `Explosion.ts`, `EntityRuntime.ts`, `EntityStore.ts`, `live.ts`, `liveBodies.ts`; also a probe, `benchmarks/zzDigestProbe.bench.ts`, to delete |
| `refactor/chat-fanout-respawn-service` | B3b: chat fan-out and respawn search as services | Nothing beyond B3a | Chat fan-out in `ChatManager.ts` and `Player.ts`, with `ChatManager.test.ts`. Respawn search not started |

To pick one up, check out its branch, run `pnpm install`, read the package's brief (the work package's row in the plan and the notes above), and undo the `broken!` commit with `git reset HEAD~1` to get the work back as uncommitted changes. Then finish it, split it into commits by area, and rebase it onto the program branch.

C2 and C3 both edit `entity/data/live.ts`, `EntityRuntime.ts` and `testing/entityServer.ts`. Land C3 first, since deleting the mirror changes what C2 builds on, then rebase C2 onto it.

C2 was finished from `refactor/item-entities-to-store` on `refactor/item-entities-to-store-v2`, which starts at `cf5684e516` and holds no `broken!` commit.

## What to do next

1. Finish C3, then C2, then B3b, and integrate each onto the program branch. Before each integration, rebase the program branch onto the latest `master` and keep a backup branch. After each push, wait for CI's Client E2E before starting work that builds on the change.
2. Start C4 (players in the store). The plan splits it into C4b to C4h after the player spike. C4b and C4c can run side by side once C3 has landed.
3. Phases D to F follow the plan.

## How the work was run

One orchestrating session briefed each package to its own agent in its own worktree. Agents committed small and did not push; the orchestrator reviewed each report, rebased the work onto the program branch, ran the targeted suites and pushed. A few things learned on the way:

- CI's Client E2E is the gate for client-visible behavior. The development host has no display, so local e2e runs under `xvfb-run -a -s "-screen 0 1280x720x24" pnpm run e2e:client -- --concurrency 1 <scenarios>`, and under load it fails in suite setup on `master` too. A local failure counts only if the same scenario passes on `master`.
- The replay suite (`packages/client/src/SessionReplay.test.ts`) is the acceptance check for the simulation. It now runs a slow-host case that fails if a tick runs while anything the harness does not track is still pending. A new source of untracked async work shows up there first.
- Run the parity suite at every integration. A stub in it missed a new world method once, and only CI caught it.
- Tell every agent to commit at least hourly and to finish in one turn with commands in the foreground. One package lost six hours of uncommitted work to a host restart, and two agents ended their turn while a test was still running, so nothing woke them.
- `/tmp` on the development host ran over its quota. Point `TMPDIR` at a scratch directory before running tests that write worlds.

## Open items

- ADR 0018 (saves at a tick boundary) is proposed, not accepted. [The save pass measurement](../research/save-pass-measurement.md) recommends accepting it with the changes already written into it.
- The entity AI digest bench's reviewed goldens were already stale on the base. Check whether `master` has the same problem and open an issue if so.
- The client e2e `lever-lamp` scenario fails on `master` from time to time.
- Issues filed during the work, all outside its scope: #2949, #2950, #2952, #2953, #2955. #2951 is fixed on the program branch.
