---
'@jsprismarine/entities': minor
'@jsprismarine/bedrock-data': patch
---

Carry out the event actions, fire the `minecraft:on_*` triggers, and give the components that
measure most real behavior. The package parsed the vanilla pack well and then did almost nothing
with it: 16 of the 157 implemented components carried behavior, every event action was collected
raw and reported, and nothing fired the eleven trigger components.

**Event actions.** Nine keys parse into an `EntityAction` and run. Eight are everything the composed
vanilla pack writes, measured over its 850 events: `play_sound` 23 uses, `set_home_position` 17,
`emit_vibration` 9, `drop_item` 2, `execute_event_on_home_block` 2, and one each of
`emit_particle`, `reset_target` and `stop_movement`. The ninth is `queue_command`, which the
documentation describes and no vanilla entity uses. Six leave through the new
`EntityEnvironment.effects` seam; `set_home_position` and `stop_movement` go through the actuator
and `reset_target` clears the attack target the entity now owns. An action key the package does not
parse, a body it cannot read, and an action whose environment member a caller left out each reach
the report.

**Damage and triggers.** `EntityInstance.damage` applies the damage instead of only offering it to
the components. The sensors decide the amount with the damager answering the `damager` and `other`
filter subjects, `minecraft:fire_immune` and `minecraft:freezing_immune` turn their causes aside
after the sensors have seen them, the rest comes off the `health` attribute, and
`minecraft:on_hurt`, `minecraft:on_hurt_by_player` and `minecraft:on_death` fire in that order.
`setAttackTarget` fires the two target triggers. `EntityInstance.trigger` is the firing point for
all eleven; the six that name equipment, fire, flight, sleep and friendly anger wait for a caller.

**Components.** `minecraft:hurt_on_condition` (87 of the 129 vanilla entities),
`minecraft:breathable` (84), `minecraft:ageable` (35), `minecraft:ambient_sound_interval` (32),
`minecraft:rideable` (36), `minecraft:angry` (20) and `minecraft:damage_over_time` (3) stopped being
parse-only. `minecraft:despawn` now leaves a `minecraft:persistent` entity alone, and
`minecraft:timer` and `minecraft:environment_sensor` honor a `target` other than `self` through the
new `EntityInstance.raise`. 37 of the 157 implemented keys carry behavior, up from 16.

**Breaking.** `EntityInstance.damage` returns a `DamageResult` rather than a `DamageOutcome`,
`EventAction` gained a `parsed` member, `TriggerComponentParams` and `RideableParams` moved to their
own modules with `target` narrowed from `string` to `EventTarget`, and `TRIGGER_COMPONENTS` is now a
tuple of its eleven names.

`@jsprismarine/bedrock-data` exports the Java attribute golden as `java_entity_attributes`, which
the entity corpus test measures the Bedrock stats against: 423 stats are published in both editions
and 279 agree.
