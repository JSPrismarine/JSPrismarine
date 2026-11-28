# Bedrock versions: each protocol checked against its own server

Status: accepted direction, 2026-11-28.

## Problem

The server speaks three Bedrock protocols, each with a Bedrock Dedicated Server pinned in
`packages/bedrock-data/sources.json`:

| Protocol | Game version | Pinned BDS | Role |
| --- | --- | --- | --- |
| 2193 | 1.26.51 | 1.26.51.1 | an older release, accepted when `protocol-window` reaches it |
| 2225 | 1.26.60 | 1.26.60.6 | the primary: the newest release and `defaultProtocolVersion` |
| 2259 | 1.26.70.24 | 1.26.70.24 | the preview |

The data each protocol needs is captured from its own pin, under `src/jsp/v<n>/`: the join's
packets, the block palette, the items and the command answers. Behavior is not. What the server
sends a client, and when, is checked against one server at most:

- The 67 scripting goldens under `packages/parity/goldens/scripting/` all record protocol 2225
  and BDS 1.26.60.6.
- The LevelDB and persistence suites boot the default pin only.
- No capture records an exchange after the join: what BDS sends when a player opens a crafting
  table, dies, respawns or changes dimension.

So the code says what BDS does in prose. 47 comments under `packages/prismarine/src` name a BDS
version: 8 name 1.26.51, 23 name 1.26.52, 14 name 1.26.60 and 2 name 1.26.70. No pin holds
1.26.52. Nothing checks that a claim was true, that it is true of the primary protocol, or that it
holds for the other protocols the server accepts. `BedrockPresenter.openContainer` follows a
crafting table's `ContainerOpen` with the player's inventory under window 0 because "a Bedrock
Dedicated Server 1.26.52 sent" that, a capture no one can rerun. When a later version sends
something else, the only place to record it is another comment.

## The system

1. **Exchange scenarios.** A scenario is one behavior: what the client does, step by step, and
   which of the server's packets in reply the scenario is about, with the fields to compare and the
   ones to ignore, such as runtime ids and ticks. Scenarios are written once and run against every
   protocol.
2. **Captured per protocol.** A dump pass, `dump:bedrock --pass exchanges --protocol <n>`, boots
   that protocol's pinned BDS, drives `@jsprismarine/client` at that protocol through each
   scenario, and writes `src/jsp/v<n>/exchanges/<scenario>.json`: the server's packets in order,
   decoded by that protocol's codec, with the BDS build that sent them. A capture is data under
   [ADR 0019](../adr/0019-bedrock-data-comes-from-bds.md), like the join's.
3. **Replayed per codec.** A parity family, `protocol.bedrock-exchanges`, runs every scenario
   against a loopback JSPrismarine once for each codec the build registers, and compares what the
   server sent with that protocol's capture. A difference JSPrismarine keeps on purpose is a row in
   `behavior-gaps.json` keyed by protocol and scenario, as `intentional` with its reason, and a gap
   it has not closed is `deferred` or `defect` with its issue, as other families record them.
4. **Citations are tags.** A comment that rests on what BDS does names the scenario, with
   `@bdsSee <scenario>`, as `@javaSee` names a Java member
   ([ADR 0031](../adr/0031-copied-java-code-names-its-source.md)), and never a version. A lint
   check fails on a tag the primary protocol has no capture of, and on a BDS version written in
   source prose. The 47 comments migrate: each one either gets a scenario and a tag, or loses its
   claim.
5. **Version differences live in the wire.** When two protocols' captures of one scenario differ,
   the difference goes where [the edition layers plan](edition-layers.md) puts every version
   concern: a wire gate ([ADR 0003](../adr/0003-declarative-wire-layouts.md)) or a per-protocol
   table entry beside the codec, which the Bedrock presenter or decoder asks. It is never a branch
   in game logic. The replay shows which protocols differ and that the gate covers them.
6. **The primary first.** New work captures and checks against the primary protocol,
   `defaultProtocolVersion`. A pull request's tier replays at the primary; the merge group replays
   at every registered codec, as [the CI rules](../../AGENTS.md#github-workflows) ask of work that
   only has to pass once before a merge. A protocol bring-up captures every scenario for the new
   version, and the `protocol-bringup` skill gains the step.

## Slices

1. The exchange format, the capture pass, the replay family at the primary protocol, and the first
   scenario: opening a crafting table, whose comment started this.
2. The `@bdsSee` tag and its lint check, and the 47 citations migrated.
3. The replay at every registered codec in the merge group, and the bring-up step.
4. Scenarios for the outbound behavior the edition layers plan's slice 4 moves: the death screen,
   the respawn exchange, block containers, trades and the world change, captured before slice 4.4
   reworks the world change and the chunk path.

## Decisions

- `@jsprismarine/client` drives every capture. It runs headless in CI, and the scenario it runs
  against BDS replays against JSPrismarine unchanged. A scenario that needs what a real client
  does on its own waits until one comes up, and is decided then.
- The scripting goldens stay at the primary protocol. They are recorded per protocol once the
  Script API's modules differ between the pinned versions. Exchanges are captured per protocol
  from the start.
- The edition layers plan's slice 4.4 waits for this plan's slices 1 and 4, so the world change
  and the chunk path are reworked against captures.
