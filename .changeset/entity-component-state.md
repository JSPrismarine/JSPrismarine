---
"@jsprismarine/entities": patch
---

Keep component state on the instance. Timers, cooldowns, the air supply and every other value a component carries between ticks now live in `EntityInstance.componentState`, one plain-data record per component, instead of `WeakMap`s inside the component modules. A component declares its state with `defineComponentState` and reads and writes it through the typed key. Every write goes through `ComponentStates.write` and reaches the new `EntityEnvironment.componentStateWritten` hook with its before and after values, so a host can log and undo it, and `snapshot` and `restore` save and load it. Simulation behavior does not change.
