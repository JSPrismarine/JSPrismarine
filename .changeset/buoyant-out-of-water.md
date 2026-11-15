---
'@jsprismarine/prismarine': patch
---

Stop horses rising into the sky. A horse, donkey, mule, zombie horse, sulfur cube or experience orb declares `minecraft:buoyant` with `apply_gravity: false`, and the server read that as no gravity everywhere, so one that left the ground kept rising. Out of water these entities now fall like any other.
