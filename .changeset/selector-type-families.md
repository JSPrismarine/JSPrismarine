---
'@jsprismarine/prismarine': patch
---

Answer `@e[family=...]` with the entity's real type families. The command host supplied no families at all, and a selector test whose fact is absent fails, so every family selector matched nothing: `/testfor @e[family=mob]` found none of the mobs standing in front of it and `/kill @e[family=monster]` reached nothing. A live entity answers with the families of its active components, so a component group added at runtime counts; the player and a dropped stack, which no data instance backs, answer with the families their own declaration carries.
