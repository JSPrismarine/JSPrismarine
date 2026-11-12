---
"@jsprismarine/entities": patch
---

`stateField.number`, `stateField.id` and the plain-data check of component state accept finite numbers only. A JSON record writes `Infinity` and `NaN` as `null`, so a component that held one saved a record its own guard refused on load, and the component quietly started from its initial state. A write that a declared field guard refuses is now refused when it is made. A guard a component writes itself decides for its own fields.
