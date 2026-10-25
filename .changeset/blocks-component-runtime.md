---
'@jsprismarine/blocks': patch
---

Add `@jsprismarine/blocks`, the Bedrock block definition grammar and component runtime over
`@jsprismarine/content`. `parseBlockDefinition` reads `format_version`, `minecraft:block.description`
with its identifier, menu category, states, traits and the undocumented `internal_vanilla_data`, the
component list and the permutations, dispatching on `format_version` to the newest of three known
schemas at or below the file's version. `createBlockComponentRegistry` holds 56 `ComponentFactory`
entries: the 49 names in Mojang's 1.26.20 `Components.json` with the parameter defaults those
schemas declare, the four property components renamed at 1.19.40, `minecraft:custom_components`, and
two this project adds for the facts Bedrock's grammar cannot hold. `BlockHooks` declares the ten
hook names Mojang's `BlockCustomComponent` uses, so the behavior families attach through
`BehaviorRegistry` and a future script host fits the same shape. `resolveBlocks` evaluates each
permutation's Molang condition per state and applies its components over the base list with the
later entry winning, groups states that match the same permutations onto one resolved type, and
hands back a `BlockType` per identifier and a `BlockState` per palette state over a dense runtime
id. `flattenBlockStates` precomputes solidity, light emission, light filter, blast resistance,
hardness, friction and random ticking into typed arrays indexed by that id. The package ships the
generated `jsprismarine_vanilla` overlay pack, a real Bedrock behavior pack declaring all 1477
palette blocks from the Java-sourced property table, with the 182 Bedrock-only blocks on a reviewed
exception list rather than a silent default.
