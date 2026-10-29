# Where do Java Edition and Bedrock Edition behave differently, and which differences would a Bedrock client notice?

Researched 2026-10-24. Scope: the gameplay behaviors that differ between the two editions, and what a vanilla Bedrock client does when the server implements Java's behavior instead of Bedrock's. World generation is out of scope; [cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md) covers it and this note only references it. Every claim names its source. Mojang statements (the published protocol documentation, release changelogs, the Bedrock Dedicated Server documentation, bug tracker resolutions) are marked as such. The Minecraft Wiki's "Parity issue list" began as a Mojang page and now carries the banner "Former official page now maintained by community" (https://minecraft.wiki/w/Parity_issue_list), so it is treated as secondary throughout, as are the other wiki pages.

## Summary

1. The difference list in section 13 has 278 rows. 213 are decided by the server, 44 by the Bedrock client and 21 by both. If the server implemented Java's behavior in every one of them, 102 would be invisible to the player, 94 would read correctly, 56 would be visible and broken, and 26 would desync. The 186 that are server-decided and either invisible or correct are what a parity claim can cover.
2. "1-1 Java Edition parity" cannot be true as written, because a large class of Java behavior is not the server's to decide. The Bedrock client computes its own lighting, predicts its own block breaking, picks its own block collision shapes where the two editions disagree, and ships a fixed list of 102 particle types, 35 damage causes and 19 wire attributes. No packet changes any of those.
3. Movement authority is settled and in the server's favor. Mojang removed the `server-authoritative-movement` option in Bedrock 1.21.70 with the line "Removed server-authoritative-movement parameter. It will now always use server-auth-with-rewind", and in the same release "Server Authoritative movement is now turned on by default" (https://feedback.minecraft.net/hc/en-us/articles/35256043330189). A server at protocol 2193 no longer writes a movement mode in `StartGamePacket` at all.
4. The client still originates every movement intent and runs the first simulation. Mojang's guide says "This movement mode is client predicted with full server authority [...] The server does not simulate movement for players until one of these packets arrives", and the `PlayerAuthInputPacket::InputData` bits for sneaking, sprinting, swimming, gliding, crawling, flying and riptide are all documented as requests the server accepts or rejects. Java movement constants that differ from Bedrock's therefore produce corrections, not fidelity.
5. The client runs no mob AI. Mojang documents `SetActorMotionPacket` as doing "nothing" for most actor types, `MoveActorDeltaPacket` as an interpolation feed with an explicit tick count, and `MotionPredictionHintsPacket` as a bandwidth optimization. Every mob's AI, pathfinding and physics is the server's problem, and every mob difference in section 7 is implementable.
6. Combat is the largest gap and the one with the worst consequences on a Bedrock client. Java's attack cooldown section is marked `{{exclusive|Java}}`, Bedrock's attribute set has no `attack_speed`, and the Bedrock client draws no cooldown meter. A server that throttles damage the way Java does produces a player who cannot see why their hits are weak, and the client keeps playing the strong-attack sound on every connecting hit.
7. Three combat differences people expect are already fixed. Mojang brought Bedrock's armor and toughness formula, its enchantment protection factor cap and its netherite knockback resistance to Java's values in 1.18.30, and every enchantment's maximum level already matches. Sweeping Edge is the only edition-exclusive enchantment in either direction.
8. Redstone is not Java redstone with bugs; it is a different scheduler. "In Bedrock Edition, block updates and redstone are not connected", and the Tick page documents a Bedrock-exclusive produce-tick and consume-tick split across odd and even game ticks. Quasi-connectivity, zero-ticking, sticky-piston block dropping and instant repeaters are Java-and-console-only families of behavior; soft inversion and phase-splitting circuits are Bedrock-only.
9. Light is entirely client-side. The Bedrock protocol has no light packet and the chunk packets carry no light arrays. A server must still compute an internal light value for spawning, crop growth and daylight detectors, and it can never correct what the player sees. Java's directional opacity has no Bedrock expression at all.
10. The spawning model is structurally different. Java scales a global cap by loaded chunks (`globalCap = mobCap x chunks / 289`) and adds a per-player cap; Bedrock has one global cap of 200 plus per-category surface and cave caps over a 9x9 chunk region plus per-mob density caps. Phantoms, guardians and slime chunks use entirely different spawn mechanisms. All of it is invisible to the client, so implementing Java's version is possible and would silently break every farm a Bedrock player has built.
11. Bedrock's nether build limit is Y=128 against Java's 256, so the nether roof is not buildable, and Bedrock's void damage starts at Y=-82 in the overworld rather than Java's 64 blocks below the minimum build height.
12. Several Bedrock constraints are deliberate. Mojang closed the offhand restriction (MCPE-23282), the attack sound on a whiff (MCPE-28266), projectile knockback against players (MC-3179), pistons finishing before retracting (MC-5726), the absence of quasi-connectivity (MCPE-14664) and the slower regeneration (MCPE-179223) as Works As Intended or Invalid. Java behavior in those places is a product choice, not a bug fix.
13. Section 14 proposes the claim to make, the three levels of verification it implies, and the eight categories that have to be excluded from it.

## 1. How to read the two axes

Every difference below is classified twice.

Axis A says who decides the outcome.

- Server. The server simulates the behavior and sends the result; the client only displays it. Most block, entity and world simulation is here.
- Client. The Bedrock client decides locally and the server cannot override the decision, either because no packet carries it or because the client computes it from data that was fixed when the client was built.
- Mixed. Both sides compute something. Either the client predicts and the server confirms or corrects, or the server owns a value that the client then renders by its own rules.

Axis B says what happens if this server implements Java's behavior while a vanilla Bedrock client is connected.

- Invisible. The player cannot tell. The behavior produces no distinct rendering, sound or HUD element, so Java's rule and Bedrock's rule look the same on screen.
- Visible and correct. The player sees Java's behavior and it reads as intended. The client has the rendering it needs.
- Visible and broken. The player sees something, and it is wrong or unexplained, because the client lacks the presentation that makes Java's behavior legible. The attack cooldown is the archetype: the damage reduction lands, the meter that explains it does not exist.
- Desync. The client's local state and the server's state disagree, and the player sees rubber-banding, ghost blocks, reappearing items or corrections. This happens where the client predicts.

The evidence for Axis A is Mojang's own protocol documentation, in three forms. The rendered reference and its design guides live at https://mojang.github.io/bedrock-protocol-docs/, which at the time of writing serves 1.26.70-preview.21 (protocol 2238) as latest and 1.26.51 (protocol 2193) as the newest stable; the guides under `/guides/` are Mojang engineering prose about movement, anti-cheat, block breaking and server-authoritative inventory, and they are the single best source for this note. The machine-readable form is pinned in this repository at `packages/minecraft/datagen/manifest.json` as `Mojang/bedrock-protocol-docs` release `v1.26.51` for the JSON schemas and commit `0e00fe80f4f3c71572ff6429de40146d1f4412fc` for the last published `html/enums.html`; the cached copy at `packages/minecraft/datagen/snapshot/v2193/enums.html` carries Mojang's prose description of every enum member. Mojang's Bedrock Dedicated Server documentation at https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties supplies the defaults.

## 2. Who decides what: the Bedrock authority model

### Movement

Mojang's `ServerAuthMovementMode` enum has three members. `LegacyClientAuthoritativeV1_Deprecated` is 0. `ClientAuthoritativeV2` is 1, described as "Referred to in the rest of the documentation as 'Client Authoritative'. This mode is the current default with previews coming soon for migrating to server authoritative", with repositioning by `MovePlayerPacket` and `SetActorMotionPacket`. `ServerAuthoritativeV3` is 2: "This mode is intended to become the new default after previews coming soon", with repositioning by `MovePlayerPacket`, `CorrectPlayerMovePredictionPacket` and `SetActorMotionPacket`, and the note "Additionally, in this mode many client-bound packets have a 'Tick' value. These echo back the tick value that the client supplies in the PlayerAuthInputPacket." (`packages/minecraft/datagen/snapshot/v2193/enums.html`, Minecraft 1.26.40, protocol 2168.)

That migration finished. The Bedrock 1.21.70 changelog says under its dedicated-server section: "Removed server-authoritative-movement parameter. It will now always use server-auth-with-rewind", and separately "Server Authoritative movement is now turned on by default" (https://feedback.minecraft.net/hc/en-us/articles/35256043330189). The same release added three strictness toggles: "server-authoritative-movement-strict default to false and can be set to true. Will affect Player position acceptance", "server-authoritative-dismount-strict default to false and can be set to true. Will affect Player position when dismounting", and "server-authoritative-entity-interactions-strict default to false and can be set to true. Will affect Entity interaction acceptance". It also removed the `set_movement_authority` command.

The protocol followed. At protocol 2193 the movement settings in `StartGamePacket` are a rewind history size and a block-breaking flag and nothing else; the movement mode field that used to lead them left at 1.21.90, and a server that still writes it puts every later field one byte out (`packages/protocol/src/packet/StartGamePacket.ts`, verified against a Bedrock Dedicated Server 1.26.51 capture). The repository's current Bedrock Dedicated Server extraction finds no `server-authoritative-movement` key in `server.properties` at all ([bedrock-data-extraction.md](bedrock-data-extraction.md), section 2).

What the server does not get is the decision to move. The client reports input and expects a verdict. Mojang's `PlayerAuthInputPacket::InputData` enum documents, for each state change, exactly what the server is expected to answer:

| Bit | Member | Mojang's description |
|---|---|---|
| 25, 26 | `StartSprinting`, `StopSprinting` | "Server is expected to respond with SetActorDataPacket with ActorFlags::SPRINTING and an UpdateAttributesPacket to apply the sprint boost." |
| 27, 28 | `StartSneaking`, `StopSneaking` | "Server is expected to respond with SetActorDataPacket with ActorFlags::SNEAKING true if accepted, false if rejected, and a bounding box update." |
| 29, 30 | `StartSwimming`, `StopSwimming` | "Server is expected to respond with SetActorDataPacket with ActorFlags::SWIMMING set to true if accepted or false if rejected, and a bounding box update." |
| 32, 33 | `StartGliding`, `StopGliding` | "Server is expected to respond with SetActorDataPacket with ActorFlags::GLIDING true if accepted or false if rejected, and a bounding box update." |
| 37 | `HandledTeleport` | "Used to inform the server that we have received a MovePlayerPacket causing a teleport, and re-enable client auth movement. The server should ignore any client predicted positions from the moment a MovePlayerPacket was sent until receipt of this action." |
| 39 | `MissedSwing` | "Sent when client wants to play the arm swing animation like for left click. Server is expected to broadcast a LevelSoundEventPacket with LevelSoundEvent::AttackNoDamage." |
| 8 | `Sneaking` | "If the player is sneaking, which may be from input or because there's not enough space to stand" |

`PlayerActionType` adds `StartCrawling` ("Sent when the player is standing and thinks there is not enough space to stand"), `StopCrawling`, `StartFlying` and `StopFlying` ("Server is expected to respond with an UpdateAbilitiesPacket to accept or reject this"), and `StartSpinAttack` ("Sent on the tick that the client predicts a riptide spin attack starting"). All quotes are from `packages/minecraft/datagen/snapshot/v2193/enums.html`.

So the shape of movement authority is: the client proposes a pose and a position, the server accepts or rejects, and `CorrectPlayerMovePredictionPacket` drags the client back when it disagrees. Mojang's player movement guide states the model plainly: "This movement mode is client predicted with full server authority. After simulating movement for the frame, the client sends their input along with their predicted position information in the input packet containing a tick ID. The server does not simulate movement for players until one of these packets arrives. When it does, they simulate movement for the player, comparing the server's results with the predicted client positions." The correction itself is a rewind: "The player rewinds their state to the tick the correction is referring to, applies it, then simulates all predictions since then back up to the present [...] These corrections are not applied with any interpolation." Four client-bound packets carry the tick id and participate in the rewind: `CorrectPlayerMovePredictionPacket` (161), `MovePlayerPacket` (19), `SetActorDataPacket` (39) and `UpdateAttributesPacket` (29). (https://mojang.github.io/bedrock-protocol-docs/guides/player-movement-overview/)

Two sentences from that guide matter for an implementation. "The server does not simulate movement for players until one of these packets arrives" means Bedrock's player movement is input-driven, not tick-driven; a server that ticks players on its own clock is not speaking this protocol. And "If a server didn't want to implement server authoritative movement yet still use this protocol they could blindly accept the predicted positions supplied in PlayerAuthInputPacket rather than simulating and sending corrections" is the escape hatch: a server can speak protocol 2193 without simulating Bedrock physics at all, at the cost of having no movement validation.

Mojang documents the correction tolerance as `player-position-acceptance-threshold`, default 0.5: "This is the tolerance of discrepancies between the Client and Server Player position. This helps prevent sending corrections too frequently for non-cheating players in cases where the server and client have different perceptions about when a motion started. For example damage knockback or being pushed by pistons. The higher the number, the more tolerant the server will be before asking for a correction. Values beyond 1.0 have increased chances of allowing cheating." The anti-cheat guide expands the number into three behaviors: "The server eases their position by a small fraction of this towards the client to converge towards being in sync", "The server sends a correction if the divergence distance is above this amount", and "The server accepts the client position if the divergence is within a small fraction of this". Two more keys appear there and not in the shipped defaults: `player-rewind-min-correction-delay-ticks=5` ("Regardless of discrepancies the server will not send corrections within this many ticks of each-other") and `player-rewind-history-size-ticks=40` ("At 20 ticks per second a history size of 40 means that a correction could stil be processed with rewind with two seconds of two-way latency"). (https://mojang.github.io/bedrock-protocol-docs/guides/anti-cheat-server/, https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties)

That tolerance is the whole anti-cheat story for a Bedrock server. The physics the client runs is the Bedrock client's physics. If the server runs Java's physics, the two walk apart and the server corrects, which the player experiences as rubber-banding. Any movement difference between the editions therefore lands in Axis B as desync, not as "visible and correct". Mojang's own worked example of a non-malicious correction is knockback: "Server player is knocked one block east by a server authoritative force, landing at [1, 0] [...] Client gets a packet from server frame 0 saying he should be at [1, 0]. Client rewinds to frame 0."

### Block breaking

The client predicts the break either way. Mojang's block breaking guide splits the responsibilities explicitly. Predicted by the client: "Swinging animation", "Destroying the block in the world", "Applying durability damage to the item in hand", "Controller vibration on impact". Initiated by the server: "Block cracking progress", "Particles coming out of the block while it's being broken", "The sound and burst of particles when destroying a block". So the cracking visuals are never client-predicted and the destruction always is.

With the toggle off: "Server receives these and performs the visual effects of it. No logic or validation in GameMode takes place [...] Position validation takes place, but not meaningfully, since it's based on a position provided by the client. No validation of block break progress takes place."

With the toggle on: "When the client predicts a block is broken, it notifies the server of this prediction with a PlayerBlockAction [...] the server validates that it agrees with the client's prediction, or lack thereof, and corrects the client if necessary. For example, if the server broke a block and the client didn't predict it: correction. If the client predicted destruction but the server didn't compute destruction: correction." Two caveats follow in the same guide: "Note that the target block is still client authoritative with a distance check for validation. The server is not doing raycasts using player orientation to determine target blocks", and "Creative mode is an exception and is still client authoritative". (https://mojang.github.io/bedrock-protocol-docs/guides/block-breaking-overview/)

The matching `PlayerActionType` members spell out the wire contract. `PredictDestroyBlock` (26): "Used for the client to inform the server that it predicted the player destroying a block. The server may respond with block, chunk, or item information if it disagrees, or send no response to imply agreement. Only used when server-auth block breaking toggle is on as specified in StartGamePacket." `ContinueDestroyBlock` (27): "Used to inform the server that the client's current block changed for block destruction. The server is expected to use this to progress the block destruction and await an upcoming PredictDestroyBlock action." With the toggle off, the client sends `CrackBlock` (18) instead and simply expects the server to broadcast the matching crack event.

The default is contested between Mojang's own documents. The server properties reference gives `server-authoritative-block-breaking` a "Default: false" and names the companion `server-authoritative-block-breaking-range-scalar` (https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties), while the anti-cheat guide ships a recommended block of properties containing `server-authoritative-block-breaking=true` and `server-authoritative-block-breaking-pick-range-scalar=1.5` (https://mojang.github.io/bedrock-protocol-docs/guides/anti-cheat-server/). The 1.21 changelog says "Removed 'server-authoritative-block-breaking' from the default server.properties" (https://feedback.minecraft.net/hc/en-us/articles/27451789924237), and 1.17.40 says "Enabled 'server authoritative block breaking' on Realms" (https://feedback.minecraft.net/hc/en-us/articles/4411311573133). The practical reading: the toggle still exists on the wire in `SyncedPlayerMovementSettings`, Mojang enables it where it runs the server, and a third-party server should set it rather than inherit a default.

Either way, the client computes a break time from its own formula and its own reach. The wiki's Breaking page gives three Bedrock reach values ("5 blocks when using a keyboard/mouse or controller input; when using touch input, the range is 12 blocks in Creative mode and 6 blocks otherwise") against Java's two ("5.2 blocks in Creative mode, and 4.5 blocks otherwise"), and gives different haste and mining-fatigue terms per edition: haste is "increased by (20xlevel)% in Java Edition or multiplied by (0.2xlevel+1)x(1.2^level) in Bedrock Edition", mining fatigue "multiplying by (0.3^min(level,4)) in Java Edition or by (0.3^level)x(0.7^level) in Bedrock Edition" (https://minecraft.wiki/w/Breaking). A server that implements Java's formula disagrees with the client on every enchanted or hasted break, and the disagreement shows up as blocks that pop back.

Two Bedrock timing constants have no Java counterpart and come from Mojang's build action guide: "In survival the delay between destroying blocks is always GameMode::creativeDestructionTickDelay which is 250ms, unless a tool is efficient enough to damage through a block's durability in one tick, in which case there is no delay", and the build delay is 200 ms by default, 300 ms while sneaking or against interactive or snappable blocks, otherwise `min(180, 900 / currentPlayerSpeed)` (https://mojang.github.io/bedrock-protocol-docs/guides/build-action-simulation-rate/). That is the mechanism behind the Bedrock exclusive "Block placing speed matches player movement speed".

### Inventory and item use

Mojang moved inventories to the server in Bedrock 1.16.0 with the `ItemStackNetManager` system, and its design document states the model in six lines:

> Servers, as of R16, can be much more authoritative over item stack transfers via a new ItemStackNetManager system. Whereas beforehand clients were widely client-authoritative over their inventories and related mechanics such as crafting results.
> - Clients send requests for UI item stack changes in Container Screens.
> - Client request are for simple transfers and also various Crafting/Trading/Enchanting/etc.
> - Clients locally predict results for most UI operations to mask latency.
> - Servers process requests and authoritatively respond with success or failure to each.
> - Clients apply changes on success and otherwise throw away relevant predictions on failure.
> - Clients do not wait for responses before sending subsequent requests for further smooth UI.

(https://mojang.github.io/bedrock-protocol-docs/guides/server-auth-inventory-item-stack-packets-disabled/, dated "05/12/2020, for R16".) The same document names the opt-out and its intended lifetime: "StartGamePacket - serialize the new mEnableItemStackNetManager bool to false" and "The ability to disable the system will be removed in a later release, at which point clients will require full support from servers for ItemStackNetManager being enabled." Unlike the movement mode, that opt-out has not been removed: `StartGamePacket` at protocol 2193 still carries an "Enable Item Stack Net Manager" boolean.

The prerequisite that landed a year earlier is the Player UI Container, a 51-slot server-known container for every player-facing UI screen. Mojang's reason for it is the parity question in miniature: "This new container is in preparation of Server Authoritative changes for container items. Player UI Container enables servers to know about all containers that clients see and use (e.g. for crafting)." Slot 0 is the cursor, slots 28 to 31 are the inventory 2x2 crafting grid, slots 32 to 40 are the crafting table 3x3, and slot 50 is "Special slot for all newly created items" (https://mojang.github.io/bedrock-protocol-docs/guides/server-auth-inventory-player-ui-container/).

On the wire, `ITEM_STACK_REQUEST` (0x93) carries up to 100 requests, each a client request id plus a list of typed actions drawn from 18 types: Take, Place, Swap, Drop, Destroy, Consume, Create, ScreenLabTableCombine, ScreenBeaconPayment, ScreenHUDMineBlock, CraftRecipe, CraftRecipeAuto, CraftCreative, CraftRecipeOptional, CraftRepairAndDisenchant, CraftLoom, CraftNonImplemented, CraftResults. `ITEM_STACK_RESPONSE` (0x94) answers with an `ItemStackNetResult` that has more than twenty distinct rejection reasons, from `InvalidRequestActionType` through `ExpectedItemSlotNotFullyConsumed`. `PlayerAuthInputPacket::InputData` has `PerformItemStackRequest` (36), "Indicates mItemStackRequest will be written to the packet". The older `ComplexInventoryTransaction::Type` path remains for item use, with `NormalTransaction` "Sent for container UI operations depending on if ItemStackNetManager is enabled" and `InventoryMismatch` "Sent from server to client to reject a transaction". `ItemUseInventoryTransaction::PredictedResult` has two members, `Failure` and `Success`, which is the client telling the server what it already drew, and `PlayerActionType::StartUsingItem` is "Used to inform the server that we are predicting using an item."

Java's model is the same idea with a different unit of work. Java's Click Container carries a client-computed slot diff and a container State ID: "After performing the action, the server compares the results to the slot change information included in the packet [...] For any slots that do not match, it sends Set Container Slot packets containing the correct results. If State ID does not match the last ID sent by the server, it will instead send a full Set Container Content to resynchronize the client" (https://minecraft.wiki/w/Java_Edition_protocol/Packets). Java has no typed action list and no response result code. "Implement Java's inventory behavior" therefore has to mean "produce Java's resulting stacks", not "replay Java's click semantics".

Recipes and the creative inventory are server-driven. The protocol has `CRAFTING_DATA` (0x34) for the recipe set, `CREATIVE_CONTENT` (0x91) for the creative inventory, and `UNLOCKED_RECIPES` (0xc7) whose packet type enum is `INITIALLY_UNLOCKED_RECIPES`, `NEWLY_UNLOCKED_RECIPES`, `REMOVE_UNLOCKED_RECIPES` and `REMOVE_ALL_UNLOCKED_RECIPES` (`packages/protocol/src/packet/UnlockedRecipesPacket.ts`). Recipe unlocking and the creative tab contents are therefore server decisions a Bedrock client will display faithfully. Java is the opposite here: its creative menu lives entirely in the client, and `Set Creative Mode Slot` means "Picking up an item with the mouse actually deletes the item from the server, and placing an item into a slot or dropping it out of the inventory actually tells the server to create the item from scratch" (https://minecraft.wiki/w/Java_Edition_protocol/Packets). Bedrock's creative mode is more server-controlled than Java's, not less.

Mojang's R16 document also lists three consequences a server has to honor: "OpenContainerPacket send for opening of all container screens; clients depend on this now for all container screens", "MobArmorEquipmentPacket [...] Bedrock servers no longer handles receiving this packet", and "The server is authoritative about the generation and assignment of ItemStackNetIds values in various packets below."

### Combat

Mojang has never shipped a `server-authoritative-combat` toggle, and no changelog announces one. The authority has to be read off the packets, and they are unambiguous: the client reports an event, the server computes every number.

`ItemUseOnActorInventoryTransaction` carries `Action Type` (Attack or Interact), the target's runtime id, the hand, the item, the player position and the hit position, and no damage field (https://mojang.github.io/bedrock-protocol-docs/1.26.70-preview.21/types/item-use-on-actor-inventory-transaction/). `ItemUseInventoryTransaction` has a "Client Interact Prediction" field, "Whether the client predicted the interaction would succeed", and a "Client Cooldown State", "Whether the item is currently on cooldown on the client". `HurtArmorPacket` "Sends the damage taken after armor is taken into account" and is "From the server"; `PlayerArmorDamagePacket` is "Sent from server whenever the player's armor takes damage"; knockback arrives as `SetActorMotionPacket`, "used for the server to set the velocity of a client actor"; and the hurt and death animations are `ActorEvent` values the server broadcasts. `PlayerAuthInputPacket::InputData` bit 39 is `MissedSwing`, the client telling the server it swung at nothing.

So the division is: the client decides whether a swing happened and at whom, plays the swing animation and the attack sound, and draws the critical-hit particles; the server decides damage, armor and enchantment reduction, invulnerability frames, knockback impulse, durability, effects and hunger. Reach and hit-position validation is the server's option and it is off by default: `server-authoritative-entity-interactions-strict` has "Default: false. If set to true, clients will be more strict towards entity interactions. This will impact players interacting with each other in higher latency situations."

### What is baked into the client

These are the hard walls. None of them can be changed from the server.

- Damage causes. `SharedTypes::Legacy::ActorDamageCause` has 35 members, from `Override` (0) to `MaceSmash` (34), with `Contact`, `EntityAttack`, `Projectile`, `Suffocation`, `Fall`, `Fire`, `FireTick`, `Lava`, `Drowning`, `BlockExplosion`, `EntityExplosion`, `Void`, `SelfDestruct`, `Magic`, `Wither`, `Starve`, `Anvil`, `Thorns`, `FallingBlock`, `Piston`, `FlyIntoWall`, `Magma`, `Fireworks`, `Lightning`, `Charging`, `Temperature`, `Freezing`, `Stalactite`, `Stalagmite`, `RamAttack`, `SonicBoom`, `Campfire`, `SoulCampfire` in between (`packages/minecraft/datagen/snapshot/v2193/enums.html`). Java's equivalent is a datapack registry: the wiki's Damage type page is marked `{{exclusive|java}}` and describes `data/<namespace>/damage_type/<name>.json` with `message_id`, `exhaustion`, `scaling`, `effects` and `death_message_type` fields (https://minecraft.wiki/w/Damage_type). Java damage types that do not map onto one of the 35 Bedrock causes cannot be expressed, and neither can their death messages or their `effects` tint.
- Particles. The `ParticleType` enum has 102 members before `_count`. It contains `Crit` but no sweep-attack particle and no damage indicator. The wiki lists both as Java exclusives: "sweep_attack: Perform a sweep attack with a sword" and "damage_indicator: When an entity is damaged significantly" (https://minecraft.wiki/w/Java_Edition_exclusive_features).
- Attributes. The wiki's Attribute page is marked `{{exclusive|java}}` and lists 41 named attributes including `attack_speed` ("determines the rate at which a player's attack cooldown recharges. Its value is the number of full-strength attacks per second. Only players have this attribute"), `armor`, `armor_toughness`, `step_height` (default 0.6), `sweeping_damage_ratio`, `block_interaction_range`, `entity_interaction_range`, `gravity`, `jump_strength`, `safe_fall_distance` and `fall_damage_multiplier` (https://minecraft.wiki/w/Attribute). Bedrock's wire attribute set is 19 names: `minecraft:absorption`, `player.saturation`, `player.exhaustion`, `knockback_resistance`, `health`, `movement`, `follow_range`, `player.hunger`, `attack_damage`, `player.level`, `player.experience`, `underwater_movement`, `luck`, `fall_damage`, `horse.jump_strength`, `zombie.spawn_reinforcements`, `lava_movement` (`packages/prismarine/src/entity/Attribute.ts`). There is no attack speed, no armor, no armor toughness, no step height and no sweeping ratio on the wire.
- Light. The Bedrock protocol has no light packet (`packages/protocol/src/PacketIdentifier.ts` contains no light identifier) and the chunk packets carry no light arrays. See section 9.
- Collision and hitbox shapes, partly. The wiki's parity list has a 64-row table of blocks whose hitbox or collision box differs between editions, from anvils (MCPE-59921) through walls (MCPE-59920), with entries like "Piston (body): Is a full block" (MCPE-83258) and "Sea pickles have no collision in Bedrock Edition" (MCPE-59925). Recent protocol versions claw some of this back: `VoxelShapesPacket` at protocol 2193 hands the client a shape registry, 287 shapes and 220 names at 1.26.50, and Mojang's packet notes say to send it before `StartGamePacket` (`packages/protocol/src/packet/VoxelShapesPacket.ts`). Entity hitboxes have no such packet; the parity list's blanket claim is "Most entities have different hitbox sizes in each edition."
- Reach, input handling, the inventory UI layout, the offhand slot filter, the death screen, achievements, and the particle and sound catalogs.

## 3. Combat

Combat is where the two editions diverge most and where the Bedrock client is least able to present Java's behavior. The wiki's Combat page opens its comparison with "The combat system is different between Java Edition and Bedrock Edition, and is one of the biggest differences between the two editions" (https://minecraft.wiki/w/Combat).

### Attack cooldown

Java: "When a player swings a weapon or switches to a weapon, they are locked into a cooldown meter that limits how much damage they can deal". The formula is published: "The `attack_speed` attribute controls the length of the cooldown time, with the time taken being `T = 20 / attack_speed` ticks. The damage multiplier is then `0.2 + ((t + 0.5) / T) ^ 2 * 0.8`, restricted to the range 0.2 - 1, where `t` is the number of ticks since the last attack or item switch." Enchantment damage is reduced too, with the multiplier not squared. At 84.8% charge, critical hits, sweep attacks and sprint-knockback attacks become possible. The whole section is marked `{{exclusive|Java}}` (https://minecraft.wiki/w/Damage, https://minecraft.wiki/w/Melee_attack).

Java's per-weapon attack speeds, which set `T`: sword 1.6 (12 ticks), pickaxe 1.2 (16), trident 1.1 (18), iron axe 0.9 (22), wood, stone and copper axe 0.8 (25), mace 0.6 (33), fist and diamond or netherite hoe 4.0 (5). Haste adds 10% per level and Mining Fatigue removes 10% per level in Java only; Bedrock's Haste has no attack-speed term (https://minecraft.wiki/w/Melee_attack, https://minecraft.wiki/w/Haste).

Bedrock: "The attack cooldown does not exist." Weapons have no attack speed and "Axes have lower attack damages than swords due to the absence of the attack cooldown." (https://minecraft.wiki/w/Combat)

Axis A for the damage number is server. Axis B is visible and broken. The Bedrock client has no attack indicator, no `attack_speed` attribute to drive one, and no hotbar or crosshair meter. A server that scales damage by time since the last swing produces hits that deal 20% damage for no reason the player can see, and the client will keep playing the strong attack sound for every connecting hit because Mojang closed MCPE-28266, "Attack sounds are heard when nothing is being hit (punching the air)", as Works As Intended (https://mojira.dev/MCPE-28266). The audible feedback contradicts the damage.

### Base weapon damage

Bedrock adds the bare-hand point: "The barehand damage of 1 is added to the damage of the weapon used, causing all weapons and tools aside from tridents and maces to deal 1 more damage than in Java Edition", with tridents and maces exempt because their Bedrock base damage is 1 lower (https://minecraft.wiki/w/Combat). Server-decided and invisible as a mechanism, but visible in the item tooltip, which the Bedrock client renders from its own item data. A server that uses Java's numbers makes every sword hit for one less than the tooltip implies.

The effect on the weapon table is large. Java axe totals including the player's base point are 7 for wood and gold, 9 for stone, copper, iron and diamond, and 10 for netherite; with the 1.6 sword attack speed and the 0.8 to 0.9 axe speed, that makes the axe Java's highest-damage melee weapon per swing. Bedrock axe totals are 4, 5, 6, 7 and 8, always one below the same-tier sword, and with no cooldown the sword simply wins. Hoes diverge the other way: "In Bedrock Edition, they deal identical damage to pickaxes of the same tier, while in Java Edition they are strictly inferior to bare fists" (https://minecraft.wiki/w/Damage, https://minecraft.wiki/w/Melee_attack). Mojang brought Bedrock's bare hand from 2 damage to 1 in 1.18.30: "Punching deals less damage now, to better match the Java Edition (MCPE-152713)" (https://feedback.minecraft.net/hc/en-us/articles/5520890863245).

### What is already parity and should not be changed

Three things that look like obvious divergences are not, because Mojang fixed them in Bedrock 1.18.30, and a server that reimplements "the Java version" of them is reimplementing what Bedrock already does.

- The armor damage formula, including armor toughness. The 1.18.30 changelog reads "Added armor toughness", "Diamond Armor and Netherite Armor now have a toughness value of 2 and 3 respectively", "Tweaked armor reduction calculation to account for toughness", and "Armor and protection reduction calculations have been made more accurate" (https://feedback.minecraft.net/hc/en-us/articles/5520890863245). Both editions now use `damage x (1 - min(20, max(armor/5, armor - 4 x damage/(min(toughness,20)+8)))/25)`, capped at 80% (https://minecraft.wiki/w/Armor).
- Enchantment protection factor capping. The EPF sum caps at 20 for 80% reduction in both, with type modifiers 1 for Protection and 2 for Fire, Blast and Projectile Protection and 3 for Feather Falling. Bedrock's Protection was over-strong until "Fixed an issue where the Protection enchantments mitigated too much damage. This has been changed to match Java Edition (MCPE-113191)".
- Netherite knockback resistance, now 10% per piece and 40% for a set in both: "Lowered the amount of knockback resistance granted by Netherite Armor (MCPE-109408)". Bedrock previously gave 22.5% per piece.

Also parity: the 10-tick invulnerability timer and its "only the excess is dealt" rule, the 5-tick shield activation delay, the 5-second axe shield disable (Bedrock adopted it in 1.18.30, "Vanilla Parity: Attacks with Axes towards a raised Shield will disable the Shield for 5 seconds", https://www.minecraft.net/en-us/article/minecraft-beta---preview---1-18-30-28-29), the 180-degree frontal blocking arc, Unbreaking's `1/(level+1)` and armor's `0.6 + 0.4/(level+1)`, Mending's 2 durability per experience point, every enchantment's maximum level, and the anvil's 39-level "Too Expensive" ceiling and `2n+1` prior-work penalty.

### Critical hits

Both editions give a critical hit 50% extra damage when the attacker is falling, but they apply it at different points: "increases the damage of the attack by 50% (after strength is applied and before{{only|JE}} / after{{only|be}} enchantments or armor are applied)". Java also requires 84.8% attack cooldown charge and forbids crits in water, on ladders or vines, under Slow Falling or Blindness, while riding, or while flying, and forbids a crit and a sprint-knockback attack in the same swing. Bedrock allows a crit and a sprint-knockback attack simultaneously (https://minecraft.wiki/w/Damage, https://minecraft.wiki/w/Combat). Server-decided. Ordering the multiplier Java's way is invisible, since the `Crit` particle exists in Bedrock; gating crits on a cooldown the client does not show is visible and broken.

### Sweep attacks

Java has them. The conditions are attack cooldown at least 84.8%, a sword in the main hand, feet on the ground, no critical hit, no sprint-knockback attack, and a movement delta no greater than the `movement_speed` attribute (default 0.1 blocks per tick). The area is the target's hitbox expanded 1 block horizontally and 0.25 vertically, limited to entities within 3 blocks of the player; sweep knockback is 0.4 blocks per tick and base sweep damage is 1. Sweeping Edge raises the `sweeping_damage_ratio` attribute by `n/(n+1)`, giving 50%, 67% and 75% of base damage at levels I, II and III, for a final `1 + ratio x base + enchantment` (https://minecraft.wiki/w/Melee_attack).

Bedrock has neither sweep attacks nor the Sweeping Edge enchantment (https://minecraft.wiki/w/Combat). Sweeping Edge is the only edition-exclusive enchantment in either direction; Mojang's `EnchantType` protocol enum lists Bedrock's set and contains no entry for it (https://mojang.github.io/bedrock-protocol-docs/1.26.70-preview.21/types/enchant-type/). The `sweep_attack` particle is a Java exclusive and is absent from Bedrock's 102-member `ParticleType` enum, and Bedrock has no `sweeping_damage_ratio` attribute on the wire. Server-decided damage, client-owned presentation. Implementing it is visible and broken: nearby mobs take damage and fly back with no sweep arc and no particle to explain it.

### Shields

The 5-tick activation delay, the 5-second axe disable and the 180-degree frontal arc are shared. Seven things differ, from https://minecraft.wiki/w/Combat, https://minecraft.wiki/w/Blocking and https://minecraft.wiki/w/Shield:

- Activation input. Java uses the use control, which blocks shield use while holding an item with a right-click function. Bedrock activates the shield by sneaking, so it works with any main-hand item. MCPE-43599, "Shields not blocking when right-clicking", is resolved Works As Intended.
- Auto-raise while riding. Bedrock raises the shield automatically when the player is in a vehicle with no way to suppress it (MCPE-41212, Works As Intended); Java only plays the blocking animation when entering a boat.
- Knockback to the attacker. "Shields deal knockback when blocking melee attacks" is marked `{{Only|Bedrock}}`, and it applies "even if the attack was from an axe which stunned the shield."
- The Knockback enchantment against a raised shield. "If an attack from a Knockback weapon is blocked by a shield, the knockback effect doesn't apply in Java Edition but does in Bedrock Edition" (https://minecraft.wiki/w/Knockback).
- Post-attack lockout. Java shields "can be activated at any time, even if an attack was just performed"; Bedrock shields "cannot be activated if an attack was recently performed". The wiki does not know the tick count and carries a `{{check the code}}` marker.
- Lowering. Java shields are not lowered when the user attacks; Bedrock shields are.
- Disable. In Java, a disabled shield grants 10 ticks of knockback immunity because the invulnerability timer fires without damage (MC-268147, open, https://mojira.dev/MC-268147); in Bedrock it does not.

What a shield blocks also differs. Java blocks all explosions; Bedrock blocks all except TNT lit by a player or by redstone. Bedrock does not block Fire Aspect's ignition, and a blocked shulker bullet still applies Levitation. In Java, contact damage from slimes, magma cubes and the ender dragon bypasses invulnerability frames and drains shield durability in seconds; Bedrock fixed that (MCPE-119451).

Activation and the riding auto-raise are client-decided: the Bedrock client enters the blocking pose from its own input state. The rest are server-decided and invisible or visible-and-correct. Implementing Java's activation rule is not possible, because the server has no way to make the client raise a shield on the use control rather than on sneak.

### Offhand in combat

Java can hold a bow, crossbow, trident, spear or shield in the offhand and fire it while swinging with the main hand. Bedrock's offhand accepts six item kinds, none of which is a weapon except the shield, so none of those combinations exists. Mojang resolved MCPE-23282, "Off-hand can only hold a limited amount of items", as Works As Intended (https://mojira.dev/MCPE-23282). Section 5 covers the allowlist and the mechanism.

### Knockback

Java's published numbers: knockback speed is half the knockback strength; non-living targets get 0.1 blocks per tick vertically; living targets have their horizontal speed halved before knockback is applied, their vertical speed halved if grounded, and their final vertical speed capped at 0.4 blocks per tick; the attacker's horizontal speed drops to 60% and sprinting cancels. The Knockback enchantment adds about 2.586 blocks of horizontal distance per level over a 1.552-block base and raises vertical distance from 0.8125 to 1 block at any level (https://minecraft.wiki/w/Melee_attack, https://minecraft.wiki/w/Knockback).

Differences: "Entities that are already in the air do not take additional vertical knockback when attacked" in Java; in Bedrock "Entities that are already in the air are knocked further into the air when attacked." Snowballs and eggs deal no knockback to players in Java (MC-3179, Works As Intended, https://mojira.dev/MC-3179) and do in Bedrock. Java players can knock armor stands back with the Knockback enchantment and Bedrock players cannot. Blast Protection reduces explosion knockback in Java only (MCPE-97054), and explosion knockback resistance is a Java-only attribute.

All server-decided and invisible as mechanisms, visible as motion. Because the Bedrock client predicts its own position, any knockback the server applies to a player that the client did not predict goes through the `player-position-acceptance-threshold` path: within a small fraction of 0.5 blocks it is accepted, beyond 0.5 the server sends a correction. Mojang's own documentation names "damage knockback" as the motivating case for that tolerance and uses it as the worked rewind example. Bedrock also has an open bug here, MCPE-159055, "Player vertical knockback is still desynced".

### Status effects that scale damage

Strength and Weakness are different functions, not the same function with different constants. Java applies flat attribute modifiers, `+3 x level` for Strength and `-4 x level` for Weakness. Bedrock applies a recurrence: Strength is `d(n) = 1.3 x d(n-1) + 1`, Weakness is `d(n) = 0.8 x d(n-1) - 0.5`, clamped at zero. The order of operations differs too: for players, Bedrock applies the item damage and then Strength or Weakness; for non-player mobs it applies Strength or Weakness to the base and then adds the item damage (https://minecraft.wiki/w/Melee_attack, https://minecraft.wiki/w/Strength, https://minecraft.wiki/w/Weakness). Server-decided and invisible.

### Mob damage by difficulty

The difficulty scaling rule is shared: hard is 1.5 times normal, easy is `min(normal, 0.5 x normal + 1)`, and mob-against-mob always uses Normal. The per-mob values diverge. Easy, Normal and Hard against a player, from https://minecraft.wiki/w/Damage/Mobs:

| Mob | Java | Bedrock |
|---|---|---|
| Creeper explosion, adjacent | 22.5 / 43 / 64.5 | 14.75 / 27.5 / 41.25 |
| Charged creeper | 43.5 / 85 / 127.5 | 35.25 / 68.5 / 102.75 |
| Zombified piglin, wither skeleton, piglin with sword | 5 / 8 / 12 | 5.5 / 9 / 13.5 |
| Piglin brute | 7.5 / 13 / 19.5 | 6 / 10 / 15 |
| Vindicator, unarmed | 3.5 / 5 / 7.5 | 5 / 8 / 12 |
| Vex, unarmed | 3 / 4 / 6 | 2.5 / 3 / 4.5 |
| Baby hoglin | 0.5 / 0.5 / 0.75 | 1 / 1 / 1 |
| Pufferfish, puffed | 2.5 / 3 / 4.5, Poison 6 s | 2 / 2 / 3, Poison 10 s |
| Pillager melee | no melee attack except underwater | 2.5 / 3 / 4.5 |
| Wither dash attack | none | 8.5 / 15 / 22.5 |
| Skeleton family arrows | fixed per difficulty | varies with proximity, 1-4 / 1-4 / 1-5 |

Several of the Bedrock-higher rows are the bare-hand point from the base-damage rule showing through on item-holding mobs. Mojang retuned a batch of these toward Java in 1.18.30: "Blaze fireballs, Fang attack damage, and Shulker bullets now deal consistent damage across all difficulties", "Spiders deal slightly less damage, from 3 to 2 on normal (MCPE-94878)", "Skeleton melee attack does slightly less damage, from 3 to 2 on normal", "Wolves deal slightly more damage, from 3 to 4 on normal", "Damage is now calculated more accurately by properly calculating and storing partial damage for larger damage" (https://feedback.minecraft.net/hc/en-us/articles/5520890863245). Hoglins and zoglins fling their targets into the air in Java only (MCPE-74465).

### Tridents and the drowned

Melee and thrown damage are 9 and 8 in both, but Java's 1.1 attack speed caps the trident at 9.9 damage per second while Bedrock's absent cooldown makes it 18. Durability is 250 in Java and 251 in Bedrock. Java's thrown trident damages exactly one entity (MC-125325, Works As Intended) and despawns after 60 seconds; Bedrock's "can damage multiple entities as long as it touches a solid block between hits" (MCPE-60933, Works As Intended) and never despawns. Riptide costs 2 durability in Java, 1 on the throw and 1 on collision, and only 1 in Bedrock. Loyalty returns from an entity hit directly in Java and only after a subsequent block bounce in Bedrock (MCPE-51726, Won't Fix). Bedrock dispensers fire tridents regardless of enchantment; release Java cannot. Impaling targets aquatic mobs in Java and any mob or player touching water or in rain in Bedrock. (https://minecraft.wiki/w/Trident, https://minecraft.wiki/w/Riptide, https://minecraft.wiki/w/Loyalty.)

Drowned differ on every trident-related number: the drop chance on a player kill is 8.5% in Java and 25% in Bedrock, both rising 1% per Looting level; Bedrock drowned have a 9-damage trident melee attack within 3 blocks that Java drowned do not have; thrown trident damage by difficulty is 5, 8 and 12 in Java and a flat 8 in Bedrock; and Java drowned from zombie reinforcements can spawn with tridents while Bedrock's cannot.

### Invulnerability frames

Shared: "After sustaining damage from any source, a mob or player turns red for 10 game ticks. During this period, the target is invulnerable to most kinds of further damage" and "any damage less than or equal to the original damage that caused the invulnerability is ignored. However, any higher damage [...] causes only the difference between the original and new damage amounts to be dealt" (https://minecraft.wiki/w/Damage). The editions differ on side effects: Java does not consume durability on attacks that land during invulnerability, while in Bedrock "Attacking invulnerable entities causes durability damage, causing high CPS to break items fast" (MCPE-157150, open, https://mojira.dev/MCPE-157150). Server-decided, invisible.

### Bows, crossbows and projectiles

- Crossbow damage: Java rolls 7 to 11, Bedrock is a flat 9.
- Crossbow handling: Java loads the arrow on release and recharges while the use control is held; Bedrock loads automatically when charging completes, does not recharge while held (MCPE-25778, Won't Fix, https://mojira.dev/MCPE-25778), consumes durability on charge, and has a several-tick delay both after charging and after firing (MCPE-239075, open, https://mojira.dev/MCPE-239075).
- Firework rockets fired from a crossbow explode on impact in Java and slide across the ground in Bedrock (MCPE-52675, open, https://mojira.dev/MCPE-52675).
- Projectile inheritance: "The movement of the player influences the flight of fired projectiles" in Java; "Fired projectiles are unaffected by player movement" in Bedrock.
- Projectile timing: Java launches on the firing tick; Bedrock launches "several ticks after they are fired, causing a desync" (MCPE-174685, open, https://mojira.dev/MCPE-174685).

All from https://minecraft.wiki/w/Combat. Damage and flight are server-decided and implementing Java's versions is visible and correct. The charging cadence is client-decided; the Bedrock client will not recharge on a held input no matter what the server does.

### Enchantment damage arithmetic

Sharpness: Java adds 1 for level I and 0.5 per level after; Bedrock adds 1.25 per level rounded down. Smite and Bane of Arthropods: Java does not round the 2.5 per level, Bedrock rounds down, which makes odd levels weaker. Bedrock applies Sharpness, Smite, Bane of Arthropods and Impaling before critical hits and Strength rather than after. Bedrock allows Sharpness, Smite and Bane of Arthropods on an axe at an enchanting table and Thorns on every armor piece. (https://minecraft.wiki/w/Combat, https://minecraft.wiki/w/Bedrock_Edition_exclusive_features.) Server-decided, invisible as arithmetic.

### Durability and spears

"All items have 1 more durability than they are programmed with" in Bedrock (MCPE-176713, open, https://mojira.dev/MCPE-176713). Spear jab attacks use a use cooldown rather than an attack cooldown, switching to a spear does not trigger it, and Bedrock adds a delay before a charge attack can follow a jab (MCPE-233837). Bedrock plays critical-hit particles on charge attacks that are not crits. Bedrock's spear hit registration is more lenient than Java's, which Java tracks as its own bug (MC-308274, open, https://mojira.dev/MC-308274). (https://minecraft.wiki/w/Combat.)

### Saturation and regeneration

Java has the saturation boost: at full hunger it heals 1 health per 10 ticks by consuming 1.5 saturation. Bedrock does not, which "drastically slows the rate of health regeneration and makes saturation only relevant for lessening the frequency of needing to eat". Mojang resolved MCPE-179223, "Slow health regeneration compared to Java Edition", as Invalid (https://mojira.dev/MCPE-179223), so this is intended. Server-decided; implementing Java's rule is visible and correct, since the client simply draws the health it is told.

## 4. Player movement and physics

This is the category where Axis B is most often desync, because the client runs Bedrock's physics regardless and the server's only lever is correction.

Established above: movement is server-authoritative with rewind since 1.21.70, the client sends `PlayerAuthInputPacket` with its predicted position and its input bits, the server accepts within `player-position-acceptance-threshold` (default 0.5) and otherwise sends `CorrectPlayerMovePredictionPacket`, and `server-authoritative-movement-strict` defaults to false.

The option history, from the wiki's `server.properties` page and the changelogs: `server-authoritative-movement` plus `player-movement-score-threshold`, `player-movement-distance-threshold`, `player-movement-duration-threshold-in-ms` and `correct-player-movement` arrived in 1.13.0; 1.16.100 changed the default "from \"true\" to \"server-auth\" (false is now \"client-auth\")"; 1.16.210 added the `server-auth-with-rewind` value and `server-authoritative-block-breaking`; preview 1.21.50.20 added a `/set_movement_authority server|client` command (https://feedback.minecraft.net/hc/en-us/articles/30892949042189); 1.21.70 removed both the option and the command. The three `player-movement-*-threshold` keys were the old client-authoritative cheat heuristic and the shipped file said of each "Disabled by server-authoritative-movement"; they are gone from the current shipped file.

Mojang's deprecation notice is explicit about the end state: "Once this process is complete and the changes have been in retail for a release, the client authoritative code paths will be deleted [...] Any servers that do not adopt the new protocol will eventually be incompatible with Bedrock." The client-to-server packets it deprecates are Move Actor Absolute (18), Move Player (19), PassengerJump (20), Player Action (36) for some action types, Animate Actor (44) and Player Input (57) (https://mojang.github.io/bedrock-protocol-docs/guides/movement-protocol-deprecation/).

### Constants that differ

| Quantity | Java | Bedrock |
|---|---|---|
| Maximum jump height without Jump Boost | about 1.2522 blocks | about 1.24919 blocks |
| Entity speed ceiling | none documented | 320 m/s, 16 blocks per tick |
| Sprint cancel on wall collision | "sprinting ends immediately upon colliding" | "there is a short window of time in which the player can move away from the solid block in order to continue sprinting" |
| Creative flight friction | "When flying, friction is reduced to a level equivalent to when on ice" | Releasing the movement keys stops the player at once |
| Elytra durability | 432 | 433 |
| Boat hitbox | 1.375 wide, 0.5625 high | 1.4 wide, 0.455 high |
| Boat look arc | 210 degrees | 180 degrees |
| Boat destruction threshold | more than 4 damage | at least 4 damage |
| Donkey and mule speed | up to 14.57 m/s through breeding | fixed 7.38 m/s |
| Block interaction range | 4.5, or 5.2 in Creative | 5 on keyboard, mouse and controller; 6 on touch, 12 on touch in Creative |

Sources: https://minecraft.wiki/w/Player, https://minecraft.wiki/w/Transportation, https://minecraft.wiki/w/Sprinting, https://minecraft.wiki/w/Flying, https://minecraft.wiki/w/Elytra, https://minecraft.wiki/w/Boat, https://minecraft.wiki/w/Interaction_range. Walk speed 4.317 m/s, sprint 5.612 m/s, sprint-jump 7.127 m/s, the swimming speeds, the elytra glide numbers (30.0 m/s level, 33.5 m/s under continuous rocket boost, 78.4 m/s straight down, glide ratio about 10.06 to 1, 1 durability per second) and the kinetic damage formula `10 x (change in horizontal velocity) - 3` carry no edition marker, so the wiki asserts parity for them.

### Sneaking

Both editions now reduce the player hitbox from 1.8 to 1.5 blocks when sneaking and enter the sneaking pose in any space at least 1.5 and under 1.8 blocks tall; Bedrock matched Java in 1.19.70 (https://minecraft.wiki/w/Sneaking). Remaining differences:

- Ledge protection. Java prevents walking off edges where the drop exceeds the `step_height` attribute, default 0.6. Bedrock has no `step_height` attribute on the wire, so the same rule is a fixed client constant.
- Shield blocking is bound to sneak in Bedrock and to the use control in Java.
- Java lets a sneaking player strip or scrape with an axe while holding a shield in the offhand; Bedrock does not have the offhand-any-item case at all.
- Toggle sneak persists through block UI interaction on Bedrock controller and touch and does not on Java (MC-163218).

The sneak pose is decided client-side and confirmed by the server (`StartSneaking` / `StopSneaking` above). Ledge protection is client-side: the client runs the collision step that stops the player.

### Sprinting

The sprint state is a client request. Mojang documents `StartSprinting` as "Set when the player wants to start sprinting, like double tapping forward. Server is expected to respond with SetActorDataPacket with ActorFlags::SPRINTING and an UpdateAttributesPacket to apply the sprint boost." The speed boost therefore arrives as an attribute update, which the client applies to its own movement simulation. A server that implements Java's sprint rules (food threshold, sprint cancellation on collision, sprint-jump exhaustion) changes the attribute the client receives, and the client's own physics still decide the resulting motion. Axis B: desync wherever the two models disagree by more than the acceptance threshold.

### Elytra, swimming, crawling, riptide

All four are request-and-accept bits with bounding-box updates in Mojang's documentation (`StartGliding`/`StopGliding`, `StartSwimming`/`StopSwimming`, `StartCrawling`/`StopCrawling`, `StartSpinAttack`/`StopSpinAttack`). The server can reject a pose, but it cannot start one. Concrete behavior differences:

- Bedrock stops gliding on contact with any vine type as well as ladders, and on touching water; Java does not. Lava does not deactivate Bedrock elytra flight (MCPE-19600, Works As Intended).
- Bedrock lets the player cancel elytra flight with the jump key, and a Bedrock creative or mayfly player can hold jump to climb while gliding and double-tap jump to switch to normal flight.
- Java has a `disableElytraMovementCheck` game rule and Bedrock does not. That rule exists only because Java validates elytra movement server-side with its own heuristic.
- Bedrock's riptide "deals splash damage, except when the trident is thrown from a dispenser".
- Crawling reached Bedrock in the 1.20.10 cycle after the "Short Sneaking and Crawling" experiment, and still differs: "Solid entity collisions can't push players into a crawling position" in Bedrock (MCPE-171878).
- Bedrock lets a player hold jump on a ladder to climb faster, and waterlogged Bedrock ladders cannot be climbed at all (https://minecraft.wiki/w/Ladder).

Sources: https://minecraft.wiki/w/Elytra, https://minecraft.wiki/w/Bedrock_Edition_exclusive_features, https://minecraft.wiki/w/Parity_issue_list.

### Creative flight

Bedrock exclusives: "Letting go any movement keys while flying makes the player stop immediately", "Players crouch when flying down in Creative mode", "Players can 'step upward' while flying", "When touching the ground while flying down in Creative mode, the player will not stop flying", and "Players in Creative mode cannot be killed" against Java, where "The player takes damage from falling into the void, even in Creative mode" (https://minecraft.wiki/w/Bedrock_Edition_exclusive_features, https://minecraft.wiki/w/Java_Edition_exclusive_features). The flight toggle itself is a client request answered by `UpdateAbilitiesPacket`. Creative invulnerability is the one case here that is unambiguously client-side: the Bedrock client refuses to show the player dying in creative, so a server that implements Java's void death in creative produces a desync.

### Block placement and interaction

Bedrock exclusives that change how building feels: "Facing down at an angle allows the player to place off of the front of the block without crouching and pointing their crosshair at it", "Blocks can be placed or broken more quickly in a row by holding the place button", and "Block placing speed matches player movement speed" (https://minecraft.wiki/w/Bedrock_Edition_exclusive_features). All client-side input handling.

### Reach

Java: 5.2 blocks in Creative, 4.5 otherwise, and the `block_interaction_range` and `entity_interaction_range` attributes can change both. Bedrock: 5 blocks on keyboard, mouse or controller; 12 in Creative and 6 in Survival on touch (https://minecraft.wiki/w/Breaking, https://minecraft.wiki/w/Bedrock_Edition_exclusive_features). A server that validates against a single Java reach number rejects legitimate touch players. Mojang's own answer to this is `server-authoritative-block-breaking-range-scalar`, default 1.5, squared and multiplied by the default range.

### Attack direction

Mojang exposes a server-side check with no Java analogue: `player-movement-action-direction-threshold`, default 0.85, "The amount that the player's attack direction and look direction can differ. This can be a value between 0.0 and 1.0. A value of 1.0 means the direction of the player's view and the direction the player is attacking must match exactly, while a value of 0.0 means the two directions can differ by up to 90 degrees." (https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties)

### Entity physics and mounts

The parity list records: "In Java Edition, the movement of a mount is controlled by its passenger, if both the mount and the passenger are mobs (not players). In Bedrock Edition, for most of rideable mobs, when its mob passenger tries to chase and attack player or mobs, the passenger takes control, otherwise the mount controls movement." Most entities have different hitbox sizes in each edition. (https://minecraft.wiki/w/Parity_issue_list.)

Boats share their slipperiness constants (0.9 in air and on water, 0.45 underwater, 0.98 on ice, 0.989 on blue ice, 0.6 elsewhere) and therefore their top speeds (8.0 m/s on water, 40.0 on ice, 72.73 on blue ice, 2.00 on flat land), but the wiki warns that "The torque and thrust values differ between Java and Bedrock edition, as do the linear drag coefficients of various surfaces, which are proportionally scaled to produce the same top speed/max yaw rate between two editions" (https://minecraft.wiki/w/Boat). Same steady state, different transients. Bedrock boats have no air resistance, so a boat launched off a cliff keeps its horizontal speed all the way down. Java boats sink when submerged and Bedrock boats float up. Falling boats stop on top of entities in Java and pass through them in Bedrock.

Minecarts: furnace minecarts and spawner minecarts exist only in Java; Java has a configurable maximum minecart speed and Bedrock does not; and Bedrock-exclusive entries include "Players in minecarts can climb rail and unpowered rail slopes at the lowest speed", "Minecarts don't glide down on unpowered rail slopes", and the Minecart page's note that in Bedrock "an unpowered powered rail slows down a minecart rapidly and can stop minecarts even on slopes". Merged minecart trains are Java-only. Both editions ignore ice for minecarts (MC-8265).

The protocol has an `IsInClientPredictedVehicle` flag, and Mojang's movement guide warns that "when riding a client-predicted vehicle (horse or boat) the predicted position values in the packet are referring to the vehicle not the player" and that "the correction data is also specifying the corrected vehicle data". Horse and boat motion therefore goes through the same prediction-and-correction path as the player's own.

## 5. Inventory, crafting and containers

### Crafting grid

Both editions give a 2x2 grid in the inventory screen, but "Players in Survival and Adventure mode, as well as Creative {{in|bedrock}} and Spectator {{in|java}} (although unable to interact with the GUI), have access to a 2x2 crafting grid from their inventory screen" (https://minecraft.wiki/w/Crafting). Bedrock keeps the grid in creative; Java replaces it with the creative tabs.

Bedrock has fixed recipes that Java does not: "dyes in banner recipes must be specifically placed to achieve the desired pattern{{Only|bedrock}}. No fixed recipes exist in Java Edition, but they can be added by data packs, add-ons, or mods." Bedrock also allows banner customization in the crafting table using "the old banner customization recipes" (https://minecraft.wiki/w/Bedrock_Edition_exclusive_features), and moves leather, leather-horse and wolf armor dyeing out of the crafting grid into a cauldron.

Recipes that exist in only one edition: Bedrock keeps the pre-loom banner recipes in the crafting table (MCPE-184522); Bedrock accepts ink sacs, cocoa beans, lapis lazuli and bone meal as dye substitutes in the grid (MCPE-42473); Bedrock requires a cauldron for leather, leather horse and wolf armor dyeing while Java does it in the grid. Java allows shift-clicking items into the crafting table grid and Bedrock does not (MCPE-82693).

The recipe set itself is a server decision: `CRAFTING_DATA` carries it, and Mojang's R16 note says "CraftingDataPacket - serialize unique values for the new RecipeNetId fields", so the server also owns the identity each recipe is requested by. Axis B for recipe differences is visible and correct, since the client renders whatever recipe list it is given.

### Recipe unlocking and the recipe book

The Bedrock protocol's `UnlockedRecipesPacket` gives the server full control: an initial set on load and deltas afterwards, plus a lock-everything type. Bedrock also exposes the whole system as a world option: "In Bedrock Edition, if recipesUnlock is set to false while creating a world, the player can view all recipes", and `recipesUnlock` and `showRecipeMessages` are Bedrock-only game rules.

The UI diverges. The book is collapsed by default in Java and expanded by default in Bedrock. Java's crafting tabs are search-all, equipment, building, miscellaneous and redstone; Bedrock's are Construction, Equipment, Items, Nature and All, matching the creative tabs. Bedrock's "Craftable" filter "shows all recipes the player has at least one ingredient of", so one iron ingot surfaces pistons and iron doors as well as iron nuggets. Bedrock right-click crafts one and shift-click crafts the maximum, showing a craftable count up to 99; on the wire those are `CraftRecipeAuto` actions. Java groups similar recipes in the book and Bedrock does not. Java's recipe-book click is a single `Place Recipe` packet with a recipe id and a "Make all" boolean, against Bedrock's typed action with a server-issued `RecipeNetId`. (https://minecraft.wiki/w/Recipe_book, https://minecraft.wiki/w/Crafting_Table, https://minecraft.wiki/w/Java_Edition_exclusive_features.)

### Container interaction

Java sends window clicks with a State ID; Bedrock sends typed `ItemStackRequest` actions and receives `ItemStackResponse` with an `ItemStackNetResult`. Section 2 covers the protocol shape. Two further requirements come out of Mojang's R16 document: the server must send `ContainerOpen` for every container screen ("clients depend on this now for all container screens"), and container close is a two-step handshake where the client deletes its manager first, the server deletes its own and replies, and the reply carries a `Server Initiated Close` boolean. Java's `Close Container` is one-way and "The vanilla client disregards the provided window ID and closes any active window."

Behavior differences a player would see:

- Large chest halves. Java maps the top three rows to the western or northern half; Bedrock maps them to whichever half was placed first (https://minecraft.wiki/w/Chest).
- Chest obstruction. "A chest cannot be opened if there is a conductive block above it [...] {{IN|bedrock}}, bottom slabs prevent chests from being opened" where Java allows it.
- Shift-click. Java has "Holding shift and double-clicking while holding an item moves all items of the type clicked on in or out of the chest" and creative middle-click drag (https://minecraft.wiki/w/Java_Edition_exclusive_features, https://minecraft.wiki/w/Inventory). Client UI.
- Stack sizes. "All items can stack up to 99{{Only|JE}} or 127{{Only|BE}} using components{{Only|JE}} or commands" (https://minecraft.wiki/w/Inventory).
- Blocks in the inventory. "The player's inventory can contain blocks, not just items [...] Blocks in the inventory can have block states" is a Bedrock exclusive (https://minecraft.wiki/w/Bedrock_Edition_exclusive_features).
- Locking. Java's `Lock` tag on a chest or hopper, set through `/data`, has no Bedrock equivalent (https://minecraft.wiki/w/Chest, https://minecraft.wiki/w/Hopper).
- Bedrock cartography tables also rename maps, create locator maps and turn paper into maps.
- Loom. "Banner designs are listed in a separate tab on the GUI similar to the Creative inventory instead of inside the inventory tab" in Bedrock.
- Chest placement. Java chests "first try to connect left, then right" when the player is not sneaking and only to the clicked block when sneaking; Bedrock has no sneak-to-separate rule and requires a piston push or a different facing instead.
- Item locking. Bedrock has a Lock in Inventory and a Lock in Slot item component, added in 1.16.100: "This prevents the item from being removed from the player's inventory, dropped, or crafted with" (https://feedback.minecraft.net/hc/en-us/articles/360052592091). Java's closest equivalent is the container `Lock` tag, which is a different mechanism.
- Changing the held item resets mining progress in Java and not in Bedrock (MCPE-19508), which matters for any server-side mining validation.
- Bedrock splits a stack by holding on the item, a touch-first interaction with no Java equivalent, and Bedrock 1.20.30 extended drag-and-drop equipping to add-on equippable slots.
- Individual stack sizes: Bedrock cakes stack to 64 against Java's 1, and Bedrock armor stands stack to 64 against Java's 16.

### Creative inventory

Server-driven through `CREATIVE_CONTENT`: "Sent once by the server on startup to tell clients all of the items that can show up in the creative menu and recipe book", with each group carrying a Creative Category from Construction, Nature, Equipment, Items and ItemCommandOnly. Creative placement is a `CraftCreative` item stack request action keyed by a server-issued `CreativeItemNetId`. Java's creative menu is pure client state, so this is the clearest reversal of the usual direction in the whole note.

The layouts differ: Java has 13 tabs, 14 with Operator Utilities; Bedrock has 5, and Bedrock's creative screen has three buttons to show the creative inventory, the survival inventory, or both, with the survival view keeping its 2x2 grid (https://minecraft.wiki/w/Creative, https://minecraft.wiki/w/Creative_inventory).

The click semantics differ. In Bedrock, "Left-clicking an item takes a full stack rather than one item; shift-clicking sends the entire stack to the inventory". In Java, middle-click copies a stack and middle-click drag fills slots. Java has a destroy-item slot where "Shift + clicking on the button clears the entire inventory, including the hotbar, off-hand slot, and armor slots"; Bedrock has no such slot, but controllers get a clear-hotbar button. Saved creative toolbars are Java-only.

The item lists differ: the wiki counts 106 Java creative-inventory exclusives including the Operator Utilities tab, among them the Luck potions and tipped arrows, spectral arrows, the furnace minecart, Sweeping Edge books, and 46 pre-defined paintings (https://minecraft.wiki/w/Java_Edition_exclusive_features). Bedrock's creative inventory exposes technical blocks Java does not, such as mushroom pore blocks, inverted daylight detectors through pick block, and frosted ice through `/give`.

### Offhand

Java allows any item or block, swaps with the F key, and shows the offhand slot in the HUD. Bedrock's slot is an allowlist: "only a select few items can be placed in the off-hand slot and be dual-wielded. Some are related to combat, like shields, arrows, tipped arrows, firework rockets or a totem of undying, while others are for exploring, like filled maps or explorer maps, and for aesthetics such as sparklers, photos, and nautilus shells. Other items can be placed into the off-hand slot by using the /replaceitem command, but most items are unusable." The list grew one release at a time: totems and arrows in 1.1.0, maps in 1.2.0, sparklers in 1.4.0, nautilus shells in 1.5.0, firework rockets in 1.8.0, shields in 1.10.0, arbitrary items through `/replaceitem` in 1.19.60 (https://minecraft.wiki/w/Dual_wielding).

The mechanism is a per-item data component. Mojang documents `minecraft:allow_off_hand` as a component that "determines whether the item can be placed in the off hand slot of the inventory", requiring "a format version of at least 1.20.30" (https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_allow_off_hand), so an add-on item can opt in, but the vanilla allowlist does not appear in `Mojang/bedrock-samples` behavior-pack item JSON and is engine code. MCPE-23282 is Works As Intended. Everything Java's open offhand enables follows: offhand bows, crossbows, tridents and spears, offhand arrows taking priority over hotbar arrows, offhand food, and offhand blocks for placement. None is reachable on Bedrock.

## 6. Redstone and tick ordering

### The two scheduling models

Java runs one loop. Its documented order for each dimension is world border, weather, daylight, sleeping, scheduled commands, scheduled block ticks, scheduled fluid ticks, raid logic, chunk load levels, then every chunk in random order for mob spawning, ice and snow, and random ticks, then block changes, points of interest, chunk unloads, block events, the dragon fight, non-passenger entities, block entities and game events (https://minecraft.wiki/w/Tick). Block ticks are prioritized: "If a redstone repeater is facing the back or side of another diode, its block tick has a priority of -3. If a redstone repeater is depowering, it has a priority of -2. Otherwise, the repeater has a priority of -1. If a redstone comparator is facing the back or side of another diode, it has a priority of -1. All other block ticks have a priority of 0."

Bedrock runs redstone separately. The wiki's Redstone mechanics page states flatly "In Bedrock Edition, block updates and redstone are not connected" (https://minecraft.wiki/w/Redstone_mechanics), and the Tick page carries a `{{exclusive|bedrock}}` section describing the split: "The redstone system is calculated independently of the main game tick loop. Each redstone tick is split into two deterministic phases: a produce tick (P-tick) and a consume tick (C-tick)." P-ticks run on odd game ticks and are when power and transmission components read input; C-ticks run on even game ticks and are when mechanism components act. Redstone dust is the exception: it "updates its power state on every game tick (20 times per second) which lets it carry 1 game tick long pulses", and "Its visual state only refreshes on P-ticks, meaning if it is only ticked on a C-tick, it will look off, even though it is technically on."

The Bedrock main game loop order itself is undocumented; the wiki's Bedrock subsection under "Game process" is an empty section.

Tick budgets differ: "In Java Edition, the maximum number of scheduled ticks per game tick is 65,536. In Bedrock Edition, the maximum number of scheduled ticks in a chunk per game tick is 100."

Axis A for all of this is server. Axis B for most of it is invisible, because the client renders block states and does not simulate redstone. The exception is the dust rendering quirk, which is a client rendering rule applied to server state.

### Quasi-connectivity

Java and Legacy Console only. The wiki's tutorial page carries `{{exclusive|java|console}}` and describes it as "a property of dispensers, droppers, and pistons that allows them to be activated by anything that would activate the space above them, no matter what is actually in that space", with the note that Mojang recognizes it as working as intended (MC-108). Per-block, the Piston page's quasi-connectivity section is `{{exclusive|java}}`, and the Dispenser and Dropper pages mark it `{{only|java}}`. The parity list places it under dispensers, droppers, pistons and sticky pistons in the Java-only half, citing MCPE-14664 as Works As Intended. (https://minecraft.wiki/w/Tutorial:Quasi-connectivity, https://minecraft.wiki/w/Piston, https://minecraft.wiki/w/Dispenser, https://minecraft.wiki/w/Dropper, https://minecraft.wiki/w/Parity_issue_list.)

### Pistons

| Behavior | Java | Bedrock |
|---|---|---|
| Start delay | 0 or 1 game tick: "0 ticks if powered during the scheduled tick, random tick or block event phase; 1 tick if powered during the entity or block entity phase, or during player input handling" | Fixed 2 game ticks; "Activation occurs only on a consume tick (C-tick)" |
| Polling | Reacts to block updates | "Check if they are powered/can extend every tick (instead of only when receiving a block update)"; "A powered unextended piston immediately extends if it becomes able to rather than waiting for an update" |
| Abort mid-extension | "a piston that is de-powered during the extension process aborts its extension and starts to retract" | "Pistons only extend/retract when the previous action finished" (MCPE-14851 and MC-5726, both Works As Intended) |
| Block dropping | A sticky piston given a short pulse "spits out its block" | Retracts the block instead |
| Block entities | Cannot push or pull block entities | "Blocks that contain block entities (except banners, signs, and campfires) can be moved by pistons"; breaks banners and signs rather than failing to extend; can push and pull bells, lanterns and candles |
| Dust connection | Redstone wire runs next to pistons | Dust connects to the back and side faces of pistons (MCPE-17289, Works As Intended) |
| Attached blocks | Levers and similar break when the piston extends except on the back | "blocks that require a support (such as levers) can be placed on the back or sides of a piston without being destroyed when that piston extends" |

Sources: https://minecraft.wiki/w/Piston, https://minecraft.wiki/w/Sticky_Piston, https://minecraft.wiki/w/Parity_issue_list, https://minecraft.wiki/w/Java_Edition_exclusive_features, https://minecraft.wiki/w/Bedrock_Edition_exclusive_features. Extension and retraction take 2 game ticks in both. A Java-side consequence with a number: "in a chain of pistons each pushing a redstone block to activate the next, successive activations will happen 3 ticks apart."

Bedrock has a compensating exclusive, soft inversion: "When a piston that has a redstone torch attached to it is powered, the redstone torch turns off, and when said piston is depowered, the redstone torch turns back on" (MCPE-17909, Won't Fix), which works through indirect powering and is Bedrock's nearest thing to a block update detector.

### Zero-ticking and block dropping

The wiki's zero-ticking tutorial is `{{exclusive|java|console}}` and is explicitly a bug exploit (MC-8328). Zero-tick plant farms were patched in Java: "The bug was accidentally patched in snapshot 18w06a, and it was officially patched in snapshot 20w12a ahead of release 1.16" (https://minecraft.wiki/w/Tutorial:Zero-ticking). Neither family should be implemented.

### Observers

"In Java Edition, an observer detects shape updates coming from the block it's facing [...] This makes observers differ from block update detectors in terms of what they can detect." "In Bedrock Edition, an observer acts as a block update detector and detects anything that causes a block update", and "it is aligned to redstone ticks and will detect block updates only on odd game ticks also known as P-ticks". The pulse is 2 game ticks of strength 15 in both. Piston interaction differs: in Java, moving an active observer turns it off; in Bedrock a moved observer "always outputs immediately". Java observers also "allow opening chests below and prevent redstone wire placed on it from transmitting a signal downward". (https://minecraft.wiki/w/Observer.)

### Repeaters, comparators, torches, dust

- Repeater delays are 2, 4, 6 and 8 game ticks in both. The scheduling semantics are Java-only: "only one tick can be scheduled at a time, and any attempt to schedule a tick while one already exists is completely ignored", and "instant repeater circuits are possible" in Java (https://minecraft.wiki/w/Redstone_Repeater).
- Comparator delay is 2 game ticks in both and the compare and subtract formulas are identical. Java accepts a block of redstone as a side input; Bedrock does not (MCPE-122611). The wiki lists non-conductive blocks in Bedrock's comparator-conducting set, including dirt path, farmland, chains, pistons, copper grates, chorus plant and chorus flower, but the report it cites for the chain case, MCPE-138549, is resolved as Fixed, so this entry may be stale (https://minecraft.wiki/w/Redstone_Comparator, https://mojira.dev/MCPE-138549).
- Redstone torch burnout triggers at more than eight state changes in 60 game ticks in both. Java "might or might not attempt to turn itself back on after 160 ticks (8 seconds) depending on the update chain that caused it to burn out" (MC-120938); in Bedrock "each redstone torch can only burn itself out". Bedrock torches can be turned off with a one-tick pulse (MC-109737, Works As Intended) (https://minecraft.wiki/w/Redstone_Torch).
- Redstone dust: Java has a dot state reachable by right-clicking, Bedrock does not (MCPE-83955). Bedrock dust connects to piston back and side faces, remains on a piston base after extension and retraction, and transmits power downward through non-conductive blocks where Java does not (MC-3311, Works As Intended). Bedrock power transmission order within a tick is random; Java's is deterministic but locational (MC-11193) (https://minecraft.wiki/w/Redstone_Dust, https://minecraft.wiki/w/Parity_issue_list).
- Redstone lamp: 4 game ticks to turn off in Java, 6 in Bedrock (https://minecraft.wiki/w/Redstone_Lamp).
- Target block: Java emits a block update observers can detect; Bedrock does not (MCPE-84391) (https://minecraft.wiki/w/Target).
- Daylight detector: inverted detectors always output 15 in the Java nether and behave as overworld noon in the Java end; in Bedrock they "never produce a signal under any circumstance" in either (https://minecraft.wiki/w/Daylight_Detector).
- Note block: Java treats a pitch change as a block state change that observers and block update detectors see; Bedrock stores pitch and instrument in block entity data that "updates independently of the main world loop", so neither detects it (MCPE-53919) (https://minecraft.wiki/w/Note_Block).
- Fluids destroy repeaters, comparators, buttons, levers and tripwire hooks in Java only. Bedrock allows comparators and repeaters on walls and fences, and levers on fences, walls and hoppers.

### Hoppers

Transfer cooldown is 8 game ticks in both, for 2.5 items per second, and pushes are processed before pulls in the same game tick. The empty-push case differs: 8 game ticks in Bedrock, 7 in Java. Bedrock hoppers lock only on C-ticks and have an additional 4-redstone-tick collection cooldown. Java pushes items "in a consistent order, the first slot first" (MCPE-28890, Works As Intended) and collects dropped items in the order they landed; Bedrock collects them "in the order in which they entered the chunk". Bedrock hoppers can be moved by pistons; Java hoppers cannot. (https://minecraft.wiki/w/Hopper, https://minecraft.wiki/w/Parity_issue_list.)

### Rails and dispensers

Bedrock powered rails, dispensers and droppers all activate only on C-ticks. Mojang fixed a related Bedrock bug in 1.21.60: "Fixed trigger rate of Redstone powered Droppers and Dispensers (MCPE-189895)" (https://feedback.minecraft.net/hc/en-us/articles/34034576387469). Rail placement orientation differs: "{{in|bedrock}} the new rail orients itself as a straight north-south rail, and {{in|java}} the new rail orients itself in the direction the player is facing" (MCPE-52823), and Bedrock rails "Are broken by flowing water" (MCPE-104825) (https://minecraft.wiki/w/Rail).

### What the client renders

Block state is server state, so a Bedrock client shows whatever power level, piston pose and lamp state the server sends. Three client-owned pieces sit on top: the piston extension animation (Bedrock gave pistons a block entity and smoothed the animation in 1.19.30, MCPE-155987, https://feedback.minecraft.net/hc/en-us/articles/9272494067469), the dust visual refresh that only happens on P-ticks, and note block audio. None of those can be driven to match Java.

## 7. Mobs: spawning, despawning and AI

### Spawn cycle

Java: "Most mobs have a spawning cycle once every game tick [...] but passive mobs have only one spawning cycle every 400 game ticks". "Mobs spawn naturally within chunks that have a player horizontally within 128 blocks of the chunk center, and can only spawn within a 128 block radius sphere centered on the player." Pack spawning makes up to 3 attempts per mob category per eligible chunk, picks a pack center at a random X and Z with Y between the highest block and the minimum vertical limit, and offsets each member by plus or minus 5 on X and Z with a triangular distribution. Pack sizes cap at 8 for wolves, cod and tropical fish, 6 for horses and donkeys, 4 otherwise, with per-mob minimums and maximums listed. (https://minecraft.wiki/w/Mob_spawning.)

Bedrock: "Mob spawning in Bedrock Edition happens within a spherical shell 24-44 blocks away from the player on simulation distance 4. It happens in a quasi-spherical shell 24-128 blocks away from the player, restricted by a simulation distance and/or to roughly 96 blocks horizontally, on simulation distances 6 and higher [...] There is a 11/2000 chance of the mob spawning algorithm attempting to run per chunk, per tick." The 96-block horizontal cap was reported as MCPE-102197 and is now resolved as Fixed (https://mojira.dev/MCPE-102197). Bedrock splits spawns into cluster spawns and structure spawns, where "structure spawns can exceed the monster population cap by 1".

### Mob caps

Java has two caps. The base values are monster 70, creature 10, ambient 15, axolotls 5, underground water creature 5, water creature 5, water ambient 20. "All non-persistent loaded mobs are counted against the global cap [...] The cap is scaled by the total number of chunks within a 17x17 chunk square around any player. The cap is then scaled as `globalCap = mobCap x chunks / 289`." The per-player cap counts non-persistent mobs in chunks whose center is within 128 blocks horizontally of that player.

Bedrock has three. "The global mob cap is set at 200 regardless of difficulty" and covers only environmental spawning. Population control caps "limit how many mobs of each type and category can spawn within a 9 chunk by 9 chunk square region surrounding the chunk in which the spawn attempt is made", split into a surface cap and a cave cap that do not count against each other:

| Category | Overworld surface | Overworld cave | Nether surface | Nether cave | End surface | End cave |
|---|---|---|---|---|---|---|
| Ambient | 0 | 2 | 0 | 0 | 0 | 2 |
| Animal | 4 | 0 | 0 | 4 | 4 | 0 |
| Monster | 8 | 16 | 0 | 16 | 10 | 8 |
| Pillager | 8 | 8 | 0 | 0 | 8 | 8 |
| Water animal | 36 | 0 | 0 | 0 | 36 | 0 |

On top of that sit per-mob density caps: cod 20 surface, creeper 5 surface, dolphin 5, drowned 5 in ocean and 2 in river, ghast 2 cave, phantom 5, pufferfish 3, salmon 10 in ocean and 4 in river, squid 4 in ocean and 2 in river, tropical fish 20 per pattern kind. "Structure-spawned mobs and converted mobs [...] always count toward the cave cap, and monster-spawner-spawned mobs always count toward the surface cap." (https://minecraft.wiki/w/Mob_spawning.)

Axis A: server. Axis B: invisible. The client never sees a cap; it sees the mobs it is sent. Implementing Java's model therefore produces a different world without any visual error, which makes it the single cleanest "parity achievable but not verifiable by looking" case in this note.

### Spawn conditions

Bedrock requires, among other things, that "There must be a block with a full, solid top surface under the spawn location", that "Mobs cannot spawn on transparent full blocks like glass and leaves", that "Most Overworld monsters cannot spawn if the sky light level is greater than or equal to 7 or the block light level is greater than 0", and that "Most Overworld animals cannot spawn if the (combined) light level is less than 7". Java's passive rule is different: "they require a block light level of 9 or higher when the block is not exposed to the sky" (https://minecraft.wiki/w/Light, https://minecraft.wiki/w/Mob_spawning). Bedrock's "most animals can spawn at light level 7 or higher rather than 9 or higher" is called out explicitly as the notable difference.

Other spawn-rule differences: Bedrock monster spawners "spawn mobs within 4 blocks of taxicab distance from a spawner, resulting in a diamond-shaped volume", require light level 7 or higher for some animals, and can only spawn fish when waterlogged (https://minecraft.wiki/w/Bedrock_Edition_exclusive_features). Pillager patrols, cat spawning in villages and nether fortress spawning all work differently per the parity list. Slime chunks do not use the world seed in Bedrock, which [cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md) records from a seed-cracking project rather than from Mojang.

### Despawning

Java: random despawn at 1/800 per tick for mobs with no player within 32 blocks for more than 30 seconds, or 10 seconds for monsters in light over 12, governed by an inactivity counter that increases by 1 per tick plus 2 for light over 12 plus 2 for illagers. Immediate despawn beyond 128 blocks, 64 for fish. All mobs despawn at Y=-128 and below. Persistence comes from riding, structure generation, inventory additions, name tags or `PersistenceRequired`.

Bedrock: "On simulation distances 6 and higher, almost all environmentally spawned mobs immediately despawn when they are either (1) in a chunk at the edge of the simulation distance [...] or (2) more than 128 blocks from the nearest player. On simulation distance 4, mobs immediately despawn when they are more than 44 blocks from the nearest player. Fish despawn at a shorter distance, when they are more than 40 blocks from the nearest player on all simulation distances. Mobs more than 32 blocks from the nearest player have a 1 in 800 chance to despawn on each game tick if they have not taken damage for 30 seconds." Bedrock's persistence list is behavioral rather than tag-based: riding, name tag, tempting with food, breeding, taming, summoning, curing, skeleton trap, leashing, picking up an item, or generating in a structure. A list of entity types always has persistence: ender dragon, item frame, wither, elder guardian, piglin brute, evoker, vindicator, allay, iron golem, snow golem, villager, armor stand, sniffer, ghastling, happy ghast, minecart, painting and shulker. (https://minecraft.wiki/w/Mob_spawning.)

Note the inversion on damage: Java resets its inactivity counter on damage, Bedrock gates the random despawn on not having taken damage for 30 seconds. Both server, both invisible.

### Who runs mob AI

The Bedrock client runs no AI, no pathfinding and no independent physics for mobs. Its only prediction is for the local player and for a vehicle that player is driving. Mojang's protocol documentation settles this in four places.

`SetActorMotionPacket` is documented as "This is used for the server to set the velocity of a client actor", and the packet notes add that "It is primarily relevant for client predicted entities like the player or a boat or horse they are in control of. For most other actor types it does nothing." If the client integrated velocity into a local physics step for mobs, that packet would matter for them.

`MoveActorDeltaPacket` is an interpolation feed. Its fields are `Ticks`, "Expected number of ticks before the next movement update, used for position interpolation duration on the client"; `Force Move`, "Whether the receiver should snap the actor to the new position without interpolation"; and `Force Completion`, "Whether the receiver should complete any in-progress local movement before applying this update". The vocabulary is interpolate and snap, never simulate.

`MotionPredictionHintsPacket` is dead reckoning for bandwidth, not AI: "It is essentially a SetActionMotionPacket with a bool indicating if the actor was on the ground at the time the packet is sent or not", sent "when spatial optimizations are enabled and the server does not send a spatial update". The server-side knob is the `minecraft:conditional_bandwidth_optimization` entity component, present on most vanilla entities, whose `max_dropped_ticks` "determines the maximum ticks spatial update packets can be not sent" and whose `use_motion_prediction_hints` makes the client coast on a supplied velocity during the gap (https://github.com/MicrosoftDocs/minecraft-creator, `minecraftComponent_conditional_bandwidth_optimization.md`).

The rewind list from section 2 is closed and contains no mob movement packet, and `IsInClientPredictedVehicle` is a `PlayerAuthInputPacket::InputData` bit about the vehicle the player is driving, not an actor flag. `AddActorPacket` carries a type, a position, a velocity, rotations, attributes, synched actor data and links, and no goals.

Three consequences for a server. Every mob's AI, pathfinding, targeting, attack timing and physics must run server-side. The `Ticks` value sent with each delta sets how long the client stretches its interpolation, so it is a visual-quality knob, not decoration. And knockback applied to a mob has to be converted into position deltas, because `SetActorMotion` does nothing for it.

Entity model, animation and sound stay client-side. The parity list records a long tail of model differences including "Ghasts use different models between the Java and Bedrock, and some of their tentacles are different lengths" and "In Java, entity shadows are more smoothly rounded than on Bedrock" (MCPE-32662), plus the bow-charging animation that Bedrock skeletons lack (MCPE-16209), the fire tint and particle on burning entities, and glowing eyes on drowned, ghasts, spiders and magma cube cores.

Net: per-mob AI differences are server-decided. Where the outcome is a position, an attack or a drop, implementing Java's behavior is visible and correct. Where the outcome is an animation state the Bedrock model does not have, it is invisible.

### Per-mob differences a player would notice

General entity rules. Java damages crammed entities for 3 health every half second; "Entities do not take entity cramming damage and can be crammed infinitely" in Bedrock (MCPE-83181, Invalid). Java mobs can hold items in the offhand and Bedrock mobs cannot. Java mobs have an 11% chance to spawn left-handed. Java mobs pick up items they happen to walk past while "In Bedrock Edition, they actively search for and walk toward dropped items" (MC-195151). Bedrock mobs have shorter follow ranges because Bedrock expresses them as per-goal `max_dist` values rather than a `follow_range` attribute (MCPE-50207). Bedrock mobs path better over rails and azaleas and worse around lava cauldrons (MCPE-125675). Bedrock villagers and iron golems use a cost-weighted preferred-path system with dirt path and smooth sandstone at cost 0 that Java has no equivalent for. Ravager knockback resistance is 70% in Java and 75% in Bedrock. Equipment drop chance on death is 8.5% in Java and 25% in Bedrock, and "Mobs drop their exact equipment, rather than drawing from the loot table" is Java-only.

Regional difficulty. Java's regional and clamped regional difficulty, derived from chunk inhabited time, world age and moon phase, drives zombie door-breaking, zombie reinforcements, leader zombies, spider status effects, zombie villager conversion rate, villager targeting radius and burning-zombie ignition. Bedrock has no observable equivalent for any of those; it substitutes flat probabilities. Bedrock's zombie behavior file encodes the door-break chance as a fixed 10 against 90 weight at spawn, where Java computes `(10 x clamped regional difficulty)%`. (https://minecraft.wiki/w/Difficulty, `VanillaBehaviorPack/entities/zombie.json` in https://github.com/MicrosoftDocs/minecraft-creator.)

Selected per-mob differences, all from the per-mob wiki pages and Mojang's vanilla behavior pack:

| Mob | Java | Bedrock |
|---|---|---|
| Creeper | Swells within 3 blocks, cancels at 7; explosion 22.5/43/64.5; ignitable with a fire charge; effect explosions leave an area effect cloud; creeper head halves detection; spawns in groups of 4 | `swell` goal `start_distance: 2.5, stop_distance: 6.0`; explosion 14.75/27.5/41.25; none of the three extras; spawns individually with a surface density limit of 5 |
| Zombie | Reinforcements on Hard, leader zombies with 20 to 80 extra health, a 67x21x67 to 111x21x111 damage alert, burning zombies ignite targets, zombie sieges | None of these; babies ride most mobs rather than only chickens; targets the nearest of player, villager or golem rather than preferring the player |
| Skeleton | Strafes, retreats within 4 blocks, sprints from 14 blocks, uses the bow, shoots tipped arrows from the offhand, burns through glass | "Typically stop moving to shoot, making no attempt to avoid being hit"; shoots like a ghast; the page calls the AI "a mix of skeleton AI from Java Edition between versions 1.5 and 1.8.9 and the skeletons in Update Aquatic" |
| Spider | Needs the block above the 3x1x3 spawn space to be non-solid; aggros instantly; can spawn with status effects on Hard; climbs the world border | Spawns under full solid blocks; aggros after a delay; no status effects (MCPE-10240); cannot climb magma blocks |
| Slime | Needs a 3x2.1x3 effective space because the volume is centered on the block's top face; slime chunks follow the world seed | Needs 2x2x2 because the volume is centered on a block's northwest corner; "they are generated at the same coordinates in every world" |
| Ghast | Targets within 64 blocks horizontally and 4 vertically; does not target other mobs; fireballs do not ignite entities; cannot spawn within 16 blocks of another ghast in soul sand valleys | Targets within 28 blocks, 64 after being damaged; retaliates against mobs; fireballs ignite (MCPE-186607); density limit 2 underground |
| Piglin | 6-second bartering examination; babies steal items and drop 5 experience; crossbows break; walks backward when a target closes; Nausea on zombification | 8-second examination (`admire_item duration: 8`); babies drop 1 experience; crossbows never break; attacks during bartering; spawns passive on Peaceful instead of despawning |
| Phantom | Spawns on a 1 to 2 minute timer only at night or in a thunderstorm above Y=62 with sky access, 20 to 34 blocks above the player; `spawn_phantoms` game rule; damage 2/2/3; swoops every 8 to 12 seconds | Spawns through ordinary monster spawning at light 7 or less with a density limit of 5, in a 21x15x21 cube 28 blocks above the player, so it can spawn in daytime; `doInsomnia` game rule; damage 4/6/9; swoops every 10 to 20 seconds |
| Guardian | Natural spawning with a 95% failure rate for sky-exposed water below sea level | Structure spawns in "25 pre-determined spawning columns" whose rate is unaffected by removing the monument |
| Elder guardian | Mining Fatigue III to every survival player within 50 blocks once a minute, with a particle image | Summons an `elder_guardian_ghost` entity that applies the effect on contact (MCPE-60692) |
| Wither | 300 health on every difficulty; regenerates 1 per second and 5 per kill; main head fires every 2 seconds; wither armor at half health; breaks a 3x4x3 area when damaged | 300, 450 or 600 health by difficulty (MCPE-127978, Invalid); no regeneration; fires three black and one blue skull per position; crashes into the ground at half health, spawns wither skeletons and gains a block-breaking dash; explodes on spawn, at half health and on death; blue skulls can be deflected |
| Ender dragon | Circles down to the perch; charges without needing line of sight; the dragon egg appears only on the first kill | Dives from the pillars; needs line of sight within 150 blocks; the egg appears on the first and second kill; `/kill` plays the death animation in place |
| Warden | Adds 35 anger on contact; `spawn_wardens` game rule; prioritizes redstone vibrations over players; pushed by explosions | Adds 80 anger; no game rule; cannot path through fire or soul fire (MCPE-169919); Thorns damages its sonic boom |
| Iron golem | Summoned by 3 panicking or 5 gossiping villagers; hostile at -15 village popularity or -100 villager reputation; cannot attack targets 2.75 blocks above | Spawns with a village, or with 20 beds and 10 villagers in a 17x13x17 volume; hostile at once if a player attacks a villager nearby; reach 3 blocks; moves at full speed unprovoked |
| Snow golem | Leaves a snow trail in any biome; a sheared golem can only be re-pumpkined by command | No trail in hot biomes; spawns naturally when a pumpkin generates on two snow blocks; its snowballs knock players back and can ignite mobs after passing through fire |
| Witch | Targets within 16 blocks; drinks healing potions; joins patrols; cannot open doors; 85% magic resistance; 8.5% potion drop | Targets within 10 blocks, 64 after being attacked; attacks golems and other witches unprovoked; immune to its own splash effects; 95% magic resistance; 25% potion drop |
| Shulker | Duplicates when hit by any shulker bullet; immune to fire and lava; drops 0 to 1 shell with Looting scaling 6.25% per level; alerts others in a 32x20x32 box | Also duplicates on death by bullet; takes fire damage with a 15-second lava grace period; drops 0 to 4 with Looting III |
| Pillager | Sees enemies up to 32 blocks; alerts others at any distance when attacked; crossbow can break; walks slowly when not provoked; unlimited outpost spawns | Sees 16 blocks; alerts within 10; has a melee attack used underwater; always moves at provoked speed; at most eight spawn per outpost, on the northwest corner of the highest opaque block |
| Patrols | 1 to 5 scaled by regional difficulty, block light under 9, `spawn_patrols` game rule, other illagers can join near a captain | 2 to 5, any light level, `/mobevent pillager_patrols_event`, 24 to 48 blocks from the player |
| Endermite | Spawns at the thrower's original position; hostile to anything that attacks another endermite | Spawns at the pearl's landing site; not hostile to other endermites' attackers; attacks endermen and iron golems |
| Wolf | 3/4/6 wild damage, sits on taming, 5-minute breeding cooldown, teleports to a hurt owner, pack-alerts on team | 2/3/4.5, does not sit (MCPE-137119), 1-minute cooldown, neither extra |
| Cat | Village spawn checks a random player every 1200 ticks at 8 to 32 blocks; 70% gift chance per cat; hisses at phantoms | Fills a quota of 1 cat per 4 beds up to 5, in a 17x13x17 volume; only one cat gifts; 25% kitten rate; 50% black on a full moon |
| Fox | 15% eggs, 20% feathers, 8.5% drop rate, 1 to 2 experience, drops and picks up items while asleep | 20% eggs, 15% feathers, 100% drop rate, 1 to 3 experience, defends its trusted player against any attacker including other players |
| Drowned | Spawns individually below Y=58 in oceans, passive by day, ranged 5/8/12, 8.5% trident drop, seeks turtle eggs within 24 blocks | Spawns 2 to 4 in oceans with density caps of 5 ocean and 2 river, neutral by day, has a 3-block trident melee, flat 8 ranged, 25% trident drop, 10-block egg range |

Mojang continues to close these one at a time in the "Vanilla Parity" sections of Bedrock changelogs. Recent examples: "Endermen can now pick up all block types they are able to in Java Edition" and "Fixed Endermen placing blocks in locations or states where they normally shouldn't (MCPE-162613)" (preview 1.21.100.21, https://feedback.minecraft.net/hc/en-us/articles/37453175894669); "Zoglin and Zombified Piglin are no longer faster when chasing the player in the Bedrock version" and "Piglins and Hoglins naturally spawned in Bastion Remnants will now drop XP when killed (MCPE-166103)" (preview 1.21.90.21, https://feedback.minecraft.net/hc/en-us/articles/36203344176269); "Baby Drowneds now move with the same speed as their Zombie and Zombie Villager counterparts (MCPE-34574)", "Gold Swords dropped by Piglins and Zombified Piglins now have randomized durability to match Java (MCPE-75292)" and "Neutral Mobs no longer become aggressive when Players or other Mobs throw Lingering Potions with positive effects on them (MCPE-105343)" (preview 1.21.60.21, https://feedback.minecraft.net/hc/en-us/articles/31998389834637).

### Monster spawners

Java attempts spawns "within a 4-block horizontal and 1-block vertical range; that is, in a 9x3x9 volume centered on the monster spawner"; Bedrock uses "4 blocks taxicab distance", a diamond cross-section. The crowding check is a 9x9x9 volume centered on the spawner in Java and a 16x10x16 volume centered on its lower northwest corner in Bedrock. The 16-block activation radius, the 4 spawn attempts and the 200 to 799 tick delay are the same. Java spawners can produce chicken jockeys and raid captains and can be customized by command; Bedrock's cannot be customized in the base game, but its skeleton spawners can produce strays, and Bedrock applies light conditions to some animals and not others. (https://minecraft.wiki/w/Monster_Spawner.)

## 8. Villagers, trading, raids and breeding

### Reputation

Java has per-villager gossip with five types and published numbers: `trading` gain 4, decay 2, sharing cost 20, maximum 25, multiplier 1; `major_positive` from curing gain 20, decay 0, sharing cost 100, maximum 20, multiplier 5; `minor_positive` gain 25, decay 1, cost 5, maximum 25, multiplier 1; `minor_negative` from attacking gain 25, decay 20, cost 20, maximum 200, multiplier -1; `major_negative` from killing a nearby villager gain 25, decay 10, cost 10, maximum 100, multiplier -5. Gossip decays every 20 minutes.

Bedrock has village popularity instead: "In Bedrock Edition, villagers increase their prices of trades if a player's popularity is low [...] and decrease it if their popularity is high. Curing a zombie villager also increases the player's popularity by 10. In Java Edition, a villager's prices are affected by the player's reputation with that villager rather than by village popularity." And the asymmetry matters: "In Bedrock Edition negative reputation can only cancel out positive reputation and other price discounts but not increase the price." Attacking and killing villagers generate negative gossip in Java only (the `{{only|java}}` markers on the attacking and killing rows). (https://minecraft.wiki/w/Villager.)

### Iron golems

Java: "villagers can summon an iron golem to protect themselves [...] This requires either a villager panicking in a group of 3 villagers or 5 gossiping villagers. If they don't find an iron golem within 16 blocks of their location for 30 seconds, another one is summoned."

Bedrock: "villagers can summon an iron golem if there are more than 10 villagers per existing golem, the village has at least 20 beds, and 75% of these villagers must have worked in the past day." Bedrock iron golems also "only spawn in chunks directly loaded by the player" (MCPE-226025, open, https://mojira.dev/MCPE-226025). (https://minecraft.wiki/w/Villager.)

### Breeding

Willingness is shared: 12 nutrition points, 3 bread or 12 carrots, potatoes or beetroots, and a 5-minute cooldown after breeding. The surrounding model differs: "In Java Edition, two villagers nearby one another periodically enter mating mode if both have enough food and are not on cooldown. Breeding fails (with angry villager particles displayed) if no unclaimed bed can be reached via pathfinding within a 48-block radius. The appearance of the child is randomly determined by either the biome type of the parents or by the biome where the breeding occurred." "In Bedrock Edition, a census is periodically taken to determine the current population of the village [...] The appearance is determined by the biome where the breeding occurs." Bed requirements scope to "village bounds{{only|je}} / loaded terrain{{only|be}}". Baby villagers become adults 20 minutes after birth in both.

Animal growth differs in a way that is exploitable: "In Java Edition feeding baby animals reduces the time remaining until they grow up by 10%. In Bedrock Edition feeding baby animals reduces the total amount of time until they grow up by 10%, meaning feeding a baby animal 10 times in a row will cause them to immediately become an adult." (https://minecraft.wiki/w/Parity_issue_list.)

### Trading

The structural difference is grouping: "Bedrock trade groups are based on the specific trade slot. Java trade groups are based on the villager level. This affects the chances of trades that are chosen. For example, Bedrock farmers always sell bread, while Java farmers have a 40% chance to sell bread (20% per slot, 2 slots)." The parity list then enumerates per-profession differences, including the butcher's coal trade giving 2 villager XP in Java and 10 in Bedrock, the leatherworker's journeyman dyed tunic trade giving 1 XP in Java and 10 in Bedrock, the weaponsmith's enchanted iron sword having price multiplier 0.05 and 1 XP in Java against 0.2 and 5 XP in Bedrock, and the bell trade being apprentice in Java and journeyman in Bedrock with 5 against 10 XP. Fletchers can sell Arrows of Decay in Bedrock and Arrows of Slow Falling in Java.

Explorer maps differ fundamentally: "In Java Edition, each cartographer sells its own unique explorer map that points to a different location than other cartographers [...] In Bedrock Edition, a cartographer sells explorer maps that point to the nearest unexplored location, regardless of whether it has been previously mapped by another cartographer."

Wandering traders have Bedrock-only grouping that "prevents items of similar types from being offered more than once per trader", with all dyes, all seeds, both mushrooms, all coral blocks and all saplings grouped. (https://minecraft.wiki/w/Parity_issue_list.)

### Raids

Trigger. Java: "any subchunk containing a POI (a bed, job site, or bell) claimed by a villager counts as a village. When a player with Bad Omen enters a 3x3x3 subchunk region around a village, the effect transforms into Raid Omen that disappears after 30 seconds". Bedrock: "when a player with Bad Omen enters a 64x23x64 region around a village center (technically 1.12 blocks below the center)". The Java raid center is "the average position of all claimed POIs within 64 block radius of the player"; the Java boss bar is visible up to 96 blocks and represents total remaining raider health, while Bedrock's is visible in a 128x88x128 region and represents the number of remaining mobs.

Wave difficulty source. Bedrock exclusive: "The number of waves and illager spawning depends on the difficulty rather than the level of Bad Omen" (https://minecraft.wiki/w/Bedrock_Edition_exclusive_features), and "Different mobs spawn in different waves in raids" (parity list).

Spawn search. Java makes 480 location checks across a 300-tick cooldown, requires generated entity-ticking chunks outside any village within 96 vertical blocks on a valid spawn block, and falls back to 6 groups of 20 locations. Bedrock spawns within a 128x32x128 region around the village center, accepts "any block except leaves and scaffolding [...] with enough space on top", including redstone components, fences and beds, at any light level, and if the attempt fails "the wave is immediately declared over and the game moves on to the next wave".

Loot. "In Java Edition, villagers give the player extra loot (gifts) after the raid, while in Bedrock Edition, the illagers drop extra loot when killed." Java raid captains drop an ominous banner; Bedrock pillagers and vindicators roll an additional table of emeralds, enchanted books and iron gear with a 65% chance on Easy and Normal and 80% on Hard.

Hero of the Village. Bedrock's "Amplifier is always I, regardless of waves defeated in raids", it is "Stored per saved village, and considered as AoE buff", and it "Is not removed from drinking milk, using a Totem of Undying, or dying". Java gives gifts from villagers and raises popularity by 10; Bedrock does neither. (https://minecraft.wiki/w/Raid, https://minecraft.wiki/w/Villager, https://minecraft.wiki/w/Bedrock_Edition_exclusive_features.)

All of section 8 is server-decided. Axis B is invisible or visible-and-correct throughout, with two exceptions: the boss bar semantics (Java's health bar against Bedrock's mob count) are rendered by the client from the value the server sends, so a Java-style bar is representable only as a number the client labels its own way, and Bedrock's Hero of the Village and Raid Omen pop-up animations are client assets with no Java counterpart.

## 9. Blocks, light and tick behavior

### Light

The Bedrock client computes all of it. The protocol has no light packet, and neither `LevelChunkPacket` nor `SubChunkPacket` carries sky-light or block-light arrays (`packages/protocol/src/packet/LevelChunkPacket.ts`, `packages/protocol/src/packet/SubChunkPacket.ts`, `packages/protocol/src/PacketIdentifier.ts`). Java ships both arrays in its chunk packet plus a dedicated light-update packet. A Bedrock server must still maintain an internal light model, because spawning, crop growth, ice and snow formation and daylight detectors depend on it, but it cannot correct what the player sees.

The propagation models differ.

- Java has one filtering rule: light-filtering blocks "decrease sky light by 1 level (but do not affect block light)", for water, transparent waterlogged blocks, bubble columns, ice, frosted ice, cobweb, leaves, slime blocks, honey blocks, spawners, lava, beacons, end gateways, chorus plant, chorus flower and shulker boxes.
- Bedrock has per-block integers that affect both light types, expressed in behavior-pack data as `minecraft:light_dampening`, "The amount that light will be dampened when it passes through the block, in a range of 0-15". The wiki's table gives beacon 14; anvil, hopper, brewing stand, cauldron, ice and frosted ice 3; leaves 2; water, cobweb, powder snow and non-double slabs 1 (https://minecraft.wiki/w/Light). Mojang's component documentation says "Leaves use 1, water uses 2" (https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/Reference/Content/BlockReference/Examples/BlockComponents/minecraftBlock_light_dampening.md). The water half of that disagreement is Mojang changing the number under the wiki: preview 1.21.120.24 says "We've updated how light is absorbed by water in Bedrock Edition. Instead of reducing light by 2 units per block, water now reduces light by only 1 unit. With this change, fewer Drowned will spawn in shallow water or rivers" (https://feedback.minecraft.net/hc/en-us/articles/40008177570061). That is still experimental at the time of writing, so water costs 2 on current stable Bedrock and 1 on Java. The leaves disagreement is unresolved.
- Java has directional opacity: "the shapes of some blocks are detected: pistons, daylight detectors, enchanting tables, farmland, lecterns, stonecutters, dirt paths, snow, end portal frames, slabs and stairs, so that the light passing through them can spread only in specific directions". Bedrock's model is a single 0-15 scalar per block with no direction, and as a result "Slabs, stairs, and farmland do not block light" (https://minecraft.wiki/w/Bedrock_Edition_exclusive_features).
- Water: "In Bedrock Edition, every block of water reduces light by 1 extra level [...] In Java Edition, water does not cause any additional decrease for block light, but diffuses sky light, causing the light to fade with depth" (https://minecraft.wiki/w/Water).

The internal-versus-client distinction also swaps for two block families: "All plants and mushrooms in the chart are affected in Bedrock Edition by internal light instead of client light. Mycelium in Bedrock Edition is affected by client light instead of internal light." Internal sky light at full sky light is 15 at clear noon, 12 in rain or snow, 10 in a thunderstorm, and 4 at midnight, and "During thunderstorms, hostile mobs are allowed to spawn as if the internal sky light level were actually 5" (https://minecraft.wiki/w/Light).

Axis A for light is mixed: the opacity and emission values come from the server's block data and the Bedrock client applies them, and the propagation itself is client. Axis B for Java's directional opacity is visible and broken: the server can compute Java's light for spawning purposes, but the client will keep rendering the Bedrock result, and the player sees a dark room full of torches that still spawns mobs, or the reverse.

### Random ticks and fire

Random tick speed defaults to 3 in Java and 1 in Bedrock, and the game rule names differ (`random_tick_speed` against `randomtickspeed`). The semantics differ too: in Java the value "is specified by gamerule random_tick_speed (defaults to 3), and one block can be chosen multiple times in one chunk tick"; in Bedrock "it also depends on randomTickSpeed (defaults to 1), but it specifies only relative speed instead of the exact number" (https://minecraft.wiki/w/Tick). Bedrock 1 is therefore not "one third of Java 3", and the mapping is undocumented.

Fire: "In Java Edition, fire behavior is controlled by scheduled ticks and is not affected by gamerule random_tick_speed. The interval between one fire update and the next ranges from 30 game ticks to 40 game ticks." "In Bedrock Edition, fire behavior is controlled by random ticks and is affected by gamerule randomTickSpeed." (https://minecraft.wiki/w/Fire.)

### Per-block differences that change play

| Block | Java | Bedrock |
|---|---|---|
| Leaves | Decay at distance over 6, driven by the `prevents_nearby_leaf_decay` tag; state changes propagate in 1 game tick | Decay at distance over 4, hardcoded block list |
| Saplings | Logs, wood, stripped variants and leaves above do not stop growth | "log and wood blocks are treated like other block types and stop the sapling from growing if they are above it" |
| Crops | Break (uproot) on the next block update when light is insufficient, and cannot be planted in the dark | "crops don't break and can always be planted due to a bug" (MCPE-36863, open) |
| Crop growth rate | Baseline | Melons, pumpkins and sugar cane "grow more slowly than in Java Edition" (MCPE-91021, open); magnitude unpublished. The general crop claim cites MCPE-158309, which Mojang resolved as Cannot Reproduce |
| Farmland | Mobs under 0.512 cubic blocks cannot trample it; blocks light partially | Trampled by all mobs; does not block light; "Does not dehydrate when growing plants"; supports torches, levers and similar on its sides |
| Cauldron | 3 water levels; separate `water_cauldron`, `lava_cauldron`, `powder_snow_cauldron` blocks; water color follows biome | 6 levels; one `cauldron` block with state; fixed water color; holds potions and dyed water; fills from water above; is a block entity |
| Chest | Opens under bottom slabs; halves map to west or north; cannot be pushed by pistons; supports a `Lock` tag | Bottom slabs block opening; halves map by placement order; pistons can push chests |
| Bed | Usable from 3 blocks; no support block required | Usable from 2 blocks; requires a solid, non-transparent block below; is a block entity; explosions can be disabled with `respawnBlocksExplode`; on Peaceful, sleeping fully restores health |
| Honey block | Baseline | Transfers redstone power; lower jump height; entities slide much less; moves entities touching its sides; fences, panes, walls and iron bars connect to it |
| Waterlogging | A fixed set of blocks | "Almost every non-full block can be waterlogged"; some waterloggable blocks can exist inside flowing water |
| Item frame | An entity, broken instantly | A block, with a breaking time and waterlogging |
| Snow | Flat layers | Affected by gravity, stacks into random patches, melts gradually in snowless biomes, generates on packed and blue ice, removable with a shovel |
| Sponge | Baseline | A wet sponge in a dry overworld biome dries out by itself after a few minutes |
| Dragon egg | One per world | "Two dragon eggs spawn per world instead of one" |
| Lectern | Signal strength per page | "Because Bedrock Edition displays two pages of the book at once, the same signal strength increments require double the number of pages" |
| Lightning rod | 64-block radius | 128-block radius |
| Composter | Chance from a number provider | Chance from `composting_chance`; grass blocks compostable; entities inside are pushed up |
| Sculk catalyst | Baseline | Larger detection range for mob deaths |

Sources: https://minecraft.wiki/w/Leaves, https://minecraft.wiki/w/Sapling, https://minecraft.wiki/w/Light, https://minecraft.wiki/w/Farmland, https://minecraft.wiki/w/Cauldron, https://minecraft.wiki/w/Chest, https://minecraft.wiki/w/Bed, https://minecraft.wiki/w/Parity_issue_list, https://minecraft.wiki/w/Bedrock_Edition_exclusive_features, https://minecraft.wiki/w/Java_Edition_exclusive_features.

### Block states and conductivity

"In Bedrock Edition, there are also aux values (also known as Metadata) to define a block [...] However, aux values are intended to be deprecated, and newly added blocks or block states no longer support aux values." "In Java Edition, there are also fluid states, that further define a fluid as to how it behaves." A Bedrock block state is also called a block permutation (https://minecraft.wiki/w/Block_states). Redstone conductivity is data in Bedrock through the `minecraft:redstone_conductivity` block component with `allows_wire_to_step_down` (default true) and `redstone_conductor` (default false) (https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/Reference/Content/BlockReference/Examples/BlockComponents/minecraftBlock_redstone_conductivity.md), and Mojang retunes the vanilla values toward Java: 1.21.30 brought mangrove roots, beacons, TNT and sea lanterns into Java parity for redstone power (https://feedback.minecraft.net/hc/en-us/articles/30220110283533).

### Hitboxes

The parity list's 64-row hitbox and collision table is the authoritative inventory of where the two editions disagree about block shape. Representative entries: anvil hitbox and collision both differ (MCPE-59921); bed both differ (MCPE-60829); cauldron both differ, and the Bedrock hitbox does not go inside the cauldron (MCPE-59923); "Piston (body): Is a full block" (MCPE-83258); "Sea pickles have no collision in Bedrock Edition" (MCPE-59925); fences, glass panes, iron bars and walls all have corner hitboxes that "don't follow direction" (MCPE-59920, open, https://mojira.dev/MCPE-59920); stairs, hoppers, scaffolding, sculk shriekers and piston heads "have a full block outline selection". `VoxelShapesPacket` narrows this for collision at protocol 2193; outline selection remains a client rendering decision.

## 10. World, dimensions and chunk ticking

### Build and damage limits

| Limit | Java | Bedrock |
|---|---|---|
| Overworld build range | -64 to 320, set by `min_y` and `height` in the dimension type; `min_y` can go to -2032 and the maximum to 2031 | -64 to 320, extendable to plus or minus 512 only in void worlds through behavior packs |
| Nether build range | 0 to 256, so the bedrock roof at Y=127 is buildable above | 0 to 128, so the roof is the ceiling |
| End build range | 0 to 256 | 0 to 256 (the World boundary page says 128, which contradicts the Altitude page and the End dimension type's `height: 256`; unresolved) |
| Void damage | 4 health every 10 ticks at 64 blocks or more below the minimum build height, so Y=-128 in the overworld | 4 health every half second below Y=-82 overworld, Y=-18 nether and end |
| Hard floor | None below the build limit | Invisible bedrock at Y=-105 overworld, Y=-41 nether and end, which "prevents all entities from falling further down" |
| Horizontal | World border at plus or minus 29,999,984; hard wall at plus or minus 30,000,000 | No hard boundary; `/tp` capped at plus or minus 30,000,000 |
| Despawn floor | All mobs despawn at Y=-128 and below | Same |

Sources: https://minecraft.wiki/w/World_boundary, https://minecraft.wiki/w/Altitude, https://minecraft.wiki/w/The_End, https://learn.microsoft.com/en-us/minecraft/creator/documents/datadrivenoverworldheight.

The nether height difference is the one that matters most for gameplay. Bedrock's build limit of 128 removes the entire nether roof as buildable space, so any Java design that lives above Y=128 in the nether has nowhere to go. Axis A: server, for what the server will let a player place. Axis B: visible and broken if the server allows placement above 128, because the Bedrock client's own limit check rejects it and the player sees a warning ("Attempting to place blocks below the minimum height limit shows warning messages" is a Bedrock exclusive, and the same check applies at the top).

### Chunk ticking

Java ticks chunks at the entity-ticking load level, which is mostly the simulation distance, and requires a player within 8 chunks for mob spawning and lightning. Since 25w06a "All fully-loaded chunks now receive random ticks, regardless of if a player is within an 8-chunk distance or not." Bedrock ticks "all chunks inside simulation distance (or specified in the /tickingarea command)". Simulation distance ranges differ: Bedrock multiplayer takes an integer from 4 to 12 with 4 as the default, Java an integer from 3 to 32 with 10 as the default. (https://minecraft.wiki/w/Tick, https://minecraft.wiki/w/Simulation_distance.)

Bedrock's `/tickingarea` and Java's `/forceload` are not equivalent. Ticking areas are capped: "Up to ten ticking areas, each containing up to 100 chunks, can exist at one time in a world." They do not enable mob spawning on their own, "as all forms of mob spawning attempts are done in a radius centered on a player", with zombified piglin portal spawning as the exception. They suspend effects that cross into inactive chunks: "An entity (mob, minecart, arrow, etc.) that attempts to move into an outside chunk becomes suspended as soon as it leaves the ticking area. It remains visible but motionless." (https://minecraft.wiki/w/Ticking_area.)

Java has a portal chunk-loading behavior Bedrock lacks, marked `{{Exclusive|Java}}`: "Whenever an entity is teleported through a Nether portal, the chunk at the linked portal gets load ticked with load level of 30 [...] These chunks remain loaded for 15 seconds but this timer gets refreshed each time the entity passes through the portal", which is the basis of Java portal chunk loaders (https://minecraft.wiki/w/Nether_Portal).

### Terrain generation on the client

Mojang's default pushes distant terrain generation to the client: `client-side-chunk-generation-enabled`, "Default: true. If true, the server will inform clients that they have the ability to generate visual level chunks outside of player interaction distances", with `server-build-radius-ratio`, "Default: Disabled. If 'Disabled' the server will dynamically calculate how much of the player's view it will generate, assigning the rest to the client to build" (https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties). The repository's Bedrock Dedicated Server extraction confirms `client-side-chunk-generation-enabled=true` in the shipped `server.properties` ([bedrock-data-extraction.md](bedrock-data-extraction.md), section 2).

This matters for the parity claim: with the flag on, the client draws distant terrain from its own generator and the world seed. A server whose world generation differs from vanilla Bedrock's will show the player one terrain at distance and a different one up close. The flag is off-switchable, so this is a configuration decision rather than a hard wall, at the cost of the server generating and sending every visible chunk.

### Nether portals

Coordinate scaling is 1:8 horizontally in both, with the Y axis unscaled. The search region differs: "In Java Edition, the point of interest can be within a 256x256 square block area (128-block radius) in the Overworld and a 32x32 square block area (16-block radius) in the Nether (MC-197538, Works As Intended) centered on the converted coordinate and the full map height. In Bedrock Edition, the point of interest can be within a 256x256 square block area (128-block radius) in both the Overworld and Nether."

Other differences: "The incoming entity can be almost any entity except withers and the ender dragon in Java Edition or only be a player in Bedrock Edition" for portal creation. Bedrock flanks a forced portal's obsidian with netherrack on each side, "which is the only renewable source of netherrack". Java rotates entity yaw and velocity 90 degrees when the destination portal is perpendicular, marked `{{only|je}}`. Transportation with passengers through a portal is `{{only|je}}`, and "In Bedrock Edition, a parrot on the player's shoulder prevents the player from going through the portal" (MCPE-27950). Zombified piglins spawn on the portal's bottom frame in Java and in adjacent squares in Bedrock. Java's portal teleport delay is configurable through `playersNetherPortalDefaultDelay` and `playersNetherPortalCreativeDelay`. (https://minecraft.wiki/w/Nether_Portal.)

Cross-dimension portal behavior inverts: "Nether portal blocks in the End teleport players to the Nether in Java and the Overworld in Bedrock. In Bedrock, End portal blocks in the Nether teleport players to the End." (https://minecraft.wiki/w/Parity_issue_list.)

### The End

Bedrock exclusives: end portal blocks "Reduce fall damage" and "Allow withers to teleport", the end sky turns white under Night Vision, and two dragon eggs spawn per world. The wiki also records "Placement of small end islands is different" in Bedrock without a Mojang source ([cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md), section 1). All 20 end gateways on the main island generate at Y=75 in both (https://minecraft.wiki/w/Altitude).

## 11. Items, enchanting, potions and anvils

### Anvils

The combine cost formula differs in a way that changes gear progression: "For Java Edition, add the final level of the enchantment on the resulting item multiplied by the multiplier [...] For Bedrock Edition, add the difference between the final level and the initial level on the target item multiplied by the multiplier." The wiki's worked example: a sword with Sharpness III, Knockback II and Looting III combined with a sword with Sharpness III and Looting III costs "16 in Java and 1 in Bedrock" (https://minecraft.wiki/w/Anvil_mechanics).

Three smaller divergences. Java adds one level for every incompatible enchantment on the target and Bedrock adds none. Impaling's anvil multiplier is 4 for an item and 2 for a book in Java, and 2 and 1 in Bedrock; every other enchantment's multipliers match. Java caps a rename-only operation at 39 levels and Bedrock does not, so a high-prior-work Bedrock item becomes unrenameable in Survival. Renaming has a 50-character limit in Java and 30 in Bedrock (MCPE-127906, Won't Fix, https://mojira.dev/MCPE-127906).

Shared: the 39-level "Too Expensive" ceiling on all operations, unit repair at 25% of maximum durability per material unit for 1 level, combining two items for the sacrifice's durability plus 12% at 2 levels, a 1-level rename, the `2n+1` prior-work penalty growth, grindstone behavior, and crafting-grid repair wiping enchantments and the name. Java extras: incompatible enchantments allowed in Creative, and renaming a bucket of fish, axolotl or tadpole renames the mob inside. Bedrock extras: anvils add map locators and clone and expand maps.

### Enchantments

Sweeping Edge is the only enchantment that exists in one edition and not the other, and the maximum level of every enchantment is the same in both. There is no max-level divergence to implement.

Bedrock's enchanting table offers things Java's does not, because Bedrock classes them as primary rather than anvil-only: Sharpness, Smite and Bane of Arthropods on axes, Fire Aspect, Knockback and Looting on axes, Thorns on helmets, leggings, boots and turtle shells where Java's table only offers it on a chestplate, and Silk Touch and Efficiency on shears. Bedrock also adds raid-spawned mob drops as an obtaining route for essentially every enchantment, including Mending, Frost Walker, Infinity and Soul Speed; Java has no equivalent source. Java allows any enchantment on any item through a Creative anvil and Bedrock does not (MCPE-142596). (https://minecraft.wiki/w/Enchantment, https://minecraft.wiki/w/Anvil_mechanics, https://minecraft.wiki/w/Thorns.)

Enchantability values and the enchanting-table cost formula carry no edition marker, so the wiki asserts parity for both. Behavior differences: Bedrock's Fire Aspect ignites TNT, unlit candles and campfires and is not blockable by a shield; Bedrock Multishot arrows from one shot can all hit the same entity while Java's invulnerability frames let only one land; Bedrock Piercing V and above passes through hit entities instead of sticking; Bedrock Channeling hits entities inside blocks or vehicles; Bedrock Impaling applies to any mob or player in water or rain; Bedrock Riptide deals splash damage. Thorns damages the warden's sonic boom in Bedrock (MCPE-170546) and not in Java (MC-250157, Works As Intended).

### Effects and potions

Edition-exclusive effects. Java only: Luck, Bad Luck, Glowing, and Dolphin's Grace as a visible effect ("This speed boost is applied without an effect in Bedrock Edition"). Bedrock only: Fatal Poison, given to a parrot fed a cookie, which "Can hurt and kill both undead and non-undead mobs similar to Wither effect" with damage classified as magic. The internal identifiers also differ for three effects: Java's `binding_curse`, `vanishing_curse` and `hero_of_the_village` are Bedrock's `binding`, `vanishing` and `village_hero`.

Edition-exclusive potions. Java only: the potion of Luck, which "cannot be brewed, and can be obtained only by commands", plus the uncraftable potion family. Bedrock only: the potion of Decay (Wither I for 40 seconds, found in swamp hut cauldrons) and the long mundane potion.

Brewing. "Brewing recipes in Bedrock Edition are a superset of that in Java Edition." Bedrock extras: Weakness from Mundane and Thick bases, fermented spider eye on Strength giving Weakness where Java gives nothing, and Healing II or Poison II corrupting into Harming I.

Durations that differ: extended Regeneration and extended Poison are 1:30 in Java and 2:00 in Bedrock, Poison II is 21.6 seconds against 22.5, enchanted golden apple Regeneration II is 20 seconds against 30, and Bedrock splash potions run shorter than Java's with extended splash Regeneration and Poison outright wrong (MCPE-180936, MCPE-180950). Suspicious stew effect durations differ broadly (MCPE-52351). Instant Health and Instant Damage are numerically identical, `2 x 2^level` healed and `3 x 2^level` dealt, but witch magic resistance is 85% in Java and 95% in Bedrock. Regeneration on undead always registers as level I in Bedrock.

Mechanics that differ: Bedrock destroys a weaker effect when a stronger one is applied to a non-player entity where Java hides and restores it (MCPE-74059, with the wiki marking the Bedrock behavior `{{until|BE 26.60}}`); Bedrock's Saturation status effect does not restore saturation points (MCPE-52353); Bedrock Absorption lingers after the hearts are gone (MCPE-180762); Bedrock Haste sets mining speed to `(1 + 0.2n) x 1.2^n` with no attack-speed term, which makes Haste I stronger for mining than Java's flat 20% per level (MCPE-161227, marked `{{until|be 26.70}}`); Bedrock Levitation works underwater; Bedrock Water Breathing allows waterlogged beds and prevents suffocation inside blocks.

Totems of Undying give the same Regeneration II for 45 seconds, Fire Resistance for 40 and Absorption II for 5 in both, but Java's Regeneration heals 36 health and Bedrock's 32, and Bedrock grants no invulnerability window after activation so a player can be killed immediately after popping one (MCPE-225818).

Tipped arrows carry 1/8 of the potion duration in both. Java has the Arrow of Splashing, the four no-effect tipped arrows, the Arrow of Luck and spectral arrows; Bedrock has the Arrow of Decay and tips arrows from a cauldron, up to 64 from a full one. Spectral arrows and the Glowing effect they apply do not exist in Bedrock (MCPE-36852, Works As Intended).

Sources: https://minecraft.wiki/w/Effect, https://minecraft.wiki/w/Potion, https://minecraft.wiki/w/Brewing, https://minecraft.wiki/w/Tipped_Arrow, https://minecraft.wiki/w/Totem_of_Undying, https://minecraft.wiki/w/Haste, https://minecraft.wiki/w/Parity_issue_list.

### Food, hunger and saturation

Java's saturation boost is the single biggest survivability difference. "Saturation boost heals 1 by consuming 1.5 saturation, and activates every 0.5 seconds (10 ticks) when at full hunger. While the saturation mechanic as a whole is in both Bedrock Edition and Java Edition, saturation boost is only in Java Edition" (https://minecraft.wiki/w/Food). Mojang resolved MCPE-179223 as Invalid, so Bedrock's slower regeneration is intended. The slow path is shared: 1 health per 80 ticks when hunger is at least 18 or saturation is above zero, at 6.0 exhaustion per health point.

Other differences: Bedrock allows any food at full hunger on Peaceful and Java restricts it to chorus fruit, golden apples, enchanted golden apples, honey bottles and suspicious stew; dried kelp saturation is 0.6 in Java and 0.2 in Bedrock; sweet berry saturation is 0.4 in Java and 1.2 in Bedrock. Mojang retuned hunger toward Java in 1.18.30: "Tweaked hunger depletion rate to better match Java Edition (MCPE-56031)", "Players can now properly lose hunger when sprinting or swimming", "Players lose significantly less hunger when jumping", "Exhaustion rates can now be tweaked in Behavior Packs" (https://feedback.minecraft.net/hc/en-us/articles/5520890863245).

### Durability and misc items

Nearly every Bedrock item has one more durability point than its Java counterpart (MCPE-176713, open), and Bedrock loses durability on hits absorbed by invulnerability frames where Java does not (MCPE-157150, open). Two items diverge by more than one: the fishing rod is 64 in Java and 385 in Bedrock, and the brush is 64 against 65, which is why "a single unenchanted brush can get 5 armadillo scutes from an armadillo instead of 4". Bow durability is 384 against 385 and trident 250 against 251.

Java bone meal has a 5% chance to drop from any fish. Java's knowledge book and debug stick have no Bedrock equivalent. Smelting cacti yields 2 experience in Java and 0.2 in Bedrock (MC-210211). "Some blocks and items provide different amounts of furnace fuel in each edition." Lily pads are treasure loot when fishing in Bedrock and junk loot in Java. Enchanted books are Rare in Java and Common in Bedrock (MCPE-184791). Bedrock spawns experience orbs only after the death animation finishes where Java spawns them with the loot. (https://minecraft.wiki/w/Java_Edition_exclusive_features, https://minecraft.wiki/w/Parity_issue_list, https://minecraft.wiki/w/Bedrock_Edition_exclusive_features, https://minecraft.wiki/w/Experience.)

### Difficulty

On Hard, "Zombies and zombified piglins{{only|je}} can break through wooden and copper doors", Java spiders can spawn with an infinite-duration beneficial effect, and "In Bedrock, if the world type isn't infinite, pillagers deal 4 damage, instead of 5". On Peaceful, Bedrock piglins, piglin brutes and hoglins remain and go passive where Java's despawn or freeze mid-zombification, and Bedrock phantoms do not fully despawn (MCPE-55270). Creative mode players are invulnerable in Bedrock and can die to the void, `/kill`, `/damage` and instant health with amplifier 29 in Java. (https://minecraft.wiki/w/Difficulty, https://minecraft.wiki/w/Creative.)

## 12. Features that exist in one edition only

This section is a list, not an analysis. Everything here is a case where "implement the Java behavior" has no target on the other side.

### In Java, not in Bedrock

Gameplay systems: the 1.9 combat system as a whole (attack cooldown, per-weapon attack speeds, axes out-damaging swords), sweep attacks and Sweeping Edge, the saturation boost, the attribute system as a named registry of 41 attributes with modifiers, data-driven damage types, advancements, statistics, the recipe book's grouped recipes, the knowledge book, the debug stick, spectator-mode entity possession and `/spectate`, death messages broadcast to all players, the "You Died!" screen, quasi-connectivity, zero-ticking, sticky-piston block dropping, instant repeaters, the `Lock` tag on containers, `/forceload`, portal chunk loading, directional block opacity, any-item offhand, creative void death, the `sweep_attack` and `damage_indicator` particles, the Luck, Bad Luck and Dolphin's Grace effects, the potion of Luck, spectral arrows, the furnace minecart, 46 pre-defined paintings, and the Illusioner and Giant mobs.

Mechanic details: zombie reinforcements on Hard, Halloween pumpkin-wearing undead, "Newly generated chunks have a chance to generate an initial set of mobs", armor stands with 20 health that can be dispenser-placed and take Thorns damage, blazes sinking in water and lava, boats sinking when submerged, cats giving gifts at 70%, creepers ignitable with a fire charge and leaving an area effect cloud when they explode with an effect, dolphins granting Dolphin's Grace and being lured by dropped items, and the farmland small-mob trampling exemption.

### In Bedrock, not in Java

Gameplay systems: achievements tracked across the whole game, add-ons and behavior packs as a supported content system, the Character Creator, emotes, player permissions and `permissions.json`, `/tickingarea`, spawn events, the education feature set, ticking-area suspension semantics, the P-tick and C-tick redstone phases, soft inversion, client-side chunk generation, the Vibrant Visuals renderer, touch and controller input modes with their own reach values, the `allow`, `deny`, `border` and invisible bedrock blocks, colored and underwater torches, hardened glass, chemistry blocks and items, Fatal Poison, the Elder Guardian Ghost, the Sulfur Cube, the Camel Husk and the Parched.

Mechanic details: waterlogging nearly every non-full block, snowlogging, blocks with block states in the inventory, pistons moving block entities, cauldrons holding potions and dyed water and six levels, dyeing armor in a cauldron rather than a crafting grid, banner crafting in a crafting table, fixed banner recipes, gravity-affected snow layers, self-drying sponges, two dragon eggs per world, the 128-block lightning rod radius, the Bedrock-only raid loot table, difficulty-driven raid wave counts, per-slot trade grouping, explorer maps that always point at the nearest unexplored structure, the global 200 mob cap with surface and cave categories, and per-mob density caps.

For a complete list, the wiki maintains https://minecraft.wiki/w/Java_Edition_exclusive_features, https://minecraft.wiki/w/Bedrock_Edition_exclusive_features and https://minecraft.wiki/w/Parity_issue_list, of which the last is the longest at about 4000 lines of wikitext.

## 13. Classification table

One row per difference. Axis A is Server, Client or Mixed as defined in section 1. Axis B is Invisible, Correct (visible and correct), Broken (visible and broken) or Desync. The source column names the section above that carries the quote and URL, plus a bug key or option name where one pins the claim.

278 rows. By Axis A: 213 Server, 44 Client, 21 Mixed. By Axis B: 102 Invisible, 94 Correct, 56 Broken, 26 Desync. The 186 rows that are Server and either Invisible or Correct are the ones a parity claim can cover; section 14 explains what to do with the other 92. By area: 60 mobs, 47 combat, 40 redstone, 27 movement, 27 items, 22 blocks, 17 inventory, 14 world, 8 villagers, 6 raids, 5 light, 5 structural.

| # | Area | Java behavior vs Bedrock behavior | Axis A | Axis B | Source |
|---|---|---|---|---|---|
| 1 | Combat | Attack cooldown scales damage by time since the last swing; Bedrock has none | Server | Broken | 3, `attack_speed` |
| 2 | Combat | Per-weapon attack speeds 0.6 to 4.0; Bedrock has no attack speed | Server | Broken | 3 |
| 3 | Combat | Axes out-damage swords; Bedrock axes are one below the same-tier sword | Server | Broken | 3 |
| 4 | Combat | Weapon damage is the tooltip value; Bedrock adds the 1-point bare hand | Server | Broken | 3, MCPE-152713 |
| 5 | Combat | Hoes deal 1; Bedrock hoes match the same-tier pickaxe | Server | Broken | 3 |
| 6 | Combat | Critical hits multiply before enchantments; Bedrock multiplies after | Server | Invisible | 3 |
| 7 | Combat | Critical hits need 84.8% cooldown charge; Bedrock has no gate | Server | Broken | 3 |
| 8 | Combat | Critical hits and sprint-knockback are exclusive; Bedrock stacks them | Server | Invisible | 3 |
| 9 | Combat | Sweep attacks hit surrounding entities; Bedrock has none | Server | Broken | 3, `sweep_attack` |
| 10 | Combat | Sweeping Edge raises sweep damage to 50/67/75%; Bedrock lacks the enchantment | Server | Broken | 3, `EnchantType` |
| 11 | Combat | Shields activate on the use control; Bedrock activates on sneak | Client | Broken | 3, MCPE-43599 |
| 12 | Combat | Shields do not auto-raise in a vehicle; Bedrock always raises | Client | Broken | 3, MCPE-41212 |
| 13 | Combat | Blocking deals no knockback to the attacker; Bedrock does | Server | Invisible | 3 |
| 14 | Combat | Knockback enchantment is nullified by a shield; Bedrock applies it | Server | Invisible | 3 |
| 15 | Combat | Shields raise at any time; Bedrock locks out after an attack | Mixed | Desync | 3 |
| 16 | Combat | Attacking does not lower the shield; in Bedrock it does | Client | Broken | 3 |
| 17 | Combat | A disabled shield grants 10 ticks of knockback immunity; Bedrock grants none | Server | Desync | 3, MC-268147 |
| 18 | Combat | Shields block all explosions; Bedrock lets player-lit and redstone TNT through | Server | Invisible | 3 |
| 19 | Combat | Any item in the offhand; Bedrock allows six item kinds | Client | Broken | 5, MCPE-23282 |
| 20 | Combat | Airborne targets take no extra vertical knockback; Bedrock adds it | Server | Desync | 3 |
| 21 | Combat | Snowballs and eggs do not knock players back; in Bedrock they do | Server | Desync | 3, MC-3179 |
| 22 | Combat | Blast Protection reduces explosion knockback; Bedrock's does not | Server | Desync | 3, MCPE-97054 |
| 23 | Combat | Knockback moves armor stands; Bedrock's does not | Server | Correct | 3 |
| 24 | Combat | No durability loss on hits absorbed by invulnerability; Bedrock loses it | Server | Invisible | 3, MCPE-157150 |
| 25 | Combat | Sharpness adds 1 then 0.5 per level; Bedrock adds 1.25 per level floored | Server | Invisible | 3 |
| 26 | Combat | Smite and Bane of Arthropods are unrounded; Bedrock floors them | Server | Invisible | 3 |
| 27 | Combat | Impaling hits aquatic mobs; Bedrock hits anything wet | Server | Correct | 11, MCPE-34025 |
| 28 | Combat | Crossbows roll 7 to 11 damage; Bedrock deals a flat 9 | Server | Invisible | 3 |
| 29 | Combat | Holding use recharges a crossbow; Bedrock needs a new press | Client | Broken | 3, MCPE-25778 |
| 30 | Combat | No crossbow fire or recharge delay; Bedrock adds several ticks each way | Client | Broken | 3, MCPE-239075 |
| 31 | Combat | Crossbow firework rockets explode on impact; Bedrock's slide | Server | Correct | 3, MCPE-52675 |
| 32 | Combat | Projectiles inherit the shooter's velocity; Bedrock's do not | Server | Correct | 3 |
| 33 | Combat | Projectiles launch on the firing tick; Bedrock launches several ticks late | Mixed | Desync | 3, MCPE-174685 |
| 34 | Combat | Only one Multishot arrow lands per target; all of Bedrock's can | Server | Invisible | 11 |
| 35 | Combat | A thrown trident hits one entity; Bedrock's hits many after a bounce | Server | Correct | 3, MCPE-60933 |
| 36 | Combat | Thrown tridents despawn after 60 seconds; Bedrock's never do | Server | Correct | 3 |
| 37 | Combat | Loyalty returns straight from an entity hit; Bedrock needs a block bounce | Server | Correct | 3, MCPE-51726 |
| 38 | Combat | Riptide costs 2 durability; Bedrock costs 1 | Server | Invisible | 3 |
| 39 | Combat | Drowned drop a trident 8.5% of the time and never melee with it; Bedrock 25% and melees | Server | Correct | 3 |
| 40 | Combat | Strength and Weakness are flat modifiers; Bedrock uses a recurrence | Server | Invisible | 3 |
| 41 | Combat | Per-mob damage per difficulty differs for about a dozen mobs | Server | Invisible | 3 |
| 42 | Combat | Hoglins and zoglins fling targets upward; Bedrock's do not | Server | Correct | 3, MCPE-74465 |
| 43 | Combat | Saturation boost heals 1 per 10 ticks at full hunger; Bedrock has none | Server | Correct | 3, MCPE-179223 |
| 44 | Combat | Attack sound marks cooldown charge; Bedrock's marks hit versus whiff | Client | Broken | 3, MCPE-28266 |
| 45 | Combat | Sprint-knockback has a unique sound; Bedrock has none | Client | Broken | 3 |
| 46 | Combat | Spear hit registration is strict; Bedrock's is lenient | Mixed | Desync | 3, MC-308274 |
| 47 | Combat | A charge attack can follow a jab at once; Bedrock delays it | Client | Broken | 3, MCPE-233837 |
| 48 | Movement | Maximum jump is 1.2522 blocks; Bedrock's is 1.24919 | Server | Desync | 4 |
| 49 | Movement | No documented speed ceiling; Bedrock caps at 320 m/s | Server | Desync | 4 |
| 50 | Movement | Sprint ends on wall collision at once; Bedrock has a grace window | Mixed | Desync | 4 |
| 51 | Movement | Sneak ledge protection follows `step_height`; Bedrock has no such attribute | Client | Desync | 4 |
| 52 | Movement | Server can set a pose directly; Bedrock poses are client requests the server accepts | Client | Broken | 2 |
| 53 | Movement | Creative flight has ice-like friction; Bedrock stops dead | Client | Desync | 4 |
| 54 | Movement | No step-up while flying; Bedrock steps up | Client | Desync | 4 |
| 55 | Movement | Creative players die to the void; Bedrock creative players cannot die | Client | Desync | 4 |
| 56 | Movement | No jump-to-cancel gliding; Bedrock cancels on jump | Client | Broken | 4 |
| 57 | Movement | Gliding survives vines and water contact; Bedrock stops | Server | Desync | 4 |
| 58 | Movement | Lava deactivates gliding; in Bedrock it does not | Server | Desync | 4, MCPE-19600 |
| 59 | Movement | Elytra durability 432; Bedrock 433 | Server | Invisible | 4 |
| 60 | Movement | `disableElytraMovementCheck` game rule exists; Bedrock has none | Server | Invisible | 4 |
| 61 | Movement | Ladder climb speed is fixed; Bedrock speeds it with held jump | Mixed | Desync | 4 |
| 62 | Movement | Waterlogged ladders are climbable; Bedrock's are not | Server | Desync | 4 |
| 63 | Movement | Reach is 4.5 or 5.2; Bedrock is 5, 6 or 12 by input device | Client | Broken | 2, 4 |
| 64 | Movement | No attack-direction check; Bedrock has `player-movement-action-direction-threshold` 0.85 | Server | Invisible | 2 |
| 65 | Movement | Boat hitbox 1.375 by 0.5625; Bedrock 1.4 by 0.455 | Mixed | Desync | 4 |
| 66 | Movement | Boats sink when submerged; Bedrock's float up | Server | Desync | 4 |
| 67 | Movement | Boats have air resistance; Bedrock's do not | Mixed | Desync | 4 |
| 68 | Movement | Boat look arc 210 degrees; Bedrock 180 | Client | Broken | 4 |
| 69 | Movement | Falling boats stop on entities; Bedrock's pass through | Server | Correct | 4 |
| 70 | Movement | Minecart maximum speed is configurable; Bedrock's is not | Server | Invisible | 4 |
| 71 | Movement | Furnace and spawner minecarts exist; Bedrock has neither | Server | Broken | 12 |
| 72 | Movement | A mob passenger always steers its mount; Bedrock switches by intent | Server | Correct | 4 |
| 73 | Movement | Block placement rate is fixed; Bedrock scales it with player speed | Client | Broken | 2, 4 |
| 74 | Movement | Auto-jump is ground-only; Bedrock auto-jumps underwater | Client | Desync | 4 |
| 75 | Inventory | No crafting grid in creative; Bedrock keeps the 2x2 | Client | Broken | 5 |
| 76 | Inventory | No fixed recipes; Bedrock banner recipes are position-fixed | Server | Correct | 5 |
| 77 | Inventory | Recipe book groups similar recipes; Bedrock does not | Client | Invisible | 5 |
| 78 | Inventory | Recipe unlocking is mandatory; Bedrock has `recipesUnlock` | Server | Correct | 5 |
| 79 | Inventory | The craftable filter needs all ingredients; Bedrock needs one | Client | Invisible | 5 |
| 80 | Inventory | Shift-click into the crafting grid works; in Bedrock it does not | Client | Broken | 5, MCPE-82693 |
| 81 | Inventory | Large chest rows map to west or north; Bedrock maps by placement order | Server | Correct | 5, 9 |
| 82 | Inventory | Chests open under a bottom slab; Bedrock chests do not | Server | Correct | 9 |
| 83 | Inventory | Containers support a `Lock` tag; Bedrock locks per item instead | Server | Invisible | 5 |
| 84 | Inventory | Forced stack ceiling 99; Bedrock 127 | Mixed | Broken | 5 |
| 85 | Inventory | Inventories hold items only; Bedrock holds blocks with states | Server | Invisible | 5, MCPE-71123 |
| 86 | Inventory | The creative menu is client state; Bedrock's comes from the server | Server | Correct | 2, 5 |
| 87 | Inventory | Creative middle-click copies a stack; Bedrock left-click takes the stack | Client | Broken | 5 |
| 88 | Inventory | A destroy-item slot clears the inventory; Bedrock has none | Client | Broken | 5 |
| 89 | Inventory | Creative toolbars can be saved; Bedrock cannot | Client | Broken | 5 |
| 90 | Inventory | Cakes stack to 1 and armor stands to 16; Bedrock stacks both to 64 | Mixed | Broken | 5 |
| 91 | Inventory | Switching the held item resets mining progress; in Bedrock it does not | Client | Invisible | 9, MCPE-19508 |
| 92 | Redstone | Quasi-connectivity powers pistons, dispensers and droppers; Bedrock has none | Server | Invisible | 6, MCPE-14664 |
| 93 | Redstone | Redstone rides block updates; in Bedrock the two are decoupled | Server | Invisible | 6 |
| 94 | Redstone | Scheduled block ticks are prioritized -3 to 0; Bedrock has no priorities | Server | Invisible | 6 |
| 95 | Redstone | 65,536 scheduled ticks per game tick globally; Bedrock 100 per chunk | Server | Invisible | 6 |
| 96 | Redstone | One tick phase; Bedrock splits produce and consume ticks over odd and even ticks | Server | Invisible | 6 |
| 97 | Redstone | Dust renders its live state; Bedrock dust refreshes only on produce ticks | Mixed | Invisible | 6 |
| 98 | Redstone | Piston start delay 0 or 1 tick by phase; Bedrock a fixed 2 | Server | Correct | 6 |
| 99 | Redstone | Pistons react to block updates; Bedrock pistons poll every tick | Server | Correct | 6 |
| 100 | Redstone | A depowered piston aborts mid-extension; Bedrock finishes first | Server | Correct | 6, MCPE-14851 |
| 101 | Redstone | A short pulse makes a sticky piston drop its block; Bedrock retracts | Server | Correct | 6, MC-5726 |
| 102 | Redstone | Pistons cannot move block entities; Bedrock pistons can | Server | Correct | 6, MC-164 |
| 103 | Redstone | Dust runs past pistons; Bedrock dust connects to their back and sides | Server | Correct | 6, MCPE-17289 |
| 104 | Redstone | No soft inversion; Bedrock torches on powered pistons flip | Server | Invisible | 6, MCPE-17909 |
| 105 | Redstone | Zero-tick pulses work; Bedrock has none | Server | Correct | 6, MC-8328 |
| 106 | Redstone | Observers detect shape updates; Bedrock observers are block update detectors | Server | Invisible | 6 |
| 107 | Redstone | Observers sample every tick; Bedrock samples on produce ticks | Server | Invisible | 6 |
| 108 | Redstone | A moved active observer turns off; Bedrock's outputs at once | Server | Correct | 6 |
| 109 | Redstone | Observers allow chests below and block downward dust; Bedrock's do not | Server | Invisible | 6 |
| 110 | Redstone | Repeater scheduling allows one pending tick; Bedrock has no equivalent | Server | Invisible | 6 |
| 111 | Redstone | Instant repeater circuits work; Bedrock has none | Server | Invisible | 6 |
| 112 | Redstone | Comparators take a redstone block as side input; Bedrock's do not | Server | Invisible | 6, MCPE-122611 |
| 113 | Redstone | Comparator conduction follows conductivity; the wiki says Bedrock adds chains, farmland and more, but MCPE-138549 is Fixed | Server | Invisible | 6, MCPE-138549 |
| 114 | Redstone | Torch burnout recovery depends on the update chain; Bedrock torches self-burn only | Server | Invisible | 6, MC-120938 |
| 115 | Redstone | A torch ignores a one-tick pulse; Bedrock torches switch off | Server | Invisible | 6, MC-109737 |
| 116 | Redstone | Dust has a dot state; Bedrock dust is always a cross | Server | Broken | 6, MCPE-83955 |
| 117 | Redstone | Non-conductors do not pass power downward; in Bedrock they do | Server | Invisible | 6, MC-3311 |
| 118 | Redstone | Dust propagation is deterministic but locational; Bedrock's order is random | Server | Invisible | 6, MC-11193 |
| 119 | Redstone | Redstone lamps take 4 ticks to turn off; Bedrock 6 | Server | Correct | 6 |
| 120 | Redstone | Target blocks emit an observable update; Bedrock's do not | Server | Invisible | 6, MCPE-84391 |
| 121 | Redstone | Note block pitch change is a block state change; Bedrock stores it in block entity data | Mixed | Invisible | 6, MCPE-53919 |
| 122 | Redstone | Inverted daylight detectors output 15 in the nether; Bedrock outputs 0 | Server | Correct | 6 |
| 123 | Redstone | Fluids destroy repeaters, buttons and levers; Bedrock's survive | Server | Correct | 6 |
| 124 | Redstone | Repeaters and comparators need a full support; Bedrock allows walls and fences | Server | Correct | 6 |
| 125 | Redstone | Hopper empty-push cooldown is 7 ticks; Bedrock 8 | Server | Invisible | 6 |
| 126 | Redstone | Hoppers push first slot first and collect by landing order; Bedrock collects by chunk entry order | Server | Invisible | 6, MCPE-28890 |
| 127 | Redstone | Hoppers cannot be moved by pistons; Bedrock's can | Server | Correct | 6 |
| 128 | Redstone | Dispensers, droppers and powered rails fire any tick; Bedrock only on consume ticks | Server | Invisible | 6, MCPE-189895 |
| 129 | Redstone | A placed rail faces the player; Bedrock places it north to south | Server | Correct | 6, MCPE-52823 |
| 130 | Redstone | Flowing water does not break rails; in Bedrock it does | Server | Correct | 6, MCPE-104825 |
| 131 | Redstone | Piston animation is driven by block state; Bedrock interpolates from a block entity | Client | Invisible | 6, MCPE-155987 |
| 132 | Light | The server sends sky and block light arrays; Bedrock sends none | Client | Broken | 9 |
| 133 | Light | Pistons, slabs, stairs and nine other blocks have directional opacity; Bedrock has a scalar | Client | Broken | 9 |
| 134 | Light | Filtering blocks cost 1 sky light; Bedrock has per-block 0 to 15 values for both light types | Mixed | Broken | 9, `light_dampening` |
| 135 | Light | Water diffuses sky light with depth; Bedrock subtracts 1 extra per block from both | Client | Broken | 9 |
| 136 | Light | Plants follow client light and mycelium internal light; Bedrock swaps both | Server | Invisible | 9 |
| 137 | Blocks | Random tick speed defaults to 3 and is a block count; Bedrock defaults to 1 and is a relative multiplier | Server | Invisible | 9 |
| 138 | Blocks | Fire runs on scheduled ticks every 30 to 40; Bedrock runs on random ticks | Server | Invisible | 9 |
| 139 | Blocks | Leaves decay past distance 6 from a tag; Bedrock past 4 from a hardcoded list | Server | Correct | 9 |
| 140 | Blocks | Leaf distance state propagates in 1 game tick; Bedrock has no equivalent | Server | Invisible | 9 |
| 141 | Blocks | Logs above a sapling do not block growth; in Bedrock they do | Server | Correct | 9, MCPE-93524 |
| 142 | Blocks | Crops uproot in low light and cannot be planted there; Bedrock's never break | Server | Correct | 9, MCPE-36863 |
| 143 | Blocks | Melons, pumpkins and sugar cane grow at the base rate; Bedrock grows slower | Server | Invisible | 9, MCPE-91021 |
| 144 | Blocks | Mobs under 0.512 cubic blocks cannot trample farmland; in Bedrock all can | Server | Correct | 9 |
| 145 | Blocks | Cauldrons hold 3 levels across three block ids; Bedrock holds 6 in one block with state | Mixed | Broken | 9 |
| 146 | Blocks | Beds are usable from 3 blocks; Bedrock from 2 | Client | Broken | 9 |
| 147 | Blocks | Beds need no support block; Bedrock needs a solid opaque one | Server | Correct | 9 |
| 148 | Blocks | Bed explosions are unconditional; Bedrock has `respawnBlocksExplode` | Server | Invisible | 9 |
| 149 | Blocks | Honey blocks do not conduct redstone; Bedrock's do | Server | Invisible | 9, MCPE-59451 |
| 150 | Blocks | A fixed set of blocks is waterloggable; Bedrock waterlogs nearly every non-full block | Server | Correct | 9, MC-125351 |
| 151 | Blocks | Item frames are entities broken instantly; Bedrock item frames are blocks | Server | Broken | 9 |
| 152 | Blocks | Snow layers are flat and static; Bedrock snow falls, stacks randomly and melts gradually | Server | Correct | 9 |
| 153 | Blocks | Wet sponges stay wet; Bedrock sponges dry out in dry biomes | Server | Correct | 9 |
| 154 | Blocks | Break speed uses `+20% per haste level`; Bedrock multiplies by `1.2^level` as well | Mixed | Desync | 2, 9 |
| 155 | Blocks | Instamining thresholds follow Java's formula; Bedrock reaches them at lower levels | Mixed | Desync | 9 |
| 156 | Blocks | 64 blocks have a different hitbox or collision box between editions | Mixed | Broken | 2, 9, MCPE-59920 |
| 157 | Blocks | Stairs, hoppers and scaffolding have shaped outlines; Bedrock draws a full-block outline | Client | Invisible | 9, MCPE-59928 |
| 158 | Blocks | Chests drop oak plank particles; Bedrock drops chest particles | Client | Invisible | 9, MC-2614 |
| 159 | Mobs | Global cap scales by loaded chunks plus a per-player cap; Bedrock uses 200 plus surface and cave caps over 9x9 chunks | Server | Invisible | 7 |
| 160 | Mobs | Spawn attempts run per chunk per tick within 128 blocks; Bedrock uses a 24 to 44 or 24 to 128 shell at 11/2000 per chunk per tick | Server | Invisible | 7 |
| 161 | Mobs | Passive mobs need block light 9; Bedrock needs combined light 7 and daytime | Server | Invisible | 7, 9 |
| 162 | Mobs | Spawn surfaces follow Java's block rules; Bedrock requires a full solid top and rejects transparent blocks | Server | Invisible | 7 |
| 163 | Mobs | Despawn at 128 blocks or randomly after 30 seconds beyond 32; Bedrock adds a simulation-distance edge rule and a 44-block rule at distance 4 | Server | Invisible | 7 |
| 164 | Mobs | Persistence comes from tags and structures; Bedrock derives it from interactions plus an always-persistent type list | Server | Invisible | 7 |
| 165 | Mobs | Spawners use a 4x1x4 box; Bedrock uses a 4-block taxicab diamond | Server | Correct | 7 |
| 166 | Mobs | New chunks can generate an initial mob set; Bedrock does not | Server | Invisible | 12 |
| 167 | Mobs | Entity models and animations are Java's; the Bedrock client ships its own | Client | Invisible | 7 |
| 168 | Mobs | Entity hitbox sizes differ for most mobs | Mixed | Broken | 4, 7 |
| 169 | Villagers | Per-villager gossip with five weighted types; Bedrock uses village popularity | Server | Invisible | 8 |
| 170 | Villagers | Negative reputation raises prices; in Bedrock it only cancels discounts | Server | Correct | 8 |
| 171 | Villagers | Golems need 3 panicking or 5 gossiping villagers; Bedrock needs 10 villagers per golem, 20 beds and 75% worked | Server | Invisible | 8 |
| 172 | Villagers | Breeding pairs enter mating mode individually; Bedrock runs a village census | Server | Invisible | 8 |
| 173 | Villagers | Feeding a baby cuts 10% of remaining growth time; Bedrock cuts 10% of total | Server | Correct | 8 |
| 174 | Villagers | Trade groups are per villager level; Bedrock's are per trade slot | Server | Correct | 8 |
| 175 | Villagers | Per-profession trade experience and price multipliers differ in about a dozen places | Server | Correct | 8 |
| 176 | Villagers | Each cartographer sells its own map; Bedrock sells the nearest unexplored one | Server | Correct | 8 |
| 177 | Raids | Raid triggers on a 3x3x3 subchunk region; Bedrock on a 64x23x64 box | Server | Invisible | 8 |
| 178 | Raids | Wave count follows the Bad Omen level; Bedrock follows difficulty | Server | Invisible | 8 |
| 179 | Raids | The boss bar shows total raider health; Bedrock shows a mob count | Mixed | Broken | 8 |
| 180 | Raids | 480 spawn location checks over 300 ticks; Bedrock takes one attempt and skips the wave on failure | Server | Invisible | 8 |
| 181 | Raids | Villagers gift the player after a raid; Bedrock raiders drop extra loot | Server | Correct | 8 |
| 182 | Raids | Hero of the Village scales with waves and is removable; Bedrock is always I, per village and permanent | Server | Correct | 8 |
| 183 | World | Nether build limit 256; Bedrock 128 | Mixed | Broken | 10 |
| 184 | World | Void damage 64 blocks below the minimum build height; Bedrock at Y=-82 overworld | Server | Correct | 10 |
| 185 | World | No floor below the build limit; Bedrock has invisible bedrock at Y=-105 | Server | Correct | 10 |
| 186 | World | Nether portal search radius 16 in the nether; Bedrock 128 in both dimensions | Server | Correct | 10, MC-197538 |
| 187 | World | A perpendicular destination portal rotates yaw 90 degrees; Bedrock does not | Server | Desync | 10 |
| 188 | World | Almost any entity creates a portal; in Bedrock only a player does | Server | Correct | 10 |
| 189 | World | Portal travel load-ticks the destination chunk for 15 seconds; Bedrock does not | Server | Invisible | 10 |
| 190 | World | Zombified piglins spawn on the portal frame; Bedrock spawns them beside it | Server | Correct | 10 |
| 191 | World | A nether portal in the end leads to the nether; in Bedrock it leads to the overworld | Server | Correct | 10 |
| 192 | World | `/forceload` has no cap; Bedrock allows 10 ticking areas of 100 chunks | Server | Invisible | 10 |
| 193 | World | Simulation distance 3 to 32, default 10; Bedrock 4 to 12, default 4 | Server | Invisible | 10 |
| 194 | World | The server generates all visible terrain; Bedrock offloads distant chunks to the client | Client | Broken | 10 |
| 195 | World | End portal blocks do not reduce fall damage; Bedrock's do | Server | Correct | 10 |
| 196 | World | One dragon egg per world; Bedrock spawns two | Server | Correct | 9 |
| 197 | Items | Anvil cost scales on the final enchantment level; Bedrock on the level difference | Server | Correct | 11 |
| 198 | Items | Incompatible enchantments add 1 level; Bedrock adds 0 | Server | Invisible | 11 |
| 199 | Items | Impaling's anvil multipliers are 4 and 2; Bedrock's are 2 and 1 | Server | Invisible | 11 |
| 200 | Items | A rename-only operation caps at 39 levels; Bedrock has no cap | Server | Correct | 11 |
| 201 | Items | Names can be 50 characters; Bedrock 30 | Client | Broken | 11, MCPE-127906 |
| 202 | Items | Enchanting tables offer Thorns only on chestplates and no axe damage enchantments; Bedrock offers both | Server | Correct | 11 |
| 203 | Items | Treasure enchantments come from loot only; Bedrock adds raid mob drops | Server | Correct | 11 |
| 204 | Items | Thorns does not damage the sonic boom; in Bedrock it does | Server | Invisible | 11, MCPE-170546 |
| 205 | Items | Luck, Bad Luck, Glowing and Dolphin's Grace exist; Bedrock has Fatal Poison instead | Mixed | Broken | 11 |
| 206 | Items | Effect ids are `binding_curse`, `vanishing_curse`, `hero_of_the_village`; Bedrock drops the suffixes | Server | Invisible | 11 |
| 207 | Items | Potion of Luck exists; Bedrock has the potion of Decay and the long mundane potion | Server | Broken | 11 |
| 208 | Items | Brewing recipes are a subset of Bedrock's | Server | Correct | 11 |
| 209 | Items | Extended Regeneration and Poison last 1:30; Bedrock 2:00 | Server | Invisible | 11 |
| 210 | Items | Witch magic resistance is 85%; Bedrock 95% | Server | Invisible | 11 |
| 211 | Items | A stronger effect hides a weaker one on a mob; Bedrock destroys it | Server | Invisible | 11, MCPE-74059 |
| 212 | Items | The Saturation effect restores saturation points; in Bedrock it does not | Server | Invisible | 11, MCPE-52353 |
| 213 | Items | Absorption ends with its hearts; Bedrock's lingers | Server | Invisible | 11, MCPE-180762 |
| 214 | Items | Haste adds 20% mining speed per level and 10% attack speed; Bedrock multiplies by `1.2^level` and has no attack term | Server | Desync | 11, MCPE-161227 |
| 215 | Items | Totem Regeneration heals 36; Bedrock heals 32 | Server | Invisible | 11 |
| 216 | Items | A totem grants an invulnerability window; Bedrock grants none | Server | Invisible | 11, MCPE-225818 |
| 217 | Items | Spectral arrows and the Glowing effect exist; Bedrock has neither | Server | Broken | 11, MCPE-36852 |
| 218 | Items | Arrows are tipped by crafting with lingering potions; Bedrock also tips them in a cauldron | Server | Correct | 11 |
| 219 | Items | Item durability is the programmed value; Bedrock adds one point | Server | Broken | 11, MCPE-176713 |
| 220 | Items | Fishing rod durability 64; Bedrock 385 | Server | Broken | 11 |
| 221 | Items | Only five foods are edible at full hunger on Peaceful; Bedrock allows all | Server | Correct | 11 |
| 222 | Items | Dried kelp saturation 0.6 and sweet berries 0.4; Bedrock 0.2 and 1.2 | Server | Invisible | 11 |
| 223 | Items | Experience orbs drop with the loot; Bedrock drops them after the death animation | Server | Invisible | 11 |
| 224 | Mobs | Crammed entities take 3 damage every half second; Bedrock has no cramming | Server | Invisible | 7, MCPE-83181 |
| 225 | Mobs | Mobs hold offhand items and 11% spawn left-handed; Bedrock has neither | Mixed | Broken | 7, MCPE-112469 |
| 226 | Mobs | Mobs pick up items they walk past; Bedrock mobs path to them | Server | Correct | 7, MC-195151 |
| 227 | Mobs | Follow range is a `follow_range` attribute; Bedrock uses per-goal `max_dist` | Server | Invisible | 7, MCPE-50207 |
| 228 | Mobs | No preferred-path costing; Bedrock villagers and golems weight block types | Server | Correct | 7 |
| 229 | Mobs | Equipment drops at 8.5% from exact gear; Bedrock drops at 25% from a loot table | Server | Correct | 7 |
| 230 | Mobs | Regional difficulty drives about eight behaviors; Bedrock substitutes flat probabilities | Server | Invisible | 7 |
| 231 | Mobs | Zombie reinforcements, leader zombies and sieges exist; Bedrock has none | Server | Correct | 7, MCPE-134640 |
| 232 | Mobs | Door-break chance is `10 x clamped regional difficulty`; Bedrock rolls a flat 10% at spawn | Server | Invisible | 7 |
| 233 | Mobs | Baby zombies ride chickens; Bedrock babies ride most mobs | Server | Correct | 7 |
| 234 | Mobs | Skeletons strafe, retreat and sprint; Bedrock skeletons stand and shoot | Server | Correct | 7, MCPE-167689 |
| 235 | Mobs | Skeletons draw a bow; Bedrock skeletons shoot like ghasts | Server | Correct | 7 |
| 236 | Mobs | Spiders need a non-solid block above the spawn space; Bedrock spawns under solids | Server | Invisible | 7 |
| 237 | Mobs | Spiders spawn with status effects on Hard; Bedrock's do not | Server | Correct | 7, MCPE-10240 |
| 238 | Mobs | Slimes need 3x2.1x3; Bedrock needs 2x2x2 anchored at a block corner | Server | Invisible | 7 |
| 239 | Mobs | Slime chunks follow the world seed; Bedrock's are the same in every world | Server | Invisible | 7 |
| 240 | Mobs | Ghasts target 64 blocks and never aggro mobs; Bedrock targets 28 and retaliates | Server | Correct | 7 |
| 241 | Mobs | Ghast fireballs do not ignite entities; Bedrock's do | Server | Correct | 7, MCPE-186607 |
| 242 | Mobs | Piglins examine a bartered ingot for 6 seconds; Bedrock for 8 | Server | Correct | 7, MCPE-99448 |
| 243 | Mobs | Baby piglins steal items and drop 5 experience; Bedrock's drop 1 and never steal | Server | Correct | 7, MCPE-70869 |
| 244 | Mobs | Piglin and pillager crossbows break; Bedrock's never do | Server | Correct | 7, MCPE-67489 |
| 245 | Mobs | Piglins freeze mid-zombification on Peaceful; Bedrock despawns or goes passive | Server | Correct | 7 |
| 246 | Mobs | Phantoms spawn on a timer above Y=62 at night; Bedrock uses ordinary monster spawning | Server | Invisible | 7 |
| 247 | Mobs | Phantoms deal 2/2/3 and swoop every 8 to 12 seconds; Bedrock 4/6/9 every 10 to 20 | Server | Invisible | 7, MCPE-236190 |
| 248 | Mobs | Guardians spawn naturally with a sky penalty; Bedrock uses 25 fixed structure columns | Server | Invisible | 7 |
| 249 | Mobs | Elder guardians apply Mining Fatigue by area with a particle; Bedrock spawns a ghost entity | Server | Correct | 7, MCPE-60692 |
| 250 | Mobs | The wither has 300 health and regenerates; Bedrock scales health by difficulty and does not | Server | Correct | 7, MCPE-127978 |
| 251 | Mobs | The wither gains armor at half health; Bedrock also crashes, spawns skeletons and gains a dash | Server | Correct | 7 |
| 252 | Mobs | The dragon egg appears on the first kill; Bedrock gives one on the second too | Server | Correct | 7, MCPE-51345 |
| 253 | Mobs | The dragon charges without line of sight; Bedrock needs it within 150 blocks | Server | Correct | 7 |
| 254 | Mobs | Wardens gain 35 anger on contact and are pushed by explosions; Bedrock gains 80 and is not | Server | Invisible | 7, MCPE-153577 |
| 255 | Mobs | Golems spawn from panicking or gossiping villagers; Bedrock needs 20 beds and 10 villagers | Server | Invisible | 8 |
| 256 | Mobs | Golem hostility follows reputation; Bedrock aggros on any nearby villager attack | Server | Correct | 7 |
| 257 | Mobs | Snow golems trail snow in every biome; Bedrock skips hot biomes | Server | Correct | 7 |
| 258 | Mobs | Snow golems cannot be re-pumpkined without a command; Bedrock spawns them from world generation | Server | Correct | 7 |
| 259 | Mobs | Witches target within 16 blocks and cannot open doors; Bedrock targets 10 and does | Server | Correct | 7 |
| 260 | Mobs | Shulkers are immune to fire; Bedrock's burn with a 15-second lava grace | Server | Correct | 7 |
| 261 | Mobs | Shulkers drop 0 to 1 shells scaled 6.25% per Looting level; Bedrock drops 0 to 4 | Server | Correct | 7 |
| 262 | Mobs | Patrols are 1 to 5 by regional difficulty in block light under 9; Bedrock is 2 to 5 at any light | Server | Invisible | 7, MC-161182 |
| 263 | Mobs | Outposts spawn pillagers without limit; Bedrock caps at eight on fixed spots | Server | Invisible | 7 |
| 264 | Mobs | Endermites spawn at the thrower's position; Bedrock at the pearl's landing site | Server | Correct | 7 |
| 265 | Mobs | Tamed wolves sit and teleport to a hurt owner; Bedrock's do neither | Server | Correct | 7, MCPE-137119 |
| 266 | Mobs | Cats spawn by a player-anchored roll; Bedrock fills a per-bed quota in a 17x13x17 volume | Server | Invisible | 7 |
| 267 | Mobs | Foxes drop a held item 8.5% of the time; Bedrock drops it always | Server | Correct | 7 |
| 268 | Mobs | Spawners use a 9x3x9 volume; Bedrock uses a 4-block taxicab diamond | Server | Correct | 7 |
| 269 | Mobs | Spawner crowding checks 9x9x9 at the spawner; Bedrock checks 16x10x16 at its corner | Server | Invisible | 7 |
| 270 | Mobs | Spawners are customizable by command; Bedrock's are not | Server | Correct | 7 |
| 271 | Mobs | Entities riding entities travel through portals; Bedrock jockeys cannot | Server | Correct | 7, MCPE-47288 |
| 272 | Mobs | Client simulates no mob AI in either edition; Bedrock interpolates over a server-supplied tick count | Client | Invisible | 7 |
| 273 | Mobs | Server velocity moves any entity; Bedrock's `SetActorMotion` "does nothing" for most actor types | Client | Broken | 7 |
| 274 | Structural | Damage types are a datapack registry with messages and effects; Bedrock has 35 fixed causes | Client | Broken | 2 |
| 275 | Structural | 41 named attributes with modifiers; Bedrock carries 19 on the wire and no attribute registry | Client | Broken | 2 |
| 276 | Structural | Java's particle catalog includes `sweep_attack` and `damage_indicator`; Bedrock has 102 types and neither | Client | Broken | 2 |
| 277 | Structural | Advancements and statistics exist; Bedrock has achievements tied to a Microsoft account | Client | Broken | 12 |
| 278 | Structural | Death messages broadcast to all players; Bedrock has no equivalent broadcast | Client | Broken | 12 |

## 14. A testable parity target

"1-1 Java Edition parity" is not a claim this project can make, because 44 of the 278 rows above are decided by the Bedrock client, another 21 are mixed, and 56 would be visible and broken if the server implemented Java's behavior. The useful claim is narrower, and it is testable.

### Why the plain claim fails

Three independent reasons, in order of how hard they are to argue with.

The client owns registries the server cannot replace. Damage causes are a 35-member enum, particles are 102 types, attributes are 19 names on the wire, and the enchantment list has no Sweeping Edge. Java's equivalents are datapack registries with hundreds of entries. No packet carries a new damage type, a new particle or a new attribute, so any Java behavior whose only expression is one of those is unreachable.

The client computes things the server never sends. Lighting is the largest: the Bedrock protocol has no light packet and the chunk packets carry no light arrays, so the player sees Bedrock's light model no matter what the server believes. Block breaking speed, reach, collision response and the pose transitions are all computed client-side first.

Some Bedrock behavior is Mojang's deliberate design, not a bug. MCPE-23282 (offhand restriction), MCPE-28266 (attack sound on a whiff), MC-3179 (projectile knockback), MCPE-14851 and MC-5726 (pistons finishing before retracting), MCPE-14664 (no quasi-connectivity) and MCPE-179223 (no saturation boost) are all closed as Works As Intended or Invalid. "Java parity" in those places means overriding a decision Mojang made on purpose, which is a product choice, not a correctness fix.

### Proposed wording

> JSPrismarine implements Java Edition's gameplay rules for every behavior a server decides, verified against Java Edition's own implementation, and presents them through the Bedrock client's model of the world. Where a Java rule has no Bedrock presentation, or where the Bedrock client decides the outcome locally, the server implements the behavior the client expects. Section 13 of docs/research/edition-behavior-differences.md enumerates every such case.

Two shorter variants for places where the long form will not fit:

> Java Edition's rules, played on a Bedrock client.

> Server-side parity with Java Edition. Client-side presentation is Bedrock's.

The long form is the one to use in any document that could be read as a promise. The short forms are marketing, and they should link to the long one.

### How each row resolves

The classification in section 13 is the decision procedure.

- Server plus Invisible, or Server plus Correct. Implement Java's rule. These 186 rows are what the claim is about.
- Client, 44 rows. Implement what the client expects, which is Bedrock's behavior, because the alternative is a broken screen. Record the decision.
- Server plus Broken, 15 rows. Decide per case and record the decision. These are the rows where Java's rule is implementable but illegible: the attack cooldown, sweep attacks, the dust dot state, the durability off-by-one. The default should be Bedrock's behavior, because an unexplained game is worse than a different one.
- Mixed, 21 rows, and Server plus Desync, 12 rows. Implement whatever keeps the client in sync, then see whether the Java rule fits inside the tolerance. Movement constants, break speed and knockback live here. The acceptance criterion is a correction rate, not a value match.

### What "verified" means

Three levels, only the first two of which this project should claim.

Rule parity. For a defined input sequence, the server's own state transitions match Java Edition's for the same sequence. The oracle is a vanilla Java server driven by the same script, with both sides dumping state. This is testable in CI without a client and it is where the claim lives.

Observable parity. The packets the server sends produce, on a vanilla Bedrock client, the outcome Java would show. The oracle is a packet capture against a Bedrock Dedicated Server plus a rendered comparison. [extraction-and-parity-verification.md](extraction-and-parity-verification.md) describes the capture harness.

Bit parity. Identical values for identical seeds and identical random draws. Only reachable where no random number is consumed. [cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md) establishes that the generator is the ceiling; the same applies to every gameplay path that draws from a random source, because Mojang has not documented Bedrock's generator.

### Categories to exclude from any 1-1 claim

Eight, each with its section reference.

1. Rendered presentation. Lighting and its propagation, particles, block and entity models, animations, shadows, the HUD, item tooltips, block outlines, death screens, and sound selection. Sections 2, 3, 7, 9.
2. Input handling and pose selection. Reach by input device, shield activation, crossbow charge cadence, sneak and sprint toggles, auto-jump, creative flight feel, the offhand slot filter, block placement rate. Sections 2, 4, 5.
3. Client-predicted simulation. Block breaking speed and target selection, player movement physics constants, and the physics of a vehicle the player is driving. Matching Java here produces corrections, not fidelity. Sections 2, 4, 9.
4. Fixed client registries. Damage causes, particle types, attributes, enchantment names, effect identifiers, and the item damage and durability values the tooltip draws from. Section 2.
5. Geometry the client owns. Entity hitboxes everywhere, and block collision and outline shapes beyond what `VoxelShapesPacket` covers. Sections 2, 9.
6. World generation. Covered by [cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md), which stops the claim at the first random draw.
7. Spawn and cap models. The mob cap, spawn radius, despawn and persistence models are server-decided and invisible, so Java's can be implemented, but doing so changes every farm a Bedrock player has built. This is a product decision to make explicitly rather than a constraint. Section 7.
8. Behavior Mojang closed as intended on Bedrock. The bug keys listed above, plus quasi-connectivity, the P-tick and C-tick split, and the absence of entity cramming. Implementing Java's version here is a deliberate divergence from Bedrock's design and should be labeled as one. Sections 3, 6, 7.

### Acceptance tests the claim implies

The four Axis B values imply four test shapes, and two more tests keep the claim honest.

For every Server plus Invisible row, a unit test comparing the server's state transition against a value taken from Java's implementation or from a cited published formula. These need no client and no network.

For every Server plus Correct row, a packet-level test asserting that the server emits the packet a Bedrock client needs to render the Java outcome, compared against a Bedrock Dedicated Server capture of the equivalent event.

For every Client row, a test asserting the server does not try to override the client. A server that sends a correction for something the client owns is the failure mode.

For every Mixed or Desync row, a latency-bounded test measuring the `CorrectPlayerMovePredictionPacket` rate under a scripted movement trace. The target is a correction rate, with `player-position-acceptance-threshold` at its default of 0.5.

A conformance test that the server's own classification table stays in step with this note, so a behavior change that moves a row from Server to Client is visible in review.

A negative test for each of the eight excluded categories, asserting the server does not claim them. The cheapest form is a documentation test: the public parity claim links to section 13 and section 13 lists every exclusion.

## Open questions

- Mojang's two documents disagree on the block-breaking option. The server properties reference calls it `server-authoritative-block-breaking` with "Default: false" and the scalar `server-authoritative-block-breaking-range-scalar`; the anti-cheat guide ships `server-authoritative-block-breaking=true` and `server-authoritative-block-breaking-pick-range-scalar=1.5`. Which name a current Bedrock Dedicated Server reads was not tested in this pass.
- `player-rewind-min-correction-delay-ticks` and `player-rewind-history-size-ticks` appear in Mojang's anti-cheat guide and in no shipped `server.properties`. Whether a current server reads them is untested.
- Bedrock's main game loop order is undocumented. The wiki's Bedrock subsection under "Game process" is an empty section, and Mojang publishes nothing. Everything in section 6 about Bedrock ordering comes from the wiki's reverse-engineered produce-tick and consume-tick model, which is cross-referenced across about eight pages but has no Mojang source for the terminology or the odd and even alignment.
- Bedrock's `randomTickSpeed` is "only relative speed instead of the exact number" and the mapping to blocks per subchunk is undocumented, so Bedrock 1 is not one third of Java 3 and the ratio is unknown.
- The leaves light-dampening value disagrees between the wiki (2) and Mojang's component documentation (1). The water value is being changed by Mojang from 2 to 1 in preview 1.21.120.24, which resolves that half.
- The Bedrock build limit for the end is 256 on the Altitude page and in the dimension type, and 128 on the World boundary page. Unresolved.
- Bedrock's post-attack shield lockout exists but the wiki does not know the tick count and carries a `{{check the code}}` marker.
- The crop, melon, pumpkin and sugar cane growth rates are "slower in Bedrock" with no published multiplier.
- Several per-mob numbers disagree between wiki pages: Java baby piglin rate (20% versus 25%), Bedrock drowned nautilus shell rate (8% versus 7%), Bedrock wither skeletons summoned at half health (3 versus 4), Java patrol size (1 to 8 versus 1 to 5), and Java pillager target range (32 versus 64).
- Two wiki claims rest on bug reports that are no longer open. MCPE-138549, the chain comparator read, is resolved as Fixed, so Bedrock's comparator-conducting block list may have changed. MCPE-158309, slow crop growth, is resolved as Cannot Reproduce, so only the melon, pumpkin and sugar cane half of that claim stands.
- The wiki's per-mob and parity pages are not versioned against a Bedrock release, so any entry here may describe a state Mojang has since changed in a "Vanilla Parity" changelog section. The list in section 7 shows four such fixes in the last year alone. Every row of section 13 is a claim about 2026-10-24 and needs re-checking before it is relied on.
- Powered rail chain length, water and lava flow rates, swimming speeds, elytra glide numbers and the kinetic damage formula carry no edition marker, so the wiki implies parity for them without asserting it. None was verified against Bedrock.
- No Mojang changelog announces server-authoritative combat. The authority model in section 2 is read off the packets and the `server-authoritative-entity-interactions-strict` option, not off a Mojang statement.
- Bedrock renaming is said to set a prior-work penalty of 0 rather than leaving it absent, which would make renamed items stack only with other renamed items. The wiki carries a `{{check the code}}` marker on it.

## Reproduction

```
# Minecraft Wiki raw wikitext, no browser challenge
curl -sS -A "Mozilla/5.0" "https://minecraft.wiki/index.php?title=Parity_issue_list&action=raw" -o raw_Parity_issue_list.txt
for p in Combat Damage Armor Knockback Shield Melee_attack Mob_spawning Villager Raid Trading Breeding \
         Tick Redstone_mechanics Observer Piston Sticky_Piston Redstone_Dust Redstone_Repeater \
         Redstone_Comparator Redstone_Torch Hopper Light Opacity Breaking Instant_mining Block_states \
         Simulation_distance Ticking_area Nether_Portal World_boundary Altitude The_End Attribute \
         Damage_type Anvil_mechanics Potion Brewing Effect Food Dual_wielding Inventory Crafting \
         Recipe_book Creative Difficulty Sneaking Sprinting Elytra Boat Monster_Spawner \
         Bedrock_Edition_exclusive_features Java_Edition_exclusive_features; do
  curl -sS -A "Mozilla/5.0" -o "raw_$p.txt" "https://minecraft.wiki/index.php?title=$p&action=raw"
done

# Mojang's protocol reference and its engineering guides
for g in player-movement-overview movement-protocol-deprecation configuring-anti-cheat anti-cheat-server \
         block-breaking-overview build-action-simulation-rate \
         server-auth-inventory-player-ui-container server-auth-inventory-item-stack-packets-disabled; do
  curl -sSL -A "Mozilla/5.0" -o "g_$g.html" "https://mojang.github.io/bedrock-protocol-docs/guides/$g/"
done
python3 -I -c "
import re,html,sys
s=open(sys.argv[1],encoding='utf-8',errors='replace').read()
m=re.search(r'<main[^>]*>(.*?)</main>',s,re.S)
t=re.sub(r'<(script|style)[^>]*>.*?</\1>','',m.group(1),flags=re.S)
print('\n'.join(l.strip() for l in html.unescape(re.sub('<[^>]+>','\n',t)).split('\n') if l.strip()))
" g_player-movement-overview.html

# Mojang's Bedrock Dedicated Server option defaults
curl -sSL -A "Mozilla/5.0" -o sp.html \
  "https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties?view=minecraft-bedrock-stable"

# Mojang changelogs through the Zendesk JSON API, which has no browser challenge
curl -sS -A "Mozilla/5.0" "https://feedback.minecraft.net/api/v2/help_center/articles/search.json?query=server-authoritative-movement&per_page=25"
curl -sS -A "Mozilla/5.0" "https://feedback.minecraft.net/api/v2/help_center/en-us/articles/35256043330189.json" \
  | python3 -I -c "import json,sys,re,html;print(re.sub('<[^>]+>','\n',html.unescape(json.load(sys.stdin)['article']['body'])))"
# Article ids used: 35256043330189 (1.21.70), 4411311573133 (1.17.40), 27451789924237 (1.21),
# 5520890863245 (1.18.30), 30220110283533 (1.21.30), 34034576387469 (1.21.60), 9272494067469 (1.19.30),
# 40008177570061 (preview 1.21.120.24), 37453175894669 (preview 1.21.100.21),
# 36203344176269 (preview 1.21.90.21), 31998389834637 (preview 1.21.60.21), 30892949042189 (preview 1.21.50.20)

# Bug tracker: mojira.dev serves HTML with the title and resolution in meta tags; /api/issue/ returns 404
python3 -I -c "
import re,html,sys,urllib.request
for k in sys.argv[1:]:
    req=urllib.request.Request(f'https://mojira.dev/{k}',headers={'User-Agent':'Mozilla/5.0'})
    s=urllib.request.urlopen(req).read().decode('utf-8','replace')
    t=re.search(r'<meta name=\"title\" content=\"\[[A-Z0-9-]+\] ([^\"]*)\"',s)
    r=re.search(r'Resolved as \*\*([^*]*)\*\*',s)
    print(k,'|',html.unescape(t.group(1)) if t else '?','|','Resolved as '+r.group(1) if r else 'Open')
" MCPE-23282 MCPE-28266 MCPE-176713 MCPE-157150 MCPE-174685 MC-3179 MC-268147

# Mojang's vanilla behavior pack and block component docs
curl -sS "https://raw.githubusercontent.com/MicrosoftDocs/minecraft-creator/main/creator/Reference/Source/VanillaBehaviorPack/entities/zombie.json"
curl -sS "https://raw.githubusercontent.com/MicrosoftDocs/minecraft-creator/main/creator/Reference/Source/VanillaBehaviorPack/spawn_rules/chicken.json"
curl -sS "https://raw.githubusercontent.com/MicrosoftDocs/minecraft-creator/main/creator/Reference/Content/BlockReference/Examples/BlockComponents/minecraftBlock_light_dampening.md"

# Mojang's enum documentation as cached in this repository
python3 -I -c "
import re,html
s=open('packages/minecraft/datagen/snapshot/v2193/enums.html',encoding='utf-8',errors='replace').read()
lines=[l.strip() for l in html.unescape(re.sub('<[^>]+>','\n',s)).split('\n') if l.strip()]
i=lines.index('PlayerAuthInputPacket::InputData'); print('\n'.join(lines[i:i+130]))
"
python3 -I -c "
import re,html
s=open('packages/minecraft/datagen/snapshot/v2193/enums.html',encoding='utf-8',errors='replace').read()
lines=[l.strip() for l in html.unescape(re.sub('<[^>]+>','\n',s)).split('\n') if l.strip()]
i=lines.index('ParticleType'); seg=[]; j=i+1
while lines[j]!='_count': seg.append(lines[j]); j+=1
print('particle types:', len([x for x in seg if not x.lstrip('-').isdigit()]))
"

# The protocol levers this server has, read from its own source
grep -n "CREATIVE_CONTENT\|CRAFTING_DATA\|ITEM_STACK\|PLAYER_AUTH_INPUT\|CORRECT_PLAYER\|VOXEL_SHAPES" \
  packages/protocol/src/PacketIdentifier.ts
grep -in "light" packages/protocol/src/PacketIdentifier.ts   # no match: Bedrock has no light packet
cat packages/prismarine/src/entity/Attribute.ts               # 19 attribute names, no attack_speed
cat packages/minecraft/src/generated/ServerAuthMovementMode.ts
```
