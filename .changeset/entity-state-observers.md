---
"@jsprismarine/entities": patch
---

Report every attribute, property and component group change to the host. `EntityEnvironment` gains `attributeWritten`, `propertyWritten` and `componentGroupsWritten`, each called with the value before and after the change, and a write that changes nothing is not reported. `Attributes.restore` puts an attribute back exactly, bounds included, and `EntityInstance.restoreComponentGroups` sets the active groups to a given list and rebuilds the component set without running an event. A host undoes a change with these two and `PropertyValues.set`. The group report arrives after the attribute and component state writes its rebuild made. `PropertyValues` takes the observer as an optional third constructor argument, and `Attributes` as an optional second one.
