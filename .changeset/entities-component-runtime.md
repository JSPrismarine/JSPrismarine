---
'@jsprismarine/entities': patch
---

Add `@jsprismarine/entities`, the Bedrock entity definition, component and event runtime. It parses
the five top-level keys of an entity file structurally and reports an unknown key rather than
refusing the file, dispatches on `format_version` for the four gated features, and resolves
`components` and `component_groups` once at load through `@jsprismarine/content`. The event engine
determines an event's effects immediately and applies them on the entity's next tick, with `add`,
`remove`, `sequence`, weighted `randomize` against an injectable random source, `first_valid`,
`trigger` with target routing and a cycle guard, and `set_property`; re-adding an active component
group re-initializes its components. Entity properties carry the four types with range clamping and
Molang defaults. The filter evaluator covers all 107 documented tests over a context of eight entity
subjects plus item, block and world views, reusing the grammar and both encodings from
`@jsprismarine/packs`. The goal seam is a `GoalFactory` plus a priority scheduler over the `move`,
`look` and `jump` control flags, with three reference goals. 157 of the 202 non-goal component keys
vanilla uses are implemented, which covers every non-goal component of 102 of the 129 vanilla
entities.
