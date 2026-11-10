---
"@jsprismarine/prismarine": patch
---

Let the entity store own every blow a data-driven entity takes. A player's swing, a blast, a command, an item, a status effect, a mob's attack and a component hazard each enter one damage pipeline as a plain intent, pass the guards in ADR 0013's order (the store's and the pack's rules, game rules, then before-hooks such as the `entityDamage` plugin event), go through declared modifiers for the grace period, armor, protection, resistance, absorption, the dragon's scaling and the damage sensor's multiplier, and commit in the same call. A vetoed blow leaves only an `action-rejected` entry in the change log. The health comparison between a mob and its client-facing body is gone: the body reads its health from the store and only shows it.

Behavior changes: a death runs inside the blow that caused it rather than on the entity's next tick; damage from `minecraft:breathable`, `minecraft:hurt_on_condition` and other component hazards now kills; Regeneration, Instant Health and other heals restore a data-driven entity's health; and a damage sensor sees a player's swing as `entity_attack` and a blast as `entity_explosion` or `block_explosion`, the Bedrock cause names its triggers use.
