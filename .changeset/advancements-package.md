---
'@jsprismarine/advancements': patch
---

Add `@jsprismarine/advancements`, the Java Edition advancement engine. It parses the 26.3 file
shape (`parent`, `display`, `criteria`, `requirements`, `rewards`, `sends_telemetry_event`), links
the parent tree with cycle detection reported as a diagnostic, and evaluates the conjunctive normal
form in `requirements`, including the default Java derives for a file that writes none. All 58
trigger types in `minecraft:trigger_type` are implemented, read out of the pinned 26.3 server jar
rather than from memory: the registry report for the ids, and the `TriggerInstance` records for
each one's fields. The 58 ids share 29 Java instance shapes, so the ids that read the same JSON
share one parser, and every condition inside a criterion compiles through
`@jsprismarine/predicates` instead of being reimplemented. Per-player progress records completed
criteria with their instants, derives completion from the advancement's current requirements rather
than a stored flag, and serializes to a plain JSON shape. Rewards reach a host through four
injected hooks, with the function hook left for `@jsprismarine/mcfunction`. Criteria are indexed by
trigger, and the four triggers whose event names a registry element are indexed by that element as
well, which is what keeps the recipe-unlock path cheap: a `recipe_unlocked` event evaluates one
criterion against the full vanilla corpus, where a scan would touch 1739. A gated corpus test
parses all 1866 vanilla advancements with zero diagnostics and pins the counts: 4045 criteria, 54
of the 58 triggers used, 30 of those exactly once, 6 roots and no parent cycle.
