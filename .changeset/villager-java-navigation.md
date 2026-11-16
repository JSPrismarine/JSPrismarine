---
'@jsprismarine/bedrock-data': patch
---

`java_entity_navigation` now holds the villager. The dumper's probe level gives the villager's constructor an empty environment attribute system to read its schedule from, so the server pins Java's ground navigation for villagers: they turn toward a waypoint by Java's move control and open wooden doors by Java's path costs.
