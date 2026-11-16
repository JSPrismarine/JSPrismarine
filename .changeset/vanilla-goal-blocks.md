---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Make the block-handling and guardian goals run Java's rules. `eat_block` and `take_block` now resolve the bare and legacy block names the vanilla files write (`dirt`, `grass`, `tallgrass`), so sheep graze and endermen pick up blocks again; a sheep eats only at its feet or the grass block below. An enderman lifts a block out without dropping it, puts a carried block only into air above a block and then stops carrying it, and both respect `mobGriefing`, which `GoalWorld.gameRule` now reports. A silverfish hides in any of Java's seven host blocks on one random face, and a hurt silverfish wakes its nests 20 ticks later, nearest first, with a coin flip ending the scan. A guardian locks its beam for 10 ticks, charges it for 80 (an elder for 60), hits once and drops its target.
