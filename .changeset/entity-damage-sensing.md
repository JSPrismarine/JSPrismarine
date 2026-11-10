---
"@jsprismarine/entities": patch
---

Damage can be sensed without being applied. `EntityInstance.senseDamage` reports what the sensors and immunities make of a blow, with the sensor's multiplier and events, and changes nothing. `EntityInstance.applyDamage` applies an amount with those events. `minecraft:damage_sensor` now names its event instead of firing it, and the event fires when the damage is applied, so `damage` behaves as before. An environment that supplies `EntityEnvironment.damage` receives the damage components deal, such as drowning and `minecraft:hurt_on_condition`, so a host can run it through its own pipeline.
