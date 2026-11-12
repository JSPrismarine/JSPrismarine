# Vetoable actions run as intent, guard, compute and commit

Status: accepted

Every action that can be vetoed or modified runs in four stages.

1. The intent is plain data that describes the attempt.
2. The guard stage runs cheap synchronous checks in a stated order: pack-defined rules such as `damage_sensor` and `cannot_be_attacked`, game rules, permissions, and then scripting before-hooks. A guard reads the intent and returns one of three results: pass, veto, or replacement values for parameters the pipeline declares replaceable, such as a damage amount, an effect duration, a target game mode, an explosion's block list or an item stack. A guard never writes state. Later guards see the replaced intent. The first veto stops everything after it, so nothing after it is computed and nothing is logged except a rejection record.
3. The compute stage does the expensive work, such as damage, loot rolls and explosion rays, and only after the guards before it pass. The exception is a guard that replaces a computed result: it runs after the computation it replaces, so it can read the result. An explosion's rays run once the cheap guards pass and before the scripting before-hook, which receives the impacted blocks and may replace them, as `ExplosionBeforeEvent.setImpactedBlocks` does. A change to a result is a declared modifier with an operation, a value and a priority, as Java's attribute modifiers have, and never a listener mutating a shared object.
4. The commit stage applies the result through the setters and appends the deltas to the change log ([ADR 0012](0012-the-change-log-is-the-history.md)). After commit nothing can veto, and observers read the log.

Offloaded or long-running work carries a request id and a cancellation token that it checks at checkpoints. A result for a cancelled request is dropped when it is admitted ([ADR 0009](0009-external-inputs-enter-once-per-tick.md)).

The legacy cancellable events set a flag that the raising code reads once. Listener order follows `Set` insertion, an async listener's cancel after its first `await` is lost, and the emit site decides whether listeners are awaited at all. A veto that arrives late throws away finished work. With cheap guards first, a veto costs one check.

Replacement exists because the Bedrock Script API needs it. In `@minecraft/server` 2.11.0, ten of the seventeen stable before-events let a script rewrite a parameter of the action, for example `EntityHurtBeforeEvent.damage`, `EffectAddBeforeEvent.duration` and `ExplosionBeforeEvent.setImpactedBlocks`, and one custom component hook rewrites a parameter without being able to cancel. The same documentation runs before-event callbacks in restricted execution, where a write to world state throws. A guard that returns replacements and writes nothing matches both rules.

This replaces the legacy cancellable event objects for simulation actions. Each pipeline defines its own guard list and modifier slots.
