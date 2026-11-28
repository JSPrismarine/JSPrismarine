---
'@jsprismarine/script-host': patch
'@jsprismarine/prismarine': patch
---

Read the structures behavior packs ship in `structures/`, so `world.structureManager.get` and `place` find them by id, as BDS does: `structures/<namespace>/<name>.mcstructure` is `<namespace>:<name>`, and a file directly in `structures/` is `mystructure:<name>`. `getPackStructureIds` lists them, `delete` refuses one, and `getWorldStructureIds` leaves them out. The Sift's spawn step placed its own `the_sift:portal` structure, so `/the_sift:travel` never moved a player.
