---
'@jsprismarine/prismarine': patch
---

Post `entityDeath` and raise the `player_killed_entity`, `entity_killed_player`, `player_hurt_entity` and `entity_hurt_player` advancement triggers only once the unit of the blow keeps its writes. A blow that a later failure in the same unit undid used to tell plugins the mob died and grant kill advancements while the mob lived on.
