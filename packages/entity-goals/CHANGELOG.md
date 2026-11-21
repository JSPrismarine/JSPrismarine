# @jsprismarine/entity-goals

## 0.23.0

### Minor Changes

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Errors carry a stable code and a link to their entry in the error reference at https://jsprismarine.dev/errors/, from their catalog in `@jsprismarine/errors`. Messages are unchanged.

- [#3259](https://github.com/JSPrismarine/JSPrismarine/pull/3259) [`357c93f`](https://github.com/JSPrismarine/JSPrismarine/commit/357c93f46d12599b79670adc65a401d7c4397a45) Thanks [@filiphsps](https://github.com/filiphsps)! - Regenerate the tables that read the default Bedrock data against Bedrock Dedicated Server 1.26.60.6 and `bedrock-samples` v1.26.60.5: the item type table, the goal inventory, the Bedrock command table and the structure state transforms.

- [`044e299`](https://github.com/JSPrismarine/JSPrismarine/commit/044e299ca064611e596e2bdab6aa9151e539149e) Thanks [@filiphsps](https://github.com/filiphsps)! - The melee goals (`melee_attack`, `melee_box_attack`, `delayed_attack`) start and continue as Java's `MeleeAttackGoal` does. Without `track_target` a goal runs while its walk does instead of asking about sight, and it starts only with a route to the target or the target already in reach, checking at most every 20 game ticks. A chasing zombie no longer stops and restarts its goal, and drops its path, every selector pass against a target it holds from beyond its follow range. The navigator hands the route a `canReach` check found to the next `moveTo` from the same block, so a start costs one path search.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`e304e99`](https://github.com/JSPrismarine/JSPrismarine/commit/e304e993f54ce5c92e7d4103008076e0d767c0b0), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`4e02e0b`](https://github.com/JSPrismarine/JSPrismarine/commit/4e02e0b72800bca87529013b34712be0df006874), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`3bb64da`](https://github.com/JSPrismarine/JSPrismarine/commit/3bb64dae3e3ea4e01bca0de55cdedfd678c9c3bf), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/entities@0.23.0
  - @jsprismarine/content@0.23.0
  - @jsprismarine/math@0.23.0

## 0.22.0

### Minor Changes

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`bfeebea`](https://github.com/JSPrismarine/JSPrismarine/commit/bfeebea99c5b9ef3c61e5ecc60109d3052efbb10) Thanks [@filiphsps](https://github.com/filiphsps)! - Cast the evoker's spells the way Java's evoker does. With a target it first summons three vexes it owns, then casts fangs: two rings 1.5 and 2.5 blocks out when the target is within 3 blocks, otherwise a line of sixteen toward it that rises one fang a tick. With no target it turns a blue sheep within 16 blocks red.
  
  `GoalWorld.spawn` now takes a fourth `options` argument (owner, facing and entity data) and returns the spawned mob, and `GoalWorld` gains `fireOn` and `gameTime`. `SummonChoice`, `SummonStep` and `SendEventChoice` describe the spell tables in full, so their fields changed.

### Patch Changes

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`a45be83`](https://github.com/JSPrismarine/JSPrismarine/commit/a45be836d454a57e664a666d44bdfb6c2b209050) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix target and avoid searches that offered no candidates when an `all_of` filter combined two family tests that share no name, such as `monster` and `blaze`. Each test bounds the search on its own, and the intersection of their names is empty.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`2afb7bb`](https://github.com/JSPrismarine/JSPrismarine/commit/2afb7bbeb1f59e6a1d3311f4c93bf8026a8761dd) Thanks [@filiphsps](https://github.com/filiphsps)! - A bee carrying nectar grows the crops, stems, sweet berry bushes and cave vines one and two blocks under it, as Java's `BeeGrowCropGoal` does: only while it has a hive within 48 blocks and is not angry, at most 10 growth steps between two visits to its hive. The goal world gains `javaBlockAt` and `setJavaBlock`, which read and write a block as Java's state.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`ec686f5`](https://github.com/JSPrismarine/JSPrismarine/commit/ec686f52de71ce5c4fae5753661b1190bd90a5a4) Thanks [@filiphsps](https://github.com/filiphsps)! - A bee wanders as Java's `Bee$BeeWanderGoal` does: no home radius holds it, and once it is 24 blocks from its hive its hover wander heads back toward the hive. `minecraft:behavior.random_hover` takes a `home_steer_distance` key for that, and `Navigator.randomTarget` takes a filter that refuses a candidate before the path finder sees it.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`56a6e3e`](https://github.com/JSPrismarine/JSPrismarine/commit/56a6e3e7a5f93b770456fe7bf54425e32066ecdc) Thanks [@filiphsps](https://github.com/filiphsps)! - Run Java's `BreakDoorGoal` for `minecraft:annotation.break_door`: a mob whose path a closed wooden door blocks beats on it and breaks it after 240 goal ticks, on a difficulty at or above the component's `min_difficulty` and only with `mobGriefing` on. The path finder now plans a door breaker's path through a closed wooden door, as Java's `setCanBreakDoors` turns on `setCanOpenDoors`, and no longer plans one for a mob with a Java navigator that cannot open doors and carries no `minecraft:annotation.break_door`.
  
  `GoalWorld` gains the optional `horizontalCollision`, `breakDoor`, `doorBreakProgress` and `knockOnDoor`, and `GoalSupport.pathAhead` reads the path any of an entity's goals planned last.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`ce80df9`](https://github.com/JSPrismarine/JSPrismarine/commit/ce80df91c6442220d07f51882c4eda1727f77dec) Thanks [@filiphsps](https://github.com/filiphsps)! - Show the path finder the doors in the live world: the runtime's navigation view answers `doorAt` from a door's `open_bit` and whether it is iron, so a mob that cannot open doors no longer plans its path through a closed one. `minecraft:behavior.open_door` now opens and closes the door through `GoalWorld.setDoorOpen` instead of writing a `minecraft:open_door` block in its place.
  
  A hopper minecart now collects the items around it, one stack a tick, as Java's `MinecartHopper.suckInItems` does.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`276c40b`](https://github.com/JSPrismarine/JSPrismarine/commit/276c40be2755b05413ef413818210328969d125a) Thanks [@filiphsps](https://github.com/filiphsps)! - Fly the ender dragon. Its phase goals now run Java's phase manager: the dragon laps the node rings around the fountain, strafes a player with a dragon fireball, charges where a player stood, lands on the exit portal, scans for a player, roars and breathes a cloud of dragon breath that hurts for 3, takes off again after four breaths or once it has lost a quarter of its health while perched, and flies by Java's flight model with no gravity. The phase is saved with the dragon. `GoalWorld` gains `moveSelf`, `surfaceY`, `seaLevel`, `fightOrigin`, `endCrystalsAlive`, `discard` and `hasLineOfSight`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`b44e30d`](https://github.com/JSPrismarine/JSPrismarine/commit/b44e30d8a3defcbbff2636326e836dd5578db9b0) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the ender dragon's contact with the world as Java's `EnderDragon.aiStep` does: unless it was hurt in the last 10 ticks, each wing shoves what it meets away from the body and, while the dragon flies, hurts it for 5, and the head and neck hurt what they touch for 10. With `mobGriefing` on, the dragon removes every block its head, neck and body pass through but the `minecraft:dragon_transparent` and `minecraft:dragon_immune` ones, as `checkWalls` does. The goal world gains optional `pushMob` and `blockHasTag`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`a400fff`](https://github.com/JSPrismarine/JSPrismarine/commit/a400fff6fd27aa5bbd5744639c4aee7cf305da9a) Thanks [@filiphsps](https://github.com/filiphsps)! - School cod, salmon and tropical fish as Java's `FollowFlockLeaderGoal` does. Every 100 to 110 goal updates a fish that neither leads nor follows gathers the free fish of its type within 8 blocks under a leader, up to the school's `high_flock_limit`; a follower paths to its leader every 10 ticks, swims at random no more, and leaves once the leader is more than 11 blocks away. `minecraft:flocking` now runs as a goal, `GoalWorld` and `GoalMob` gain an optional `school`, and `GoalSupport` gains `canRandomSwim`. A salmon school holds Java's 5, and a pufferfish or a dolphin no longer declares `minecraft:flocking`, since neither schools in Java.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`77cef33`](https://github.com/JSPrismarine/JSPrismarine/commit/77cef334ad04778f18f277e308c8563592f637a6) Thanks [@filiphsps](https://github.com/filiphsps)! - Flying mobs send `minecraft:flap` game events as they fly, so sculk sensors and wardens hear them. Each type whose `minecraft:game_event_movement_tracking` sets `emit_flap` flaps when its Java class's `isFlapping` holds: an allay whenever it is off the ground, a bat every 10 ticks, a bee every 2 ticks in the air, a phantom every 25, a chicken or a parrot by the distance it flies, and the ender dragon on each wingbeat. `@jsprismarine/entity-goals` exports `isSittingDragonPhase`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`831aa0b`](https://github.com/JSPrismarine/JSPrismarine/commit/831aa0bd97d8c7628bcab6b72549d843de92dc0a) Thanks [@filiphsps](https://github.com/filiphsps)! - A fox's `minecraft:behavior.find_cover` runs Java's `Fox$SeekShelterGoal`: under open sky in daylight it looks for shelter once every 100 selector updates, at once in a thunderstorm, and walks to the first of ten spots that cannot see the sky and is dark enough, by Java's light cost, that an animal rates it below zero, at Java's 1.25 speed. It used to walk to any spot out of the sun whatever the fox stood in, and Bedrock's cooldown stood in for Java's interval. The navigation view now answers Java's light cost on its own, beside a monster's walk value.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`8f74738`](https://github.com/JSPrismarine/JSPrismarine/commit/8f747387fee850d3b9a2ff707dbd3c1fc554d98b) Thanks [@filiphsps](https://github.com/filiphsps)! - A fox stalks and pounces as Java's `Fox$StalkPreyGoal` and `FoxPounceGoal` do: only on a chicken or a rabbit farther than 6 blocks, which it walks toward at 1.5 until it is within 6, crouches for 15 ticks and leaps, biting on landing. The stalk used to stall on each waypoint until the next re-path, so the fox overshot into a range its leap could not land from, and it stalked any target, players included. `minecraft:behavior.stalk_and_pounce_on_target` takes a `filters` key for the prey it stalks.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`1fc4c45`](https://github.com/JSPrismarine/JSPrismarine/commit/1fc4c45d80d54517acae278b74b9527b92595bd8) Thanks [@filiphsps](https://github.com/filiphsps)! - Run `minecraft:trust` and `minecraft:bribeable`. A bred fox trusts the players who fed its parents, which the `trusts` filter test and `minecraft:behavior.defend_trusted_target` now read; the `trusts` test asks the entity about the subject, as Bedrock documents, rather than the other way round. A grown dolphin eats any item of Java's `fishes` tag and leads its player to treasure only while it holds that bribe, spending it when the swim ends. Item interactions now carry the used item's Java tags.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`36bd824`](https://github.com/JSPrismarine/JSPrismarine/commit/36bd8246a5595449b8688aecbeb276466adefe2e) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix four goals against Java:
  
  - `tempt` matched its items as the file writes them, so `wheat` never matched a held `minecraft:wheat` and most vanilla animals could not be tempted. Item names without a namespace now get `minecraft:`.
  - `panic` with no `damage_sources` panicked at any damage, a fall included. It now uses Bedrock's documented default list, which leaves out falls as Java's `panic_causes` tag does.
  - `avoid_mob_type` always ran at its sprint speed. It now walks at `walk_speed_multiplier` while the threat is 7 or more blocks away and sprints once it is closer, as Java's `AvoidEntityGoal` does. `Navigator.setSpeed` changes the speed of a walk under way.
  - `stay_while_sitting` now holds the `jump` flag as well as `move`, as Java's `SitWhenOrderedToGoal` does.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`2734a47`](https://github.com/JSPrismarine/JSPrismarine/commit/2734a47e57307ebc95842def00f1536819016030) Thanks [@filiphsps](https://github.com/filiphsps)! - Hold a `look_at_player` or `look_at_entity` look for as long as Java does. The look counted its drawn 40 to 80 ticks down only on selector ticks, every other tick, so it lasted twice as long; it now counts in Java's `adjustedTickDelay` form and ends once the subject walks out of the look distance.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`229b377`](https://github.com/JSPrismarine/JSPrismarine/commit/229b377ea58e47abfbc37c9941ca9cc8f6e22efd) Thanks [@filiphsps](https://github.com/filiphsps)! - Scan for attack targets and start leaps on Java's random draws. `nearest_attackable_target` and `defend_trusted_target` scanned on a fixed countdown of `scan_interval` selector ticks; they now scan on one selector tick in half of it, rounded up, as Java's `NearestAttackableTargetGoal` does with its random interval. `defend_village_target` and `wither_target_highest_damage` look every selector tick, as Java's goals do. `leap_at_target` started on a 0.2 chance and now starts on Java's one in three.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`45326a4`](https://github.com/JSPrismarine/JSPrismarine/commit/45326a41f0ddbce0aa7a97c77580dc625b9f84ce) Thanks [@filiphsps](https://github.com/filiphsps)! - Tick the happy ghast's brain only while it is a ghastling, as Java's `HappyGhast.customServerAiStep` does, so a grown ghast's brain no longer drags it away from a player tempting it with a snowball. `BrainMobDefinition` gains an optional `ticksBrain`. `minecraft:behavior.follow_mob` reads a `preferred_actor_type` written without a namespace, such as the ghastling's `player`, so a ghastling follows a nearby player.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`22bc257`](https://github.com/JSPrismarine/JSPrismarine/commit/22bc2574d691862b37af20a975dfe6ff25300588) Thanks [@filiphsps](https://github.com/filiphsps)! - Hold a mob's random wandering to the `restriction_radius` of its `minecraft:home`, as Java's `RandomPos` holds it to the radius `Mob.setHomeTo` gives: while the mob is within the radius plus its wander range plus one block of home, a random stroll, swim, hover or flight refuses a destination outside the radius. `NavigatorContext` gains an optional `homeRestriction`, and `breaksHomeRestriction` is exported. The goals now read the home `minecraft:home` sets, which they never saw, and the save keeps it. A guardian and a creaking, which Java gives no home radius, wander freely.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`205722f`](https://github.com/JSPrismarine/JSPrismarine/commit/205722f0230dadfea3d25eefb451b8645ef21d94) Thanks [@filiphsps](https://github.com/filiphsps)! - Run `minecraft:tamemount`. An untamed horse, donkey, mule, zombie horse or llama keeps a temper that starts at 0 and that Java's feeding amounts raise, and each buck with a player on its back tames it when Java's `nextInt(maxTemper)` falls below the temper, or adds 5 and throws every rider off. A buck used to dismount the horse from its own vehicle instead of throwing its rider. `GoalWorld` gains `ejectRiders` and `tameBy`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`b94e27c`](https://github.com/JSPrismarine/JSPrismarine/commit/b94e27c2f874030df4a7c810f9ff645a56cf6600) Thanks [@filiphsps](https://github.com/filiphsps)! - Make `minecraft:behavior.hurt_by_target` call nearby mobs of the same type onto the attacker when the goal declares `alert_same_type`, as Java's `HurtByTargetGoal.setAlertOthers` does. A hurt mob alerts each mob of its type within its follow range across and 10 blocks up and down that has no target and shares its owner. The goal used to read `alert_same_type` as a number, so the boolean vanilla files write never turned it on. `GoalWorld` gains `setTargetOf` and `GoalMob` gains `owner`, both optional.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`811e45c`](https://github.com/JSPrismarine/JSPrismarine/commit/811e45c827552175fb2aa500ad49fb9c5b515658) Thanks [@filiphsps](https://github.com/filiphsps)! - `minecraft:behavior.hurt_by_target` reads `alert_filters`, the server's own key, for the other mobs `alert_same_type` calls onto the attacker. `javaGoalBody` writes it from the subclasses Java's `alertOthers` finds, so a hurt zombie calls nearby husks, drowned and zombie villagers, but not zombified piglins.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`8b807d8`](https://github.com/JSPrismarine/JSPrismarine/commit/8b807d84205904bc5e5a85eae1342ecf0c798f92) Thanks [@filiphsps](https://github.com/filiphsps)! - Steer a pig or strider only while its rider holds a carrot or warped fungus on a stick, as Java's `getControllingPassenger` does: `controlled_by_player` now leaves a mob whose rider holds nothing to its own goals. Using the item boosts the mount the rider steers for Java's 140 plus up to 840 ticks, refuses a second boost while one runs, and costs Java's durability only when the boost takes: 7 for a carrot on a stick, 1 for a warped fungus on a stick, which becomes a fishing rod once worn out. The item world gains an optional `boostMount` query for it.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`a6ae3a0`](https://github.com/JSPrismarine/JSPrismarine/commit/a6ae3a0be1a677ad7fdcd8b5cf8442c448df145c) Thanks [@filiphsps](https://github.com/filiphsps)! - Pass open doors the way a mob's Java navigator does. A fish or a turtle no longer paths through an open door, and a bee, an allay or a ghast now does, as `NodeEvaluator.canPassDoors` and the `door_open` path cost decide in Java.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`777d06c`](https://github.com/JSPrismarine/JSPrismarine/commit/777d06ce5be0c5b4f31a1e9cd36887aff7950b30) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `javaGoalBody` and `matchingJavaGoals` in `@jsprismarine/entity-goals/javaArguments`. `javaGoalBody` writes a Java goal's arguments into the Bedrock goal body that means the same thing, such as `LookAtPlayerGoal`'s look distance into `look_distance` or a `TemptGoal`'s items into `items`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`5a0294d`](https://github.com/JSPrismarine/JSPrismarine/commit/5a0294d47ecd0e5c5d53f527f1a1575a40877e04) Thanks [@filiphsps](https://github.com/filiphsps)! - `matchingJavaGoals` now also answers for `minecraft:behavior.random_look_around`, `stay_while_sitting` and `find_mount`, which no Java goal matches. Add `jsprismarine:behavior.land_on_owners_shoulder`, Java's `LandOnOwnersShoulderGoal`, which seats a tamed parrot on the owner its box touches once it has been off a shoulder for more than 100 ticks.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`e12868b`](https://github.com/JSPrismarine/JSPrismarine/commit/e12868ba23ab117e494a836c76ba060914a60b5b) Thanks [@filiphsps](https://github.com/filiphsps)! - The blaze, the ghast and the shulker attack through their own Java goals. `jsprismarine:behavior.blaze_attack` runs `Blaze$BlazeAttackGoal`: a bite every 20 ticks inside 2 blocks, otherwise 60 ticks of charging, three fireballs 6 ticks apart and 100 ticks of rest. `jsprismarine:behavior.ghast_shoot_fireball` runs `Ghast$GhastShootFireballGoal`, a fireball every 60 ticks within 64 blocks while the ghast drifts on. `jsprismarine:behavior.shulker_attack` runs `Shulker$ShulkerAttackGoal`, a bullet every 20 to 110 ticks within 20 blocks, never on peaceful. The server swaps them in for the Bedrock ranged and melee goals these mobs carried.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`7b0da18`](https://github.com/JSPrismarine/JSPrismarine/commit/7b0da18c80dce3e59270a1b174749aebf03200f3) Thanks [@filiphsps](https://github.com/filiphsps)! - Run Java's outcome for more mob-specific goals. A panda walks to bamboo or cake lying within 6 blocks and takes it before it sits to eat, and a playful panda rolls forward. A dolphin at the surface leaps out of the water. A strider in lava floats up to the surface. A cat that slept with its owner reaches the owner and drops its gift even when it starts close by. A turtle lays 1 to 4 eggs in the open block over sand after 200 ticks of digging. A patrol captain walks toward a far patrol target in hops of up to 10 blocks. `place_block` reads entries written as a block with states and a filter, which is how the copper golem places its statue, and the happy ghast's `float_tempt` steers straight at the player as Java's `TemptGoal.ForNonPathfinders` does.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`0027316`](https://github.com/JSPrismarine/JSPrismarine/commit/002731694586012b09741bad35be135207a69762) Thanks [@filiphsps](https://github.com/filiphsps)! - Run Java's rules for more vanilla goals. A tamed wolf now joins the fight its owner started and turns on whatever hurt its owner, once per blow, and a fox defends a trusted player the same way, through the new `GoalMob.lastHurt` and `lastHurtBy` marks. A bee or allay hovers 1 to 3 blocks over the ground under its destination, a dolphin surfaces only below 140 ticks of air, an iron golem strolls its village by day, and the golem's flower stays out for 400 game ticks. The wither closes to within 3 blocks of its target and climbs 5 above it, the ravager's roar hurts what its damage filters accept, a phantom with no path steers straight at its target, a squid flees its attacker, a witch or trader drinks the potion its filters pick and takes its effects, milk clears every effect, and a fox pounces, bites on the leap, picks ripe berry bushes back to growth 1 and eats on Java's clock. `GoalWorld.attack` takes an optional damage, and `GoalWorld.blockAt` and the states argument of `setBlock` let a goal read and write a crop's growth.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`f0da846`](https://github.com/JSPrismarine/JSPrismarine/commit/f0da846737182df7f814406d2c218dcfb8432867) Thanks [@filiphsps](https://github.com/filiphsps)! - `minecraft:behavior.random_swim` takes Java's numbers from a guardian's `RandomStrollGoal`, which swims on its water-bound navigation, and from the turtle's `TurtleTravelGoal`, which swims whenever the turtle is in water. A guardian and an elder guardian start a swim on one selector tick in 40 at Java's speed, and a turtle in water travels at once.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`ed70545`](https://github.com/JSPrismarine/JSPrismarine/commit/ed70545a3fa294f8d86b94d604f7a33e3c004a7b) Thanks [@filiphsps](https://github.com/filiphsps)! - Let `minecraft:behavior.use_kinetic_weapon` charge on foot, as Java's `SpearUseGoal` does. The goal started only while its mob rode something; it now starts whenever the mob has a target and its main hand holds an item with `minecraft:kinetic_weapon`, mounted or not, and stops when the spear leaves its hand. A zombie without a spear still leaves its movement to its melee attack. `GoalWorld` gains an optional `itemHasComponent`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`7159e9c`](https://github.com/JSPrismarine/JSPrismarine/commit/7159e9c26b783a1186c2f40ccdd2e1f3000dd955) Thanks [@filiphsps](https://github.com/filiphsps)! - `Navigator.pathStep` reports the node of the path under way the entity last left and the one it walks to, Java's `Path.getPreviousNode` and `getNextNode`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`3db1090`](https://github.com/JSPrismarine/JSPrismarine/commit/3db10903da83af9ccadf7dee18ec0f9e1cef40d7) Thanks [@filiphsps](https://github.com/filiphsps)! - Roll a panda's `gameplay/panda_sneeze` gift table on every sneeze, as Java's `Panda.afterSneeze` does, without Bedrock's extra 0.001 roll in front of it. A strider on land now walks to lava: `minecraft:behavior.move_to_liquid` searches on its first pass and then every 200 to 399 ticks, as Java's `MoveToBlockGoal` does, walks to the lava block itself, as `StriderGoToLavaGoal` does, and looks 7 blocks across and 2 up or down, Java's search range.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`e4aa848`](https://github.com/JSPrismarine/JSPrismarine/commit/e4aa8488318e5d0fd6ef0bbc54fb136c8f135d39) Thanks [@filiphsps](https://github.com/filiphsps)! - Size path cells by the mob's width, as Java's node evaluators take `floor(width + 1)` blocks each way, so a horse, panda, spider or other mob a block wide or wider no longer paths through a one-block gap, and walks to the middle of its cells. A mob with Java navigation now routes through a closed wooden door only when its Java navigator opens doors, or when it can break them, and a zombie, husk or zombie villager can break doors by Java's spawn chance (a tenth of the local difficulty's special multiplier, none on a fresh Normal world) rather than Bedrock's one in ten. A drowned never breaks doors.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`59329d6`](https://github.com/JSPrismarine/JSPrismarine/commit/59329d600ff76ed780ec2bdf2d5bfa61e991f2c5) Thanks [@filiphsps](https://github.com/filiphsps)! - Size a mob's path cells by its scaled hitbox, so a foal or other baby fits through the gaps Java lets it through, and take a mob with no collision box as one block wide, the component's documented default, as the server's hitbox does.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`ae6d236`](https://github.com/JSPrismarine/JSPrismarine/commit/ae6d23693209078981ede05a2f68919a765f52e4) Thanks [@filiphsps](https://github.com/filiphsps)! - A phantom targets and fears as Java's does. `jsprismarine:behavior.phantom_attack_player_target` runs `Phantom$PhantomAttackPlayerTargetGoal`: ten updates after it appears and every 30 after a scan, it takes the highest player in its box inflated by 16 across and 64 up and down. A swoop breaks off and drops its target while a cat is within 16 blocks, looked for once every 20 ticks, as `PhantomSweepAttackGoal` has it; `minecraft:behavior.swoop_attack` takes `scared_of` and `scare_range` keys for it. The phantom no longer flees cats and ocelots through `avoid_mob_type`, which Java's phantom has no goal for.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`7a39ff6`](https://github.com/JSPrismarine/JSPrismarine/commit/7a39ff6eedaa35bd604f4c78b2b72c4a0ffa1b39) Thanks [@filiphsps](https://github.com/filiphsps)! - `minecraft:behavior.pickup_items` takes an item already within its `goal_radius` where it lies, without starting a walk to it.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`c0e779f`](https://github.com/JSPrismarine/JSPrismarine/commit/c0e779fb068a7e4a778d246ea77dccc101e23620) Thanks [@filiphsps](https://github.com/filiphsps)! - Let `minecraft:behavior.ranged_attack` start with a target beyond its attack radius and walk toward it, as Java's `RangedAttackGoal`, `RangedBowAttackGoal` and `RangedCrossbowAttackGoal` do. A skeleton, stray, bogged, pillager, drowned or witch whose target stood farther than `attack_range` used to stand still; it now closes in at its goal speed and holds its ground once the target is inside `attack_radius`.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`63ae71e`](https://github.com/JSPrismarine/JSPrismarine/commit/63ae71ea246ff1a69f556afc2bf8dfe4fea95ad8) Thanks [@filiphsps](https://github.com/filiphsps)! - Roll spawn gear at Java's regional difficulty. `ServerContent.equipmentDifficulty` answers `random_regional_difficulty_chance` for the place a mob spawns, from the world's difficulty, time and moon, so a fresh world's zombies and skeletons spawn without armor. Chunk inhabited time is not tracked yet ([#3168](https://github.com/JSPrismarine/JSPrismarine/issues/3168)). A drowned's nautilus shell now goes to its off hand.
  
  A pickup goal with `pickup_based_on_chance` now asks `GoalWorld.canPickUpLoot`, which the runtime rolls once per mob as Java's `Zombie.finalizeSpawn` does (`0.55` times the special multiplier) and saves, so a zombie in a fresh region never picks up items. A host without it keeps the per-attempt chance.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`ed71c7e`](https://github.com/JSPrismarine/JSPrismarine/commit/ed71c7e66ad9e40ab4e154de18fbfc480433519b) Thanks [@filiphsps](https://github.com/filiphsps)! - A baby's path height shrinks with its `minecraft:scale`, as its width already did and as Java sizes path nodes by the scaled hitbox. A ghastling, whose 4-block box is under a block tall at its scale, now paths through water and doorways the way Java's navigator takes it.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`9620803`](https://github.com/JSPrismarine/JSPrismarine/commit/9620803121157b21696960932b3a885f92308092) Thanks [@filiphsps](https://github.com/filiphsps)! - Spring the skeleton horse trap. A player who comes within 10 blocks of a trap horse now calls a lightning bolt that hurts nobody, a skeleton mounts the trap horse, and three more skeleton horses with skeleton riders appear beside it; a skeleton that spawned bareheaded wears an iron helmet. The trap springs once, survives a save as sprung, and a trap nobody springs within its duration takes the horse away.
  
  `GoalSpawnOptions` gains `rides`, `fillEmptySlots` and `velocity`, `GoalWorld` gains `self`, and a lightning bolt spawned with `visual_only` data strikes nothing.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`885eeb2`](https://github.com/JSPrismarine/JSPrismarine/commit/885eeb2e1ebb9fce1fbdf38eff90df72519dec2a) Thanks [@filiphsps](https://github.com/filiphsps)! - Turn a squid's body a tenth of the way toward where it swims each tick, as Java's `Squid.aiStep` eases it, and leave a slime's turn to its move control's 90 degrees a tick: `slime_random_direction` no longer sets the slime's heading at once.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`26b9939`](https://github.com/JSPrismarine/JSPrismarine/commit/26b9939e9f7f58c151999cfe8a9f4e1800b119f3) Thanks [@filiphsps](https://github.com/filiphsps)! - `minecraft:behavior.rise_to_liquid_level` holds no control flag, so a strider strolls across a lava pool while it floats on it. Java floats a strider from `Strider.tick` rather than from a goal, and the goal holding `move` kept a strider in lava standing still.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`98d08e1`](https://github.com/JSPrismarine/JSPrismarine/commit/98d08e1b6333a4ef847808e815356b1d661806ac) Thanks [@filiphsps](https://github.com/filiphsps)! - A skeleton horse trap's skeletons carry an enchanted bow and helmet, drawn from the `mob_spawn_equipment` enchantment provider as Java's `SkeletonTrapGoal` does through `EnchantmentHelper.enchantItemFromProvider`: a cost from 5 up to 22 by the regional difficulty, then the enchanting table's draw. A goal's spawn options take `enchantFromProvider` for the slots to enchant.

- [#3229](https://github.com/JSPrismarine/JSPrismarine/pull/3229) [`35c78be`](https://github.com/JSPrismarine/JSPrismarine/commit/35c78bee3f811c54bbd3ab664a00b24334d68af5) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the block-handling and guardian goals run Java's rules. `eat_block` and `take_block` now resolve the bare and legacy block names the vanilla files write (`dirt`, `grass`, `tallgrass`), so sheep graze and endermen pick up blocks again; a sheep eats only at its feet or the grass block below. An enderman lifts a block out without dropping it, puts a carried block only into air above a block and then stops carrying it, and both respect `mobGriefing`, which `GoalWorld.gameRule` now reports. A silverfish hides in any of Java's seven host blocks on one random face, and a hurt silverfish wakes its nests 20 ticks later, nearest first, with a coin flip ending the scan. A guardian locks its beam for 10 ticks, charges it for 80 (an elder for 60), hits once and drops its target.
- Updated dependencies [[`4ffca69`](https://github.com/JSPrismarine/JSPrismarine/commit/4ffca6962fbf64ab4c166105136f05bf55754785), [`626a69c`](https://github.com/JSPrismarine/JSPrismarine/commit/626a69ccaaaa8a1ca5d1dd7c9ff1542e86e938fd), [`007a5ea`](https://github.com/JSPrismarine/JSPrismarine/commit/007a5eacc9bb52e44e2becb65b139313cad701c5), [`da13973`](https://github.com/JSPrismarine/JSPrismarine/commit/da13973976f9bb8fa2e0b56f2052dafd21704024), [`3610da2`](https://github.com/JSPrismarine/JSPrismarine/commit/3610da25e96d3c3693da2b1e705b8b2d605847a0), [`0fa1344`](https://github.com/JSPrismarine/JSPrismarine/commit/0fa134406ad5741c68facf7052a60b0f011bf93a), [`33082ec`](https://github.com/JSPrismarine/JSPrismarine/commit/33082ec55be1f828b9ccffe705e39b61b913193f), [`127b459`](https://github.com/JSPrismarine/JSPrismarine/commit/127b459d3e08d45537f6810ce50f4afd3db3fa25), [`0f9ed99`](https://github.com/JSPrismarine/JSPrismarine/commit/0f9ed99c1e01730decebfa0f56f97329d8dbf176), [`e911c47`](https://github.com/JSPrismarine/JSPrismarine/commit/e911c47c4dc0d0ebac4b2ee77a2c22977f824cf5), [`089d411`](https://github.com/JSPrismarine/JSPrismarine/commit/089d411b6ffd8c4af63bed35b59ab01aaba1a353), [`f0e7eb1`](https://github.com/JSPrismarine/JSPrismarine/commit/f0e7eb10df4e829d451ecd3af725d4bbabe4c7a9), [`4ffca69`](https://github.com/JSPrismarine/JSPrismarine/commit/4ffca6962fbf64ab4c166105136f05bf55754785), [`7b44c4c`](https://github.com/JSPrismarine/JSPrismarine/commit/7b44c4cd93df3869dc08e34898a3ca24b79fba0b), [`87191cd`](https://github.com/JSPrismarine/JSPrismarine/commit/87191cd86b7281046c817ea85270c14967b3ccc0), [`321e697`](https://github.com/JSPrismarine/JSPrismarine/commit/321e6979115019811a546e93d5da367171569e03), [`1fc4c45`](https://github.com/JSPrismarine/JSPrismarine/commit/1fc4c45d80d54517acae278b74b9527b92595bd8), [`d1ee7a3`](https://github.com/JSPrismarine/JSPrismarine/commit/d1ee7a3d2fd525b2487148d1e4ba3ab131ff536c), [`205722f`](https://github.com/JSPrismarine/JSPrismarine/commit/205722f0230dadfea3d25eefb451b8645ef21d94), [`b6c42bf`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c42bf0e250b2b20e7ff0862a8b6c4074f3370c), [`0ab8650`](https://github.com/JSPrismarine/JSPrismarine/commit/0ab86502ee94c75aa340edd1a062fb7eb95cc17d), [`91dc371`](https://github.com/JSPrismarine/JSPrismarine/commit/91dc371a5b1c352bb859a64a15bd4704f6e94984), [`8022cb7`](https://github.com/JSPrismarine/JSPrismarine/commit/8022cb7b552b9837f451ff7776d2792b5495078a), [`44a68ec`](https://github.com/JSPrismarine/JSPrismarine/commit/44a68ec1aba917018203b53b76a55255dd6eafc6), [`2ccf7e3`](https://github.com/JSPrismarine/JSPrismarine/commit/2ccf7e3d48c6620e3b7b6f0080c8277181894b6d), [`c7daa77`](https://github.com/JSPrismarine/JSPrismarine/commit/c7daa77fb7d42b94499f49dc68aaabd489b010c1), [`f570be0`](https://github.com/JSPrismarine/JSPrismarine/commit/f570be08e6dbc1dee2f66b4d8a29e0fd09c88c12), [`4f027b5`](https://github.com/JSPrismarine/JSPrismarine/commit/4f027b52594da5dad466e4bb55ab79ca75969edd), [`4cba707`](https://github.com/JSPrismarine/JSPrismarine/commit/4cba707208fad7ce689de15fc992dc83bfc3971a), [`d637f9e`](https://github.com/JSPrismarine/JSPrismarine/commit/d637f9ee461c7c79f103dcfd221c68837f26db24), [`6f10d54`](https://github.com/JSPrismarine/JSPrismarine/commit/6f10d544a9a90e6f4275984c29d2d83e0f0fcb10), [`edf7c0c`](https://github.com/JSPrismarine/JSPrismarine/commit/edf7c0c39659ed0ecfe674575eae05c74226855a), [`b4ad684`](https://github.com/JSPrismarine/JSPrismarine/commit/b4ad68468671838aa1bef016346645b9f63d7143), [`83a9331`](https://github.com/JSPrismarine/JSPrismarine/commit/83a9331f215001c8c60f9abb439250525c50cae5), [`b7f4780`](https://github.com/JSPrismarine/JSPrismarine/commit/b7f4780e371f2bd5b2d2e5ef906141dcfaab4c24), [`27f5860`](https://github.com/JSPrismarine/JSPrismarine/commit/27f5860294a3feba094ebf7afb3a1514b7f0bf65), [`50f2d4a`](https://github.com/JSPrismarine/JSPrismarine/commit/50f2d4aac7d1d8ad14f006dc9ddecf352baca59f), [`b35cdc7`](https://github.com/JSPrismarine/JSPrismarine/commit/b35cdc7bbe74d7c966c3b5e8b09c44fc04e2f29a), [`bb32ba4`](https://github.com/JSPrismarine/JSPrismarine/commit/bb32ba45751d75a3e0e089f200859b9a6a1ff0d6), [`489b9da`](https://github.com/JSPrismarine/JSPrismarine/commit/489b9da10174639c14bbfca4e120a703688cf888), [`32db937`](https://github.com/JSPrismarine/JSPrismarine/commit/32db9377f210710aa46744293c6ba176e1dd0cbc), [`4ffca69`](https://github.com/JSPrismarine/JSPrismarine/commit/4ffca6962fbf64ab4c166105136f05bf55754785)]:
  - @jsprismarine/entities@0.22.0
  - @jsprismarine/content@0.22.0
  - @jsprismarine/math@0.22.0

## 0.21.0

### Patch Changes

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`0040048`](https://github.com/JSPrismarine/JSPrismarine/commit/0040048d165f6e8825706c6f1e09f80073a0d09c) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep a replica of each world's entities from the change log. `NetworkWorldReplicator` reads every sealed tick into an `EntityReplica` (`network/replica/EntityReplica.ts`), which takes each entity from the saved form its membership entry carries and writes every entity and slot entry after it over that form. `entityView` answers what a client is shown of an entity from that data alone, as the new `EntityView` that `entityViewOf` (`entity/data/actorView.ts`) builds from live state, and `entityReplicaCounts` reports what it holds. Entities are still sent as before.
  
  Every field a client is shown is now logged. The status effect clock, the actor record tags and the online owner are logged body fields (`statusEffectClock`, `actorTags`, `owner`), the `in_water` and `on_ground` conditions are logged as they change, and a trader's offers are logged as its `merchant` field after each draw, trade and restock. `StoreActor.persistentNbt` is kept as bytes in the store and answers a new compound on every read, so a caller that changed the compound in place assigns it back. A trade screen trades through `EntityRuntime.tradeSource`. A unit of work that throws now also undoes the offers, conditions and owner it changed, and a zero that changes sign is logged as a change.
  
  The metadata projection runs from plain values: `projectActorMetadata` takes the facts a component set decides (`componentMetadataFacts`, over a live instance or a set resolved from a type and its groups) and an `ActorMetadataState`. `ActorMetadataInputs` holds `spawnBlock` in place of `fallingBlock`. In `@jsprismarine/entity-goals`, `navigationProfile` accepts any `NavigationSource`, the four members of an `EntityInstance` it reads.
- Updated dependencies [[`363bc4b`](https://github.com/JSPrismarine/JSPrismarine/commit/363bc4bfc1fab7119e2f915bc95369543643af2c), [`3ae62c9`](https://github.com/JSPrismarine/JSPrismarine/commit/3ae62c9b49c995dc5047c916c784c7f64aff2d31), [`304a733`](https://github.com/JSPrismarine/JSPrismarine/commit/304a7338b577f3bc86870d5f9eca134b74a79dc5), [`869b0fd`](https://github.com/JSPrismarine/JSPrismarine/commit/869b0fd00c52877eadfdd6594d6f288a2cfb3ba8), [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c), [`3246094`](https://github.com/JSPrismarine/JSPrismarine/commit/3246094c5f015aa47f61872d91064d0ffada0098), [`37eb905`](https://github.com/JSPrismarine/JSPrismarine/commit/37eb9053b4ba2e9ed5ca65404fa7129c75dea04f), [`02c3c4f`](https://github.com/JSPrismarine/JSPrismarine/commit/02c3c4fed413754c61ee94466c181a0df3cf0127), [`b46bf9a`](https://github.com/JSPrismarine/JSPrismarine/commit/b46bf9a56f8b70e076f471d4574815a66cc947b4), [`939f1d1`](https://github.com/JSPrismarine/JSPrismarine/commit/939f1d169d4ef7f2cc29ecf1ac1e16a7cadb3784), [`a62725a`](https://github.com/JSPrismarine/JSPrismarine/commit/a62725a4b2c149d165fcb48c8b8816f6114e1fc4), [`b86f58f`](https://github.com/JSPrismarine/JSPrismarine/commit/b86f58f3ed84856df9758f2d86a1563219815edf), [`8f42dce`](https://github.com/JSPrismarine/JSPrismarine/commit/8f42dceac036a8b896069c40835944ee4190b1c1), [`7c3219a`](https://github.com/JSPrismarine/JSPrismarine/commit/7c3219a7baa1944f9a613bbbe97b9280f4c08c06), [`2e1e953`](https://github.com/JSPrismarine/JSPrismarine/commit/2e1e9532a42d6e6b38eb4ed923738946635e3f86), [`eec2435`](https://github.com/JSPrismarine/JSPrismarine/commit/eec2435c0ecf23fd43a9fdb28c4cfc9da0281aba)]:
  - @jsprismarine/entities@0.21.0
  - @jsprismarine/content@0.21.0
  - @jsprismarine/math@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/math@0.20.0
  - @jsprismarine/entities@0.20.0
  - @jsprismarine/content@0.20.0

## 0.19.2

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/content@0.19.2
  - @jsprismarine/entities@0.19.2
  - @jsprismarine/math@0.19.2

## 0.19.1

### Patch Changes

- Updated dependencies []:
  - @jsprismarine/entities@0.19.1
  - @jsprismarine/content@0.19.1
  - @jsprismarine/math@0.19.1

## 0.19.0

### Patch Changes

- [`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e) Thanks [@filiphsps](https://github.com/filiphsps)! - Point the Discord link in each package README at the project's current invite.
- Updated dependencies [[`e785c39`](https://github.com/JSPrismarine/JSPrismarine/commit/e785c393143af8f1812350c7de218f809d6e5c8e)]:
  - @jsprismarine/entities@0.19.0
  - @jsprismarine/math@0.19.0
  - @jsprismarine/content@0.19.0

## 0.18.0

### Patch Changes

- [#2890](https://github.com/JSPrismarine/JSPrismarine/pull/2890) [`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v13.0.7

- [#2893](https://github.com/JSPrismarine/JSPrismarine/pull/2893) [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.6

- [#2902](https://github.com/JSPrismarine/JSPrismarine/pull/2902) [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14

- [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5) Thanks [@filiphsps](https://github.com/filiphsps)! - Name the built files `index.js` and so on instead of `index.es.js`. Every `exports`, `main`, `module` and `bin` path in the packages points at the new names, so a consumer that imports through a package name needs no change; one that reaches into `dist/` by file name has to drop the `.es`.
- Updated dependencies [[`2ed840e`](https://github.com/JSPrismarine/JSPrismarine/commit/2ed840e8fd0ec1651fbba1bdfb3e2ab728c8bfe1), [`2d468b0`](https://github.com/JSPrismarine/JSPrismarine/commit/2d468b068fa56b158a7fe43168368dbef0c49015), [`0a03bb6`](https://github.com/JSPrismarine/JSPrismarine/commit/0a03bb69b0c8b11d9432f8f306111b66d7ff3596), [`cd2a60d`](https://github.com/JSPrismarine/JSPrismarine/commit/cd2a60d428ee7f983601dc0fdf2638bdec7e4fe5)]:
  - @jsprismarine/content@0.18.0
  - @jsprismarine/entities@0.18.0
  - @jsprismarine/math@0.18.0

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- [`ac02142`](https://github.com/JSPrismarine/JSPrismarine/commit/ac021424a6534c7b023d1288b6d78da999a65fb0) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `hypot3`, a three-argument `Math.hypot` with identical results that runs 2-3 times faster, and use it for entity and path distances.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`f5b3d7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f5b3d7c830dc19189d85e21af834391192ccb481) Thanks [@filiphsps](https://github.com/filiphsps)! - Match Java flee-sun preconditions and bounded candidate draws.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`57d0d17`](https://github.com/JSPrismarine/JSPrismarine/commit/57d0d17d8577cde351c634e6b0dadd00a1ea6428) Thanks [@filiphsps](https://github.com/filiphsps)! - Match Java goal selector cadence and inactivity.

- [#2699](https://github.com/JSPrismarine/JSPrismarine/pull/2699) [`d7e9d45`](https://github.com/JSPrismarine/JSPrismarine/commit/d7e9d45c682e633ae7d4d90221193785ae9d2760) Thanks [@filiphsps](https://github.com/filiphsps)! - Reduce repeated navigation planning and redundant world work, and add repeatable performance benchmarks.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`d8e0a48`](https://github.com/JSPrismarine/JSPrismarine/commit/d8e0a48ead973091d46f81760e9dbfde08522449) Thanks [@filiphsps](https://github.com/filiphsps)! - Cache component-derived entity facts by active set.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`67296ae`](https://github.com/JSPrismarine/JSPrismarine/commit/67296ae70a02eef49106f7f35460aedc497946c0) Thanks [@filiphsps](https://github.com/filiphsps)! - Use family-indexed candidates for mob avoidance.

- [#2795](https://github.com/JSPrismarine/JSPrismarine/pull/2795) [`57340c6`](https://github.com/JSPrismarine/JSPrismarine/commit/57340c66f59a010f29eac04f15f2bd1f7df8ca9d) Thanks [@filiphsps](https://github.com/filiphsps)! - Add limited nearest-first block queries and reuse navigation reads.
- Updated dependencies [[`b4940f3`](https://github.com/JSPrismarine/JSPrismarine/commit/b4940f32e1fcd3640af201432f67ee382d50efc6), [`ac02142`](https://github.com/JSPrismarine/JSPrismarine/commit/ac021424a6534c7b023d1288b6d78da999a65fb0), [`f5b3d7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f5b3d7c830dc19189d85e21af834391192ccb481), [`57d0d17`](https://github.com/JSPrismarine/JSPrismarine/commit/57d0d17d8577cde351c634e6b0dadd00a1ea6428), [`d8e0a48`](https://github.com/JSPrismarine/JSPrismarine/commit/d8e0a48ead973091d46f81760e9dbfde08522449), [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d), [`f44af22`](https://github.com/JSPrismarine/JSPrismarine/commit/f44af22c7f60d46edff66d84c478b7e2f07a76cf), [`86915c4`](https://github.com/JSPrismarine/JSPrismarine/commit/86915c42d90df184dbb200ecd81e52cc11a76892), [`3934d28`](https://github.com/JSPrismarine/JSPrismarine/commit/3934d281e96f022a0d57c95d8de99794ed6dd244)]:
  - @jsprismarine/entities@0.17.0
  - @jsprismarine/math@0.17.0
  - @jsprismarine/content@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`fee1601`](https://github.com/JSPrismarine/JSPrismarine/commit/fee1601bb697b8ba9625b0d10e292d66f33d3391) Thanks [@filiphsps](https://github.com/filiphsps)! - Cut what a vanilla mob costs to tick, without changing a decision it takes.
  
  Path finding was nearly all of it, and almost none of that was the search itself. One node expansion
  asked the world about the same cell several times over. The node tested its own cost, each of its
  eight neighbors tested the two cells a diagonal would cut past, and every cell a node bordered was
  asked again when that cell was itself expanded. Ninety block reads per expansion. A `CellReader` per
  search keeps each answer, hands the view one position object instead of allocating one per read, and
  keys its memo on a packed integer rather than an `"x,y,z"` string. A node now costs about
  twenty-five reads.
  
  `findPath` also refuses outright when no cell within the goal radius is one the profile could stand
  in. A search succeeds only by popping a node inside that radius, and every node but the root came
  out of the enterable test, so such a search cannot succeed whatever it does. Saying so costs a few
  dozen block reads instead of the whole 512-node budget. That is where the tick spikes lived.
  `minecraft:behavior.flee_sun`, `find_cover`, `move_to_land` and `avoid_mob_type` draw up to ten
  candidate destinations and ask whether each is reachable, and a candidate three blocks in the air
  was costing the full budget: half a million block reads in one `canStart`, on every mob standing in
  daylight, on the same tick.
  
  `GoalScheduler` keeps its priority order between ticks rather than sorting the entry map three times
  a tick with a `localeCompare` comparator. The comparator is unchanged, so the order is the one it
  already produced.
  
  Measured over real vanilla entity definitions, thirty mobs around a player: the mean per-mob cost
  fell from 290 to 15 microseconds a tick, the 99th-percentile whole tick from 350 ms to 6 ms, and the
  worst tick from 1879 ms to 12 ms. At a hundred mobs the worst tick fell from 3571 ms to 42 ms. Every
  goal decision and every resulting path is unchanged, checked by digesting which goals ran on which
  mob and where each mob stood, every tick, over five seeded scenarios.
  
  The `entity-goals` bump is `minor` because `NavigationView` now states that the path finder hands
  every call the same position object. A view that reads the three numbers and answers, which is what
  the package's own `voxelGrid` and the server's view both do, needs no change. One that kept the
  object or keyed a cache on it does.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`da1793e`](https://github.com/JSPrismarine/JSPrismarine/commit/da1793e286c051351c49dfb1e35b002a6e787bce) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix two gaps the written entity classes were covering, found by connecting real clients to a
  server running the data path alone.
  
  A data-driven mob dropped nothing when it died. `EntityRuntime.kill` read the loot table off the
  resolved type, which only ever sees an entity's base components, and 29 of the 128 vanilla entity
  files declare `minecraft:loot` only inside a component group. The cow carries it in
  `minecraft:cow_adult`, so every cow, pig, sheep and chicken in the world died empty-handed. The
  table is now read off the live instance through `EntityInstance.lootTable()`, which sees the
  groups the entity's spawn event turned on, and falls back to the type.
  
  `minecraft:behavior.mount_pathing` started on nothing more than the entity having a target. The
  adult zombie carries it at priority 2 and `minecraft:behavior.melee_box_attack` at priority 4, and
  both claim the `move` and `look` control flags, so the moment a zombie picked a player it took
  those flags off every goal below it and stood still. Mojang's wording for the goal is "while
  mounted", and it now refuses unless the entity is riding something.

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3f0e622`](https://github.com/JSPrismarine/JSPrismarine/commit/3f0e6228843e07f161a665424b7d7fad69273188) Thanks [@filiphsps](https://github.com/filiphsps)! - Use loaded crafting recipes for `minecraft:shareables` rules with `craft_into` when entities share items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`3e00071`](https://github.com/JSPrismarine/JSPrismarine/commit/3e00071b6842b6a9769032fbfc066ee0c3a75299) Thanks [@filiphsps](https://github.com/filiphsps)! - Avoid a duplicate path search when melee goals start.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`09883cc`](https://github.com/JSPrismarine/JSPrismarine/commit/09883cceba7c537b878891ee0200d8e6d52b8e48) Thanks [@filiphsps](https://github.com/filiphsps)! - Improve dense-world target searches and add opt-in DevTools profiling for server runs.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`cfaf00d`](https://github.com/JSPrismarine/JSPrismarine/commit/cfaf00d727b7a3e8a6dc0815fe75fb53c420b325) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply `minecraft:can_fly` to aerial pathfinding and Bedrock actor metadata.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`7ee8d6c`](https://github.com/JSPrismarine/JSPrismarine/commit/7ee8d6cfd30248841511bc6fb4f69e2db705b96d) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse one packed cell key when checking path cost and support.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`23bfa3d`](https://github.com/JSPrismarine/JSPrismarine/commit/23bfa3dcd39e963d7cc41aef68a7be74e4d4a06a) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply Java's creative and spectator combat target rules, including releasing targets when players change modes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`82679b5`](https://github.com/JSPrismarine/JSPrismarine/commit/82679b595802f95dd7012e756215776ee1883a81) Thanks [@filiphsps](https://github.com/filiphsps)! - Aim entity AI at entity eye positions

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`ee83909`](https://github.com/JSPrismarine/JSPrismarine/commit/ee83909459951c39b8e44e48a80c2e1848741f49) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` surplus and wanted amounts when entities share inventory.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a2f93a1`](https://github.com/JSPrismarine/JSPrismarine/commit/a2f93a166aca94ab3cf95d086203693b143843a7) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip breeding partner searches when active entity data makes the entity ineligible.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`31ec74a`](https://github.com/JSPrismarine/JSPrismarine/commit/31ec74a54779952d8bccc0f9dacd8e5131f3e363) Thanks [@filiphsps](https://github.com/filiphsps)! - Reduce allocations when building navigation profiles

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d19be92`](https://github.com/JSPrismarine/JSPrismarine/commit/d19be9216143a40fb546b24d3f4a6196c326508e) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix ground navigators treating floatable water as vertical swim paths

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`03e6df9`](https://github.com/JSPrismarine/JSPrismarine/commit/03e6df9845bc83a24309e667bb10a7bcd17c2d88) Thanks [@filiphsps](https://github.com/filiphsps)! - Apply lethal entity events before removal and finish the data-defined Ender Dragon death behavior.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`2708df3`](https://github.com/JSPrismarine/JSPrismarine/commit/2708df314b5234ddebacfcd11119c9c6497e7f40) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/entity-goals`, which implements all 170 vanilla Bedrock AI goals against the
  goal seam of `@jsprismarine/entities`. The work is driven by a generated inventory:
  `utils/build-inventory.ts` reads the composed behavior pack of Bedrock Dedicated Server 1.26.51.1
  and writes `src/generated/goalInventory.json` with every `minecraft:behavior.*` name, its use count
  over the 129 entity files, the union of parameter keys observed under it with their JSON types, and
  which entities carry it. The measured count is 170, matching the research note. A totality test
  asserts every name in that file has a registered factory, so coverage cannot silently regress, and
  the measured result is 170 of 170 goals and 129 of 129 entities fully covered.
  
  Goals are grouped by family: targeting, attacking, looking, movement, social, work, environment and
  the single-entity specials. Thirty of them have a Java counterpart whose class name matches after
  snake-casing, and for those the constants are read out of the unobfuscated 26.3 server jar rather
  than guessed, with the class named in the JSDoc: `LookAtPlayerGoal.DEFAULT_PROBABILITY` of 0.02,
  `MeleeAttackGoal`'s 20-tick swing and 10-tick re-path, `LeapAtTargetGoal`'s 2-to-4-block window,
  `BreedGoal`'s 8-block partner search and 60-tick courtship, `HurtByTargetGoal`'s 300-tick revenge
  memory, and the rest. Where the editions differ the Bedrock parameter wins, and the JSDoc records
  the difference.
  
  Navigation is an A\* search over whole blocks against an injected `NavigationView`, governed by a
  `NavigationProfile` built from the entity's `minecraft:navigation.*` component. It honors
  `can_pass_doors`, `can_open_doors`, `can_open_iron_doors`, `can_break_doors`, `avoid_water`,
  `avoid_damage_blocks`, `avoid_sun`, `avoid_portals`, `blocks_to_avoid`, `can_path_over_water`,
  `can_path_over_lava`, `can_walk_in_lava` and the walk, fly, hover, swim, climb and generic
  variants. `Navigator` is the only caller of the path finder and falls back to
  `EntityActuator.moveTo` when no view is supplied, so every movement goal still runs on a server
  that has not implemented the view yet.
  
  `registerVanillaGoals(registry, { world })` wires every goal, and `createGoalEntityRegistry` builds
  the registry in the order that makes these implementations win over the three reference goals the
  entity runtime ships. `GoalWorld` is the second seam a server implements, beside `EntityActuator`,
  and every member is optional so a goal refuses to start rather than throwing when the world cannot
  answer it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`918f5db`](https://github.com/JSPrismarine/JSPrismarine/commit/918f5dbb0876f076c51e2dc03a21f8db2c634c4e) Thanks [@filiphsps](https://github.com/filiphsps)! - Make `minecraft:can_climb` enable pathfinding and vertical movement on ladders.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0cf1eb0`](https://github.com/JSPrismarine/JSPrismarine/commit/0cf1eb0f08e14c795136a1caa6540f470a7cb7df) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep ground navigation from treating liquids as solid support

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`a1c295a`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c295a3fc29e44a4c89a9f5eea9ab1bda99500c) Thanks [@filiphsps](https://github.com/filiphsps)! - Run live entities through the data-driven runtime. `EntityRuntime` was built only by its own
  tests, so the whole `src/entity/data/` layer, and with it `@jsprismarine/entities`,
  `entity-goals`, `entity-brains`, `spawning` and `trading`, never ran on a server. A server with
  `content-packs` on now opens one runtime per dimension as that dimension's content adapter is
  assembled, supplies its host from the live world, and ticks it from `World.update`.
  
  What this turns on, with the flag on: the 60 Bedrock spawn rules and the six-step spawn cycle in
  `@jsprismarine/spawning`, over Bedrock's caps and cadences rather than Java's; the population
  despawn pass; the 170 goals and the 20 brain mobs over the real world; `minecraft:breedable`;
  villager trade tables through `Merchant`; and Java's loot tables on death. `MobSpawner` and the
  written entity classes still run with the flag off, which is the default.
  
  Each data entity carries a `GenericEntity` body so clients see it, and the two stay in step:
  position and health go out to the body, and damage the legacy pipeline dealt to the body comes
  back carrying whoever dealt it. `GenericEntity` rather than one of the written classes, so
  nothing runs the legacy goals against the same body.
  
  `ServerWorldSourceOptions` gained `entityRuntimes`, which is what fills the adapter's `spawning`
  and `ai` groups; without it both stay absent and every projected member still names the subsystem
  that owes it. `Server.getEntityRuntime` and `World.dataEntities` read one back.
  
  `GoalWorld.mobs` now includes players, carrying the `player` and `mob` families a filter can ask
  about. 49 vanilla entities carry `nearest_attackable_target` with an `is_family: player` entry and
  that goal searches `mobs`, so without this no monster ever found anybody.
  
  Two measured costs on the way: `Navigator.randomTarget` asked the path finder about ten candidate
  destinations and a candidate inside a block fails only after the search spends its whole 512-node
  budget, and the path finder's view of the blocks was rebuilt per query and resolved every read
  through the palette. Together these were 623 microseconds per entity per tick; they are now 20.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d1ba51f`](https://github.com/JSPrismarine/JSPrismarine/commit/d1ba51fa3f516153c06103d14b2badd9223fba0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Skip water destinations when navigation data says to avoid water

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c32bfed`](https://github.com/JSPrismarine/JSPrismarine/commit/c32bfededb57b65bab45897dda54e0fa621d0ff1) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Java-derived mob navigation and path costs, and separate overlapping mobs during movement.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d0e884d`](https://github.com/JSPrismarine/JSPrismarine/commit/d0e884d8a40a80047ec6bb948f1f8e1637ccb804) Thanks [@filiphsps](https://github.com/filiphsps)! - Avoid repeating the destination occupancy check during wander pathfinding.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8a20e74`](https://github.com/JSPrismarine/JSPrismarine/commit/8a20e745347d42e28b8ed38cd8a0e5b80b37dcc5) Thanks [@filiphsps](https://github.com/filiphsps)! - Route `minecraft:shareables` consume items through the carried-item goal.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b14a5c8`](https://github.com/JSPrismarine/JSPrismarine/commit/b14a5c867f0eb00691ee7b0b12a726b3823e7ba4) Thanks [@filiphsps](https://github.com/filiphsps)! - Include declared entity inventory slots when shareable items are offered and transferred.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`6d1b073`](https://github.com/JSPrismarine/JSPrismarine/commit/6d1b07376d4d3285768fc807a557ba0722dffb88) Thanks [@filiphsps](https://github.com/filiphsps)! - Equip items picked up under `minecraft:behavior.pickup_items` when item and goal data allow it.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`949785e`](https://github.com/JSPrismarine/JSPrismarine/commit/949785e4be1ae2ffd834354fefe993990d5000d6) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` item names, tags, priorities, and pickup limits when entities collect drops.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`981cf5b`](https://github.com/JSPrismarine/JSPrismarine/commit/981cf5b9b2665ae087e53df6919923b4ad4181bb) Thanks [@filiphsps](https://github.com/filiphsps)! - Use `minecraft:shareables` admiration and barter flags when piglins pick up items.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`e924c76`](https://github.com/JSPrismarine/JSPrismarine/commit/e924c76b5fdfad1e0c7e809ece789e98764283aa) Thanks [@filiphsps](https://github.com/filiphsps)! - Match `minecraft:shareables` item tags when entities choose items to share.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`13147a3`](https://github.com/JSPrismarine/JSPrismarine/commit/13147a33e36e0f0a00fc5935b9b7f4862e8d686d) Thanks [@filiphsps](https://github.com/filiphsps)! - Track player bed-sleeping state so cats can fire `minecraft:on_wake_with_owner` when their
  owner wakes.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`f24718e`](https://github.com/JSPrismarine/JSPrismarine/commit/f24718e513d296bdf0e07ec042564f7f9eda0f64) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the slime line move. `minecraft:behavior.slime_keep_on_jumping` called
  `EntityActuator.jump` and nothing else, and `minecraft:behavior.slime_random_direction` picked a
  heading that nothing read, so the two goals ran every tick and displaced the slime by zero blocks.
  On a host whose actuator has no vertical impulse the slime did not even leave the ground.
  
  A slime has no walk in either edition. It moves by hopping, and vanilla's four slime goals all talk
  to one `SlimeMoveControl` on the mob rather than to each other. `SlimeHeading` is that shared piece
  here, kept per entity because each goal component builds its own `GoalSupport`.
  `slime_random_direction` and `slime_attack` set the heading, and `slime_keep_on_jumping` spends it:
  on each landing it jumps and sends the slime four blocks along the heading through the navigator, so
  a wandering slime travels and a slime with a target closes in on it.
  
  `slime_attack` also aims the heading at its target now. It holds `look` at a better priority than
  `slime_random_direction`, which is what stops a slime wandering once it has something to land on.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`eca419a`](https://github.com/JSPrismarine/JSPrismarine/commit/eca419a4641cb31e7c2e0e790520a25ce59527e2) Thanks [@filiphsps](https://github.com/filiphsps)! - Reuse neighbor buffers during pathfinding to reduce allocations.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`8ab8262`](https://github.com/JSPrismarine/JSPrismarine/commit/8ab82622b9be169bccd794f43b151a9685708cc7) Thanks [@filiphsps](https://github.com/filiphsps)! - Let `minecraft:can_stand_on_powder_snow` affect pathfinding and body collision.
- Updated dependencies [[`35dc8ab`](https://github.com/JSPrismarine/JSPrismarine/commit/35dc8ab56ba8acf18a68357c3c0ca1e4ed1f8801), [`3f0e622`](https://github.com/JSPrismarine/JSPrismarine/commit/3f0e6228843e07f161a665424b7d7fad69273188), [`0d64a00`](https://github.com/JSPrismarine/JSPrismarine/commit/0d64a00ec60a7c2064030bfdcec0b2ca26de5236), [`376f8e2`](https://github.com/JSPrismarine/JSPrismarine/commit/376f8e258ba349d5fa5d7c496b3aa6b8045dec46), [`91eaefa`](https://github.com/JSPrismarine/JSPrismarine/commit/91eaefae197242e2476901190792924edcabb0fe), [`b194cc3`](https://github.com/JSPrismarine/JSPrismarine/commit/b194cc3b8a647bd944f78b60903cf23edcc04d1b), [`9617d18`](https://github.com/JSPrismarine/JSPrismarine/commit/9617d187fd9dad87384a46b57548d94441123eeb), [`c59762e`](https://github.com/JSPrismarine/JSPrismarine/commit/c59762eb7d8d7e58bd477e48de087667c565045b), [`2e922ce`](https://github.com/JSPrismarine/JSPrismarine/commit/2e922ce3b1e06c27fbcfac65d2d01a977f2e5ccc), [`9dffb9a`](https://github.com/JSPrismarine/JSPrismarine/commit/9dffb9aa993febd34d79d0bd40afb4334bcd09fa), [`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95), [`59a3e5c`](https://github.com/JSPrismarine/JSPrismarine/commit/59a3e5c5b910027bcb07b47ed65faa177a2c8d98), [`3a673cf`](https://github.com/JSPrismarine/JSPrismarine/commit/3a673cf89f9c11a8c3ba503c7a62dfc21ca1b5b0), [`931294b`](https://github.com/JSPrismarine/JSPrismarine/commit/931294b82cad6bc2ed4d65a68c36e3c7c560bf00), [`bf9bb09`](https://github.com/JSPrismarine/JSPrismarine/commit/bf9bb0905c5278e4ffc2fd88a7eebe62db6c7ea3), [`c0ccdfe`](https://github.com/JSPrismarine/JSPrismarine/commit/c0ccdfeb805c0869006d380408dc74f84496ddaf), [`a825e54`](https://github.com/JSPrismarine/JSPrismarine/commit/a825e5478baccfc586fc3acd3fd5d8d9fc17a02d), [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e), [`985c08e`](https://github.com/JSPrismarine/JSPrismarine/commit/985c08e1f93cbb557a8ce8be02fb2e0a04587f31), [`609b543`](https://github.com/JSPrismarine/JSPrismarine/commit/609b543617f8731ab597322cf5a6132e4d4ca519), [`582536f`](https://github.com/JSPrismarine/JSPrismarine/commit/582536f53c4ed407b065155dc6dce7f5f48982d8), [`97fde37`](https://github.com/JSPrismarine/JSPrismarine/commit/97fde374f2812e33f4b6a71bbbcf268b78963700), [`03e6df9`](https://github.com/JSPrismarine/JSPrismarine/commit/03e6df9845bc83a24309e667bb10a7bcd17c2d88), [`d29e1d4`](https://github.com/JSPrismarine/JSPrismarine/commit/d29e1d4ef750af20698531f32a3e36040312d3a9), [`c1f0bc3`](https://github.com/JSPrismarine/JSPrismarine/commit/c1f0bc3fe5abfffa6c43d9cc44a407e4e25fd10a), [`cd8645c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd8645c9b8bfcb48162a0c9f99a5d4c7449ea613), [`f94da48`](https://github.com/JSPrismarine/JSPrismarine/commit/f94da4841180543ba50be440c4bc796a8a472fcb), [`701c6e7`](https://github.com/JSPrismarine/JSPrismarine/commit/701c6e7e83b91ae2eaa8aa2bbadbf049c6ef75cf), [`6237d25`](https://github.com/JSPrismarine/JSPrismarine/commit/6237d2570ef950f83dcc0111de283340ff35aca3), [`1d905e2`](https://github.com/JSPrismarine/JSPrismarine/commit/1d905e27de007bc64a3f8c4f3c87c46955573e2a), [`c132c90`](https://github.com/JSPrismarine/JSPrismarine/commit/c132c9073992d5a0e8a7f9203298ec8711b0d585), [`b503085`](https://github.com/JSPrismarine/JSPrismarine/commit/b503085d2c068c27dbb4087e00e3e1a12a42e384), [`67546be`](https://github.com/JSPrismarine/JSPrismarine/commit/67546bec49a4f299b2be9b54b10a7d42865884a9), [`542da3b`](https://github.com/JSPrismarine/JSPrismarine/commit/542da3b62a4895905847cd14c0952a97d254d472), [`8196ea9`](https://github.com/JSPrismarine/JSPrismarine/commit/8196ea9e576d0acc3e17fe6b159791e25dc1092e), [`62df686`](https://github.com/JSPrismarine/JSPrismarine/commit/62df68684596605007aef673182fc0b5d61d1a1f), [`2bea6ac`](https://github.com/JSPrismarine/JSPrismarine/commit/2bea6ac82e3a0a100ee254c7e536df73262bef9f), [`c67300a`](https://github.com/JSPrismarine/JSPrismarine/commit/c67300a6cef6ec68daa9f720bc31c7f238874e01), [`0d53afd`](https://github.com/JSPrismarine/JSPrismarine/commit/0d53afdc4b0f42260231d56bbdeb2b4874f8bae7), [`d647e47`](https://github.com/JSPrismarine/JSPrismarine/commit/d647e4746b3533fbc61afac8414b749a253a32c1), [`7b70cc7`](https://github.com/JSPrismarine/JSPrismarine/commit/7b70cc76fb8f1584746b76ee406ad48811d5d6a2), [`68cef3f`](https://github.com/JSPrismarine/JSPrismarine/commit/68cef3f794575714fef335397e8d6e21aa7ae512), [`7562d04`](https://github.com/JSPrismarine/JSPrismarine/commit/7562d044dae9cefb977dc5f24a9a82c7121d8365), [`c5ae5e6`](https://github.com/JSPrismarine/JSPrismarine/commit/c5ae5e6e2e231751c82840c05dbc34435ccd7304), [`cd3077c`](https://github.com/JSPrismarine/JSPrismarine/commit/cd3077c55d5ee9984512f8e34660e7aae5b55680), [`321a017`](https://github.com/JSPrismarine/JSPrismarine/commit/321a0170b36a2946fa3d06fe5924336222275de2), [`fee1601`](https://github.com/JSPrismarine/JSPrismarine/commit/fee1601bb697b8ba9625b0d10e292d66f33d3391), [`da1793e`](https://github.com/JSPrismarine/JSPrismarine/commit/da1793e286c051351c49dfb1e35b002a6e787bce), [`a0c479e`](https://github.com/JSPrismarine/JSPrismarine/commit/a0c479e0ab28de8ba46bac842ddc90a50d9e679f), [`d490871`](https://github.com/JSPrismarine/JSPrismarine/commit/d49087199730fb9eac7d8ee1976ad36df8475394), [`b98742b`](https://github.com/JSPrismarine/JSPrismarine/commit/b98742b80037c69e51cf6059bff2b45147e6a53e), [`f4ec478`](https://github.com/JSPrismarine/JSPrismarine/commit/f4ec4787eb307bbeefe5d51034f43b0728088c55), [`68febb8`](https://github.com/JSPrismarine/JSPrismarine/commit/68febb838436b90836c311f7cc435676dff5a438), [`c32bfed`](https://github.com/JSPrismarine/JSPrismarine/commit/c32bfededb57b65bab45897dda54e0fa621d0ff1), [`5121b88`](https://github.com/JSPrismarine/JSPrismarine/commit/5121b88dab4fbfd3c6f14476ef2ae0014a710086), [`738a665`](https://github.com/JSPrismarine/JSPrismarine/commit/738a66555ddfad7912d7b6c61f28e78a575996cc), [`03d0f89`](https://github.com/JSPrismarine/JSPrismarine/commit/03d0f89125f6101873fbee9df425f33497b0cc7a), [`5445a16`](https://github.com/JSPrismarine/JSPrismarine/commit/5445a16a437bddc8726e71d4ae135d5286e351bb), [`0e7d345`](https://github.com/JSPrismarine/JSPrismarine/commit/0e7d345611f49a463d03f3762f3006f5cab2aaf6), [`259282c`](https://github.com/JSPrismarine/JSPrismarine/commit/259282cf8da2397f26bea2bea8816eb6e4ec91d4), [`949785e`](https://github.com/JSPrismarine/JSPrismarine/commit/949785e4be1ae2ffd834354fefe993990d5000d6), [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247), [`a1c9fe5`](https://github.com/JSPrismarine/JSPrismarine/commit/a1c9fe587b5d6eb19a990c16766962c49f9614fe), [`d304979`](https://github.com/JSPrismarine/JSPrismarine/commit/d3049792f9f15adc6936c8049c56a913732ce036), [`9258ef1`](https://github.com/JSPrismarine/JSPrismarine/commit/9258ef152ef8c0802eefc2cad93e1f8ddb950f46), [`13147a3`](https://github.com/JSPrismarine/JSPrismarine/commit/13147a33e36e0f0a00fc5935b9b7f4862e8d686d), [`3c86e27`](https://github.com/JSPrismarine/JSPrismarine/commit/3c86e279350e4b8dd7c67c6ab84e9ab5b617faea), [`e3fbb5f`](https://github.com/JSPrismarine/JSPrismarine/commit/e3fbb5f7f4db31c80f4d07a51065fc3b28a726c6), [`1b08aed`](https://github.com/JSPrismarine/JSPrismarine/commit/1b08aed5a46a79b19ee36c0cc644c958663d3c4b), [`aedac18`](https://github.com/JSPrismarine/JSPrismarine/commit/aedac183fbdabb86c1140c67feab3cf21b8f0ce9), [`163c611`](https://github.com/JSPrismarine/JSPrismarine/commit/163c611a935d954736c43f98aad3bf7ffa875917), [`d06d825`](https://github.com/JSPrismarine/JSPrismarine/commit/d06d8258b8a875f15fbf4ae7b5a249377639742c), [`7ddfa43`](https://github.com/JSPrismarine/JSPrismarine/commit/7ddfa4319dcf42685218014950ad48dafbacc051), [`de16ae0`](https://github.com/JSPrismarine/JSPrismarine/commit/de16ae07c1f0167885a280a1fc91030b9fbfe0cf), [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c), [`03e7f72`](https://github.com/JSPrismarine/JSPrismarine/commit/03e7f729a0fd42a8c6cb42582914f646b4a6762d), [`5a1ab40`](https://github.com/JSPrismarine/JSPrismarine/commit/5a1ab4010008ca1065cc934efb11701831d2c8ac), [`2e24f49`](https://github.com/JSPrismarine/JSPrismarine/commit/2e24f499570960f91e53c0388e6ea00a7f662116), [`2291a0d`](https://github.com/JSPrismarine/JSPrismarine/commit/2291a0d0ce40d73af8eb09cf0e46cfa2ab79db5c)]:
  - @jsprismarine/entities@0.16.0
  - @jsprismarine/content@0.16.0
