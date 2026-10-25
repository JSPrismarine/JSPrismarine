---
'@jsprismarine/commands': minor
'@jsprismarine/prismarine': minor
---

Run the vanilla command set through `@jsprismarine/commands`, and close part of the Bedrock
coverage gap.

The command package was built, tested and wired to nothing: no package depended on it, the content
adapter carried a structural stand-in for its `CommandHost` so `@jsprismarine/prismarine` would not
have to depend on it, and the live server still ran twenty command classes of its own. The server
now holds a `CommandHost` over its real managers and dispatches the package's tree. Fourteen vanilla
command classes are gone, along with `jsprismarine:reload`, whose root literal collided with the
vanilla `/reload` and reached the client as a second `/reload`; `/ban` and `/pardon`, which the
package does not implement, and the rest of the `jsprismarine:` namespace stay on the old
dispatcher. `AvailableCommandsPacket` now carries both halves, and the vanilla half goes through the
package's own flattener, so the chained `/execute` tree reaches a client for the first time.

Forty-two of the package's fifty-nine commands are registered. The other seventeen call into a
subsystem this server does not have - there is no scoreboard, no status effect system, no loot
runtime, no experience model - and `UNWIRED_COMMANDS` names each one with what it would need. An
unwired command is not registered at all, so the client is never offered it and the dispatcher
reports it unknown, rather than accepting a line and doing nothing.

In `@jsprismarine/commands`:

- `matchSelector` resolves a parsed selector against a candidate list, which is Java's
  `EntitySelector` in the order Java applies it: filter, then sort, then cut to the limit. The facts
  an `EntityRef` does not carry arrive through an optional `SelectorFacts`, and a fact left out
  never matches a test that reads it.
- `CommandRegistry` takes an `include` predicate. An excluded command is built but never registered,
  so nothing can parse it, no alias is registered for it, and the flattener never puts it in the
  packet. `getExcludedNames` reports the difference between the set the package implements and the
  set a host runs.
- Nine Bedrock-only commands: `/testfor`, `/testforblock`, `/testforblocks`, `/daylock`,
  `/titleraw`, `/replaceitem`, `/camerashake`, `/fog` and `/playanimation`. The first four run the
  same host verbs as the Java commands they are older spellings of.
- `ServerCommandHost.sendTitle` now takes a `TitleInstruction` rather than a kind and a string, so
  `clear` and `reset` carry no text and the new `times` form carries three durations. It gains
  `shakeCamera`, `setFog` and `playAnimation`, `DataCommandHost.setSlot` gains the old-item handling
  `/replaceitem` asks for, and `ItemSlot` gains an `index`, because Bedrock names a slot in two
  parts where Java names it in one.
- A Java registry argument completes from Mojang's own published enum where Bedrock has one, so
  `/summon`, `/give`, `/setblock`, `/fill` and `/clear` autocomplete on the client instead of taking
  an unvalidated string.
- A block state list requires its brackets, which is what keeps `/setblock 1 2 3 dirt keep` from
  reading `keep` as an empty state list and placing the block in replace mode.

In `@jsprismarine/prismarine`:

- `Entity` carries the `/tag` tag set that `@e[tag=...]` tests.
- `Config.setDifficulty` lets `/difficulty` change what it reads, and `DIFFICULTIES` and
  `difficultyName` are exported so the name and the number cannot disagree.
- `World.setLoadedBlockState`, `CameraShakePacket`, `PlayerFogPacket`, `AnimateEntityPacket`,
  `SetTitlePacket`, `TransferPacket` and `StopSoundPacket` are reached for the first time; the last
  five were written and never sent.
- `dispatchCommand` reads the `sendCommandFeedback` gamerule as its value rather than as the
  `[value, editable]` pair, which is always truthy, so the rule suppresses feedback as documented.
