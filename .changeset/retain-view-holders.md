---
'@jsprismarine/prismarine': patch
---

Keep 512 generation holders rather than 128, so a player's view no longer rebuilds terrain and features it already generated. At view distance 10, generating the 317 chunks of a view filled 4654 terrain tiles and ran 1964 feature passes; it now fills 501 and runs 405, one per tile. The generator holds about 110 MiB more while it works.
