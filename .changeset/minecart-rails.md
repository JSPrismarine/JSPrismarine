---
'@jsprismarine/prismarine': patch
---

Run minecarts along rails. A minecart on a rail now follows it through straights, curves and slopes as Java's minecart does: it keeps 0.96 of its speed a tick, 0.997 with a rider, and a chest or hopper minecart keeps 0.98 to 0.995, less the fuller it is. It moves at most 0.4 blocks a tick (0.2 in water), speeds up on a powered rail and brakes on an unpowered one. A powered activator rail drops a minecart's riders, primes a TNT minecart and stops a hopper minecart taking items, which it takes again over an unpowered one. Entity filters can now test `is_game_rule`, which the TNT minecart's priming checks.
