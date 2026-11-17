---
'@jsprismarine/prismarine': patch
---

A zombie horse takes a lead as Java's `ZombieHorse.canBeLeashed` decides: a tamed one always, a wild one only while no mob rides it. The `is_controlling_passenger_family` filter now names the rider the server seated first, which a zombie riding a zombie horse never was before, so its sensor never saw the zombie.
