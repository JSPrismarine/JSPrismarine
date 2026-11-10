---
'@jsprismarine/prismarine': minor
---

Run dropped items and the eye of ender as entities of the entity store, and remove the `Item` entity class (`entity/other/Item`) and `EyeOfEnderSignal` (`entity/other/EyeOfEnderSignal`). A drop is a `minecraft:item` store entity whose stack, age and pickup delay are logged component state, and a thrown eye is a `minecraft:eye_of_ender_signal` store entity that `EntityRuntime.eyesOfEnder` flies. Movement, merging, pickup, pickup delays, despawning, the eye's flight, its shatter and its drop keep their behavior, and a saved item keeps the same actor record.

A dropped stack over a chunk that is not loaded now waits where it is instead of loading the chunk inside the tick. A stack that only part of fits into a player's inventory leaves the rest on the ground. The previous entity kept the whole stack there and still added the part that fit. A dropped stack now burns away in fire and lava, is destroyed by a cactus, takes blast damage against five health as in Java, and is removed once it falls 64 blocks below the world. Netherite survives fire and a nether star survives blasts.
