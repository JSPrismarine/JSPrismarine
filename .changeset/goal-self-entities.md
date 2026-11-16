---
'@jsprismarine/bedrock-data': patch
---

`java_entity_goals` records `selfEntities` on a goal that calls `setAlertOthers`: the entity types whose class is the registering mob's class or extends it, which Java's `HurtByTargetGoal.alertOthers` searches.
