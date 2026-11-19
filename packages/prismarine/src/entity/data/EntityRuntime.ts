/**
 * The data-driven entity runtime: the live entities of one dimension.
 *
 * This is the whole of what used to be 111 entity classes, `MobStats`,
 * `EntitySize`, `LootTables`, `Brains`, `Targeting` and `Speed`. An entity is
 * a reference to a resolved `EntityType` plus the component state that type
 * builds, so adding a mob is adding a behavior-pack file and nothing else.
 *
 * Four things happen per entity per tick, in this order, which is the order
 * both AI packages document:
 *
 * 1. `EntityInstance.tick` applies the events that fired last tick, runs the
 *    active components, then runs the goal scheduler.
 * 2. Daylight exposure, wetness, and fire ticks update the fire state and can deal damage.
 * 3. A brain mob runs its `updateActivity` and then its brain, because the
 *    brain never chooses an activity - the mob does, and the brain only
 *    answers whether one is possible.
 * 4. The body takes one step along whatever walk the two systems asked for.
 *
 * The camel, the happy ghast and the tadpole run both 1 and 3, which is what
 * `BrainMobDefinition.alsoRunsGoals` is for.
 */
import type { EntitySpawnCause } from '../../events/entity/EntitySpawnEvent';
import { legacy_item_aliases } from '@jsprismarine/bedrock-data';
import { javaDyeColorIndexOf } from '@jsprismarine/mapping';
import type {
    DamageEvent,
    DamageResult,
    EntityActuator,
    EntityAngerBroadcast,
    EntityBlockBreakEvent,
    EntityEffects,
    EntityEquipmentSlot,
    EntityPosition,
    EntitySensorCandidate,
    EntitySensorQuery,
    EntityRepairItemRequest,
    EntitySpawnRequest,
    EntitySpawnItemsRequest,
    EntityStatusEffect,
    EventTarget,
    FilterEntityView,
    OutgoingTrigger,
    TransformRequest
} from '@jsprismarine/entities';
import type { LookedAtCandidate, LookedAtQuery } from '@jsprismarine/entities/entityInstance';
import {
    canEntityAttack,
    canEntityAttackView,
    EntityInstance,
    evaluateFilter,
    isDyeableParams,
    isAreaAttackParams,
    isRecord,
    isStrengthParams,
    javaEntityNavigation,
    javaEntityStats,
    javaMoveControlTurn,
    MAX_BLOCK_SENSOR_RADIUS,
    noEffects,
    parseEventTarget
} from '@jsprismarine/entities';
import { feedMount, mountTameEvent } from '@jsprismarine/entities/components/tamemount';
import { spawnEventFor } from '@jsprismarine/entities/eventEngine';
import { EVENT_TARGETS } from '@jsprismarine/entities/events';
import type { EventEffects } from '@jsprismarine/entities/eventEngine';
import type { EventNode } from '@jsprismarine/entities/events';
import { addTrusted } from '@jsprismarine/entities/components/trust';
import { javaItemTagsForBedrock } from '../../content/javaTags';
import { itemMatchesName } from '@jsprismarine/entities/itemNames';
import { liquidStateOf } from '@jsprismarine/block-behaviors';
import { isFullCubeShape } from '@jsprismarine/blocks/geometry';
import { isLovedItem, PIGLIN, wantsToPickUp as wantsToPickUpAsPiglin } from '@jsprismarine/entity-brains/mobs/piglin';
import { wardenHearsVibration } from '@jsprismarine/entity-brains/mobs/warden';

import { containerSignal } from '@jsprismarine/block-behaviors/rules/container';
import {
    admireGoldItem,
    canAdmire,
    EntityCondition,
    isBarterCurrency,
    MemoryModuleTypes,
    WARDEN
} from '@jsprismarine/entity-brains';
import { blockPosTracker } from '@jsprismarine/entity-brains';
import type { VillagerRaidEffect, VillagerRaidState, VillagerTask } from '@jsprismarine/entity-brains';
import { blocksAttacks, entityData, maxDamage, potionDurationScale, weapon } from '@jsprismarine/items';
import type { HolderSet, ItemType } from '@jsprismarine/items';
import { shieldDurabilityCost } from '@jsprismarine/item-behaviors/behaviors/combat';
import type { RecipeBook } from '@jsprismarine/recipes';
import { EXPLOSION_ENTITY_REACH } from '@jsprismarine/engine-systems';
import type { BlockPosition } from '@jsprismarine/engine-systems';
import type {
    BlockQuery,
    GoalBlock,
    GoalItem,
    GoalItemCraft,
    GoalCombatMark,
    GoalMob,
    GoalPickupOptions,
    GoalWorld
} from '@jsprismarine/entity-goals';
import { navigationProfile } from '@jsprismarine/entity-goals';
import type { SpawnRequest, SpawnWorld } from '@jsprismarine/spawning';
import { Spawner, despawnReason } from '@jsprismarine/spawning';
import type { Merchant, MerchantSnapshot } from '@jsprismarine/trading';
import type { EntityView, ItemStack } from '@jsprismarine/predicates';

import type { ContentEntity, ContentItemDrop } from '../../content/world/adapter';
import { leashSnapDistance } from './leash';
import {
    BLOCK_DROPS,
    ENTITY_DROPS,
    FALL_DAMAGE,
    FIRE_DAMAGE,
    MOB_DROPS,
    MOB_GRIEFING,
    SPAWN_MOBS,
    SPAWN_PHANTOMS,
    TNT_EXPLODES,
    ruleIsOn
} from '../../content/world/gameRules';
import type { ServerContent } from '../../content/ServerContent';
import { bedrockItemDrops } from '../../item/bedrockDrops';
import { dropOfRolledStack } from '../../item/lootStack';
import { itemOfDrop } from '../../inventory/persistence';
import { breedableOf, canBreed, offspringIdentifierOf, offspringOf, pregnancyOf, spendLove } from './breeding';
import { assembleChickenJockey, CHICKEN, CHICKEN_JOCKEY_RIDERS, CHICKEN_SEARCH } from './chickenJockey';
import { DataEntity, MobBody, SHOWN_CONDITIONS, distance, squaredDistance } from './DataEntity';
import { EntityIndex } from './entityIndex';
import { detonate } from './explosion';
import type { ContentBlastResult } from './explosion';
import { updateControlFlags } from './riderControl';
import {
    MOB_EQUIPMENT_SLOTS,
    mobEquipmentSlotOf,
    rollMobEquipment,
    sameEquipment,
    slotForItem,
    withoutEquipmentSlot
} from '../equipment';
import type { MobEquipmentSlot } from '../equipment';
import { enchantFromProvider, enchantmentProviderSourceOf } from '../enchantmentProvider';
import { EntityFactsLookup, javaLootIdOf, PLAYER_BOX } from './facts';
import { fallsUnderGravity } from './gravity';
import { equippableSlotCount, equippableSlotsOf } from './equippable';
import {
    canPickUpLootChance,
    clampedRegionalDifficulty,
    moonBrightnessAt,
    DIFFICULTY_IDS,
    regionalDifficulty
} from '../regionalDifficulty';
import type { RegionalDifficultyInputs } from '../regionalDifficulty';
import { VEHICLE_DAMAGE_DECAY_PER_TICK, boatItemOf, isBreakableVehicle, vehicleBlow } from './vehicleDamage';
import { ITEM_HOPPER, ITEM_HOPPER_QUERY_RADIUS, inHopperReach, insertStack } from './itemHopper';
import type { CushionHost } from './cushionFire';
import type { BoatBubbleHost } from './boatBubbleColumn';
import { tickBoatBubbles } from './boatBubbleColumn';
import type { TrackHost } from './minecartTrack';
import {
    ACTIVATOR_RAIL,
    cartSlowdown,
    isPoweredRail,
    moveAlongTrack,
    railPositionOf,
    railShapeOf
} from './minecartTrack';
import type { RailSensorHost } from './railSensor';
import { activateMinecart } from './railSensor';
import type { FlappingHost } from './flapping';
import type { MobBlockHost } from './mobBlockRules';
import { BREAK_BLOCKS_COMPONENT, breakLeaves, leaveTrail } from './mobBlockRules';
import { FLAP_EVENT, updateFlapping } from './flapping';
import { isCushion, updateCushion } from './cushionFire';
import type { EntityFacts } from './facts';
import {
    bodyCanOccupy,
    bodyIntersectsMedia,
    bodyTouchesBlock,
    floorUnder,
    hasLineOfSight as hasBlockLineOfSight,
    isSupported,
    landingY,
    moveOnAxis
} from './collision';
import { actuatorOf, goalMobOf, goalWorldOf, playerGoalMob } from './goalWorld';
import { ENTITY_EYE_HEIGHT_FRACTION, blockPositionOf, entityEyePosition } from './position';
import type { Look } from './lookingAt';
import { isLookingAt, viewVector } from './lookingAt';
import { mobLootTableOf, rollMobDrops } from '../mobLoot';
import { deathDamageSource, deathLootState, killerView } from './deathLoot';
import type { DeathKiller } from './deathLoot';
import { JAVA_EXPERIENCE, deathExperience, experienceOrbs } from './deathExperience';
import { brainMobFor } from './brainIdentifiers';
import type { CopperGolemStatueHost } from './copperGolemStatue';
import { isCopperGolem, tickCopperGolemStatue } from './copperGolemStatue';

import { brainEntityById, brainItemOf, brainMobOf, brainWorldOf, tickBrainNavigation } from './brainWorld';
import { flatInventoryRoom, inPickupReach, pickupQueryRadius, villagerWants } from './lootPickup';
import type { LootPickupRule } from './lootPickup';
import { entityFilterContextOf } from './filterView';
import type { ContentItemEntity, EntityHostFacts, EntityWorldFacts, PlayerHands } from './host';
import { DroppedItems, isDroppedItem } from './droppedItems';
import { javaBlockTagsForBedrock } from '../../content/javaTags';
import { AREA_EFFECT_CLOUD, AreaEffectClouds, instantEffect, isAreaEffectCloud } from './areaEffectCloud';
import { EvokerFangs, isEvokerFangs } from './evokerFangs';
import { OminousItemSpawners, isOminousItemSpawner } from './ominousItemSpawner';
import { DEFLECTED_ARROW_FIRE_TICKS, DEFLECTED_ARROW_SPEED, deflectsArrow } from './dragonArrows';
import { DRAGON_FIREBALL, breathSearchBox, dragonBreathOf } from './dragonFireball';
import {
    EXTINGUISHES_TAG,
    HURTS_WATER_SENSITIVE_TAG,
    LINGERING_POTION,
    REACH_SQUARED,
    WATER_DAMAGE,
    WATER_REACH,
    WATER_SENSITIVE,
    boxAt,
    closestPointOf,
    isThrownPotion,
    lingeringCloudData,
    splashDuration,
    splashStrength,
    thrownPotionContentsOf
} from './thrownPotion';
import { HangingEntities, isHangingEntity } from './hangingEntities';
import { placeablePaintingVariants } from './paintings';
import { EyeOfEnderSignals, isEyeOfEnderSignal } from './eyeOfEnderSignals';
import { PlayerSystems, writeSneaking } from './playerSystems';
import { itemDropOf } from '../../inventory/persistence';
import { maxStackSizeOf, resistsDamageOf } from '../../item/Item';
import { navigationViewOf } from './navigationView';
import { DEFAULT_BLOCK_FRICTION, DRAG } from './travel';
import { projectileFlight, velocityAfterMove, velocityBeforeMove } from './projectileFlight';
import {
    JAVA_PROJECTILE_HITS,
    PROJECTILE_IGNITE_TICKS,
    grantedExperience,
    projectileHitEffects,
    projectileHitEvent,
    projectileKnockback
} from './projectileImpact';
import type { CachedNavigationView, EntityBlockView } from './navigationView';
import type { DataEntityRecord } from './persistence';
import { applyDataEntityRecord, dataEntityRecordFrom, dataEntityRecordOf } from './persistence';
import { EntityStore } from './EntityStore';
import { DamagePipeline } from './damagePipeline';
import type {
    DamageComputation,
    DamageCommitResult,
    DamageIntent,
    DamageOutcome,
    DamageRoute,
    DamageSourceFacts
} from './damagePipeline';
import { DamageSensingSlot, ITEM_BLOCKING, damageGuards, damageModifiers } from './damageStages';
import { INVULNERABILITY_TICKS } from '../Damage';
import type { DamageCause } from '../DamageCause';
import { damageCauseOf } from '../DamageCause';
import { damageCauseOfType, damageCausesInTag } from '../damageTypes';
import { damageTagsOf } from '../mobLoot';
import type { HitGrace } from './damageStages';
import { BASE_KNOCKBACK, KNOCKBACK_PER_LEVEL, behind, livingKnockback } from '../knockback';
import { SULFUR_CUBE_KNOCKBACK, sulfurCubeKnockback } from './sulfurCubeKnockback';
import { blockDelayTicks, blockedDamage, blockingAngle, disableTicks, strongKnockback } from './itemBlocking';
import type { SulfurCubeShove } from './sulfurCubeKnockback';
import {
    attributeIn,
    attributeNamed,
    booleanField,
    bodyFieldValue,
    componentStateIn,
    equipmentInventorySlotsIn,
    identityIn,
    isBodyField,
    linkIn,
    propertyIn,
    statusEffectsIn,
    stringsIn
} from './entityFields';
import type { StateEntry } from '../../world/changelog/ChangeEntry';
import type { PlainData, PlainRecord } from '../../world/changelog/PlainData';
import { isPlainRecord, plainOf } from '../../world/changelog/PlainData';
import { fallsThrough } from '../../world/physics/BlockRules';
import type { EntityItemInteraction } from './itemInteraction';
import { JAVA_POI_TYPES, PointsOfInterest } from './poi';
import { ItemSteering } from './itemSteering';
import { RideIndex } from './riding';
import type { EntityScene, SpawnOptions } from './scene';
import {
    loggedMerchantSource,
    MERCHANT_FIELD,
    merchantFieldOf,
    merchantFor,
    merchantIn,
    professionOf
} from './trading';
import type { TradeSource } from '../../network/PlayerSession';
import {
    WILLING_FOOD_POINTS,
    digest,
    farmWorkAround,
    foodPointsOf,
    harvestFarmland,
    shareWithVillager,
    useBonemeal,
    workAtComposter
} from './villagerWork';
import { bedrockEntityIdentifierOf } from '../identifierMapping';
import { DEFAULT_FUSE_TICKS, randomShortFuse } from '../fuse';
import { isDay } from '../../world/DayCycle';
import { overworldSkyDarken } from '../../world/skyDarken';
import { PhantomSpawner } from './phantomSpawner';
import { canTargetPlayer } from './playerTargets';

/** The dimension Java runs its `PhantomSpawner` in, the overworld's only custom spawners being there. */
const OVERWORLD = 'minecraft:overworld';

/** The mob `PhantomSpawner` spawns, which no natural spawn rule may. */
const PHANTOM = 'minecraft:phantom';

/** The sky light `Level.canSeeSky` asks for: the brightest there is. */
const FULL_SKY_LIGHT = 15;

/** Java's block tag `NaturalSpawner.isValidEmptySpawnBlock` refuses a spawn inside. */
const PREVENT_MOB_SPAWNING_INSIDE = 'minecraft:prevent_mob_spawning_inside';

/** How far from a bell's center a living entity hears it ring, `BellBlockEntity`'s `closerToCenterThan(32)`. */
const BELL_HEARING_RANGE = 32;
import type { GameEventListener } from '../../world/GameEventListenerRegistry';
import { VOID_DAMAGE, VOID_DEPTH, VOID_INTERVAL } from '../Environment';
import { cushions } from '../playerFall';
import type { StatusEffectInput } from '../StatusEffect';
import { mergeStatusEffect, normalizeStatusEffectId, removeStatusEffectFromMap } from '../StatusEffect';
import { clientOwnsMovement, PLAYER_IDENTIFIER } from '../playerOverlay';
import { playerAbilityNames } from '../playerAbilities';
import { javaPotionEffects } from '../../item/potions';
import { EYE_HEIGHT } from '../playerEyes';
import { normalizedItemIdentifier } from '@jsprismarine/entities/components/shared';
import { Gametype } from '@jsprismarine/minecraft';
import type { PlayerMining } from '../playerComponents';
import type { PlayerShownForm } from '../playerShown';
import { cancelMeal } from '../playerMeal';
import type { StorePlayer } from '../storePlayer';
import { PrismarineEntityErrors } from '@jsprismarine/errors/prismarine/entity';

/** The interval between projectile samples, small enough not to skip a target. */
const PROJECTILE_SWEEP_STEP = 0.25;

/** Vanilla expands a projectile target by this amount before checking a hit. */
const PROJECTILE_HIT_MARGIN = 0.3;

/** Prefix that keeps saved player holders distinct from data-entity identities. */
const PLAYER_LEASH_HOLDER_PREFIX = 'player:';

/** How long a projectile ignores its owner and stays alive, in ticks. */
const PROJECTILE_OWNER_GRACE = 5;
const PROJECTILE_MAX_LIFE = 1200;
/** The entity a death's experience drops as. */
const EXPERIENCE_ORB = 'minecraft:xp_orb';

/** Java's mob no-despawn distance; a nearby player resets `noActionTime`. */
const MOB_NO_DESPAWN_DISTANCE = 32;
/** How long Java's `LivingEntity.tick` keeps `lastHurtByMob` after the blow, in ticks. */
const LAST_HURT_BY_MEMORY_TICKS = 100;
/** `Creaking.checkCanMove`'s `isLookingAtMe` tolerance, and the height above its feet it also checks. */
const CREAKING_LOOK_TOLERANCE = 0.5;
const CREAKING_LOOK_HEIGHT = 0.5;
/** `Creaking.checkCanMove` wakes a creaking for a player closer than this, `distanceToSqr < 144`. */
const CREAKING_ACTIVATION_RANGE = 12;
/** Java's item tag of the head equipment no creaking or enderman notices a look from. */
const GAZE_DISGUISE_TAG = 'minecraft:gaze_disguise_equipment';

/** One remembered blow: the runtime id on its other side, and the game tick it landed. */
interface PlayerBlow {
    readonly id: number;
    readonly tick: number;
}

/** The last blow a player dealt and the last one it took. */
interface PlayerBlows {
    readonly hurt?: PlayerBlow;
    readonly hurtBy?: PlayerBlow;
}

const PROJECTILE_KNOCKBACK = 0.4;
/** What an ender pearl's landing hurts the player who threw it, Java's `ThrownEnderpearl.onHit` `enderPearl` 5. */
const ENDER_PEARL_DAMAGE = 5;

/** Why an entity heals, as the Script API's `EntityHealCause` names it. */
export type HealCause = 'Heal' | 'Regeneration' | 'SelfHeal' | 'TotemOfUndying';

/** What a melee blow adds to its target's upward motion beyond the push, Java's `IronGolem.doHurtTarget` 0.4. */
const JAVA_ATTACK_LIFT: ReadonlyMap<string, number> = new Map([['minecraft:iron_golem', 0.4]]);

/**
 * The types whose blow Java throws the target with by its own rule, `HoglinBase.throwTarget`,
 * rather than `Mob.doHurtTarget`'s `causeExtraKnockback`.
 */
const THROWS_ON_ITS_OWN: ReadonlySet<string> = new Set(['minecraft:hoglin', 'minecraft:zoglin']);

/** What `LivingEntity.causeExtraKnockback` leaves of the attacker's horizontal motion. */
const EXTRA_KNOCKBACK_SLOWDOWN = 0.6;

/** How hard `LivingEntity.blockedByItem` shoves a defender whose shield let part of a blow through. */
const BLOCKED_KNOCKBACK = 0.5;

/** A player's raised shield: the hand that holds it and the item type it is. */
interface RaisedShield {
    readonly hand: keyof PlayerHands;
    readonly type: ItemType;
}

/** Whether a blow committed with all of it taken off by a raised shield. */
const wasBlockedWhole = (outcome: DamageOutcome): boolean =>
    outcome.committed &&
    outcome.computation.modifiers.some((modifier) => modifier.name === ITEM_BLOCKING && modifier.amountAfter <= 0);

/**
 * The push two bodies give each other, Java's `Entity.push(Entity)`: the second is pushed this way
 * and the first the other, up to 0.05 a tick, and none for two whose centers are within 0.01
 * blocks of each other.
 *
 * @param dx - The second body's horizontal offset from the first.
 */
const entityPushImpulse = (dx: number, dz: number): EntityPosition | undefined => {
    const largestDifference = Math.max(Math.abs(dx), Math.abs(dz));
    if (largestDifference < 0.01) return undefined;
    const root = Math.sqrt(largestDifference);
    const scale = Math.min(1, 1 / root);
    return { x: (dx / root) * scale * 0.05, y: 0, z: (dz / root) * scale * 0.05 };
};

/** The Bedrock name of a Java sound event a component names, such as `item.shield.block`. */
const bedrockSoundOf = (sound: string): string => sound.replace(/^minecraft:/, '');

/** The types whose vibrations no listener hears, Java's `Entity.dampensVibrations` overrides. */
const DAMPENS_VIBRATIONS: ReadonlySet<string> = new Set(['minecraft:warden']);

/** The component spellings for the equipment slots the runtime stores. */
const COMPONENT_EQUIPMENT_SLOTS = {
    mainhand: 'slot.weapon.mainhand',
    offhand: 'slot.weapon.offhand',
    head: 'slot.armor.head',
    chest: 'slot.armor.chest',
    legs: 'slot.armor.legs',
    feet: 'slot.armor.feet',
    body: 'slot.armor.body'
} satisfies Record<MobEquipmentSlot, EntityEquipmentSlot>;
const PLAYER_WIDTH = PLAYER_BOX.width;
const PLAYER_HEIGHT = PLAYER_BOX.height;
const TICKS_PER_SECOND = 20;

/** Bedrock's player collision box, which the server uses for entity interactions. */
const PLAYER_ENTITY_BOX = PLAYER_BOX;
/** Includes exact edge contacts in broad-phase boxes; damage still uses Java's exact distance test. */
const BOX_QUERY_EPSILON = 1e-7;

/** Distance between the closest points of two entity collision boxes. */
const distanceOutsideEntityBoxes = (
    first: EntityPosition,
    firstBox: EntityFacts['box'],
    second: EntityPosition,
    secondBox: EntityFacts['box']
): number => {
    const horizontalX = Math.max(0, Math.abs(first.x - second.x) - (firstBox.width + secondBox.width) / 2);
    const horizontalZ = Math.max(0, Math.abs(first.z - second.z) - (firstBox.width + secondBox.width) / 2);
    const vertical = Math.max(0, first.y - (second.y + secondBox.height), second.y - (first.y + firstBox.height));
    return Math.hypot(horizontalX, vertical, horizontalZ);
};
const TNT_LAUNCH_SPEED = 0.2;
const TNT_GRAVITY = 0.04;
const TNT_DRAG = 0.98;

/** Scales the amount of velocity removed by one tick of drag. */
const dragWithModifier = (drag: number, modifier: number): number => 1 - (1 - drag) * modifier;

/**
 * The vertical velocity a bouncy body leaves a floor or a ceiling with, Java's
 * `Entity.restituteMovementAfterCollisions`. The share of the move made before the hit gets back
 * that share of a tick's gravity, and its drag is scaled toward none by the same share, before the
 * bounciness reverses the velocity.
 *
 * @param attempted - The vertical velocity the body moved by.
 * @param moved - How far it got before the collision stopped it.
 * @param airDrag - Java's `getAirDrag`, the 0.98 vertical drag with the air drag modifier applied.
 */
const restitutedY = (
    attempted: number,
    moved: number,
    gravity: number,
    airDrag: number,
    bounciness: number
): number => {
    const share = attempted === 0 ? 0 : moved / attempted;
    return (share * gravity - attempted) * (1 + share * (airDrag - 1)) * bounciness;
};

/** Java's `LivingEntity.computeModifiedFriction`: a friction with its loss scaled, kept within 0 and 1. */
const modifiedFriction = (friction: number, modifier: number): number =>
    Math.min(1, Math.max(0, 1 - (1 - friction) * modifier));

/**
 * The share of its speed a body keeps after a tick on the ground, as Java's
 * `LivingEntity.travelInAir` works it out: the block's friction modified by the friction
 * modifier, times the 0.91 air drag modified by the air drag modifier.
 */
const groundDrag = (blockFriction: number, frictionModifier: number, airDragModifier: number): number =>
    modifiedFriction(blockFriction, frictionModifier) * modifiedFriction(DRAG, airDragModifier);

/** The immutable recipe facts `craftInto` uses after a book accepts its trial grid. */
interface CraftIntoCandidate {
    readonly recipeId: string;
    readonly consumedPerCraft: number;
    readonly resultCount: number;
}

/** Resolves an entity name through the shared Java-to-Bedrock table and the active content registry. */
const runtimeEntityIdentifierOf = (identifier: string, content: ServerContent): string | undefined =>
    bedrockEntityIdentifierOf(identifier, (candidate) => content.entities.registry.has(candidate));

/**
 * The effects Java's `LivingEntity.canBeAffected` refuses a type in each entity type tag: the
 * silverfish infestation, the slime oozing, and an undead mob's poison and regeneration.
 */
const JAVA_TAG_EFFECT_IMMUNITIES: readonly (readonly [string, readonly string[]])[] = [
    ['minecraft:immune_to_infested', ['minecraft:infested']],
    ['minecraft:immune_to_oozing', ['minecraft:oozing']],
    ['minecraft:ignores_poison_and_regen', ['minecraft:poison', 'minecraft:regeneration']]
];

/**
 * The effects a Java class's own `canBeAffected` override refuses, by the entity type that runs
 * it: `Spider` (and the cave spider it is the parent of) poison, `WitherBoss` and
 * `WitherSkeleton` wither, `Parched` weakness, and `AbstractNautilus` poison. Java keeps these in
 * code, so the table is the only copy the server can read.
 */
const JAVA_TYPE_EFFECT_IMMUNITIES: ReadonlyMap<string, readonly string[]> = new Map([
    ['minecraft:spider', ['minecraft:poison']],
    ['minecraft:cave_spider', ['minecraft:poison']],
    ['minecraft:wither', ['minecraft:wither']],
    ['minecraft:wither_skeleton', ['minecraft:wither']],
    ['minecraft:parched', ['minecraft:weakness']],
    ['minecraft:nautilus', ['minecraft:poison']],
    ['minecraft:zombie_nautilus', ['minecraft:poison']]
]);

/**
 * Whether an active data-driven entity accepts the named status effect: not when its
 * `minecraft:mob_effect_immunity` names it, nor when Java's `canBeAffected` refuses it the
 * effect by its entity type tags or its class.
 */
export const acceptsStatusEffect = (entity: EntityInstance, identifier: string): boolean => {
    const normalized = normalizeStatusEffectId(identifier);
    if (JAVA_TYPE_EFFECT_IMMUNITIES.get(entity.type.identifier)?.includes(normalized) === true) return false;
    for (const [tag, effects] of JAVA_TAG_EFFECT_IMMUNITIES)
        if (effects.includes(normalized) && entity.hasTag(tag)) return false;
    const immunity = entity.componentParams('minecraft:mob_effect_immunity');
    if (!isRecord(immunity) || !Array.isArray(immunity.mob_effects)) return true;
    return !immunity.mob_effects.some(
        (effect) => typeof effect === 'string' && normalizeStatusEffectId(effect) === normalized
    );
};

/** The default eye position as a fraction of a non-player entity's hitbox height. */
export const PROJECTILE_EYE_HEIGHT_FRACTION = ENTITY_EYE_HEIGHT_FRACTION;

/** The body and flight lifetime state of one active projectile. */
interface ProjectileState {
    readonly hitEntities: Set<number>;
}

/** The component instance that owns an entity's current fuse. */
interface FuseState {
    readonly params: unknown;
}

/** Values that depend only on one entity's current active component map. */
interface RuntimeComponentFacts {
    readonly componentToken: object;
    readonly hasGravity: boolean;
    readonly hasCollision: boolean;
    readonly canStandOnPowderSnow: boolean;
    readonly usesUniformAirDrag: boolean;
    readonly airDragModifier: number;
    readonly frictionModifier: number;
    readonly bounciness: number;
    readonly families: readonly string[];
    /**
     * Whether the body travels as Java's `LivingEntity` does, moving by its velocity before
     * gravity applies; every other Java body applies its gravity first.
     */
    readonly movesBeforeGravity: boolean;
    /** Whether gravity the definition turns off still pulls the body out of water, as Java's fish. */
    readonly fallsOutOfWater: boolean;
    /**
     * How high the body walks up a ledge without jumping: Java's `step_height` attribute for its
     * type, or the base of its `minecraft:variable_max_auto_step` for a type Java has no row for.
     */
    readonly maxUpStep: number | undefined;
}

/** The last medium sample, which only stays valid while its inputs stay identical. */
interface MediumCache {
    readonly position: EntityPosition;
    readonly width: number;
    readonly height: number;
    readonly blockRevision: number;
}

/** The fuse length in seconds, sampled when a component declares a range. */
const fuseLengthSeconds = (params: Record<string, unknown>, random: () => number): number => {
    const length = params['fuse_length'];
    if (typeof length === 'number') return length;
    if (!isRecord(length)) return 0;

    const minimum = typeof length.range_min === 'number' ? length.range_min : 0;
    const maximum = typeof length.range_max === 'number' ? length.range_max : minimum;
    return minimum + (maximum - minimum) * Math.max(0, Math.min(1, random()));
};

/** Whether a point along a projectile's path overlaps a target's data-driven box. */
const projectileOverlaps = (
    at: EntityPosition,
    projectile: { readonly width: number; readonly height: number },
    target: EntityPosition,
    width: number,
    height: number
): boolean =>
    Math.abs(at.x - target.x) <= projectile.width / 2 + width / 2 + PROJECTILE_HIT_MARGIN &&
    Math.abs(at.z - target.z) <= projectile.width / 2 + width / 2 + PROJECTILE_HIT_MARGIN &&
    at.y + projectile.height >= target.y - PROJECTILE_HIT_MARGIN &&
    at.y <= target.y + height + PROJECTILE_HIT_MARGIN;

/** Turns a direction, speed, and spread into a projectile velocity. */
const projectileVelocity = (
    direction: EntityPosition,
    speed: number,
    inaccuracy: number,
    random: { nextFloat(): number }
): EntityPosition => {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    const unit =
        length > 0
            ? { x: direction.x / length, y: direction.y / length, z: direction.z / length }
            : { x: 0, y: 0, z: 1 };
    const spread = Math.max(0, inaccuracy) * 0.0075;
    const gaussian = (): number => {
        const first = Math.max(Number.MIN_VALUE, random.nextFloat());
        const second = random.nextFloat();
        return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
    };
    const scattered =
        spread === 0
            ? unit
            : { x: unit.x + gaussian() * spread, y: unit.y + gaussian() * spread, z: unit.z + gaussian() * spread };
    const launchSpeed = Math.max(0, Number.isFinite(speed) ? speed : 0);

    return {
        x: scattered.x * launchSpeed,
        y: scattered.y * launchSpeed,
        z: scattered.z * launchSpeed
    };
};

/**
 * A store player as the runtime's player inputs take it: its entity while it has one, and its
 * components, which take an input themselves while the player is in no store.
 */
export type PlayerInputTarget = Pick<StorePlayer, 'entity' | 'getComponents'>;

/** How to build one {@link EntityRuntime}. */
export interface EntityRuntimeOptions {
    /**
     * The built content, read back lazily.
     *
     * The world adapter is assembled before `buildServerContent` returns, so a
     * runtime that held the content directly could not be built at all. This
     * is the same closure `contentWorldViews` takes for the same reason.
     */
    content(): ServerContent;
    readonly world: EntityWorldFacts;
    readonly host: EntityHostFacts;
    /** Adds and re-files listeners for entities with `minecraft:vibration_listener`. */
    readonly gameEvents?: {
        add(listener: GameEventListener): (() => void) | undefined;
        move(listener: GameEventListener): void;
    };
    /** Receives everything the runtime met and could not carry out. */
    report?(message: string): void;
    /**
     * Called once per entity, after its spawn event has run.
     *
     * This is how a server that has to show an entity to a client learns that
     * one exists. The runtime's index is the behavior; the body a client is
     * sent is the host's, and it is created here rather than by every caller
     * of {@link EntityRuntime.spawn}.
     */
    onSpawn?(entity: DataEntity, cause: EntitySpawnCause): void;
    /** Called once per entity, after it has left the index. */
    onRemove?(entity: DataEntity, reason: string): void;
    /** Called once per entity about to be removed, while it is still in the store and the index. */
    onRemoving?(entity: DataEntity, reason: string): void;
    /** Called when a mob's melee swing reaches its target, before the blow. */
    onMeleeHit?(attacker: DataEntity, target: number): void;
    /**
     * Called before a heal, with why the entity heals as `EntityHealCause` names it.
     * @returns The health to give instead, where 0 or less gives none.
     */
    healGuard?(entity: DataEntity, amount: number, cause: HealCause): number;
    /** Called after a heal gave health. */
    onHealed?(entity: DataEntity, amount: number, cause: HealCause): void;
    /** Called after an entity's health changed, by whatever changed it. */
    onHealthChanged?(entity: DataEntity, before: number, after: number): void;
    /**
     * Called before a data-driven entity's blast hurts or clears anything, with the blocks it
     * would clear.
     * @returns Whether to cancel it, or the blocks to clear instead.
     */
    explosionGuard?(
        source: DataEntity,
        blocks: readonly BlockPosition[]
    ): { readonly cancel: true } | { readonly blocks: readonly BlockPosition[] };
    /**
     * Called when a projectile reaches an entity or a block, before what the hit does.
     * @param velocity - The projectile's motion as it hit, which `hitVector` reads.
     */
    onProjectileHit?(
        projectile: DataEntity,
        hit: { readonly entity: number } | { readonly block: EntityPosition },
        at: EntityPosition,
        velocity: EntityPosition
    ): void;
    /**
     * Called before an entity is tamed, with the runtime id of who tames it.
     * @returns Whether the taming goes on.
     */
    tameGuard?(entity: DataEntity, tamer: number): boolean;
    /** Called once an entity was tamed. */
    onTamed?(entity: DataEntity, tamer: number): void;
    /** Called as a data-driven entity's event applies: its name and the groups it adds and removes. */
    onEntityEvent?(entity: DataEntity, effects: EventEffects): void;
    /** Called after a data-driven entity's blast went off, with the blocks it cleared. */
    onExploded?(source: DataEntity, cleared: ContentBlastResult['destroyedBlocks']): void;
    /**
     * The type clients are shown an entity as when it is not the entity's own, such as the type an
     * inert actor was saved with, which its saved form carries as `shownAs`.
     */
    shownAs?(entity: DataEntity): string | undefined;
    /**
     * Draws the next runtime id, so a host can keep one pool of them.
     *
     * A goal names a target by runtime id and does not care which index
     * answers, so the ids of this runtime's entities and of the host's players
     * have to be drawn from the same counter. A host that keeps its own
     * entities supplies this; one that does not gets a counter from 1.
     */
    nextId?(): number;
}

/** The host view exposed to the runtime, with its per-tick player index. */
interface RuntimeEntityHostFacts extends EntityHostFacts {
    playerById(id: number): ContentEntity | undefined;
}

/** One entity's registration in the world's game-event listener registry. */
interface EntityGameEventRegistration {
    readonly listener: GameEventListener;
    readonly remove: () => void;
}

/** The kinds of point of interest that make a place a village, Java's `#minecraft:village`. */
const VILLAGE_POI_KINDS: readonly string[] = ['home', 'meeting', ...JAVA_POI_TYPES];

/** How far from a position Java looks for the points of interest of its village. */
const VILLAGE_RADIUS = 64;

/** The type an entity is shown as, as the part of a saved form that holds it, or nothing for its own. */
const shownAsOf = (shownAs: string | undefined): { readonly shownAs?: string } =>
    shownAs === undefined ? {} : { shownAs };

/** A store player's shown form as the part of a saved form that holds it, or nothing for any other entity. */
const shownPlayerOf = (form: PlayerShownForm | undefined): { readonly player?: PlainRecord } =>
    form === undefined ? {} : { player: { fields: form.fields, slots: form.slots } };

/** The live entities of one dimension, and the AI that drives them. */
export class EntityRuntime implements EntityScene {
    public readonly world: EntityWorldFacts;
    public readonly host: RuntimeEntityHostFacts;

    private readonly sourceHost: EntityHostFacts;
    private inTick = false;
    private playerSnapshot: readonly ContentEntity[] | undefined;
    private playersById: ReadonlyMap<number, ContentEntity> | undefined;

    /**
     * The entity store: membership of this dimension's data-driven entities and the change log
     * of their state. See {@link EntityStore}.
     */
    public readonly store: EntityStore;
    /**
     * Entities whose death is running, which refuse every further blow until it ends. Written
     * through {@link EntityRuntime.setDying}, so an undone unit puts it back.
     */
    private readonly dying = new Set<number>();
    /**
     * The grace period after a hit, by entity, for the blows that keep one. Written through
     * {@link EntityRuntime.setHitGrace}, so an undone unit puts it back.
     */
    private readonly hitGraces = new Map<number, HitGrace>();
    /** The game tick each player's shield is disabled until, after an axe's blow, by player id. */
    private readonly shieldsDisabled = new Map<number, number>();
    /** The causes each `blocks_attacks` damage type set stands for, by the set written out. */
    private readonly damageSets = new Map<string, ReadonlySet<DamageCause>>();
    /**
     * The last blow each player dealt and the last one it took, by player runtime id, which the
     * owner and trust goals read as Java's `getLastHurtMob` and `getLastHurtByMob`. A mob's own
     * are its damage record. Written through {@link EntityRuntime.markPlayerBlow}, so an undone
     * unit puts it back.
     */
    private readonly playerBlows = new Map<number, PlayerBlows>();

    /** Each boat's `VehicleEntity` damage, which blows add to and every tick takes from. */
    private readonly vehicleDamage = new Map<number, number>();
    /** What a flying mob's flap reads and sends. */
    private readonly flappingHost: FlappingHost = {
        isAir: (at) => {
            const block = this.world.blocks.get(blockPositionOf(at));
            return block === undefined || block.identifier === 'minecraft:air';
        },
        isPassenger: (entity) => this.rides.vehicleOf(entity.id) !== undefined,
        emit: (entity) => this.world.effects.emitGameEvent(FLAP_EVENT, blockPositionOf(entity.position), entity.id)
    };
    /** The entities whose coast this tick ran into a wall, as Java's `horizontalCollision` records. */
    private readonly horizontalCollisions = new Set<number>();
    /** What a snow golem's trail and a ravager's leaf breaking read and do. */
    private readonly mobBlockHost: MobBlockHost = {
        mobGriefing: () => ruleIsOn(this.world.level, MOB_GRIEFING),
        isAir: (at) => {
            const block = this.world.blocks.get(at);
            return block === undefined || block.identifier === AIR;
        },
        canSurvive: (identifier, at) => {
            const below = { x: at.x, y: at.y - 1, z: at.z };
            const block = this.world.blocks.get(below);
            if (block === undefined) return false;
            if (identifier === SNOW_LAYER) {
                // `SnowLayerBlock.canSurvive`: never on ice or a barrier, always on honey, soul
                // sand or mud, and otherwise on a full top face.
                const tags = javaBlockTagsForBedrock(this.content().tags, block.identifier, block.states);
                if (tags.includes(SNOW_CANNOT_SURVIVE_ON_TAG)) return false;
                if (tags.includes(SNOW_CAN_SURVIVE_ON_TAG)) return true;
            }
            return this.navigation().isSolid(below);
        },
        place: (entity, identifier, at) => {
            this.world.blocks.set(at, { identifier, states: {} }, true);
            this.world.effects.emitGameEvent(BLOCK_PLACE_EVENT, at, entity.id);
        },
        isLeaves: (at) => {
            const block = this.world.blocks.get(at);
            return (
                block !== undefined &&
                javaBlockTagsForBedrock(this.content().tags, block.identifier, block.states).includes(LEAVES_TAG)
            );
        },
        destroy: (at) => this.breakBlock(at),
        jump: (entity) => entity.body.jump()
    };
    /** What a cushion's fire and lava check reads and does. */
    private readonly cushionHost: CushionHost = {
        inLava: (entity) => entity.body.conditions.has('in_lava'),
        touchesFire: (entity) =>
            bodyTouchesBlock(entity.position, entity.facts.box, (at) => {
                const block = this.world.blocks.get(at);
                return (
                    block !== undefined &&
                    javaBlockTagsForBedrock(this.content().tags, block.identifier, block.states).includes(FIRE_TAG)
                );
            }),
        destroy: (entity, item) => {
            const at = blockPositionOf(entity.position);
            this.remove(entity.id, 'destroyed');
            if (ruleIsOn(this.world.level, ENTITY_DROPS)) this.host.drop(at, { identifier: item, count: 1 });
        }
    };
    /** What a minecart's reaction to an activator rail does. */
    private readonly railSensorHost: RailSensorHost = { ejectRiders: (entity) => this.ejectRiders(entity.body) };
    /** What a boat's bubble column step reads and does. */
    private readonly boatBubbleHost: BoatBubbleHost = {
        bubbleColumnAt: (at) => {
            const block = this.world.blocks.get(at);
            if (block?.identifier !== BUBBLE_COLUMN) return undefined;
            return block.states.drag_down === true ? 'down' : 'up';
        },
        isOpen: (at) => {
            const block = this.world.blocks.get(at);
            return (
                (this.navigation().collisionAt(at)?.length ?? 1) === 0 &&
                (block === undefined ||
                    liquidStateOf({ identifier: block.identifier, states: block.states }) === undefined)
            );
        },
        ejectRiders: (entity) => this.ejectRiders(entity.body)
    };
    /** The sensing of the damage run in progress, which the sensor guard and modifier share. */
    private readonly damageSensing: DamageSensingSlot;
    /**
     * Every blow an entity in the store takes runs through this, as intent, guards, modifiers and
     * commit ([ADR 0013](../../../../../docs/adr/0013-vetoable-actions-are-staged.md)). A host
     * adds before-hooks to it.
     */
    public readonly damagePipeline: DamagePipeline;
    /**
     * Where every entity of the dimension stands, which is what makes a neighbor search cheaper
     * than a scan. See ADR 0007.
     */
    public readonly index = new EntityIndex();

    /** The dropped stacks among this runtime's entities, and the system that runs them. */
    public readonly droppedItems: DroppedItems;

    /** The eyes of ender in flight among this runtime's entities, and the system that flies them. */
    public readonly eyesOfEnder: EyeOfEnderSignals;
    /** Every set of evoker fangs, which bites once and is gone. */
    public readonly evokerFangs: EvokerFangs;
    /** Every ominous item spawner, which lets its item go and is gone. */
    public readonly ominousItemSpawners: OminousItemSpawners;
    /** Every painting and leash knot, which hangs until what holds it goes. */
    public readonly hangingEntities: HangingEntities;
    /** Every area effect cloud, such as the dragon's breath. */
    public readonly areaEffectClouds: AreaEffectClouds;
    private readonly statueHost: CopperGolemStatueHost;

    /** The systems a store player's survival runs on, and its component state. */
    public readonly playerSystems: PlayerSystems;
    /**
     * Hears a store player whose update has thrown `ENTITY_FAILURE_LIMIT` (`EntityStore.ts`)
     * times in a row, which removes a mob. A player is its client's, so the host disconnects the
     * session instead, and the leave takes the entity out of the store. Every failed update was
     * undone, so the player is as its last good update left it. It fails again on each later tick
     * it stays, and this hears each of them. Left unset, the player is removed as a mob is.
     */
    public onPlayerFailed: ((entity: DataEntity, error: unknown) => void) | undefined;
    /**
     * Gives a store player's entity that an undo or a replay adds back the parts a store player
     * holds, before it enters the log, as `enterStore`'s `prepare` does at an entry. Left unset,
     * the entity comes back without them, and the next slot or player field written back to it
     * finds no writer.
     */
    public onPlayerReentered: ((entity: DataEntity) => void) | undefined;
    /** The entity each `EntityInstance` belongs to, which is how the AI seams resolve a body. */
    private readonly byInstance = new Map<EntityInstance, DataEntity>();
    /** The order each entity entered the store in, which {@link EntityRuntime.entities} cuts a walk off by. */
    private readonly admissionOf = new WeakMap<DataEntity, number>();
    /** How many entities the store has admitted, the next one's place in {@link EntityRuntime.admissionOf}. */
    private admissions = 0;
    /** Invalid interaction slots reported once per entity and request. */
    private readonly reportedInteractionSlots = new WeakMap<DataEntity, Set<string>>();
    /** Barter requests waiting for a piglin's admire behavior to finish. */
    private readonly pendingBarters = new WeakSet<DataEntity>();
    /** The last damage tick used by admiration and barter cooldowns. */
    private readonly lastDamagedAt = new WeakMap<DataEntity, number>();
    /** Last area-attack hit time per attacker and target. */
    private readonly areaAttackLastHitTicks = new WeakMap<DataEntity, Map<number, number>>();
    /** Component-derived physics values, valid until an entity rebuilds its active component map. */
    private readonly componentFactsByEntity = new WeakMap<DataEntity, RuntimeComponentFacts>();
    /** Whether each buoyant body was in a liquid on its last tick, for the boat's landing on water. */
    private readonly wasInLiquid = new WeakMap<DataEntity, boolean>();
    /** Medium samples can be reused until position, dimensions, or block writes change. */
    private readonly mediumByEntity = new WeakMap<DataEntity, MediumCache>();
    /** Area attackers whose player hit route has already been reported as unavailable. */
    private readonly reportedAreaAttackRoutes = new WeakSet<DataEntity>();
    /** Entities whose malformed barter table has already been reported. */
    private readonly reportedBarterTables = new WeakSet<DataEntity>();
    /**
     * The body being built right now.
     *
     * A goal component builds its support inside `new EntityInstance`, before
     * the entity it belongs to exists, and the support keeps the actuator and
     * the goal world it was handed. This is that body, and it is the only
     * moment at which an instance is not yet in the index.
     */
    private spawning: MobBody | undefined;
    private spawningRunsGoals = true;
    /** The pool each entity's spawn counted against, for `SpawnWorld.poolCount`. */
    private readonly pools = new Map<number, string>();
    /** The start height and pass-through blocks for each active falling-block entity. */
    private readonly fallingBlocks = new Map<
        number,
        { readonly startY: number; readonly fallThrough: ReadonlySet<string> }
    >();
    /** Flight age and impacts already passed through for each active projectile. */
    private readonly projectiles = new Map<number, ProjectileState>();
    /** How far each falling living body has dropped since it last stood on something, Java's `fallDistance`. */
    private readonly fallDistances = new Map<number, number>();
    /** How many ticks of cold each living body has taken in powder snow, Java's `ticksFrozen`. */
    private readonly frozenTicks = new Map<number, number>();
    /** The causes Java's `witch_resistant_to` damage type tag names, read from the content once. */
    private witchResistedCauses: ReadonlySet<DamageCause> | undefined;
    /** Ticks each live lightning bolt has existed, which decides when it strikes and when it goes. */
    private readonly lightningAges = new Map<number, number>();
    /**
     * The active explode component instance behind each body's ticking fuse. Written through
     * {@link EntityRuntime.setFuse}, so an undone unit puts it back.
     */
    private readonly fuses = new Map<number, FuseState>();
    /** One merchant per trading entity, kept because `persist_trades` means the offers are drawn once. */
    private readonly merchants = new Map<number, Merchant>();
    /** The player who put each animal in love, Java's `Animal.loveCause`, until it breeds or the entity goes. */
    private readonly loveCauses = new Map<number, string>();
    /** When each trader last restocked, and how often that day. */
    private readonly restocks = new Map<
        number,
        { readonly day: number; readonly count: number; readonly at: number }
    >();
    /** What a save kept of a restored trader, held until its merchant is first built from it. */
    private readonly merchantSnapshots = new Map<number, MerchantSnapshot>();
    /** Who rides whom, which both the rider's and the vehicle's goals read. */
    private readonly rides = new RideIndex();
    /** The boost of each mount steered with an item that has taken one. */
    private readonly steerings = new WeakMap<DataEntity, ItemSteering>();
    /** Stable identities of the entities or players holding data-driven entity leashes. */
    private readonly leashHolders = new Map<number, string>();
    /** Resolves persistent identities back to the currently loaded entity. */
    private readonly byPersistentIdentity = new Map<string, DataEntity>();
    /** The points of interest of the dimension, which eleven goals search. */
    private readonly interest = new PointsOfInterest({ navigation: () => this.navigation() });
    /** Who holds a ticket on each Java point of interest, by block position. */
    private readonly poiClaims = new Map<string, Set<number>>();
    /** The point-of-interest kinds already reported as unindexed, so each is said once. */
    private readonly unindexedPoi = new Set<string>();
    private readonly lookupContent: () => ServerContent;
    /** Recipe books are readonly content snapshots; a reload supplies a new key, and values keep only scalars. */
    private readonly craftIntoCache = new WeakMap<RecipeBook, Map<string, CraftIntoCandidate | null>>();
    private readonly onReport: (message: string) => void;
    private readonly onSpawn: (entity: DataEntity, cause: EntitySpawnCause) => void;
    private readonly onRemove: (entity: DataEntity, reason: string) => void;
    private readonly onRemoving: (entity: DataEntity, reason: string) => void;
    private readonly onMeleeHit: (attacker: DataEntity, target: number) => void;
    private readonly healGuard: (entity: DataEntity, amount: number, cause: HealCause) => number;
    private readonly onHealed: (entity: DataEntity, amount: number, cause: HealCause) => void;
    private readonly onHealthChanged: (entity: DataEntity, before: number, after: number) => void;
    private readonly explosionGuard: EntityRuntimeOptions['explosionGuard'];
    private readonly onExploded: EntityRuntimeOptions['onExploded'];
    private readonly onProjectileHit: EntityRuntimeOptions['onProjectileHit'];
    private readonly onEntityEvent: EntityRuntimeOptions['onEntityEvent'];
    private readonly tameGuard: EntityRuntimeOptions['tameGuard'];
    private readonly onTamed: EntityRuntimeOptions['onTamed'];
    private readonly shownAs: (entity: DataEntity) => string | undefined;
    private readonly gameEvents: EntityRuntimeOptions['gameEvents'];
    private readonly gameEventListeners = new Map<number, EntityGameEventRegistration>();
    private readonly drawId: () => number;
    private facts: EntityFactsLookup | undefined;
    private factsGeneration = -1;
    private spawner: Spawner | undefined;
    /** Java's `PhantomSpawner`, which this runtime runs in the overworld only, as Java's server does. */
    private readonly phantoms = new PhantomSpawner();
    /** The world the spawn rules read, kept because the despawn pass reads the same one. */
    private spawnWorld: SpawnWorld | undefined;
    /** The path finder's view, built once; see {@link EntityRuntime.navigation}. */
    private navigationView: CachedNavigationView | undefined;
    /** The last host-wide block revision seen by a tick-scoped navigation view. */
    private navigationBlockRevision: number | undefined;
    /** The brain callbacks are stable for this runtime and read live state through their closures. */
    private brainWorldView: ReturnType<typeof brainWorldOf> | undefined;
    private nextId = 1;

    public constructor(options: EntityRuntimeOptions) {
        this.lookupContent = options.content;
        this.world = options.world;
        this.sourceHost = options.host;
        const host: RuntimeEntityHostFacts = {
            ...options.host,
            players: () => this.playersForCurrentContext(),
            playerById: (id) => this.playerForCurrentContext(id)
        };
        // Host effects can synchronously change a player's position or eligibility before the
        // next mob in this same selector pass reads it, so that next lookup must get a fresh row.
        const invalidatePlayerAfter = (id: number): void => {
            if (this.inTick && this.playersById?.has(id) === true) this.invalidatePlayerSnapshot();
        };
        if (options.host.hurt !== undefined) {
            const hurt = options.host.hurt;
            host.hurt = (id, amount, cause, sourceId, deathMessageOverride) => {
                hurt(id, amount, cause, sourceId, deathMessageOverride);
                invalidatePlayerAfter(id);
            };
        }
        if (options.host.hurtByProjectile !== undefined) {
            const hurtByProjectile = options.host.hurtByProjectile;
            host.hurtByProjectile = (id, amount, projectileId, ownerId) => {
                hurtByProjectile(id, amount, projectileId, ownerId);
                invalidatePlayerAfter(id);
            };
        }
        if (options.host.applySonicBoom !== undefined) {
            const applySonicBoom = options.host.applySonicBoom;
            host.applySonicBoom = (id, amount, sourceId, impulse) => {
                applySonicBoom(id, amount, sourceId, impulse);
                invalidatePlayerAfter(id);
            };
        }
        if (options.host.applyStatusEffect !== undefined) {
            const applyStatusEffect = options.host.applyStatusEffect;
            host.applyStatusEffect = (id, effect) => {
                applyStatusEffect(id, effect);
                invalidatePlayerAfter(id);
            };
        }
        if (options.host.applyStatusEffectIfChanged !== undefined) {
            const applyStatusEffectIfChanged = options.host.applyStatusEffectIfChanged;
            host.applyStatusEffectIfChanged = (id, effect) => {
                const changed = applyStatusEffectIfChanged(id, effect);
                if (changed) invalidatePlayerAfter(id);
                return changed;
            };
        }
        if (options.host.removeStatusEffect !== undefined) {
            const removeStatusEffect = options.host.removeStatusEffect;
            host.removeStatusEffect = (id, identifier) => {
                const removed = removeStatusEffect(id, identifier);
                if (removed) invalidatePlayerAfter(id);
                return removed;
            };
        }
        if (options.host.knockback !== undefined) {
            const knockback = options.host.knockback;
            host.knockback = (id, directionX, directionZ, strength) => {
                knockback(id, directionX, directionZ, strength);
                invalidatePlayerAfter(id);
            };
        }
        this.host = host;
        this.onReport = options.report ?? (() => undefined);
        this.onSpawn = options.onSpawn ?? (() => undefined);
        this.onRemove = options.onRemove ?? (() => undefined);
        this.onRemoving = options.onRemoving ?? (() => undefined);
        this.onMeleeHit = options.onMeleeHit ?? (() => undefined);
        this.healGuard = options.healGuard ?? ((_entity, amount) => amount);
        this.onHealed = options.onHealed ?? (() => undefined);
        this.onHealthChanged = options.onHealthChanged ?? (() => undefined);
        this.explosionGuard = options.explosionGuard;
        this.onExploded = options.onExploded;
        this.onProjectileHit = options.onProjectileHit;
        this.onEntityEvent = options.onEntityEvent;
        this.tameGuard = options.tameGuard;
        this.onTamed = options.onTamed;
        this.shownAs = options.shownAs ?? (() => undefined);
        this.gameEvents = options.gameEvents;
        this.drawId =
            options.nextId ??
            (() => {
                const id = this.nextId;
                this.nextId += 1;
                return id;
            });
        this.store = new EntityStore((message) => this.report(message));
        const damageReads = {
            target: (id: number) => this.store.get(id),
            dying: (id: number) => this.dying.has(id),
            storeEntity: (id: number) => this.store.get(id),
            isPlayer: (id: number) => this.host.playerById(id) !== undefined,
            absorption: (target: DataEntity) => this.absorptionOf(target),
            reachesGameMode: (intent: DamageIntent) => {
                const target = this.store.get(intent.target);
                return (
                    target === undefined ||
                    !clientOwnsMovement(target.identifier) ||
                    this.playerSystems.reaches(target, intent)
                );
            },
            damagerView: (id: number) => this.mobById(id)?.view(),
            gameRule: (rule: 'fireDamage') => rule === 'fireDamage' && ruleIsOn(this.world.level, FIRE_DAMAGE),
            grace: (id: number) => this.hitGraces.get(id),
            mitigation: (target: DataEntity, intent: DamageIntent) => this.host.damageMitigation?.(target, intent),
            canAttack: (attacker: DataEntity, target: DataEntity) =>
                canEntityAttack(attacker.instance, target.instance),
            resists: (target: DataEntity, cause: string) =>
                isDroppedItem(target) && this.droppedItems.resistsDamage(target, cause),
            witchResists: (cause: string) => {
                this.witchResistedCauses ??= damageCausesInTag(this.content(), 'minecraft:witch_resistant_to');
                return this.witchResistedCauses.has(damageCauseOf(cause));
            },
            blocked: (target: DataEntity, intent: DamageIntent, amount: number) =>
                this.blockedBy(target, intent, amount)
        };
        this.damageSensing = new DamageSensingSlot(damageReads);
        this.damagePipeline = new DamagePipeline({
            guards: damageGuards(damageReads, this.damageSensing),
            modifiers: damageModifiers(damageReads, this.damageSensing),
            commit: (intent, computation, requested) => this.commitDamage(intent, computation, requested),
            reject: (intent, guard) =>
                this.store.occurred({
                    kind: 'occurrence',
                    occurrence: 'action-rejected',
                    data: { action: 'damage', entity: BigInt(intent.target), guard: guard.name }
                })
        });
        this.store.addInverseWriter((inverse) => this.writeInverse(inverse));
        this.droppedItems = new DroppedItems({
            spawn: (identifier, at, options) => this.spawn(identifier, at, options),
            byId: (id) => this.store.get(id),
            itemsWithin: (x, z, radius) => this.index.itemsWithin(x, z, radius),
            collisionAt: (position) => this.navigation().collisionAt(position),
            blockAt: (position) => this.navigation().blockAt(position),
            players: () => this.host.players(),
            minY: () => this.world.level.minY,
            maxY: () => this.world.level.maxY,
            gameTime: () => this.world.level.gameTime(),
            resists: (name, tag) => resistsDamageOf(name, tag, this.content()),
            maxCount: (name) => maxStackSizeOf(name, this.content()),
            remove: (id, reason) => this.remove(id, reason),
            damage: (id, amount, cause) => {
                const outcome = this.damage({
                    target: id,
                    cause,
                    amount,
                    source: { route: 'item', feedback: false, remembered: false }
                });
                return outcome.committed && outcome.taken > 0;
            },
            give: (playerId, itemId, stack) =>
                this.host.givePlayerItem?.(playerId, itemId, itemDropOf(stack)) ?? stack.count,
            stackChanged: (itemId, count) => this.host.itemStackChanged?.(itemId, count)
        });
        this.evokerFangs = new EvokerFangs({
            withinBox: (min, max) => this.index.withinBox(min, max),
            hurt: (entity, sourceId, cause, amount) =>
                void this.hurt(entity, sourceId, cause, amount, { route: 'area_attack' }),
            byId: (id) => this.store.get(id),
            remove: (id, reason) => this.remove(id, reason)
        });
        this.ominousItemSpawners = new OminousItemSpawners({
            randomInt: (bound) => this.world.random.nextInt(bound),
            fire: (identifier, at, speed, spread, owner) =>
                void this.launchProjectile(identifier, at, { x: 0, y: -1, z: 0 }, speed, spread, owner),
            drop: (at, item) => this.host.drop(blockPositionOf(at), item),
            playSound: (at, sound) => this.world.effects.playSound(blockPositionOf(at), sound),
            remove: (id, reason) => this.remove(id, reason)
        });
        this.hangingEntities = new HangingEntities({
            isSolid: (at) => this.navigation().isSolid(at),
            isOpen: (at) => !this.navigation().isSolid(at),
            randomInt: (bound) => this.world.random.nextInt(bound),
            isFence: (at) => {
                const block = this.world.blocks.get(at);
                return (
                    block !== undefined &&
                    javaBlockTagsForBedrock(this.content().tags, block.identifier, block.states).includes(FENCES_TAG)
                );
            },
            drop: (at, identifier) => this.host.drop(blockPositionOf(at), { identifier, count: 1 }),
            playSound: (at, sound) => this.world.effects.playSound(blockPositionOf(at), sound),
            remove: (id, reason) => this.remove(id, reason)
        });
        this.statueHost = {
            random: () => this.world.random.nextFloat(),
            isAir: (at) => (this.world.blocks.get(at)?.identifier ?? 'minecraft:air') === 'minecraft:air',
            setBlock: (at, identifier, states) => this.world.blocks.set(at, { identifier, states }, true),
            remove: (id, reason) => this.remove(id, reason)
        };
        this.areaEffectClouds = new AreaEffectClouds({
            withinBox: (min, max) => this.index.withinBox(min, max),
            hurt: (entity, sourceId, cause, amount) =>
                void this.hurt(entity, sourceId, cause, amount, { route: 'area_attack' }),
            heal: (id, amount) => void this.heal(id, amount),
            applyStatusEffect: (source, targetId, effect) =>
                void this.applyStatusEffectToId(source.instance, targetId, effect),
            remove: (id, reason) => this.remove(id, reason)
        });
        this.eyesOfEnder = new EyeOfEnderSignals({
            spawn: (identifier, at, options) => this.spawn(identifier, at, options),
            remove: (id, reason) => this.remove(id, reason),
            random: () => this.world.random.nextFloat(),
            playSoundAt: (at, sound) => this.host.playSoundAt?.(at, sound),
            levelEvent: (at, event, data) => this.host.levelEvent?.(at, event, data),
            drop: (at, stack) => void this.droppedItems.spawn(at, { stack })
        });
        this.playerSystems = new PlayerSystems({
            written: (entity, field, before, after) => this.store.written(entity, field, before, after),
            writtenSlot: (entity, container, slot, before, after) => {
                if (this.store.hasEntered(entity)) this.store.writtenSlot(entity.id, container, slot, before, after);
            },
            content: () => this.content(),
            level: this.world.level,
            tick: () => this.store.tick,
            blockAt: (at) => this.world.blocks.get(at),
            runtimeIdAt: (at) => this.world.blocks.runtimeIdAt?.(at),
            collisionAt: (at) => this.navigation().collisionAt(at),
            levelEvent: (at, event, data) => this.host.levelEvent?.(at, event, data),
            damage: (intent) => this.damage(intent),
            heal: (id, amount) => this.heal(id, amount, 'SelfHeal'),
            dying: (id) => this.dying.has(id),
            heldItem: (id) => this.host.heldItemOf?.(id),
            finishMeal: (id, item) => this.host.finishMeal?.(id, item)
        });
        this.rides.onChange = (rider, before, after) => {
            const entity = this.store.get(rider);
            if (entity !== undefined) this.store.written(entity, 'vehicle', before, after);
            else this.store.writtenLegacy(rider, 'vehicle', before, after);
        };
    }

    /** The built content. */
    public content(): ServerContent {
        return this.lookupContent();
    }

    /** The facts of every entity type, rebuilt when the content registry is replaced. */
    public typeFacts(): EntityFactsLookup {
        const registry = this.content().entities.registry;
        if (this.facts === undefined || this.factsGeneration !== registry.generation) {
            this.facts = new EntityFactsLookup(registry);
            this.factsGeneration = registry.generation;
        }
        return this.facts;
    }

    /**
     * Every live entity in spawn order, walked in place, for a caller that reads or changes the
     * entities as it goes.
     *
     * The walk visits the entities the store held when it began and skips one admitted after
     * that, as the copy it replaces did, so a mob a goal spawns first acts on the next tick. An
     * entity removed before the walk reaches it is not visited.
     */
    public *entities(): Generator<DataEntity, void, undefined> {
        const end = this.admissions;
        for (const entity of this.store.values()) {
            // The store keeps spawn order, so the first newer entity ends the walk.
            if ((this.admissionOf.get(entity) ?? 0) >= end) return;
            yield entity;
        }
    }

    /** One live entity by its runtime id, or undefined when this index holds no such entity. */
    public byId(id: number): DataEntity | undefined {
        return this.store.get(id);
    }

    /**
     * Every live entity within a radius of a position, in ascending runtime id order.
     *
     * The hot read of the whole runtime: `goalWorld.mobs` calls it once per
     * goal that searches for a neighbor, which at a hundred mobs is about
     * seventy-five times a tick. {@link EntityIndex} is what keeps that from
     * crossing every entity each time.
     */
    public near(center: EntityPosition, radius: number, families?: readonly string[]): readonly DataEntity[] {
        return this.index.within(center, radius, families);
    }

    /**
     * Java's `BellBlockEntity.updateEntities` for a bell that just rang: every living entity
     * within 32 blocks of the bell's center hears it, which writes the game time into a brain's
     * `HEARD_BELL_TIME` and sends a villager to hide.
     * @param at - The bell's block position.
     */
    public ringBell(at: EntityPosition): void {
        const center = { x: Math.floor(at.x) + 0.5, y: Math.floor(at.y) + 0.5, z: Math.floor(at.z) + 0.5 };
        const time = this.world.level.gameTime();
        for (const entity of this.near(center, BELL_HEARING_RANGE)) {
            if (entity.removed !== undefined || squaredDistance(entity.position, center) >= BELL_HEARING_RANGE ** 2)
                continue;
            entity.brain?.setMemory(MemoryModuleTypes.HEARD_BELL_TIME, time);
        }
    }

    /** Every live entity whose collision box intersects the given AABB, in ascending runtime id order. */
    public inBox(min: EntityPosition, max: EntityPosition): readonly DataEntity[] {
        return this.index.withinBox(min, max);
    }

    /** How many live entities of one type stand within a radius of a position. */
    public countOfType(identifier: string, at: EntityPosition, radius: number): number {
        return this.near(at, radius).filter((entity) => entity.identifier === identifier).length;
    }

    /**
     * Names an entity only when its active `minecraft:nameable` component accepts the name tag.
     *
     * @param id - The runtime id.
     * @param name - The custom name being assigned.
     * @returns Whether the entity accepted the name tag.
     */
    public nameEntity(id: number, name: string): boolean {
        const entity = this.byId(id);
        if (entity === undefined || !entity.instance.nameWithNameTag(name)) return false;
        entity.body.nameTag = name;
        return true;
    }

    /**
     * Whether an entity has active nameable data that permits name-tag renaming.
     *
     * @param id - The runtime id.
     * @returns Whether the entity can be renamed with a name tag.
     */
    public canNameEntity(id: number): boolean {
        const nameable = this.byId(id)?.instance.componentParams('minecraft:nameable');
        return isRecord(nameable) && nameable.allowNameTagRenaming === true;
    }

    /**
     * Whether an entity accepts a dye that changes its current palette color.
     *
     * @param id - The runtime id.
     * @param color - The dye color name.
     * @returns Whether the active component accepts this color change.
     */
    public canDyeEntity(id: number, color: string): boolean {
        const entity = this.byId(id);
        const colorIndex = javaDyeColorIndexOf(color);
        if (
            entity === undefined ||
            colorIndex === undefined ||
            !isDyeableParams(entity.instance.componentParams('minecraft:is_dyeable'))
        )
            return false;

        const componentColor = entity.instance.componentParams('minecraft:color');
        const currentColor = entity.body.color ?? (typeof componentColor === 'number' ? componentColor : undefined);
        return currentColor !== colorIndex;
    }

    /**
     * Applies a supported dye to an entity's dynamic color state.
     *
     * @param id - The runtime id.
     * @param color - The dye color name.
     * @returns Whether the color changed.
     */
    public dyeEntity(id: number, color: string): boolean {
        const entity = this.byId(id);
        const colorIndex = javaDyeColorIndexOf(color);
        if (entity === undefined || colorIndex === undefined || !this.canDyeEntity(id, color)) return false;

        entity.body.color = colorIndex;
        return true;
    }

    /** How many live entities count against one population pool's cap. */
    public poolCount(pool: string): number {
        let count = 0;
        for (const [id, name] of this.pools) if (name === pool && this.store.has(id)) count += 1;
        return count;
    }

    /**
     * Creates one entity and runs its spawn event.
     *
     * Exactly one spawn event runs: `minecraft:entity_spawned` by default,
     * `entity_born`, `entity_transformed` or `on_prime` for the other three
     * causes, and an event the caller names replaces it rather than adding to
     * it. That is the rule `@jsprismarine/entities` implements, and spawning
     * is the only place the server has to get it right.
     *
     * @returns The entity, or undefined when the content declares no such type.
     */
    public spawn(identifier: string, at: EntityPosition, options: SpawnOptions = {}): DataEntity | undefined {
        return this.spawnWithId(identifier, at, options);
    }

    /**
     * Spawns a store player's entity under the id the player was filed under at its login, which
     * {@link EntityRuntime.nextEntityId} or the server's pool drew. Otherwise {@link EntityRuntime.spawn}.
     */
    public spawnPlayer(id: number, at: EntityPosition, options: SpawnOptions = {}): DataEntity | undefined {
        return this.spawnWithId(PLAYER_IDENTIFIER, at, options, id);
    }

    /** Draws a runtime id from the pool this runtime's entities draw from, for a player not yet in a store. */
    public nextEntityId(): number {
        return this.drawId();
    }

    private spawnWithId(
        identifier: string,
        at: EntityPosition,
        options: SpawnOptions,
        id?: number
    ): DataEntity | undefined {
        const entity = this.create(identifier, at, options, undefined, false, id);
        if (entity === undefined) return undefined;
        this.prepare(entity, options.prepare);
        if (
            !this.hasValidFallingBlockData(entity) ||
            !this.droppedItems.isValid(entity) ||
            !this.eyesOfEnder.isValid(entity)
        ) {
            this.remove(entity.id, 'invalid_spawn_data');
            return undefined;
        }
        // Java's `Painting.create` draws the picture, and places nothing where none fits.
        if (isHangingEntity(entity) && !this.hangingEntities.place(entity, placeablePaintingVariants(this.content()))) {
            this.remove(entity.id, 'no_room_to_hang');
            return undefined;
        }

        entity.instance.spawn(options.cause ?? 'spawned', options.event);
        if (options.admit !== undefined && !options.admit(entity)) {
            this.remove(entity.id, 'refused_spawn');
            return undefined;
        }
        this.syncGameEventListener(entity);
        this.startFuse(entity);
        // Between the spawn event and the body, for the same reason the body comes last. The
        // event is what activates the component group a mob's `minecraft:equipment` usually
        // sits in - a piglin's weapon depends on whether `melee_unit` or `ranged_unit` was
        // added - so a roll before it would find no component, and a roll after the body
        // would leave the client a frame of an empty-handed skeleton.
        this.watchEquipment(entity);
        this.equip(entity);
        this.rollDoorBreaking(entity, spawnEventFor(options.cause ?? 'spawned', options.event));
        // Everything up to here built the entity, so it enters the log with the form it has now.
        this.store.enter(entity, this.savedFormOf(entity));
        // After the spawn event, so the body a client is sent already carries whatever the
        // event added: a baby is born a baby rather than growing into one on the next tick.
        this.onSpawn(entity, options.cause ?? 'spawned');
        this.addRiders(entity);
        if ((options.cause ?? 'spawned') === 'spawned') this.seatChickenJockey(entity);
        return entity;
    }

    /**
     * Java's `Zombie.finalizeSpawn` jockey rolls for a baby zombie that has just spawned: it may
     * climb onto a free chicken near it or get a chicken spawned under it. See
     * {@link assembleChickenJockey}.
     */
    private seatChickenJockey(rider: DataEntity): void {
        if (!CHICKEN_JOCKEY_RIDERS.has(rider.identifier) || !rider.instance.hasComponent('minecraft:is_baby')) return;
        if (this.rides.vehicleOf(rider.id) !== undefined) return;
        const { position } = rider;
        const { width, height } = rider.facts.box;
        const across = width / 2 + CHICKEN_SEARCH.horizontal;
        assembleChickenJockey<DataEntity>({
            nextFloat: () => rider.instance.random.next(),
            // Java's `EntitySelector.ENTITY_NOT_BEING_RIDDEN`: alive, carrying no one and riding nothing.
            freeChickens: () =>
                this.inBox(
                    { x: position.x - across, y: position.y - CHICKEN_SEARCH.vertical, z: position.z - across },
                    { x: position.x + across, y: position.y + height + CHICKEN_SEARCH.vertical, z: position.z + across }
                ).filter(
                    (chicken) =>
                        chicken.identifier === CHICKEN &&
                        chicken.id !== rider.id &&
                        this.rides.ridersOf(chicken.id).length === 0 &&
                        this.rides.vehicleOf(chicken.id) === undefined
                ),
            // `Chicken.finalizeSpawn` with no group data makes the first of a group an adult.
            spawnChicken: () => {
                const chicken = this.spawn(CHICKEN, position, { cause: 'spawned', yaw: rider.body.yaw });
                if (chicken?.instance.hasComponent('minecraft:is_baby') === true)
                    chicken.instance.fire('minecraft:ageable_grow_up');
                return chicken;
            },
            mount: (chicken) => {
                if (this.rides.ridersOf(chicken.id).length < seatCountOf(chicken))
                    this.rides.mount(rider.id, chicken.id);
            }
        });
    }

    /**
     * `minecraft:addrider`: a vehicle whose spawn gave it the component arrives carrying the
     * riders it names, each spawned with its own event, the way Java's `Spider.finalizeSpawn`
     * seats a skeleton on its spider. A rider that names its own riders, such as a strider's
     * baby strider jockey, brings them in turn.
     */
    private addRiders(vehicle: DataEntity): void {
        const params = vehicle.instance.componentParams('minecraft:addrider');
        if (!isRecord(params)) return;
        const riders = Array.isArray(params.riders) ? params.riders : [params];
        for (const rider of riders) {
            if (!isRecord(rider) || typeof rider.entity_type !== 'string') continue;
            const event = typeof rider.spawn_event === 'string' ? rider.spawn_event : undefined;
            const spawned = this.spawn(rider.entity_type, vehicle.position, {
                cause: 'spawned',
                ...(event === undefined ? {} : { event })
            });
            if (spawned === undefined) continue;
            if (this.rides.ridersOf(vehicle.id).length < seatCountOf(vehicle)) this.rides.mount(spawned.id, vehicle.id);
            if (this.rides.vehicleOf(spawned.id) !== vehicle.id) {
                this.report(`${vehicle.identifier} has no seat for the ${spawned.identifier} it adds as a rider`);
                this.remove(spawned.id, 'unseated_rider');
            }
        }
    }

    /**
     * Brings one saved entity back, with the state it was saved with.
     *
     * No spawn event runs. The record already holds what the spawn event did
     * the first time, and running it again would add the groups a second time
     * and reset every attribute the entity had spent: a wounded mob would come
     * back at full health and a sheared sheep with its wool.
     *
     * @param at - Where the saved body stood, which the record does not carry
     *   because the actor compound already does.
     * @param id - The runtime id to give it, which undoing a removal and a store player entering
     *   another store pass; a restore from a save draws a new one.
     * @param prepare - Writes host state onto the entity before it enters the change log, as
     *   `SpawnOptions.prepare` does for a spawn.
     * @returns The entity, or undefined when no loaded pack declares its type,
     *   in which case the caller restores the saved body the way it always did.
     */
    public restore(
        record: DataEntityRecord,
        at: EntityPosition,
        id?: number,
        prepare?: (entity: DataEntity) => void
    ): DataEntity | undefined {
        const entity = this.create(
            record.identifier,
            at,
            {
                pool: record.pool,
                yaw: record.yaw,
                pitch: record.pitch,
                data: record.spawnData
            },
            record.persistentIdentity,
            true,
            id
        );
        if (entity === undefined) return undefined;
        if (!this.hasValidFallingBlockData(entity)) {
            this.remove(entity.id, 'invalid_spawn_data');
            return undefined;
        }

        applyDataEntityRecord(entity, record);
        if (record.merchant !== undefined) this.merchantSnapshots.set(entity.id, record.merchant);
        this.watchEquipment(entity);
        if (record.leashHolderIdentity !== undefined) this.setLeashHolder(entity.id, record.leashHolderIdentity);
        if (entity.instance.hasComponent('minecraft:projectile')) {
            this.projectiles.set(entity.id, { hitEntities: new Set() });
        }
        entity.body.containerCapacity = this.containerCapacityOf(entity.instance);
        this.syncGameEventListener(entity);
        this.startFuse(entity);
        this.prepare(entity, prepare);
        this.store.enter(entity, this.savedFormOf(entity));
        this.onSpawn(entity, 'loaded');
        return entity;
    }

    /**
     * Runs a caller's `prepare` on an entity the index holds and the log does not yet, and takes
     * the entity back out when it throws, so no entity stays in the queries that never entered
     * the log or reached a client.
     */
    private prepare(entity: DataEntity, prepare: ((entity: DataEntity) => void) | undefined): void {
        if (prepare === undefined) return;
        try {
            prepare(entity);
        } catch (error: unknown) {
            this.remove(entity.id, 'invalid_spawn_data');
            throw error;
        }
    }

    /**
     * The saved form of one live entity, as a change log membership entry carries it: the
     * persistence record and what the actor compound holds beside it, which is also what a
     * client is sent when it first sees the entity.
     *
     * @returns Plain data with the runtime id, the position, the velocity, the record as it would
     *   be written, the tags, the status effects, the vehicle it rides, the online owner, the shown
     *   conditions, the actor record tags and the attributes with their bounds, for a store
     *   player what clients are shown of it beside its entity (`entity/playerShown.ts`), and the
     *   type an inert actor is shown as (`savedForm.ts` reads it back as logged fields).
     */
    public savedFormOf(entity: DataEntity): PlainRecord {
        const { body } = entity;
        const record = dataEntityRecordOf(
            entity,
            this.pools.get(entity.id),
            this.leashHolders.get(entity.id),
            this.merchantSnapshotOf(entity)
        );
        // The JSON round trip is the one the save makes, so the form holds what a save holds.
        const written = plainOf(JSON.parse(JSON.stringify(record)));
        if (written === undefined || !isPlainRecord(written))
            throw new PrismarineEntityErrors.EntityHasNoPlainRecord({ identifier: entity.identifier, id: entity.id });
        return {
            id: entity.id,
            position: { x: body.position.x, y: body.position.y, z: body.position.z },
            velocity: { x: body.velocity.x, y: body.velocity.y, z: body.velocity.z },
            record: written,
            tags: [...body.tags],
            statusEffects: [...body.statusEffects.values()].map((effect) => ({ ...effect })),
            vehicle: this.rides.vehicleOf(entity.id) ?? null,
            owner: body.owner ?? null,
            conditions: SHOWN_CONDITIONS.filter((condition) => body.conditions.has(condition)),
            actorTags: body.actorTags ?? null,
            // The record keeps only each attribute's current value; a reader of the log needs its bounds.
            attributes: Object.fromEntries(
                entity.instance.attributes.names().flatMap((name) => {
                    const attribute = entity.instance.attributes.get(name);
                    if (attribute === undefined) return [];
                    const { base, min, max, current } = attribute;
                    return [[name, { base, min, max, current }]];
                })
            ),
            ...shownPlayerOf(this.playerSystems.shownFormOf(entity)),
            ...shownAsOf(this.shownAs(entity))
        };
    }

    /**
     * Adds an entity back from the saved form a membership entry carries, with the runtime id it
     * had. This is the inverse of a removal.
     */
    private reenter(saved: PlainRecord): void {
        const { id, position, velocity, record, tags, statusEffects, vehicle, owner, conditions, actorTags } = saved;
        const restored = record === undefined ? undefined : dataEntityRecordFrom(record);
        const at = bodyFieldValue('position', position ?? null);
        if (typeof id !== 'number' || restored === undefined)
            throw new PrismarineEntityErrors.MembershipEntryHasNoRecord();
        const prepare = clientOwnsMovement(restored.identifier) ? this.onPlayerReentered : undefined;
        const entity = this.restore(restored, at, id, prepare);
        if (entity === undefined)
            throw new PrismarineEntityErrors.EntityNotRestored({ identifier: restored.identifier, id });
        entity.body.restore('velocity', bodyFieldValue('velocity', velocity ?? null));
        entity.body.tags.replace(stringsIn('tags', tags ?? []));
        entity.body.statusEffects.replace(statusEffectsIn(statusEffects ?? []).map((effect) => [effect.id, effect]));
        entity.body.restore('owner', bodyFieldValue('owner', owner ?? null));
        entity.body.restore('actorTags', bodyFieldValue('actorTags', actorTags ?? null));
        const shown = stringsIn('conditions', conditions ?? []);
        for (const condition of SHOWN_CONDITIONS) entity.body.conditions.restore(condition, shown.includes(condition));
        const ridden = linkIn('vehicle', vehicle ?? null);
        if (ridden !== undefined) this.rides.mount(id, ridden);
    }

    /**
     * Writes one inverse entry back without logging it, for {@link EntityStore}'s undo.
     *
     * @returns Whether the entry addresses an entity this runtime holds or a link it keeps.
     */
    private writeInverse(inverse: StateEntry): boolean {
        if (inverse.kind === 'membership') {
            const id = Number(inverse.entity);
            if (inverse.change === 'leave') {
                if (!this.store.has(id)) return false;
                this.remove(id, 'undone');
            } else this.reenter(inverse.saved);
            return true;
        }
        if (inverse.field === 'inventory-slot') {
            const { entity: id, container, slot } = inverse.address;
            const entity = this.store.get(Number(id));
            if (entity === undefined || !clientOwnsMovement(entity.identifier)) return false;
            return this.playerSystems.restoreSlot(entity, container, slot, inverse.after);
        }
        if (inverse.field !== 'entity') return false;
        const id = Number(inverse.address.entity);
        const { field } = inverse.address;
        if (field === 'vehicle') {
            const vehicle = linkIn(field, inverse.after);
            if (vehicle === undefined) this.rides.dismount(id);
            else this.rides.mount(id, vehicle);
            return true;
        }
        const entity = this.store.get(id);
        if (entity === undefined) return false;
        this.writeField(entity, field, inverse.after);
        return true;
    }

    /** Writes one logged field of a data entity back, without running its setter's side effects. */
    private writeField(entity: DataEntity, field: string, value: PlainData): void {
        const { body, instance } = entity;
        if (clientOwnsMovement(entity.identifier) && this.playerSystems.restore(entity, field, value)) return;
        if (isBodyField(field)) {
            body.restore(field, bodyFieldValue(field, value));
            return;
        }
        const separator = field.indexOf(':');
        const kind = separator === -1 ? field : field.slice(0, separator);
        const name = field.slice(separator + 1);
        switch (kind) {
            case 'tags':
                body.tags.replace(stringsIn(field, value));
                return;
            case 'statusEffects':
                body.statusEffects.replace(statusEffectsIn(value).map((effect) => [effect.id, effect]));
                return;
            case 'equipmentInventorySlots':
                body.equipmentInventorySlots.replace(equipmentInventorySlotsIn(value));
                return;
            case 'attribute':
                instance.attributes.restore(attributeNamed(name), attributeIn(value));
                return;
            case 'property':
                instance.properties.set(name, propertyIn(value));
                return;
            case 'component':
                instance.componentState.write(name, componentStateIn(value));
                return;
            case 'groups': {
                // The rebuild initializes the components that come back. Everything the groups
                // change wrote was logged before it and is undone next, and everything it did not
                // write is put back from here, so the attributes and state end up exact.
                const attributes = instance.attributes
                    .names()
                    .map((attribute) => [attribute, instance.attributes.get(attribute)] as const);
                const states = [...instance.componentState.entries()];
                instance.restoreComponentGroups(stringsIn(field, value));
                for (const attribute of instance.attributes.names())
                    if (!attributes.some(([kept]) => kept === attribute)) instance.attributes.restore(attribute, null);
                for (const [attribute, kept] of attributes) instance.attributes.restore(attribute, kept ?? null);
                for (const [component] of [...instance.componentState.entries()])
                    if (!states.some(([kept]) => kept === component)) instance.componentState.write(component, null);
                for (const [component, state] of states) instance.componentState.write(component, state);
                this.index.refreshBox(entity);
                this.index.refreshFamilies(entity);
                return;
            }
            case 'condition':
                body.conditions.restore(name, booleanField(field)(value));
                return;
            case MERCHANT_FIELD: {
                // Built again from the logged offers on the next ask, which a trade screen makes.
                const snapshot = merchantIn(value);
                this.merchants.delete(entity.id);
                if (snapshot === undefined) this.merchantSnapshots.delete(entity.id);
                else this.merchantSnapshots.set(entity.id, snapshot);
                return;
            }
            case 'leash': {
                const holder = identityIn(field, value);
                if (holder === undefined) this.leashHolders.delete(entity.id);
                else this.leashHolders.set(entity.id, holder);
                return;
            }
        }
        throw new PrismarineEntityErrors.NoFieldWriter({ field });
    }

    /** Points a leashed entity's lead at a holder, or cuts it, and logs the change. */
    private setLeashHolder(id: number, holder: string | undefined): void {
        const before = this.leashHolders.get(id);
        if (before === holder) return;
        if (holder === undefined) this.leashHolders.delete(id);
        else this.leashHolders.set(id, holder);
        const entity = this.store.get(id);
        if (entity !== undefined) this.store.written(entity, 'leash', before, holder);
    }

    /** Logs a write that the entities package reported for an instance, once it belongs to an entity. */
    private instanceWritten(instance: EntityInstance, field: string, before: unknown, after: unknown): void {
        const entity = this.byInstance.get(instance);
        if (entity !== undefined) this.store.written(entity, field, before, after);
    }

    /** The population pool one entity's spawn counted against, if any. */
    public poolOf(id: number): string | undefined {
        return this.pools.get(id);
    }

    /** A falling-block payload must name a block the active content stack knows. */
    private hasValidFallingBlockData(entity: DataEntity): boolean {
        if (!entity.instance.hasComponent('jsprismarine:falling_block')) return true;

        const blockName = entity.spawnData?.['block'];
        if (typeof blockName === 'string' && this.content().blocks.types.has(blockName)) return true;

        this.report(`${entity.identifier} needs a known block identifier in its spawn data`);
        return false;
    }

    /**
     * Builds one entity and puts it in the index, without running anything on it.
     *
     * The step {@link EntityRuntime.spawn} and {@link EntityRuntime.restore}
     * share. What separates the two is only what happens to the entity next: a
     * spawn runs its spawn event, a restore writes the state it was saved with.
     */
    private create(
        identifier: string,
        at: EntityPosition,
        options: SpawnOptions,
        persistentIdentity?: string,
        restoring = false,
        fixedId?: number
    ): DataEntity | undefined {
        const content = this.content();
        const registry = content.entities.registry;
        const reference = identifier.includes('<') ? identifier.slice(0, identifier.indexOf('<')) : identifier;
        if (!registry.has(reference)) {
            this.report(`asked to spawn ${reference}, which the content declares no entity type for`);
            return undefined;
        }

        const facts = this.typeFacts().get(reference);
        if (facts === undefined) return undefined;
        const brainMob = brainMobFor(content.entities.brains, reference);

        if (fixedId !== undefined && this.store.has(fixedId)) {
            this.report(`asked to add ${reference} under runtime id ${fixedId}, which another entity holds`);
            return undefined;
        }
        const id = fixedId ?? this.drawId();
        // A fixed id, such as one a snapshot carries into a fresh runtime, must not come round again
        // from the counter. A host's own pool is the host's to keep apart.
        if (fixedId !== undefined && fixedId >= this.nextId) this.nextId = fixedId + 1;

        // The body comes first: a goal component builds its support while the instance is being
        // constructed, and that reads the actuator straight away.
        const body = new MobBody(id, at, facts);
        body.yaw = options.yaw ?? 0;
        body.pitch = options.pitch ?? 0;
        body.beamTarget = options.beamTarget;
        body.showBottom = options.showBottom;
        body.invulnerable = options.invulnerable === true;
        body.owner = options.ownerId;
        body.ownerIdentity = options.ownerId === undefined ? undefined : this.host.playerIdentityOf?.(options.ownerId);
        this.spawning = body;
        this.spawningRunsGoals = brainMob === undefined || brainMob.alsoRunsGoals;
        const executeEntityEvent = this.world.blocks.executeEntityEvent;
        const filterContext = entityFilterContextOf(body, this);
        const goalWorld = goalWorldOf(body, this);
        const instance = new EntityInstance(registry.holder(reference), {
            id,
            restoring,
            ...(options.parents === undefined ? {} : { parents: options.parents.map((parent) => parent.instance) }),
            environment: {
                actuator: {
                    ...actuatorOf(body, this),
                    randomTeleport: (destination) => this.endermanTeleport(id, destination)
                },
                broadcastAnger: (entity, request) => this.broadcastAnger(entity, request),
                effects: {
                    playSound: (_source, sound) => this.world.effects.playSound(blockPositionOf(body.position), sound),
                    emitParticle: (_source, particle) =>
                        this.world.effects.spawnParticle(blockPositionOf(body.position), particle),
                    emitVibration: (_source, vibration) =>
                        this.world.effects.emitGameEvent(`minecraft:${vibration}`, blockPositionOf(body.position), id),
                    applyStatusEffect: (source, target, effect) =>
                        this.applyComponentStatusEffect(source, target, effect),
                    removeStatusEffect: (source, target, identifier) =>
                        this.removeComponentStatusEffect(source, target, identifier),
                    ...(executeEntityEvent === undefined
                        ? {}
                        : {
                              executeEventOnBlock: (_source, position, event) =>
                                  executeEntityEvent.call(
                                      this.world.blocks,
                                      blockPositionOf(position),
                                      { id, identifier: reference, position: body.position },
                                      event
                                  )
                          }),
                    dropItem: (_source, slot) => {
                        const equipmentSlot = mobEquipmentSlotOf(slot);
                        if (equipmentSlot === undefined) {
                            this.report(`entity ${id} asks to drop unsupported equipment slot ${slot}`);
                            return;
                        }
                        const item = body.equipment[equipmentSlot];
                        if (item === undefined) return;

                        const inventorySlot = body.equipmentInventorySlots.get(equipmentSlot);
                        body.setEquipment(withoutEquipmentSlot(body.equipment, equipmentSlot));
                        if (inventorySlot !== undefined) {
                            body.setContainerSlot(inventorySlot, undefined);
                            body.equipmentInventorySlots.delete(equipmentSlot);
                        }
                        this.host.drop(blockPositionOf(body.position), item);
                    }
                } satisfies EntityEffects,
                filterContext: () => filterContext,
                blockAt: (position) => this.world.blocks.get(position),
                targetProximity: () => {
                    const target = goalWorld.target();
                    return target === undefined
                        ? undefined
                        : {
                              id: target.id,
                              distance: distance(body.position, target.position()),
                              visible: goalWorld.canSee(target)
                          };
                },
                componentSetChanged: (changed) => {
                    const current = this.byInstance.get(changed);
                    if (current !== undefined) this.index.refreshBox(current);
                },
                componentStateWritten: (changed, write) =>
                    this.instanceWritten(changed, `component:${write.component}`, write.before, write.after),
                attributeWritten: (changed, write) => {
                    this.instanceWritten(changed, `attribute:${write.name}`, write.before, write.after);
                    const before = write.before?.current;
                    const after = write.after?.current;
                    const entity = this.byInstance.get(changed);
                    if (
                        write.name === 'health' &&
                        entity !== undefined &&
                        before !== undefined &&
                        after !== undefined
                    ) {
                        if (before !== after) this.onHealthChanged(entity, before, after);
                    }
                },
                propertyWritten: (changed, write) =>
                    this.instanceWritten(changed, `property:${write.name}`, write.before, write.after),
                eventApplied: (changed, effects) => {
                    const entity = this.byInstance.get(changed);
                    if (entity !== undefined) this.onEntityEvent?.(entity, effects);
                },
                componentGroupsWritten: (changed, write) =>
                    this.instanceWritten(changed, 'groups', write.before, write.after),
                entitySensorCandidates: (_entity, query) => this.entitySensorCandidates(body, query),
                lookers: (_entity, query) => this.lookers(body, query),
                targetLooker: (looking, looker) => this.targetLooker(body, looking, looker),
                random: {
                    next: () => this.world.random.nextFloat(),
                    nextInt: (bound) => this.world.random.nextInt(bound)
                },
                javaStats: content.entities.javaStats,
                javaNavigation: javaEntityNavigation(reference, content.entities.javaNavigation),
                remove: (removed, reason) => this.removeInstance(removed, reason),
                damage: (hurt, event) => this.componentDamage(hurt, event),
                transform: (from, request) => this.transform(from, request),
                spawnEntity: (from, request) => this.spawnFromComponent(from, request),
                route: (trigger, from) => this.route(trigger, from),
                report: (message) => this.report(`${reference}: ${message}`)
            }
        });

        body.containerCapacity = this.containerCapacityOf(instance);

        this.spawning = undefined;
        this.spawningRunsGoals = true;

        let entityForBarter: DataEntity | undefined;
        const profession = brainMob?.id === 'minecraft:villager' ? professionOf(instance) : undefined;
        const brain = brainMob?.makeBrain({
            baby: instance.hasComponent('minecraft:is_baby'),
            ...(profession === undefined ? {} : { variant: `minecraft:${profession}` }),
            ...(brainMob.id === 'minecraft:piglin'
                ? {
                      onBarter: () => {
                          if (entityForBarter !== undefined) this.completePiglinBarter(entityForBarter);
                      }
                  }
                : {})
        });
        const entity = new DataEntity({
            body,
            instance,
            brainMob,
            brain,
            spawnData: options.data,
            ...(persistentIdentity === undefined ? {} : { persistentIdentity })
        });
        entityForBarter = entity;
        body.onWrite = (field, before, after) => this.store.written(entity, field, before, after);
        if (clientOwnsMovement(entity.identifier))
            body.onImpulse = ({ x, y, z }) => {
                // The client owns a player's movement (ADR 0008), so the store moves nothing, and
                // replication asks the client to take the impulse once the tick seals.
                this.store.occurred({
                    kind: 'occurrence',
                    occurrence: 'impulse',
                    data: { entity: BigInt(id), x, y, z }
                });
            };
        this.store.admit(entity);
        this.admissionOf.set(entity, this.admissions++);
        this.byPersistentIdentity.set(entity.persistentIdentity, entity);
        this.byInstance.set(instance, entity);
        // After the index, and with the hook set last: everything a component did while the
        // instance was being built moved a body nothing was watching yet, and the index files
        // where the body ended up rather than where it started.
        this.index.add(entity);
        body.onMove = () => {
            this.index.refile(entity);
            const registration = this.gameEventListeners.get(id);
            if (registration !== undefined) this.gameEvents?.move(registration.listener);
        };
        if (options.pool !== undefined) this.pools.set(id, options.pool);

        if (brain !== undefined) {
            brain.delaySensorStarts((bound) => this.world.random.nextInt(bound));
            brainMob?.initMemories?.({ world: this.brainWorld(), body: brainMobOf(entity, brain, this) });
        }

        return entity;
    }

    /** Creates the child or item requested by an active entity component. */
    private spawnFromComponent(source: EntityInstance, request: EntitySpawnRequest): boolean {
        const parent = this.byInstance.get(source);
        if (parent === undefined) return false;

        const at = parent.position;
        let spawned = false;
        for (let index = 0; index < request.count; index += 1) {
            if (request.kind === 'item') {
                const identifier = legacy_item_aliases[request.identifier] ?? request.identifier;
                if (!this.content().items.registry.has(identifier)) {
                    this.report(`${parent.identifier} asks to spawn unknown item ${request.identifier}`);
                    continue;
                }
                this.host.drop(blockPositionOf(at), { identifier, count: 1 });
                if (request.itemEvent !== undefined)
                    source.raise(request.itemEvent.event, request.itemEvent.target, 'minecraft:spawn_entity');
                spawned = true;
            } else {
                const child = this.spawn(request.identifier, at, {
                    cause: request.cause,
                    event: request.event
                });
                if (child === undefined) continue;
                if (request.shouldLeash) this.setLeashHolder(child.id, parent.persistentIdentity);
                spawned = true;
            }

            if (request.sound !== undefined && request.sound.length > 0)
                this.world.effects.playSound(blockPositionOf(at), request.sound);
        }

        return spawned;
    }

    /** Takes an entity out of the world. */
    public remove(id: number, reason: string): void {
        const entity = this.store.get(id);
        if (entity === undefined) return;
        this.onRemoving(entity, reason);
        // A listener of the removal may have removed it already.
        if (this.store.get(id) !== entity) return;
        // Between ticks too, such as a command's kill: the store holds the entry for the next tick.
        const saved = this.store.hasEntered(entity) ? this.savedFormOf(entity) : undefined;
        entity.removed = reason;
        this.store.detach(entity);
        this.byPersistentIdentity.delete(entity.persistentIdentity);
        if (this.trackedIdentities.has(entity.persistentIdentity)) {
            // A chunk unload saves the entity, it does not end it; only another removal does.
            if (reason === 'chunk unload') this.unloadedIdentities.add(entity.persistentIdentity);
            else {
                this.trackedIdentities.delete(entity.persistentIdentity);
                this.unloadedIdentities.delete(entity.persistentIdentity);
            }
        }
        // Kept for an undo of the removal: the saved form the entity is added back from has neither.
        this.setDying(id, false);
        this.setHitGrace(id, undefined);
        this.byInstance.delete(entity.instance);
        entity.body.onEquipmentChanged = undefined;
        this.index.remove(entity);
        this.removeGameEventListener(id);
        entity.body.onMove = undefined;
        this.pools.delete(id);
        this.merchants.delete(id);
        this.loveCauses.delete(id);
        this.restocks.delete(id);
        for (const [key, claimants] of this.poiClaims) {
            claimants.delete(id);
            if (claimants.size === 0) this.poiClaims.delete(key);
        }
        this.merchantSnapshots.delete(id);
        this.fallingBlocks.delete(id);
        this.projectiles.delete(id);
        this.fallDistances.delete(id);
        this.frozenTicks.delete(id);
        this.lightningAges.delete(id);
        // Not through `setFuse`: an undo adds the entity back through `restore`, which starts its fuse again.
        this.fuses.delete(id);
        this.rides.remove(id);
        this.leashHolders.delete(id);
        if (reason !== 'chunk unload') {
            for (const [leashedId, holderIdentity] of this.leashHolders) {
                if (holderIdentity === entity.persistentIdentity) this.setLeashHolder(leashedId, undefined);
            }
        }
        this.onRemove(entity, reason);
        if (saved !== undefined) this.store.recordLeave(id, saved);
    }

    /**
     * Ties a leashable data-driven entity to a live entity or player.
     *
     * A second holder can replace the first only when the target's
     * `minecraft:leashable.can_be_stolen` field is true. The holder is saved by
     * stable identity so the relationship survives a restart or chunk unload.
     *
     * @param holderId - Runtime id of the entity or player holding the lead.
     * @param targetId - Runtime id of the entity receiving the lead.
     * @returns Whether the target accepted the leash.
     */
    public attachLead(holderId: number, targetId: number): boolean {
        const target = this.store.get(targetId);
        if (target === undefined || holderId === targetId || !target.instance.hasComponent('minecraft:leashable'))
            return false;

        const holderEntity = this.store.get(holderId);
        const playerIdentity = holderEntity === undefined ? this.host.playerIdentityOf?.(holderId) : undefined;
        const holderIdentity =
            holderEntity?.persistentIdentity ??
            (playerIdentity === undefined ? undefined : `${PLAYER_LEASH_HOLDER_PREFIX}${playerIdentity}`);
        if (holderIdentity === undefined) return false;

        const currentHolderIdentity = this.leashHolders.get(targetId);
        if (currentHolderIdentity === holderIdentity) return true;
        if (currentHolderIdentity !== undefined) {
            const leashable = target.instance.componentParams('minecraft:leashable');
            if (!isRecord(leashable) || leashable.can_be_stolen !== true) return false;
        }

        this.setLeashHolder(targetId, holderIdentity);
        this.raiseLeashEvent(target, 'on_leash');
        return true;
    }

    /**
     * Moves every lead a player holds onto another entity, which then holds them: Java's
     * `Entity.interact` does this when a sneaking player uses a leashable entity.
     *
     * The new holder has to carry an active `minecraft:leashable_to` and be an adult, and each
     * lead moves only when its entity is within its snap distance of the new holder, which is
     * Java's `Leashable.canHaveALeashAttachedTo`.
     *
     * @param playerId - Runtime id of the player holding the leads.
     * @param holderId - Runtime id of the entity taking them.
     * @returns Whether any lead moved.
     */
    public transferLeashes(playerId: number, holderId: number): boolean {
        const holder = this.store.get(holderId);
        if (holder === undefined || holder.removed !== undefined) return false;
        if (
            !holder.instance.hasComponent('minecraft:leashable_to') ||
            holder.instance.hasComponent('minecraft:is_baby')
        )
            return false;
        const playerIdentity = this.host.playerIdentityOf?.(playerId);
        if (playerIdentity === undefined) return false;

        let moved = false;
        for (const [leashedId, identity] of [...this.leashHolders]) {
            if (identity !== `${PLAYER_LEASH_HOLDER_PREFIX}${playerIdentity}` || leashedId === holderId) continue;
            const leashed = this.store.get(leashedId);
            if (leashed === undefined) continue;
            if (distance(leashed.position, holder.position) > leashSnapDistance(leashed.identifier)) continue;
            this.setLeashHolder(leashedId, holder.persistentIdentity);
            moved = true;
        }
        return moved;
    }

    /**
     * Snaps every lead whose entity got past its snap distance from the holder, dropping the
     * lead item when entity drops are on, which is Java's `Leashable.tickLeash`.
     */
    private tickLeashes(): void {
        for (const [leashedId] of [...this.leashHolders]) {
            const leashed = this.store.get(leashedId);
            const holderId = this.leashHolderIdOf(leashedId);
            const holder = holderId === undefined ? undefined : this.mobById(holderId);
            if (leashed === undefined || holder === undefined) continue;
            if (distance(leashed.position, holder.position()) <= leashSnapDistance(leashed.identifier)) continue;

            this.setLeashHolder(leashedId, undefined);
            this.raiseLeashEvent(leashed, 'on_unleash');
            if (ruleIsOn(this.world.level, ENTITY_DROPS))
                this.host.drop(blockPositionOf(leashed.position), { identifier: 'minecraft:lead', count: 1 });
        }
    }

    /** Cuts the incoming leash or any cuttable leashes held by an entity with shears. */
    private cutLeashesAt(target: DataEntity): boolean {
        let cut = false;
        const leashable = target.instance.componentParams('minecraft:leashable');

        if (this.leashHolders.has(target.id) && isRecord(leashable) && leashable.can_be_cut !== false) {
            this.setLeashHolder(target.id, undefined);
            this.raiseLeashEvent(target, 'on_unleash');
            cut = true;
        }

        const leashableTo = target.instance.componentParams('minecraft:leashable_to');
        if (!isRecord(leashableTo) || leashableTo.can_retrieve_from !== true) return cut;

        for (const [leashedId, holderIdentity] of this.leashHolders) {
            if (holderIdentity !== target.persistentIdentity) continue;
            const leashed = this.store.get(leashedId);
            if (leashed === undefined) continue;

            const component = leashed.instance.componentParams('minecraft:leashable');
            if (!isRecord(component) || component.can_be_cut === false) continue;

            this.setLeashHolder(leashedId, undefined);
            this.raiseLeashEvent(leashed, 'on_unleash');
            cut = true;
        }

        return cut;
    }

    /**
     * Runs one server tick for eligible live entities.
     *
     * @param tick - The world's tick counter, which the spawner's per-pool cadence uses.
     * @param shouldTick - Optional chunk eligibility rule; omitted callers tick every entity.
     */
    public tick(tick: number, shouldTick?: (position: EntityPosition) => boolean): void {
        this.inTick = true;
        try {
            this.refreshPlayerSnapshot();
            this.tickEntities(tick, shouldTick);
        } finally {
            this.inTick = false;
            this.invalidatePlayerSnapshot();
        }
    }

    /** The per-tick entity work, after the host player snapshot has been taken. */
    private tickEntities(tick: number, shouldTick?: (position: EntityPosition) => boolean): void {
        this.refreshOnlineOwners();
        this.interest.resetBlockCache();
        if (this.navigationView?.persistsAcrossTicks !== true) this.navigationView?.invalidateBlockCache();
        for (const entity of this.entities()) {
            // A player ticks wherever it stands, as the world's actor update lets it.
            if (shouldTick !== undefined && !clientOwnsMovement(entity.identifier) && !shouldTick(entity.position))
                continue;
            if (entity.removed !== undefined || this.store.isSkipped(entity.id)) continue;
            if (this.store.broken !== undefined) break;
            // This pass is an entity's last update of the tick, so it alone clears the entity's
            // run of failures: an actor update that finished must not hide an entity pass that
            // throws every tick, or the entity would never reach the limit.
            if (this.runUpdate(entity, 'update', () => this.updateEntity(entity, tick)))
                this.store.succeeded(entity.id);
        }
        if (this.store.broken !== undefined) return;
        this.tickLeashes();
        this.runSpawnCycle(tick);
        this.runPhantomSpawner();
        this.runDespawnCycle(shouldTick);
        this.discardNotAllowedInPeaceful(shouldTick);
    }

    /**
     * Runs one update of an entity as a unit (ADR 0015): a throw undoes what the update wrote,
     * skips the entity for the rest of the tick and counts against it, and the caller's pass goes
     * on. At `ENTITY_FAILURE_LIMIT` (`EntityStore.ts`) failures in a row the entity is removed,
     * and a player is handed to {@link EntityRuntime.onPlayerFailed} instead.
     *
     * @param entity - The entity the update belongs to.
     * @param name - What the update is called in the report of a throw.
     * @param update - The update.
     * @returns Whether the update finished. Clearing the entity's run of failures is the caller's.
     */
    public runUpdate(entity: DataEntity, name: string, update: () => void): boolean {
        const outcome = this.store.unit(update);
        if (!outcome.failed) return true;
        this.report(
            `${entity.identifier} ${entity.id} threw in its ${name}, which was undone: ${String(outcome.error)}`
        );
        if (!this.store.failed(entity.id) || this.store.broken !== undefined) return false;
        if (clientOwnsMovement(entity.identifier) && this.onPlayerFailed !== undefined)
            this.onPlayerFailed(entity, outcome.error);
        else this.remove(entity.id, 'update_failed');
        return false;
    }

    /** One entity's update in the entity pass, which {@link EntityRuntime.tickEntities} runs as a unit. */
    private updateEntity(entity: DataEntity, tick: number): void {
        if (entity.identifier === LIGHTNING_BOLT) {
            this.tickLightning(entity);
            return;
        }
        if (isDroppedItem(entity)) {
            this.droppedItems.update(entity);
            return;
        }
        if (isEyeOfEnderSignal(entity)) {
            this.eyesOfEnder.update(entity);
            return;
        }
        if (isEvokerFangs(entity)) {
            this.evokerFangs.update(entity);
            return;
        }
        if (isOminousItemSpawner(entity)) {
            this.ominousItemSpawners.update(entity);
            return;
        }
        if (isHangingEntity(entity)) {
            this.hangingEntities.update(entity);
            return;
        }
        if (isAreaEffectCloud(entity)) {
            this.areaEffectClouds.update(entity);
            return;
        }
        this.tickHitGrace(entity.id);
        this.tickVehicleDamage(entity.id);
        if (entity.instance.hasComponent(ITEM_HOPPER)) this.suckInItems(entity);
        this.updateMedium(entity);
        if (isCushion(entity) && updateCushion(entity, this.cushionHost)) return;
        this.tickTimers(entity.body);
        if (entity.runsGoals) this.resetNoActionTimeNearPlayers(entity);
        if (clientOwnsMovement(entity.identifier)) this.playerSystems.beforeComponents(entity);
        else if (entity.runsGoals) updateControlFlags(entity, this);
        entity.instance.tick(entity.runsGoals);
        this.tickDaylightBurn(entity);
        this.tickVoid(entity);
        if (entity.removed !== undefined) return;
        this.tickFreezing(entity, tick);
        if (entity.removed !== undefined) return;
        // The client moves this body and reports where it went as an input (ADR 0008), and its
        // survival is the player systems'.
        if (clientOwnsMovement(entity.identifier)) {
            this.playerSystems.tick(entity, tick);
            return;
        }
        entity.body.containerCapacity = this.containerCapacityOf(entity.instance);
        this.syncGameEventListener(entity);
        this.index.refreshFamilies(entity);
        this.tickBrain(entity);
        tickBrainNavigation(entity);
        if (isCopperGolem(entity) && tickCopperGolemStatue(entity, this.statueHost)) return;
        const from = { ...entity.position };
        const fromY = from.y;
        this.horizontalCollisions.delete(entity.id);
        // Java's ender dragon is `noPhysics`: its phases fly it, and nothing pulls it down.
        if (!JAVA_NO_PHYSICS.has(entity.identifier)) this.coast(entity);
        if (entity.removed !== undefined) return;
        if (this.componentFactsOf(entity).families.includes('boat')) tickBoatBubbles(entity, this.boatBubbleHost);
        this.step(entity);
        this.updateMedium(entity);
        this.updateGrounded(entity);
        updateFlapping(entity, from, this.flappingHost);
        if (entity.instance.hasComponent(BREAK_BLOCKS_COMPONENT) && this.collidedHorizontally(entity))
            breakLeaves(entity, this.mobBlockHost);
        leaveTrail(entity, this.mobBlockHost);
        this.checkFallDamage(entity, fromY);
        if (entity.removed !== undefined) return;
        // After the move, as `Mob.aiStep` picks up once `LivingEntity.aiStep` has moved the mob.
        this.pickUpLoot(entity);
        this.tickAreaAttack(entity, tick);
        if (entity.removed !== undefined) return;
        if (this.tickFuse(entity)) return;
        this.carryRiders(entity);
        this.giveRidersBreath(entity);
        this.steerings.get(entity)?.tick();
        if (entity.removed !== undefined) return;
        this.pushIntersectingEntity(entity);
    }

    /** Builds the current tick's player list and id index from the host's live view. */
    private refreshPlayerSnapshot(): void {
        const snapshot = this.sourceHost.players();
        this.playerSnapshot = snapshot;
        this.playersById = new Map(snapshot.map((player) => [player.id, player]));
    }

    /** The host's live player list outside a tick, or the shared tick snapshot inside one. */
    private playersForCurrentContext(): readonly ContentEntity[] {
        if (!this.inTick) return this.sourceHost.players();
        if (this.playerSnapshot === undefined) this.refreshPlayerSnapshot();
        return this.playerSnapshot ?? [];
    }

    /** Resolves one player without scanning the shared list. */
    private playerForCurrentContext(id: number): ContentEntity | undefined {
        if (!this.inTick) {
            if (this.sourceHost.playerById !== undefined) return this.sourceHost.playerById(id);
            return this.sourceHost.players().find((player) => player.id === id);
        }
        if (this.playersById === undefined) this.refreshPlayerSnapshot();
        return this.playersById?.get(id);
    }

    /** Drops both projections after a host action changes a player during this tick. */
    private invalidatePlayerSnapshot(): void {
        this.playerSnapshot = undefined;
        this.playersById = undefined;
    }

    /** Mirrors `Mob.checkDespawn`: a player strictly inside 32 blocks resets idle time. */
    private resetNoActionTimeNearPlayers(entity: DataEntity): void {
        const maximumDistanceSquared = MOB_NO_DESPAWN_DISTANCE * MOB_NO_DESPAWN_DISTANCE;
        const nearbyPlayer = this.host.players().some((player) => {
            const dx = player.position.x - entity.position.x;
            const dy = player.position.y - entity.position.y;
            const dz = player.position.z - entity.position.z;
            return dx * dx + dy * dy + dz * dz < maximumDistanceSquared;
        });
        if (nearbyPlayer) entity.instance.resetNoActionTime();
    }

    /**
     * Runs a zero-fuse `minecraft:explode` the killing hit queued, before the removal.
     *
     * The end crystal is the case: its `on_hurt` event adds a group whose fuse is zero,
     * and the death used to remove the entity before the fuse ever ticked, so a hit
     * crystal vanished without exploding. Only a fuse that resolves to zero runs here; a
     * fuse with time on it still dies unexploded, which is what killing a swelling
     * creeper does. A crystal an explosion destroyed does not explode again, matching
     * Java's `EndCrystal.hurtServer` skipping sources already in `#is_explosion`.
     *
     * @returns Whether the entity exploded, which also removed it.
     */
    private explodeOnDeath(entity: DataEntity): boolean {
        const params = entity.instance.componentParams('minecraft:explode');
        if (!isRecord(params) || params.fuse_lit !== true) return false;

        const cause = entity.body.damage.last()?.cause;
        if (cause === 'entity_explosion' || cause === 'block_explosion') return false;

        this.startFuse(entity);
        if (entity.body.fuseTicks !== 0) return false;

        this.explode(entity.body);
        return true;
    }

    /**
     * Invalidates block reads cached by the point-of-interest and navigation views.
     * @param chunkX - The changed chunk's x coordinate; omit both coordinates to clear all chunks.
     * @param chunkZ - The changed chunk's z coordinate.
     */
    public invalidateBlockCaches(chunkX?: number, chunkZ?: number): void {
        this.interest.invalidateBlockCache(chunkX, chunkZ);
        this.navigationView?.invalidateBlockCache(chunkX, chunkZ);
    }

    /**
     * Starts the spawn loop.
     *
     * The `SpawnWorld` comes from the caller rather than from here because
     * `src/content/world/views.ts` already projects it out of the assembled
     * adapter, and projecting it twice would be two places for the spawn
     * rules to read a different world.
     */
    public startSpawning(world: SpawnWorld): void {
        this.spawnWorld = world;
        this.spawner = new Spawner({
            // No Java biome spawns a phantom: `PhantomSpawner` does, for a player who has not slept.
            rules: this.content().spawnRules.filter((rule) => rule.identifier !== PHANTOM),
            world,
            random: this.world.random,
            onUnanswered: (test, reason) => this.report(`a spawn rule's ${test.test} test was ${reason}`)
        });
    }

    /**
     * The entities the spawner asked for on this tick, after they were created.
     *
     * `doMobSpawning` stops the cycle rather than the spawn, which is what Java's
     * `NaturalSpawner` does with it: the despawn pass still runs, so turning the rule off
     * empties a world instead of freezing it at whatever was already standing in it.
     */
    private runSpawnCycle(tick: number): readonly SpawnRequest[] {
        const spawner = this.spawner;
        if (spawner === undefined) return [];
        if (!ruleIsOn(this.world.level, SPAWN_MOBS)) return [];

        const requests = spawner.tick(tick);
        for (const request of requests)
            this.spawn(
                request.identifier,
                { x: request.position.x + 0.5, y: request.position.y, z: request.position.z + 0.5 },
                { event: request.spawnEvent, pool: request.pool }
            );
        return requests;
    }

    /**
     * One tick of Java's `PhantomSpawner`, which the overworld runs beside natural spawning when
     * it spawns monsters: off on peaceful, with `spawn_mobs` off or with `spawn_phantoms` off.
     */
    private runPhantomSpawner(): void {
        const { level, blocks } = this.world;
        if (level.dimension !== OVERWORLD) return;
        this.phantoms.tick({
            random: this.world.random,
            spawnsPhantoms: () =>
                level.difficulty() !== 'peaceful' && ruleIsOn(level, SPAWN_MOBS) && ruleIsOn(level, SPAWN_PHANTOMS),
            hasSkyLight: () => level.hasSkyLight,
            seaLevel: () => level.seaLevel,
            skyDarken: () => overworldSkyDarken(level.dayTime(), level.weather()),
            players: () => this.host.players(),
            canSeeSky: (at) => (blocks.skyLight?.(at) ?? 0) >= FULL_SKY_LIGHT,
            regionalDifficulty: (at) => regionalDifficulty(this.regionalDifficultyInputs(at)),
            difficultyId: () => DIFFICULTY_IDS[level.difficulty()],
            isValidEmptySpawnBlock: (at) => {
                const block = blocks.get(at);
                if (block === undefined) return false;
                const shape = this.navigation().collisionAt(at);
                return (
                    (shape === undefined || !isFullCubeShape(shape)) &&
                    liquidStateOf({ identifier: block.identifier, states: block.states }) === undefined &&
                    !javaBlockTagsForBedrock(this.content().tags, block.identifier, block.states).includes(
                        PREVENT_MOB_SPAWNING_INSIDE
                    )
                );
            },
            spawnPhantom: (at) => {
                this.spawn(PHANTOM, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
            }
        });
    }

    /**
     * Takes out every entity the population rules say should not be there.
     *
     * Only entities a spawn rule produced, which is what the pool record
     * distinguishes: an animal a player bred and a villager that belongs to a
     * village are nobody's to cull, and vanilla keeps them for the same
     * reason. The two rules are `@jsprismarine/spawning`'s, so the Y floor and
     * the simulation edge are one number each rather than one per caller.
     */
    private runDespawnCycle(shouldTick?: (position: EntityPosition) => boolean): void {
        const world = this.spawnWorld;
        if (world === undefined) return;

        for (const entity of this.entities()) {
            if (shouldTick !== undefined && !shouldTick(entity.position)) continue;
            if (!this.pools.has(entity.id)) continue;
            // A named mob is persistent, which Java's Mob.checkDespawn honors before any distance rule.
            const persistent =
                entity.body.nameTag !== undefined || entity.instance.hasComponent('minecraft:persistent');
            const reason = despawnReason({ position: blockPositionOf(entity.position), persistent }, world);
            if (reason !== undefined) this.remove(entity.id, reason);
        }
    }

    /**
     * Java's `Mob.checkDespawn` on peaceful: a mob whose type is not allowed in peaceful is
     * discarded, before any persistence rule, so a named zombie goes too. It runs for every
     * ticking mob rather than only the ones a spawn rule made, which is what empties a world when
     * its difficulty changes to peaceful and what clears a monster loaded from a save on its first
     * tick. The type's rule is Java's own, from the pinned server's `EntityType.isAllowedInPeaceful`.
     */
    private discardNotAllowedInPeaceful(shouldTick?: (position: EntityPosition) => boolean): void {
        if (this.world.level.difficulty() !== 'peaceful') return;
        const javaStats = this.content().entities.javaStats;
        for (const entity of this.entities()) {
            if (entity.removed !== undefined) continue;
            if (shouldTick !== undefined && !shouldTick(entity.position)) continue;
            if (javaEntityStats(entity.identifier, javaStats)?.allowedInPeaceful !== false) continue;
            this.remove(entity.id, 'not allowed in peaceful');
        }
    }

    /** Values read from an active component set only once until that set is rebuilt. */
    private componentFactsOf(entity: DataEntity): RuntimeComponentFacts {
        const componentToken = entity.instance.componentSetToken;
        const cached = this.componentFactsByEntity.get(entity);
        if (cached?.componentToken === componentToken) return cached;

        const instance = entity.instance;
        const physics = instance.componentParams('minecraft:physics');
        const physicsRecord = isRecord(physics) ? physics : undefined;
        const airDrag = instance.componentParams('minecraft:air_drag_modifier');
        const friction = instance.componentParams('minecraft:friction_modifier');
        const bounciness = instance.componentParams('minecraft:bounciness');
        const javaStats = javaEntityStats(entity.identifier, this.content().entities.javaStats);
        const autoStep = instance.componentParams('minecraft:variable_max_auto_step');
        const javaStep = javaStats?.attributes['minecraft:step_height'];
        const componentFacts: RuntimeComponentFacts = {
            componentToken,
            hasGravity: fallsUnderGravity(instance),
            hasCollision: physicsRecord === undefined || physicsRecord.hasCollision !== false,
            canStandOnPowderSnow: instance.hasComponent('minecraft:can_stand_on_powder_snow'),
            usesUniformAirDrag: instance.hasComponent('minecraft:uses_uniform_air_drag'),
            airDragModifier: typeof airDrag === 'number' ? airDrag : 1,
            frictionModifier: typeof friction === 'number' ? friction : 1,
            bounciness: typeof bounciness === 'number' ? bounciness : 0,
            families: instance.families(),
            // Java's attribute dump lists exactly the `LivingEntity` types.
            movesBeforeGravity: javaStats !== undefined,
            fallsOutOfWater:
                instance.javaNavigation?.navigationClass.endsWith('WaterBoundPathNavigation') === true &&
                !fallsUnderGravity(instance) &&
                !instance.hasComponent('minecraft:can_fly'),
            maxUpStep:
                typeof javaStep === 'number'
                    ? javaStep
                    : isRecord(autoStep) && typeof autoStep.base_value === 'number'
                      ? autoStep.base_value
                      : undefined
        };
        this.componentFactsByEntity.set(entity, componentFacts);
        return componentFacts;
    }

    /** Updates the liquid conditions every entity's components read this tick. */
    private updateMedium(entity: DataEntity): void {
        const { body, facts } = entity;
        const position = body.position;
        const box = facts.box;
        const blockRevision = this.world.blocks.blockRevision?.();
        const cached = this.mediumByEntity.get(entity);
        if (
            blockRevision !== undefined &&
            cached?.position === position &&
            cached.width === box.width &&
            cached.height === box.height &&
            cached.blockRevision === blockRevision
        ) {
            return;
        }

        const navigation = this.navigation();
        const [inWater, inLava] = bodyIntersectsMedia(position, box, navigation.isWater, navigation.isLava);
        const head = blockPositionOf({
            x: position.x,
            y: position.y + box.height - MOVEMENT_EPSILON,
            z: position.z
        });

        setCondition(body.conditions, 'in_water', inWater);
        setCondition(body.conditions, 'in_contact_with_water', inWater);
        setCondition(body.conditions, 'in_lava', inLava);
        setCondition(body.conditions, 'is_underwater', navigation.isWater(head));
        if (blockRevision !== undefined) {
            this.mediumByEntity.set(entity, { position, width: box.width, height: box.height, blockRevision });
        }
    }

    /** Rechecks support after AI movement, so packets describe the position clients receive. */
    private updateGrounded(entity: DataEntity): void {
        const componentFacts = this.componentFactsOf(entity);
        const grounded =
            componentFacts.hasCollision &&
            entity.body.velocity.y <= 0 &&
            isSupported(entity.position, entity.facts.box, this.navigation(), componentFacts.canStandOnPowderSnow);
        setCondition(entity.body.conditions, 'on_ground', grounded);
    }

    /** Runs one brain mob's activity update and then its brain. */
    private tickBrain(entity: DataEntity): void {
        const brain = entity.brain;
        const definition = entity.brainMob;
        if (brain === undefined || definition === undefined) return;

        this.updateBrainConditions(entity);
        // The context itself is tick-local; its world and mob views are cached and read live state.
        const context = { world: this.brainWorld(), body: brainMobOf(entity, brain, this) };
        if (definition.ticksBrain?.(context) === false) return;
        definition.updateActivity(context);
        brain.tick(context);
        this.syncBrainTarget(entity);
    }

    /**
     * Reports a brain mob's `ATTACK_TARGET` as its target, for a type whose Java class answers
     * `Mob.getTarget` from its brain (`getTargetFromBrain`).
     */
    private syncBrainTarget(entity: DataEntity): void {
        if (entity.brain === undefined || entity.brainMob?.targetFromBrain !== true) return;
        const target = entity.brain.getMemory(MemoryModuleTypes.ATTACK_TARGET);
        entity.body.target = target === undefined ? undefined : Number(target.id);
    }

    /**
     * Tells a brain mob a blow from a living attacker landed, Java's brain side of
     * `<Mob>.hurtServer`. A blow is direct when nothing came between, no projectile.
     */
    private brainWasHurt(entity: DataEntity, intent: DamageIntent): void {
        const definition = entity.brainMob;
        if (entity.brain === undefined || definition?.wasHurtBy === undefined || intent.attacker === undefined) return;
        const attacker = brainEntityById(intent.attacker, this);
        if (attacker === undefined) return;
        definition.wasHurtBy(
            { world: this.brainWorld(), body: brainMobOf(entity, entity.brain, this) },
            attacker,
            intent.projectile === undefined
        );
        this.syncBrainTarget(entity);
    }

    /**
     * Java's `Creaking.checkCanMove`, which decides the `can_move` and `active` conditions the
     * creaking's brain reads. Of the players its brain senses, one it may attack, wearing no gaze
     * disguise and looking at it (`isLookingAtMe` with tolerance 0.5 over its eyes, half a block
     * up and halfway between) freezes it while it is active, and wakes it while idle when within 12
     * blocks: it then targets that player. An active creaking with no such player near goes idle.
     */
    private creakingCanMove(entity: DataEntity): boolean {
        const { body, brain } = entity;
        if (brain === undefined) return true;
        const active = body.conditions.has(EntityCondition.ACTIVE);
        const seen = brain.getMemory(MemoryModuleTypes.NEAREST_PLAYERS) ?? [];
        const feet = body.position.y;
        const eyes = feet + body.facts.box.height * ENTITY_EYE_HEIGHT_FRACTION;
        const heights = [eyes, feet + CREAKING_LOOK_HEIGHT, (eyes + feet) / 2];
        const disguises = this.content().tags.members('item', GAZE_DISGUISE_TAG);
        let attackable = false;
        for (const sensed of seen) {
            const player = this.host.playerById(Number(sensed.id));
            if (player === undefined || player.creative === true || player.spectator === true) continue;
            attackable = true;
            const head = this.playerFilterView(player).equipment?.('head', 0)?.identifier();
            if (head !== undefined && disguises.includes(head)) continue;
            if (!this.looksAt(player, body, heights, CREAKING_LOOK_TOLERANCE, false)) continue;
            if (active) return false;
            if (distance(player.position, body.position) < CREAKING_ACTIVATION_RANGE) {
                // `Creaking.activate`.
                brain.setMemory(MemoryModuleTypes.ATTACK_TARGET, sensed);
                setCondition(body.conditions, EntityCondition.ACTIVE, true);
                return false;
            }
        }
        // `Creaking.deactivate`.
        if (active && !attackable) setCondition(body.conditions, EntityCondition.ACTIVE, false);
        return true;
    }

    /** Refreshes body facts that depend on the sniffer's live position and relationships. */
    private updateBrainConditions(entity: DataEntity): void {
        if (entity.identifier === 'minecraft:creaking') {
            setCondition(entity.body.conditions, EntityCondition.CAN_MOVE, this.creakingCanMove(entity));
            return;
        }
        if (entity.identifier !== 'minecraft:sniffer') return;

        const { body } = entity;
        const canSniff =
            !entity.instance.hasComponent('minecraft:is_baby') &&
            body.conditions.has(EntityCondition.ON_GROUND) &&
            !body.conditions.has(EntityCondition.IN_WATER) &&
            body.loveTicks <= 0 &&
            this.rides.vehicleOf(entity.id) === undefined &&
            !this.leashHolders.has(entity.id);
        setCondition(body.conditions, EntityCondition.CAN_SNIFF, canSniff);

        const digPosition = this.snifferDigPosition(body);
        const tags = digPosition === undefined ? undefined : this.content().tags;
        const block = digPosition === undefined ? undefined : this.world.blocks.get(digPosition);
        const explored =
            entity.brain
                ?.getMemory(MemoryModuleTypes.SNIFFER_EXPLORED_POSITIONS)
                ?.some(
                    (entry) =>
                        entry.dimension === this.world.level.dimension &&
                        entry.pos.x === digPosition?.x &&
                        entry.pos.y === digPosition?.y &&
                        entry.pos.z === digPosition?.z
                ) ?? false;
        const canDig =
            !entity.instance.hasComponent('minecraft:is_baby') &&
            digPosition !== undefined &&
            block !== undefined &&
            tags?.includes('block', 'minecraft:sniffer_diggable_block', block.identifier) === true &&
            !explored;
        setCondition(body.conditions, EntityCondition.CAN_DIG, canDig);
    }

    /**
     * The blocks as the path finder reads them.
     *
     * One view for the whole runtime rather than one per query. It memoizes
     * block reads a path search repeats thousands of times per tick while
     * reading the current day and sky state for sunlight-sensitive goals.
     */
    public navigation(): EntityBlockView {
        const blockRevision = this.world.blocks.blockRevision?.();
        if (
            this.navigationView !== undefined &&
            this.navigationView.persistsAcrossTicks !== true &&
            blockRevision !== undefined &&
            blockRevision !== this.navigationBlockRevision
        ) {
            // Without chunk revisions, a host-wide version is the only way to notice same-tick writes.
            this.navigationView.invalidateBlockCache();
        }
        this.navigationBlockRevision = blockRevision;
        this.navigationView ??= navigationViewOf(this.world.blocks, () => this.content(), this.world.level);
        return this.navigationView.view;
    }

    /** Whether the current block view leaves a clear eye-to-eye path. */
    public hasLineOfSight(from: EntityPosition, to: EntityPosition): boolean {
        return hasBlockLineOfSight(from, to, this.navigation());
    }

    /**
     * The body one `EntityInstance` drives.
     *
     * Every instance the runtime made is in the index, except the one being
     * constructed now, which is why {@link EntityRuntime.spawning} exists.
     */
    public bodyOf(instance: EntityInstance): MobBody | undefined {
        return this.byInstance.get(instance)?.body ?? this.spawning;
    }

    /** The goal world for one instance, or undefined when it runs no goals. */
    public goalWorldFor(instance: EntityInstance): GoalWorld | undefined {
        const body = this.bodyOf(instance);
        if (body === undefined) return undefined;
        const entity = this.byInstance.get(instance);
        // Goal components resolve their support during construction, before the instance is in
        // `byInstance`, so use the brain definition already resolved for the spawning body.
        if (entity !== undefined ? !entity.runsGoals : this.spawning !== undefined && !this.spawningRunsGoals)
            return undefined;
        return goalWorldOf(body, this);
    }

    /** The movement and look control for one instance. */
    public actuatorFor(instance: EntityInstance): EntityActuator | undefined {
        const body = this.bodyOf(instance);
        return body === undefined ? undefined : actuatorOf(body, this);
    }

    /** The one level the twenty brain mobs read. */
    public brainWorld() {
        this.brainWorldView ??= brainWorldOf(this);
        return this.brainWorldView;
    }

    /**
     * Item stacks lying within a radius, nearest first.
     *
     * Dropped items are the item subsystem's entities rather than this
     * runtime's, so they come from the host. A host with no item index finds
     * none, and the pickup goals stay asleep rather than reaching for
     * something that is not there.
     */
    public items(center: EntityPosition, radius: number): readonly GoalItem[] {
        const candidates = this.host.itemsNear?.(center, radius) ?? this.host.items?.() ?? [];
        const nearby: { readonly lying: ContentItemEntity; readonly distance: number; readonly order: number }[] = [];
        for (const [order, lying] of candidates.entries()) {
            const away = distance(center, lying.position);
            if (away <= radius) nearby.push({ lying, distance: away, order });
        }

        return nearby
            .sort((left, right) => left.distance - right.distance || left.order - right.order)
            .map(({ lying }) => ({
                id: lying.id,
                position: () => lying.position,
                identifier: () => lying.item.identifier,
                count: () => lying.item.count,
                ...(lying.filterView === undefined ? {} : { filterView: lying.filterView })
            }));
    }

    /** One entity or player, by runtime id, as a goal sees it. */
    public mobById(id: number): GoalMob | undefined {
        const entity = this.store.get(id);
        if (entity !== undefined) return goalMobOf(entity, this);

        const player = this.host.playerById(id);
        return player === undefined
            ? undefined
            : playerGoalMob(
                  player.id,
                  player.identifier,
                  player.position,
                  player.tags,
                  this.host.playerView?.(player.id),
                  this.playerCombat(player.id),
                  () => this.host.heldItemOf?.(player.id)
              );
    }

    /** The nearest point of interest of a kind, for the eleven goals that ask. */
    public poi(kind: string, center: EntityPosition, radius: number): EntityPosition | undefined {
        // Once per kind, because a goal asks every tick and the gap is worth naming once.
        if (!this.interest.knows(kind) && !this.unindexedPoi.has(kind)) {
            this.unindexedPoi.add(kind);
            this.report(`nothing indexes the ${kind} points of interest, so the goals that want one wait`);
        }
        return this.interest.nearest(kind, center, radius);
    }

    /**
     * Records a point of interest nothing in the blocks marks.
     *
     * The warden's `suspicious_location` and the dolphin's `buried_treasure`
     * arrive this way, from the subsystem that knows where they are.
     */
    public recordPointOfInterest(kind: string, at: EntityPosition): void {
        this.interest.record(kind, at);
    }

    /** Adds or removes the world's listener registration when an entity's active groups change. */
    private syncGameEventListener(entity: DataEntity): void {
        const current = this.gameEventListeners.get(entity.id);
        if (!entity.instance.hasComponent('minecraft:vibration_listener')) {
            if (current !== undefined) this.removeGameEventListener(entity.id);
            return;
        }

        if (current !== undefined) {
            this.gameEvents?.move(current.listener);
            return;
        }

        const listener: GameEventListener = {
            getPosition: () => blockPositionOf(entity.position),
            getListenerRadius: () => 16,
            getDeliveryMode: () => 'by_distance',
            handleGameEvent: (event) => {
                if (event.sourceId === entity.id) return;
                // Java's `VibrationSystem.User.isValidVibration` passes over what a warden does, whose
                // `dampensVibrations` is true.
                const source = event.sourceId === undefined ? undefined : this.store.get(event.sourceId);
                if (source !== undefined && DAMPENS_VIBRATIONS.has(source.identifier)) return;
                if (entity.identifier === 'minecraft:warden') {
                    this.recordPointOfInterest('suspicious_location', event.at);
                    this.wardenHears(entity, event.at, event.sourceId);
                }
                if (entity.identifier === 'minecraft:allay' && event.event === 'minecraft:note_block_play')
                    this.recordPointOfInterest('noteblock', event.at);
            }
        };
        const remove = this.gameEvents?.add(listener);
        if (remove !== undefined) this.gameEventListeners.set(entity.id, { listener, remove });
    }

    /**
     * Hands a vibration to a warden's brain, Java's `Warden$VibrationUser.onReceiveVibration`: the
     * entity that made it, and the shooter when that entity is a projectile.
     */
    private wardenHears(entity: DataEntity, at: EntityPosition, sourceId: number | undefined): void {
        if (entity.brain === undefined) return;
        const source = sourceId === undefined ? undefined : brainEntityById(sourceId, this);
        const projectile = sourceId === undefined ? undefined : this.store.get(sourceId);
        const ownerId =
            projectile?.instance.hasComponent('minecraft:projectile') === true ? projectile.body.owner : undefined;
        wardenHearsVibration(
            { world: this.brainWorld(), body: brainMobOf(entity, entity.brain, this) },
            blockPositionOf(at),
            source,
            ownerId === undefined ? undefined : brainEntityById(ownerId, this)
        );
    }

    /** Removes one entity's listener registration from the world. */
    private removeGameEventListener(id: number): void {
        const registration = this.gameEventListeners.get(id);
        if (registration === undefined) return;

        this.gameEventListeners.delete(id);
        registration.remove();
    }

    /** Blocks matching a query around a position, nearest first and up to its optional limit. */
    public blocks(center: EntityPosition, query: BlockQuery): readonly GoalBlock[] {
        // BlockQuery documents an empty identifier list as match-all, like an omitted list.
        const wanted =
            query.identifiers === undefined || query.identifiers.length === 0 ? undefined : new Set(query.identifiers);
        const limit = query.limit === undefined ? undefined : Math.max(0, Math.floor(query.limit));
        if (limit === 0) return [];

        const found: GoalBlock[] = [];
        const origin = blockPositionOf(center);
        const position = { x: origin.x, y: origin.y, z: origin.z };
        const navigation = this.navigation();

        if (limit === 1) {
            let nearest: GoalBlock | undefined;
            let nearestDistance = Number.POSITIVE_INFINITY;
            for (let dy = -query.height; dy <= query.height; dy += 1) {
                position.y = origin.y + dy;
                for (let dx = -query.range; dx <= query.range; dx += 1) {
                    position.x = origin.x + dx;
                    for (let dz = -query.range; dz <= query.range; dz += 1) {
                        position.z = origin.z + dz;
                        const identifier = navigation.blockAt(position);
                        if (identifier === undefined || (wanted !== undefined && !wanted.has(identifier))) continue;

                        const candidateDistance = distance(center, position);
                        // A strict comparison keeps the first dy/dx/dz match when distances tie.
                        if (nearest === undefined || candidateDistance < nearestDistance) {
                            nearestDistance = candidateDistance;
                            nearest = { position: { ...position }, identifier };
                        }
                    }
                }
            }
            return nearest === undefined ? [] : [nearest];
        }

        for (let dy = -query.height; dy <= query.height; dy += 1) {
            position.y = origin.y + dy;
            for (let dx = -query.range; dx <= query.range; dx += 1) {
                position.x = origin.x + dx;
                for (let dz = -query.range; dz <= query.range; dz += 1) {
                    position.z = origin.z + dz;
                    const identifier = navigation.blockAt(position);
                    if (identifier === undefined || (wanted !== undefined && !wanted.has(identifier))) continue;
                    found.push({ position: { ...position }, identifier });
                }
            }
        }

        const sorted = found.sort((a, b) => distance(center, a.position) - distance(center, b.position));
        return limit === undefined ? sorted : sorted.slice(0, limit);
    }

    /**
     * Deals one entity's melee damage to another, or `damage` in its place for a blow a goal sizes.
     *
     * A target this index does not hold goes out through {@link EntityHostFacts.hurt}, and a
     * host that supplies no route for it is told once per swing rather than letting the mob
     * connect with nothing. A player in the store takes the blow here, with the armor,
     * resistance, absorption and grace period the host's route gives a player.
     */
    public attack(attacker: MobBody, target: GoalMob, override?: number): void {
        if (typeof target.id !== 'number') return;
        const attackerEntity = this.store.get(attacker.id);
        const damage = override ?? this.meleeDamage(attacker, attackerEntity);

        const other = this.store.get(target.id);
        const hurtPlayer = this.host.hurt;
        if (other === undefined && hurtPlayer === undefined) {
            this.report(`${attacker.identifier} hit entity ${target.id}, which nothing routes damage to`);
            return;
        }

        const targetView = target.view();
        if (attackerEntity !== undefined) {
            if (!canEntityAttackView(attackerEntity.instance, targetView)) return;
            attackerEntity.instance.notifyAttack(targetView);
            this.onMeleeHit(attackerEntity, target.id);
        }

        if (other !== undefined) {
            const player = clientOwnsMovement(other.identifier);
            // A blow a guard turned aside, such as a second swing inside the target's grace
            // period, hit nothing, so it leaves no effect either: Java's `doHurtTarget` adds its
            // effect only once `hurt` answered true. A blow the armor or the absorption took whole
            // still landed, which is why this reads the commit and not the health taken.
            const throws = THROWS_ON_ITS_OWN.has(attacker.identifier);
            const extra = throws ? 0 : this.attackKnockback(attacker) / 2;
            const knockback = {
                origin: attacker.position,
                levels: 0,
                ...(extra > 0 ? { extra: { power: extra, yaw: attacker.yaw } } : {})
            };
            const blow = player ? { mitigated: true, graced: true, knockback } : { knockback };
            // A blow a raised shield took whole is not a hurt, so `doHurtTarget` does nothing more.
            const outcome = this.blow(other, attacker.id, 'entity_attack', damage, blow);
            const landed = outcome.committed && !wasBlockedWhole(outcome);
            if (landed && attackerEntity !== undefined) this.applyAttackStatusEffect(attackerEntity, target.id);
            // `causeExtraKnockback` slows the attacker as it pushes.
            if (landed && extra > 0)
                attacker.velocity = {
                    x: attacker.velocity.x * EXTRA_KNOCKBACK_SLOWDOWN,
                    y: attacker.velocity.y,
                    z: attacker.velocity.z * EXTRA_KNOCKBACK_SLOWDOWN
                };
            if (landed && throws && attackerEntity?.instance.hasComponent('minecraft:is_baby') === false)
                this.throwTarget(attacker, other);
            const lift = JAVA_ATTACK_LIFT.get(attacker.identifier);
            if (landed && lift !== undefined) {
                const resisted = Math.max(0, 1 - other.facts.knockbackResistance);
                other.body.velocity = { ...other.body.velocity, y: other.body.velocity.y + lift * resisted };
            }
            return;
        }

        hurtPlayer?.(target.id, damage, 'entity_attack', attacker.id);
        this.markPlayerBlow(target.id, 'hurtBy', attacker.id);
        if (attackerEntity !== undefined) this.applyAttackStatusEffect(attackerEntity, target.id);
    }

    /** The attacker's Java `minecraft:attack_knockback`, 0 for a type Java gives none. */
    private attackKnockback(attacker: MobBody): number {
        const stats = javaEntityStats(attacker.identifier, this.content().entities.javaStats);
        return stats?.attributes['minecraft:attack_knockback'] ?? 0;
    }

    /**
     * Throws a target an adult hoglin or zoglin hit, Java's `HoglinBase.throwTarget`: by the
     * attacker's attack knockback less the target's resistance, away from the attacker and turned
     * by a whole number of radians from -10 to 10, with a lift of up to half of it.
     */
    private throwTarget(attacker: MobBody, target: DataEntity): void {
        const strength = this.attackKnockback(attacker) - target.facts.knockbackResistance;
        if (strength <= 0) return;
        const dx = target.position.x - attacker.position.x;
        const dz = target.position.z - attacker.position.z;
        const { random } = this.world;
        const turn = random.nextInt(21) - 10;
        const across = strength * (random.nextFloat() * 0.5 + 0.2);
        const length = Math.hypot(dx, dz);
        const x = length === 0 ? 0 : (dx / length) * across;
        const z = length === 0 ? 0 : (dz / length) * across;
        // `Vec3.yRot` turns by radians.
        target.body.push({
            x: x * Math.cos(turn) + z * Math.sin(turn),
            y: strength * random.nextFloat() * 0.5,
            z: z * Math.cos(turn) - x * Math.sin(turn)
        });
    }

    /**
     * The damage one melee blow deals.
     *
     * `minecraft:attack` may declare a range, `[3, 9]` for an adult hoglin or 7 to 21 for the
     * iron golem, and each blow draws a whole number from it, the way Java's `IronGolem` and
     * `HoglinBase.hurtAndThrowTarget` draw each blow from their base damage. A single number
     * deals that number.
     */
    private meleeDamage(attacker: MobBody, entity: DataEntity | undefined): number {
        const declared = entity?.instance.attributes.get('attack_damage');
        const damage = attacker.facts.attackDamage;
        if (declared === undefined || declared.max <= damage) return damage;
        return damage + this.world.random.nextInt(Math.floor(declared.max - damage) + 1);
    }

    /** Applies active `minecraft:area_attack` damage to nearby entities and players. */
    private tickAreaAttack(entity: DataEntity, tick: number): void {
        const params = entity.instance.componentParams('minecraft:area_attack');
        if (!isAreaAttackParams(params) || params.damagePerTick <= 0) return;

        const damage = params.damagePerTick;
        const range = params.damageRange;
        const cooldown = Math.ceil(params.damageCooldown * TICKS_PER_SECOND);
        const cause = params.cause;
        const sourceId = params.useSelfAsDamageSource ? entity.id : undefined;

        let lastHits = this.areaAttackLastHitTicks.get(entity);
        if (lastHits === undefined) {
            lastHits = new Map();
            this.areaAttackLastHitTicks.set(entity, lastHits);
        }

        const halfWidth = entity.facts.box.width / 2;
        const box = entity.facts.box;
        const queryRange = range + BOX_QUERY_EPSILON;
        const queryMin = {
            x: entity.position.x - halfWidth - queryRange,
            y: entity.position.y - queryRange,
            z: entity.position.z - halfWidth - queryRange
        };
        const queryMax = {
            x: entity.position.x + halfWidth + queryRange,
            y: entity.position.y + box.height + queryRange,
            z: entity.position.z + halfWidth + queryRange
        };
        const sourceContext = entity.instance.filterContext();
        const damageTarget = (
            id: number,
            position: EntityPosition,
            box: EntityFacts['box'],
            view: FilterEntityView,
            target?: DataEntity
        ): void => {
            if (
                id === entity.id ||
                distanceOutsideEntityBoxes(entity.position, entity.facts.box, position, box) > range
            )
                return;
            if (
                params.entityFilter !== undefined &&
                !evaluateFilter(params.entityFilter, { ...sourceContext, other: view })
            )
                return;

            const previousHit = lastHits.get(id);
            if (previousHit !== undefined && tick - previousHit < cooldown) return;

            if (target === undefined) {
                if (this.host.hurt === undefined) {
                    if (!this.reportedAreaAttackRoutes.has(entity)) {
                        this.report(`${entity.identifier} area attacks a player, but nothing routes player damage`);
                        this.reportedAreaAttackRoutes.add(entity);
                    }
                    return;
                }
                this.host.hurt(id, damage, cause, sourceId, params.deathMessageOverride);
                if (sourceId !== undefined) this.markPlayerBlow(id, 'hurtBy', sourceId);
            } else this.hurt(target, sourceId, cause, damage, { route: 'area_attack' });

            if (params.playAttackSound) this.host.attackSound?.(entity.id);
            entity.instance.notifyAttack(view);
            lastHits.set(id, tick);
        };

        // A player is the host's below, which skips a creative or spectator one.
        for (const target of this.inBox(queryMin, queryMax)) {
            if (clientOwnsMovement(target.identifier)) continue;
            damageTarget(target.id, target.position, target.facts.box, target.instance.filterContext().self, target);
        }

        for (const player of this.host.players()) {
            if (player.creative === true || player.spectator === true) continue;
            const view = this.host.playerView?.(player.id) ?? this.mobById(player.id)?.view();
            if (view !== undefined) damageTarget(player.id, player.position, PLAYER_ENTITY_BOX, view);
        }
    }

    /**
     * Applies the effect a melee hit adds: the one the mob's Java class adds where it decides its
     * own, otherwise the active attack component's.
     */
    private applyAttackStatusEffect(attacker: DataEntity, targetId: number): void {
        const java = JAVA_MELEE_EFFECTS.get(attacker.identifier);
        if (java !== undefined) {
            const effect = java(regionalDifficulty(this.regionalDifficultyInputs(attacker.position)));
            if (effect !== undefined) this.applyStatusEffectToId(attacker.instance, targetId, effect);
            return;
        }
        const params = attacker.instance.componentParams('minecraft:attack');
        if (
            !isRecord(params) ||
            typeof params.effectName !== 'string' ||
            typeof params.effectDuration !== 'number' ||
            params.effectDuration <= 0
        )
            return;

        this.applyStatusEffectToId(attacker.instance, targetId, {
            id: params.effectName,
            durationTicks: Math.round(params.effectDuration * TICKS_PER_SECOND),
            amplifier: typeof params.effectAmplifier === 'number' ? params.effectAmplifier : 0
        });
    }

    /** Applies a component effect to a selected entity, using the live body when it is present. */
    private applyComponentStatusEffect(
        source: EntityInstance,
        target: FilterEntityView,
        effect: EntityStatusEffect
    ): boolean {
        const targetId = target.id?.();
        return typeof targetId === 'number' ? this.applyStatusEffectToId(source, targetId, effect) : false;
    }

    /** Removes a component effect from a selected entity, using the live body when it is present. */
    private removeComponentStatusEffect(
        _source: EntityInstance,
        target: FilterEntityView,
        identifier: string
    ): boolean {
        const targetId = target.id?.();
        if (typeof targetId !== 'number') return false;

        if (this.host.removeStatusEffect?.(targetId, identifier)) return true;
        const recipient = this.store.get(targetId);
        if (recipient !== undefined)
            return removeStatusEffectFromMap(recipient.body.statusEffects, identifier) !== undefined;
        const spawning = this.spawning;
        return spawning?.id === targetId
            ? removeStatusEffectFromMap(spawning.statusEffects, identifier) !== undefined
            : false;
    }

    /** Adds an effect through the host, or to the entity being spawned before the host knows it. */
    private applyStatusEffectToId(
        source: EntityInstance,
        targetId: number,
        effect: EntityStatusEffect | StatusEffectInput
    ): boolean {
        const recipient = this.store.get(targetId);
        if (recipient !== undefined && !acceptsStatusEffect(recipient.instance, effect.id)) return false;

        const spawning = this.spawning;
        if (recipient === undefined && spawning?.id === targetId && !acceptsStatusEffect(source, effect.id))
            return false;
        if (this.host.applyStatusEffectIfChanged !== undefined) {
            if (this.host.applyStatusEffectIfChanged(targetId, effect)) return true;
        } else {
            this.host.applyStatusEffect?.(targetId, effect);
            if (recipient === undefined && spawning?.id !== targetId) return this.host.applyStatusEffect !== undefined;
        }
        if (recipient !== undefined) return mergeStatusEffect(recipient.body.statusEffects, effect) !== undefined;
        return spawning?.id === targetId ? mergeStatusEffect(spawning.statusEffects, effect) !== undefined : false;
    }

    /**
     * Takes health off one entity and remembers who took it, through the damage pipeline.
     *
     * The record is what `hurt_by_target`, `panic`, `play_dead` and the
     * wither's targeting read, so every path that deals damage goes through
     * the pipeline rather than writing the attribute itself.
     *
     * @param options - The route the blow came by, and whether to send the hurt animation and
     *   sound when it lands. Disable feedback when the actor should not receive mob-style feedback.
     * @returns Whether the data entity took damage.
     */
    public hurt(
        entity: DataEntity,
        sourceId: number | undefined,
        cause: string,
        amount: number,
        options: {
            readonly feedback?: boolean;
            readonly route?: DamageRoute;
            /** Whether armor, resistance and absorption take their share, as for a player. */
            readonly mitigated?: boolean;
            /** Whether the target's grace period after a blow turns this one aside. */
            readonly graced?: boolean;
            /** Whether the amount is already the rule's result, which a damage sensor leaves alone. */
            readonly measured?: boolean;
        } = {}
    ): boolean {
        const outcome = this.blow(entity, sourceId, cause, amount, options);
        return outcome.committed && outcome.taken > 0;
    }

    /** Runs the blow {@link EntityRuntime.hurt} describes, and answers with what the pipeline did with it. */
    private blow(
        entity: DataEntity,
        sourceId: number | undefined,
        cause: string,
        amount: number,
        options: Pick<
            Partial<DamageSourceFacts>,
            'feedback' | 'route' | 'mitigated' | 'graced' | 'measured' | 'knockback'
        >
    ): DamageOutcome {
        const { feedback, mitigated, graced, measured, knockback } = options;
        return this.damage({
            target: entity.id,
            ...(sourceId === undefined ? {} : { attacker: sourceId }),
            cause,
            amount,
            source: {
                route: options.route ?? 'mob_attack',
                ...(feedback === undefined ? {} : { feedback }),
                ...(mitigated === undefined ? {} : { mitigated }),
                ...(graced === undefined ? {} : { graced }),
                ...(measured === undefined ? {} : { measured }),
                ...(knockback === undefined ? {} : { knockback })
            }
        });
    }

    /**
     * Runs one damage intent through the pipeline: guards, modifiers, then the commit, in which a
     * death runs too. Synchronous, so the blow and any death it caused have happened when this
     * returns.
     */
    public damage(intent: DamageIntent): DamageOutcome {
        this.damageSensing.clear();
        const target = this.store.get(intent.target);
        if (target !== undefined && isBreakableVehicle(target.identifier)) return this.hurtVehicle(target, intent);
        return this.damagePipeline.run(intent);
    }

    /**
     * One blow to a boat or raft, which has no health: Java's `VehicleEntity.hurtServer` adds it
     * to the vehicle's damage and destroys the vehicle past 40, and a creative player's blow
     * removes it at once without its item.
     */
    private hurtVehicle(entity: DataEntity, intent: DamageIntent): DamageOutcome {
        const computation: DamageComputation = { guarded: intent.amount, modifiers: [], amount: intent.amount };
        if (entity.removed !== undefined || intent.amount <= 0)
            return { committed: true, intent, computation, taken: 0, died: false };
        const creative = intent.attacker !== undefined && this.host.playerById(intent.attacker)?.creative === true;
        const blow = vehicleBlow(this.vehicleDamage.get(entity.id) ?? 0, intent.amount);
        if (!creative && !blow.destroyed) {
            this.setVehicleDamage(entity.id, blow.damage);
            return { committed: true, intent, computation, taken: intent.amount, died: false };
        }
        this.destroyVehicle(entity, !creative);
        return { committed: true, intent, computation, taken: intent.amount, died: true };
    }

    /**
     * Removes a broken boat or raft. With entity drops on it drops what it holds, as
     * `AbstractChestBoat.chestVehicleDestroyed` does, and unless a creative player broke it, the
     * boat item `AbstractBoat.getDropItem` names.
     */
    private destroyVehicle(entity: DataEntity, dropsItself: boolean): void {
        const at = blockPositionOf(entity.position);
        const item = dropsItself ? boatItemOf(entity.identifier, entity.spawnData?.['variant']) : undefined;
        const contents = entity.body.containerSlots.filter((stack) => stack !== undefined);
        this.setVehicleDamage(entity.id, 0);
        this.remove(entity.id, 'destroyed');
        if (!ruleIsOn(this.world.level, ENTITY_DROPS)) return;
        if (item !== undefined) this.host.drop(at, { identifier: item, count: 1 });
        for (const stack of contents) this.host.drop(at, stack);
    }

    /** Writes a vehicle's damage, with an undo as {@link EntityRuntime.setHitGrace} has. */
    private setVehicleDamage(id: number, damage: number): void {
        const before = this.vehicleDamage.get(id);
        if (damage <= 0) this.vehicleDamage.delete(id);
        else this.vehicleDamage.set(id, damage);
        this.store.undoWith(() => {
            if (before === undefined) this.vehicleDamage.delete(id);
            else this.vehicleDamage.set(id, before);
        });
    }

    /**
     * The commit stage: applies a computed blow through the logged setters.
     *
     * The order is the one the legacy damage pipeline and the runtime kept between them: the
     * grace period, the hurt feedback and the shove, then the health with the sensor's events and
     * the hurt triggers, then the damage record, then the host's observers, then the death.
     */
    private commitDamage(
        intent: DamageIntent,
        computation: DamageComputation,
        requested: DamageIntent = intent
    ): DamageCommitResult {
        const sensing = this.damageSensing.of(intent);
        const entity = this.store.get(intent.target);
        if (entity === undefined) return { taken: 0, died: false };
        const source = intent.source;

        let fresh = true;
        if (source.graced === true) {
            const grace = this.hitGraces.get(entity.id);
            fresh = grace === undefined || grace.ticks <= 0 || source.bypassesGrace === true;
            this.setHitGrace(entity.id, {
                ticks: fresh || grace === undefined ? INVULNERABILITY_TICKS : grace.ticks,
                last: intent.amount
            });
        }

        const absorbed = computation.modifiers.find((modifier) => modifier.name === 'absorption');
        if (absorbed !== undefined) this.setAbsorption(entity, this.absorptionOf(entity) + absorbed.value);

        // `hurtServer` runs what a raised shield does before the blow, and a blow it took whole
        // pushes nothing.
        const blocking = computation.modifiers.find((modifier) => modifier.name === ITEM_BLOCKING);
        const wholeBlocked = blocking !== undefined && blocking.amountAfter <= 0;
        if (blocking !== undefined) this.blockedBlow(entity, intent, -blocking.value, wholeBlocked);

        const taken = computation.amount;
        if (fresh && taken > 0 && source.feedback !== false) this.host.hurtFeedback?.(entity.id);
        if (fresh && !wholeBlocked && source.knockback !== undefined)
            this.shove(entity, source.knockback, intent, requested.amount);

        const damager = intent.attacker === undefined ? undefined : this.mobById(intent.attacker)?.view();
        const result = entity.instance.applyDamage(
            { cause: intent.cause, amount: intent.amount, damager },
            taken,
            sensing?.events ?? []
        );
        if (result.amount > 0 && source.remembered !== false) {
            this.keepDamageRecord(entity);
            entity.body.damage.record(intent.attacker, intent.cause, result.amount);
            if (intent.attacker !== undefined) {
                this.markPlayerBlow(intent.attacker, 'hurt', entity.id);
                this.markPlayerBlow(entity.id, 'hurtBy', intent.attacker);
            }
            this.setLastDamagedAt(entity, this.world.level.gameTime());
            this.disablePiglinAdmirationAfterDamage(entity);
        }
        if (result.amount > 0 && !result.died) this.brainWasHurt(entity, intent);
        if (result.died) {
            this.setDying(entity.id, true);
            if (clientOwnsMovement(entity.identifier)) this.playerSystems.died(entity);
            if (damager !== undefined) this.notifyAttackTargetKilled(entity, damager);
        }

        const dealt = computation.modifiers.find((modifier) => modifier.name === 'hit_grace')?.amountAfter;
        this.host.damageCommitted?.({
            target: entity,
            intent,
            dealt: dealt ?? computation.guarded,
            taken: result.amount,
            died: result.died
        });

        if (result.died) this.die(entity);
        return { taken: result.amount, died: result.died };
    }

    /**
     * The extra hearts an entity has in front of its health: its `absorption` attribute, or for a
     * player the component field that keeps it, where a golden apple writes it.
     */
    private absorptionOf(entity: DataEntity): number {
        if (clientOwnsMovement(entity.identifier))
            return this.playerSystems.componentsOf(entity).get('attributes.absorption');
        return entity.instance.attributes.get('absorption')?.current ?? 0;
    }

    /** Writes what a blow left of an entity's extra hearts, where {@link EntityRuntime.absorptionOf} reads them. */
    private setAbsorption(entity: DataEntity, absorption: number): void {
        if (clientOwnsMovement(entity.identifier)) {
            this.playerSystems.componentsOf(entity).set('attributes.absorption', absorption);
            return;
        }
        if (entity.instance.attributes.get('absorption') !== undefined)
            entity.instance.attributes.set('absorption', absorption);
    }

    /**
     * Gives health back to one entity, up to its maximum. A dead entity is not healed.
     *
     * @returns Whether any health was restored.
     */
    public heal(id: number, amount: number, cause: HealCause = 'Heal'): boolean {
        const entity = this.store.get(id);
        const health = entity?.instance.attributes.get('health');
        if (entity === undefined || health === undefined || amount <= 0) return false;
        if (health.current <= 0 || health.current >= health.max) return false;
        const given = this.healGuard(entity, amount, cause);
        if (given <= 0) return false;

        entity.instance.attributes.set('health', Math.min(health.max, health.current + given));
        this.onHealed(entity, given, cause);
        return true;
    }

    /**
     * Brings a dead player back, with the same id, at full health (ADR 0008). Its death left it
     * in the store, so nothing enters or leaves here: the log holds one health entry, and one for
     * each player component the revival resets (`PlayerSystems.revived`). A player that died in
     * another store and was restored here on its way to its spawn point is as dead, with no
     * health left, though its death did not run here.
     *
     * @returns Whether the entity was a dead player that is alive again.
     */
    public revive(id: number): boolean {
        const entity = this.store.get(id);
        const health = entity?.instance.attributes.get('health');
        if (entity === undefined || health === undefined || !clientOwnsMovement(entity.identifier)) return false;
        if (!this.dying.has(id) && health.current > 0) return false;

        this.setDying(id, false);
        this.setHitGrace(id, undefined);
        entity.instance.attributes.set('health', health.max);
        this.playerSystems.revived(entity);
        return true;
    }

    /**
     * Writes where a client says its body is, which is the one way such a body moves besides
     * a server move through `MobBody.teleportTo` that the client has to acknowledge. The input
     * step calls it with what the client reported (ADR 0009).
     *
     * @returns Whether the entity is one whose client owns its movement.
     */
    public applyClientMovement(
        id: number,
        movement: {
            readonly position: EntityPosition;
            readonly yaw: number;
            readonly pitch: number;
            readonly onGround: boolean;
        }
    ): boolean {
        const entity = this.store.get(id);
        if (entity === undefined || !clientOwnsMovement(entity.identifier)) return false;

        const from = { ...entity.position };
        const wasOnGround = entity.body.conditions.has('on_ground');
        entity.body.yaw = movement.yaw;
        entity.body.pitch = movement.pitch;
        entity.position = movement.position;
        if (movement.onGround) entity.body.conditions.add('on_ground');
        else entity.body.conditions.delete('on_ground');
        this.playerSystems.moved(entity, from, wasOnGround);
        return true;
    }

    /**
     * The server's move of a body whose client owns it, which the client has to acknowledge: the
     * body teleports, and the fall in progress ends, as a legacy player's does.
     *
     * @returns Whether the entity is one whose client owns its movement.
     */
    public teleportPlayer(id: number, position: EntityPosition): boolean {
        const entity = this.store.get(id);
        if (entity === undefined || !clientOwnsMovement(entity.identifier)) return false;
        entity.body.teleportTo(position);
        this.playerSystems.teleported(entity);
        return true;
    }

    /**
     * A store player's entity while it is in this store, or undefined from its login to its spawn,
     * between two stores, and while it is in another store. The player inputs below read it to
     * choose between this store's player systems and the player's own components.
     */
    public entityOfPlayer(player: Pick<StorePlayer, 'entity'>): DataEntity | undefined {
        const { entity } = player;
        return entity !== undefined && this.store.get(entity.id) === entity ? entity : undefined;
    }

    /**
     * Sets the block a store player is mining, whose cracks the player systems animate every tick
     * while its entity is in this store. In no store, the player keeps it for the next one.
     *
     * @param mining - The block, or null when the player stopped or broke it.
     */
    public setPlayerMining(player: PlayerInputTarget, mining: PlayerMining | null): void {
        const entity = this.entityOfPlayer(player);
        if (entity === undefined) player.getComponents().set('mining.block', mining);
        else this.playerSystems.setMining(entity, mining);
    }

    /**
     * Starts a store player's meal of what is in its hand, counted out on this store's tick. A
     * player in no store does not eat.
     *
     * @param ticks - How long the meal takes.
     * @returns Whether a meal began.
     */
    public beginPlayerMeal(player: PlayerInputTarget, ticks: number): boolean {
        const entity = this.entityOfPlayer(player);
        return entity !== undefined && this.playerSystems.beginMeal(entity, ticks);
    }

    /** Forgets a store player's unfinished meal, as letting go of the button or putting the item away does. */
    public cancelPlayerMeal(player: PlayerInputTarget): void {
        const entity = this.entityOfPlayer(player);
        if (entity === undefined) cancelMeal(player.getComponents());
        else this.playerSystems.cancelMeal(entity);
    }

    /** Writes whether a store player is sprinting, as its client reports it. */
    public setPlayerSprinting(player: PlayerInputTarget, sprinting: boolean): void {
        const entity = this.entityOfPlayer(player);
        if (entity === undefined) player.getComponents().set('movement.sprinting', sprinting);
        else this.playerSystems.setSprinting(entity, sprinting);
    }

    /** Writes whether a store player is sneaking, as its client reports it. */
    public setPlayerSneaking(player: PlayerInputTarget, sneaking: boolean): void {
        const entity = this.entityOfPlayer(player);
        if (entity === undefined) writeSneaking(player.getComponents(), sneaking, this.world.level.gameTime());
        else this.playerSystems.setSneaking(entity, sneaking);
    }

    /** Writes a store player's game mode, which its systems and its actor read. */
    public setPlayerGamemode(player: PlayerInputTarget, gamemode: Gametype): void {
        const entity = this.entityOfPlayer(player);
        if (entity === undefined) player.getComponents().set('abilities.gamemode', gamemode);
        else this.playerSystems.setGamemode(entity, gamemode);
    }

    /** Writes whether a store player is flying. Whether its game mode lets it fly is the caller's. */
    public setPlayerFlying(player: PlayerInputTarget, flying: boolean): void {
        const entity = this.entityOfPlayer(player);
        if (entity === undefined) player.getComponents().set('abilities.flying', flying);
        else this.playerSystems.setFlying(entity, flying);
    }

    /** Makes a store player in this store hungrier, as moving, jumping, attacking and healing do. */
    public exhaustPlayer(player: PlayerInputTarget, amount: number): void {
        const entity = this.entityOfPlayer(player);
        if (entity !== undefined) this.playerSystems.exhaust(entity, amount);
    }

    /** Charges a store player in this store for a jump its client reported. */
    public playerJumped(player: PlayerInputTarget): void {
        const entity = this.entityOfPlayer(player);
        if (entity !== undefined) this.playerSystems.jumped(entity);
    }

    /**
     * Brings a dead store player in this store back at full health; see {@link EntityRuntime.revive}.
     *
     * @returns Whether the player was dead here and is alive again.
     */
    public revivePlayer(player: PlayerInputTarget): boolean {
        const entity = this.entityOfPlayer(player);
        return entity !== undefined && this.revive(entity.id);
    }

    /**
     * Damage a component deals its own entity, such as drowning or `minecraft:hurt_on_condition`.
     *
     * Through the pipeline like every other blow, so a hazard that kills runs the death. It shows
     * no hurt feedback and leaves no damage record, as before the pipeline owned it. An entity
     * that is still being built is not in the store yet, and senses and applies the blow itself.
     */
    private componentDamage(instance: EntityInstance, event: DamageEvent): DamageResult {
        const entity = this.byInstance.get(instance);
        if (entity === undefined || !this.store.has(entity.id)) {
            const sensing = instance.senseDamage(event);
            return instance.applyDamage(event, sensing.amount, sensing.events);
        }

        const attacker = event.damager?.id?.();
        const outcome = this.damage({
            target: entity.id,
            ...(typeof attacker === 'number' ? { attacker } : {}),
            cause: event.cause,
            amount: event.amount,
            source: { route: 'component', feedback: false, remembered: false }
        });
        const health = instance.attributes.get('health')?.current;
        return outcome.committed
            ? { amount: outcome.taken, health, died: outcome.died, events: [] }
            : { amount: 0, health, died: false, events: [] };
    }

    /**
     * A death, inside the commit of the blow that caused it.
     *
     * The killing blow may have queued `minecraft:on_death` events, which apply first, because
     * they decide what the death is: the dragon's starts its death hold and stays, a creeper's
     * may explode it, and anything else leaves with its loot.
     */
    private die(entity: DataEntity): void {
        if (entity.instance.queued().length > 0) {
            entity.instance.applyQueuedEvents();
            if (entity.removed !== undefined) return;
            if (entity.instance.hasComponent('minecraft:behavior.dragondeath')) {
                // The killing hit added the death-hold goal; the dragon stays until it ends.
                this.setDying(entity.id, false);
                this.host.startDeathAnimation?.(entity.id);
                return;
            }
            if (this.explodeOnDeath(entity)) return;
        }
        this.kill(entity);
    }

    /**
     * A hopper minecart's tick of `MinecartHopper.suckInItems`: the first item entity in reach that
     * fits goes into its container, as much of the stack as the slots take.
     */
    private suckInItems(entity: DataEntity): void {
        const { box } = entity.facts;
        const cart = { position: entity.position, width: box.width, height: box.height };
        const lying = this.host.itemsNear?.(entity.position, ITEM_HOPPER_QUERY_RADIUS) ?? this.host.items?.() ?? [];
        for (const candidate of lying) {
            if (!inHopperReach(cart, candidate.position)) continue;
            const maxStack = maxStackSizeOf(candidate.item.identifier, this.content());
            const room = insertStack(
                entity.body.containerSlots,
                entity.body.containerCapacity,
                candidate.item,
                maxStack
            );
            if (room.inserted <= 0) continue;
            const taken = this.host.takeItem?.(candidate.id, room.inserted);
            if (taken === undefined) continue;
            const { slots } = insertStack(entity.body.containerSlots, entity.body.containerCapacity, taken, maxStack);
            for (const [index, stack] of slots.entries())
                if (stack !== entity.body.containerSlots[index]) entity.body.setContainerSlot(index, stack);
            return;
        }
    }

    /** Takes `AbstractBoat.tick`'s point a tick off a vehicle's damage. */
    private tickVehicleDamage(id: number): void {
        const damage = this.vehicleDamage.get(id);
        if (damage !== undefined) this.setVehicleDamage(id, damage - VEHICLE_DAMAGE_DECAY_PER_TICK);
    }

    /** Counts one entity's grace period down, forgetting the last blow when it runs out. */
    private tickHitGrace(id: number): void {
        const grace = this.hitGraces.get(id);
        if (grace === undefined) return;
        this.setHitGrace(id, grace.ticks <= 1 ? undefined : { ticks: grace.ticks - 1, last: grace.last });
    }

    /**
     * Marks an entity's death as running or ended. The log does not carry this, so the write
     * registers its undo with the open unit (`EntityStore.undoWith`): a death an undone unit left
     * running would refuse every later blow, and the entity could never die.
     */
    private setDying(id: number, dying: boolean): void {
        if (this.dying.has(id) === dying) return;
        if (dying) this.dying.add(id);
        else this.dying.delete(id);
        this.store.undoWith(() => {
            if (dying) this.dying.delete(id);
            else this.dying.add(id);
        });
    }

    /**
     * Sets or clears an entity's grace period, with an undo as {@link EntityRuntime.setDying}
     * has: a grace an undone blow left would refuse that blow when it comes again.
     */
    /**
     * Remembers one blow on a player's side of it: `hurt` for a blow the player dealt to `other`,
     * `hurtBy` for one `other` dealt the player. Anything that is not a player keeps its blows in
     * its damage record instead, so this leaves it alone.
     */
    private markPlayerBlow(player: number, side: keyof PlayerBlows, other: number): void {
        if (player === other || !this.isPlayer(player)) return;
        const before = this.playerBlows.get(player);
        this.playerBlows.set(player, { ...before, [side]: { id: other, tick: this.world.level.gameTime() } });
        this.store.undoWith(() => {
            if (before === undefined) this.playerBlows.delete(player);
            else this.playerBlows.set(player, before);
        });
    }

    /** Whether a runtime id is a player: one the host holds, or a player entity in the store. */
    private isPlayer(id: number): boolean {
        const entity = this.store.get(id);
        return entity === undefined ? this.host.playerById(id) !== undefined : clientOwnsMovement(entity.identifier);
    }

    /**
     * A player's remembered blow on one side, as a goal reads it, or undefined when there is none
     * or the other side is gone. The blow it took is forgotten after
     * {@link LAST_HURT_BY_MEMORY_TICKS}, as Java's `LivingEntity.tick` forgets `lastHurtByMob`.
     */
    private playerBlow(player: number, side: keyof PlayerBlows): GoalCombatMark | undefined {
        const blows = this.playerBlows.get(player);
        if (blows !== undefined && this.store.get(player) === undefined && this.host.playerById(player) === undefined) {
            this.playerBlows.delete(player);
            return undefined;
        }
        const mark = blows?.[side];
        if (mark === undefined) return undefined;
        if (side === 'hurtBy' && this.world.level.gameTime() - mark.tick > LAST_HURT_BY_MEMORY_TICKS) return undefined;
        const mob = this.mobById(mark.id);
        return mob === undefined ? undefined : { mob, tick: mark.tick };
    }

    /** The blows a player remembers, as a player's goal mob answers them. */
    public playerCombat(player: number): Pick<GoalMob, 'lastHurt' | 'lastHurtBy'> {
        return {
            lastHurt: () => this.playerBlow(player, 'hurt'),
            lastHurtBy: () => this.playerBlow(player, 'hurtBy')
        };
    }

    private setHitGrace(id: number, grace: HitGrace | undefined): void {
        const before = this.hitGraces.get(id);
        if (before === grace) return;
        if (grace === undefined) this.hitGraces.delete(id);
        else this.hitGraces.set(id, grace);
        this.store.undoWith(() => {
            if (before === undefined) this.hitGraces.delete(id);
            else this.hitGraces.set(id, before);
        });
    }

    /**
     * Sets or clears the explode component instance behind an entity's fuse. Without the undo, a
     * unit that started a fuse and threw would leave it marked started with its count undone, and
     * the fuse would never count.
     */
    private setFuse(entity: DataEntity, fuse: FuseState | undefined): void {
        const before = this.fuses.get(entity.id);
        if (before === fuse) return;
        if (fuse === undefined) this.fuses.delete(entity.id);
        else this.fuses.set(entity.id, fuse);
        this.store.undoWith(() => {
            // An entity the undo added back is a new one, and its restore started its own fuse.
            if (this.store.get(entity.id) !== entity) return;
            if (before === undefined) this.fuses.delete(entity.id);
            else this.fuses.set(entity.id, before);
        });
    }

    /**
     * Registers how to put an entity's damage record back as it is now, so `hurt_by_target` and
     * the others that read it do not answer a blow that was undone.
     */
    /**
     * Records when an entity was last hurt, which a piglin's barter and admiration cooldowns read,
     * with an undo: a unit that took the blow back would otherwise leave the piglin refusing gold
     * for a hit it never took.
     */
    private setLastDamagedAt(entity: DataEntity, at: number): void {
        const before = this.lastDamagedAt.get(entity);
        this.lastDamagedAt.set(entity, at);
        this.store.undoWith(() => {
            if (before === undefined) this.lastDamagedAt.delete(entity);
            else this.lastDamagedAt.set(entity, before);
        });
    }

    private keepDamageRecord(entity: DataEntity): void {
        const records = entity.body.damage.records();
        // By id: an undone removal adds the entity back with a new, empty record.
        this.store.undoWith(() => this.store.get(entity.id)?.body.damage.restore(records));
    }

    /**
     * Shoves an entity away from where a blow came from, as Java's `LivingEntity.hurtServer` and
     * the attack that dealt it do: `dealDefaultKnockback`'s 0.4 away from the blow, then a second
     * shove for the sprint and Knockback levels, then the attacker's own `causeExtraKnockback` the
     * way it faces. Each is `LivingEntity.knockback`, which halves what the last one left.
     *
     * They are worked out together and written once, because a player is sent its knockback and a
     * second packet in the same tick would overwrite the first.
     *
     * @param dealt - The blow as it arrived, which a sulfur cube's push is sized by even when the
     *   cube is immune to it, as Java's `SulfurCube.hurtServer` passes it to `dealDefaultKnockback`.
     */
    private shove(
        entity: DataEntity,
        knockback: NonNullable<DamageSourceFacts['knockback']>,
        intent: DamageIntent,
        dealt: number
    ): void {
        const onGround = entity.body.conditions.has('on_ground');
        const toward = { x: knockback.origin.x - entity.position.x, z: knockback.origin.z - entity.position.z };
        const shoves = [
            { power: BASE_KNOCKBACK, toward, extra: false },
            ...(knockback.levels > 0 ? [{ power: knockback.levels * KNOCKBACK_PER_LEVEL, toward, extra: true }] : []),
            ...(knockback.extra !== undefined && knockback.extra.power > 0
                ? [{ power: knockback.extra.power, toward: behind(knockback.extra.yaw), extra: true }]
                : [])
        ];
        const cube = this.carriedCubeKnockback(entity, intent);
        let velocity = entity.body.velocity;
        for (const shove of shoves)
            velocity =
                cube === undefined
                    ? livingKnockback({
                          velocity,
                          onGround,
                          resistance: entity.facts.knockbackResistance,
                          power: shove.power,
                          toward: shove.toward,
                          tieBreak: entity.id % 8
                      })
                    : sulfurCubeKnockback({ ...cube, ...shove, velocity, damage: dealt });
        this.knockTo(entity, velocity);
    }

    /**
     * What a sulfur cube carrying a block is pushed by, Java's `SulfurCube.knockback`: its
     * archetype, which the carried block's `#minecraft:sulfur_cube_archetype/<archetype>` tag
     * names, and the attacker's eyes and look. An attacker whose look the server does not know is
     * taken to look at the cube's center, which it hit. Undefined for anything else, and for a
     * blow with no attacker, which takes the plain push.
     */
    private carriedCubeKnockback(
        entity: DataEntity,
        intent: DamageIntent
    ): Omit<SulfurCubeShove, 'velocity' | 'toward' | 'power' | 'damage' | 'extra'> | undefined {
        if (entity.identifier !== SULFUR_CUBE || intent.attacker === undefined) return undefined;
        // Java keeps the block in the body slot; Bedrock's cube holds it in its main hand.
        const carried = entity.body.equipment.body ?? entity.body.equipment.mainhand;
        if (carried === undefined) return undefined;
        const stack = itemOfDrop(carried, this.content());
        const modifiers = [...SULFUR_CUBE_KNOCKBACK].find(
            ([archetype]) => stack?.hasJavaTag(`minecraft:sulfur_cube_archetype/${archetype}`) === true
        )?.[1];
        if (modifiers === undefined) return undefined;

        const stored = this.store.get(intent.attacker);
        const attacker = stored ?? this.host.playerById?.(intent.attacker);
        if (attacker === undefined) return undefined;
        const eyes =
            stored === undefined || clientOwnsMovement(stored.identifier)
                ? EYE_HEIGHT
                : stored.facts.box.height * ENTITY_EYE_HEIGHT_FRACTION;
        const eye = { ...attacker.position, y: attacker.position.y + eyes };
        const look = stored === undefined ? this.lookOf(attacker) : { yaw: stored.body.yaw, pitch: stored.body.pitch };
        const height = entity.facts.box.height;
        return {
            position: entity.position,
            height,
            resistance: entity.facts.knockbackResistance,
            modifiers,
            attacker: {
                position: attacker.position,
                eye,
                look:
                    look === undefined
                        ? {
                              x: entity.position.x - eye.x,
                              y: entity.position.y + height / 2 - eye.y,
                              z: entity.position.z - eye.z
                          }
                        : viewVector(look)
            }
        };
    }

    /**
     * Gives a body the velocity a shove worked out. A body whose client owns its movement takes
     * the change as one impulse, which its client is sent; any other is set to it.
     */
    private knockTo(entity: DataEntity, velocity: EntityPosition): void {
        const carried = entity.body.velocity;
        if (velocity.x === carried.x && velocity.y === carried.y && velocity.z === carried.z) return;
        const halved = { x: carried.x / 2, y: carried.y, z: carried.z / 2 };
        entity.body.velocity = halved;
        entity.body.push({ x: velocity.x - halved.x, y: velocity.y - halved.y, z: velocity.z - halved.z });
    }

    /**
     * A player's raised shield, Java's `LivingEntity.getItemBlockingWith`: an item with
     * `minecraft:blocks_attacks` in a hand, the main hand first, of a player that has been
     * sneaking for at least the item's block delay, which is how a Bedrock player raises one, and
     * whose shield no axe has disabled.
     */
    private raisedShieldOf(entity: DataEntity): RaisedShield | undefined {
        if (!clientOwnsMovement(entity.identifier)) return undefined;
        const since = this.playerSystems.componentsOf(entity).get('movement.sneakingSince');
        const now = this.world.level.gameTime();
        if (since === null || (this.shieldsDisabled.get(entity.id) ?? now) > now) return undefined;
        const hands = this.handsOf(entity);
        for (const hand of ['mainhand', 'offhand'] as const) {
            const identifier = hands[hand];
            const type = identifier === undefined ? undefined : this.content().items.types.get(identifier);
            const rules = type?.params(blocksAttacks);
            if (type === undefined || rules === undefined) continue;
            return now - since >= blockDelayTicks(rules.block_delay_seconds) ? { hand, type } : undefined;
        }
        return undefined;
    }

    /** What a player holds in each hand: its inventory's, through the host, or its entity's equipment. */
    private handsOf(entity: DataEntity): PlayerHands {
        const hosted = this.host.handsOf?.(entity.id);
        if (hosted !== undefined) return hosted;
        const { mainhand, offhand } = entity.body.equipment;
        return {
            ...(mainhand === undefined ? {} : { mainhand: mainhand.identifier }),
            ...(offhand === undefined ? {} : { offhand: offhand.identifier })
        };
    }

    /**
     * How much of a blow a target's raised shield blocks, Java's `LivingEntity.applyItemBlocking`:
     * nothing for a damage type the shield's `bypassed_by` names, and otherwise what its damage
     * reductions take of a blow from in front, measured from where the blow came from.
     */
    private blockedBy(target: DataEntity, intent: DamageIntent, amount: number): number {
        const rules = this.raisedShieldOf(target)?.type.params(blocksAttacks);
        if (rules === undefined) return 0;
        if (rules.bypassed_by !== undefined && this.inDamageSet(rules.bypassed_by, intent.cause)) return 0;
        const angle = blockingAngle(target.position, target.body.yaw, this.blowOrigin(intent));
        return blockedDamage(rules, amount, angle, (set) => this.inDamageSet(set, intent.cause));
    }

    /**
     * Where a blow came from, Java's `DamageSource.getSourcePosition`: what made contact, else the
     * point the blow shoves away from, else the attacker; undefined for a blow from nowhere.
     */
    private blowOrigin(intent: DamageIntent): EntityPosition | undefined {
        const contact = intent.projectile === undefined ? undefined : this.store.get(intent.projectile);
        if (contact !== undefined) return contact.position;
        if (intent.source.knockback !== undefined) return intent.source.knockback.origin;
        if (intent.attacker === undefined) return undefined;
        return (this.store.get(intent.attacker) ?? this.host.playerById?.(intent.attacker))?.position;
    }

    /** Whether a blow's cause is one of the Java damage types a `blocks_attacks` set names. */
    private inDamageSet(set: HolderSet, cause: string): boolean {
        const key = set.kind === 'tag' ? `#${set.tag}` : set.entries.join(',');
        let causes = this.damageSets.get(key);
        if (causes === undefined) {
            const content = this.content();
            causes =
                set.kind === 'tag'
                    ? damageCausesInTag(content, set.tag)
                    : new Set(set.entries.map((type) => damageCauseOfType(type, new Set(damageTagsOf(content, type)))));
            this.damageSets.set(key, causes);
        }
        return causes.has(damageCauseOf(cause));
    }

    /**
     * What a blow a raised shield blocked does besides, Java's `applyItemBlocking` and the
     * `blockUsingItem` it calls: the shield takes its `item_damage` of what it blocked and plays
     * its block sound, and a living attacker's `blockedByItem` runs, unless the blow was a
     * projectile. A weapon with `disable_blocking_for_seconds`, an axe, then disables the shield
     * for that long, scaled by the shield's `disable_cooldown_scale`, as `Player.blockUsingItem`
     * does.
     *
     * @param blocked - What the shield took off the blow.
     * @param whole - Whether it took all of it.
     */
    private blockedBlow(defender: DataEntity, intent: DamageIntent, blocked: number, whole: boolean): void {
        const shield = this.raisedShieldOf(defender);
        const rules = shield?.type.params(blocksAttacks);
        if (shield === undefined || rules === undefined) return;

        const creative = this.playerSystems.componentsOf(defender).get('abilities.gamemode') === Gametype.CREATIVE;
        const wear = creative ? 0 : shieldDurabilityCost(shield.type, blocked);
        if (wear > 0) this.wearHand(defender, shield.hand, wear);
        if (rules.block_sound !== undefined)
            this.host.playSoundAt?.(defender.position, bedrockSoundOf(rules.block_sound));

        if (intent.projectile !== undefined || intent.attacker === undefined) return;
        const attacker = this.store.get(intent.attacker);
        const hostPlayer = attacker === undefined ? this.host.playerById?.(intent.attacker) : undefined;
        if (attacker === undefined && hostPlayer === undefined) return;
        if (attacker !== undefined) this.attackerBlocked(attacker, defender, whole);
        else if (hostPlayer !== undefined && !whole) this.shoveTowardBlocked(hostPlayer.position, defender);

        const weaponId =
            attacker === undefined
                ? this.host.heldItemOf?.(intent.attacker)
                : clientOwnsMovement(attacker.identifier)
                  ? this.handsOf(attacker).mainhand
                  : attacker.body.equipment.mainhand?.identifier;
        const seconds =
            weaponId === undefined
                ? 0
                : (this.content().items.types.get(weaponId)?.params(weapon)?.disable_blocking_for_seconds ?? 0);
        const ticks = disableTicks(seconds, rules.disable_cooldown_scale);
        if (ticks <= 0) return;
        this.setShieldDisabled(defender.id, this.world.level.gameTime() + ticks);
        if (rules.disabled_sound !== undefined)
            this.host.playSoundAt?.(defender.position, bedrockSoundOf(rules.disabled_sound));
    }

    /**
     * An attacker's `blockedByItem`. A ravager runs its `minecraft:ravager_blocked`, as Java's
     * `Ravager.blockedByItem` does, unless it is stunned or roaring already. Anything else, when
     * the shield let some of the blow through, shoves the defender 0.5 toward it, as
     * `LivingEntity.blockedByItem` does.
     */
    private attackerBlocked(attacker: DataEntity, defender: DataEntity, whole: boolean): void {
        const reaction = attacker.instance.componentParams('minecraft:ravager_blocked');
        if (!isRecord(reaction)) {
            if (!whole) this.shoveTowardBlocked(attacker.position, defender);
            return;
        }
        const { instance } = attacker;
        if (instance.hasComponent('minecraft:is_stunned') || instance.hasComponent('minecraft:behavior.knockback_roar'))
            return;
        const choices = Array.isArray(reaction.reaction_choices) ? reaction.reaction_choices.filter(isRecord) : [];
        const weightOf = (choice: Readonly<Record<string, unknown>>): number =>
            typeof choice.weight === 'number' && choice.weight > 0 ? choice.weight : 0;
        let roll = this.world.random.nextFloat() * choices.reduce((total, choice) => total + weightOf(choice), 0);
        const choice = choices.find((candidate) => (roll -= weightOf(candidate)) < 0);
        const value = choice?.value;
        if (isRecord(value) && typeof value.event === 'string') {
            // Stunned, and the defender pushes off it, Java's `Entity.push(Entity)`.
            const target = parseEventTarget(value.target, (code, message) =>
                this.report(`${attacker.identifier}: ${code}: ${message}`)
            );
            instance.raise(value.event, target, 'minecraft:ravager_blocked');
            const impulse = entityPushImpulse(
                attacker.position.x - defender.position.x,
                attacker.position.z - defender.position.z
            );
            if (impulse === undefined) return;
            if (this.isPushable(defender)) defender.body.push({ x: -impulse.x, y: 0, z: -impulse.z });
            if (this.isPushable(attacker)) attacker.body.push(impulse);
            return;
        }
        defender.body.push(strongKnockback(attacker.position, defender.position));
    }

    /** `LivingEntity.blockedByItem`'s `defender.knockback(0.5, defender - attacker)`. */
    private shoveTowardBlocked(attacker: EntityPosition, defender: DataEntity): void {
        this.knockTo(
            defender,
            livingKnockback({
                velocity: defender.body.velocity,
                onGround: defender.body.conditions.has('on_ground'),
                resistance: defender.facts.knockbackResistance,
                power: BLOCKED_KNOCKBACK,
                toward: { x: defender.position.x - attacker.x, z: defender.position.z - attacker.z },
                tieBreak: defender.id % 8
            })
        );
    }

    /**
     * Spends durability of what a player holds in one hand: its inventory's, through the host, or
     * its entity's equipment, where a stack worn through breaks.
     */
    private wearHand(entity: DataEntity, hand: keyof PlayerHands, amount: number): void {
        if (this.host.wearHeldItem !== undefined && this.host.handsOf?.(entity.id) !== undefined) {
            this.host.wearHeldItem(entity.id, hand, amount);
            return;
        }
        const held = entity.body.equipment[hand];
        if (held === undefined) return;
        const spent = (held.damage ?? 0) + amount;
        const durability = this.content().items.types.get(held.identifier)?.params(maxDamage) ?? 0;
        entity.body.setEquipment(
            durability > 0 && spent >= durability
                ? withoutEquipmentSlot(entity.body.equipment, hand)
                : { ...entity.body.equipment, [hand]: { ...held, damage: spent } }
        );
    }

    /** Disables a player's shield until a tick, with an undo as {@link EntityRuntime.setHitGrace} has. */
    private setShieldDisabled(id: number, until: number): void {
        const before = this.shieldsDisabled.get(id);
        this.shieldsDisabled.set(id, until);
        this.store.undoWith(() => {
            if (before === undefined) this.shieldsDisabled.delete(id);
            else this.shieldsDisabled.set(id, before);
        });
    }

    /** Notifies combat-regeneration components watching the target that just died. */
    private notifyAttackTargetKilled(target: DataEntity, killer: FilterEntityView): void {
        for (const observer of this.store.values()) {
            if (observer.target === target.id) observer.instance.notifyAttackTargetKilled(killer);
        }
    }

    /** Shares one angry entity's target with nearby entities that pass its broadcast rules. */
    private broadcastAnger(source: EntityInstance, request: EntityAngerBroadcast): void {
        const broadcaster = this.byInstance.get(source);
        if (broadcaster === undefined) return;

        const families = request.targets;
        const requestedTargetId = request.target?.id?.();
        let targetId: number | undefined =
            typeof requestedTargetId === 'number'
                ? requestedTargetId
                : request.target === undefined
                  ? broadcaster.target
                  : undefined;
        let target = targetId === undefined ? undefined : this.mobById(targetId);
        if (target === undefined && request.target === undefined) {
            targetId = broadcaster.body.damage.last()?.sourceId;
            target = targetId === undefined ? undefined : this.mobById(targetId);
        }
        const targetView = target?.view() ?? request.target;
        const sourceView = source.filterContext().self;
        const angerGroups = source
            .activeComponentGroups()
            .filter((group) =>
                source.type.groups.get(group)?.components.some((component) => component.name === 'minecraft:angry')
            );
        const range = Math.max(0, request.range);

        for (const candidate of this.near(broadcaster.position, range, families)) {
            if (candidate.id === broadcaster.id || distance(broadcaster.position, candidate.position) > range) continue;
            if (families === undefined) {
                if (candidate.identifier !== broadcaster.identifier) continue;
            } else if (!candidate.instance.hasAnyFamily(families)) {
                continue;
            }
            if (candidate.id === targetId) continue;

            const candidateView = candidate.instance.filterContext().self;
            const subjects = {
                other: sourceView,
                ...(targetView === undefined ? {} : { target: targetView, damager: targetView })
            };
            if (
                request.filters !== undefined &&
                !evaluateFilter(request.filters, { ...source.filterContext(), other: candidateView })
            )
                continue;

            const alreadyAngry = candidate.instance.hasComponent('minecraft:angry');
            const sharesType = candidate.identifier === broadcaster.identifier;
            if (sharesType && angerGroups.length > 0) {
                candidate.instance.applyEffects({ ...noEffects('minecraft:angry.broadcast'), addGroups: angerGroups });
            } else if (alreadyAngry) {
                candidate.instance.dispatch('onFriendlyAnger', candidate.instance);
            }

            if (targetId !== undefined && targetView !== undefined) {
                const targetPlayer = this.host.playerById(targetId);
                if (targetPlayer !== undefined && !canTargetPlayer(targetPlayer, this.world.level)) continue;
                if (!canEntityAttackView(candidate.instance, targetView)) continue;

                candidate.target = targetId;
                candidate.instance.setAttackTarget(targetView);
            }

            candidate.instance.trigger('minecraft:on_friendly_anger', subjects);
        }
    }

    /** Finds live entities in one entity sensor's horizontal and vertical search bounds. */
    private entitySensorCandidates(body: MobBody, query: EntitySensorQuery): readonly EntitySensorCandidate[] {
        const center = { ...body.position, y: body.position.y + query.yOffset };
        const horizontalRange = query.horizontalRange + (query.relativeRange ? body.facts.box.width : 0);
        const verticalRange = query.verticalRange + (query.relativeRange ? body.facts.box.height : 0);
        const radius = Math.hypot(horizontalRange, verticalRange);
        const candidates: EntitySensorCandidate[] = [];
        const include = (position: EntityPosition, view: EntitySensorCandidate['view']): void => {
            const dx = position.x - center.x;
            const dy = Math.abs(position.y - center.y);
            const dz = position.z - center.z;
            if (Math.hypot(dx, dz) > horizontalRange || dy > verticalRange) return;
            candidates.push({ view });
        };

        if (!query.findPlayersOnly) {
            for (const candidate of this.near(center, radius)) {
                // A player is the host's below.
                if (candidate.id === body.id || clientOwnsMovement(candidate.identifier)) continue;
                include(candidate.position, candidate.instance.filterContext().self);
            }
        }

        for (const player of this.host.players()) include(player.position, this.playerFilterView(player));
        return candidates;
    }

    /**
     * A host player as a filter reads it: the host's own view, or its family, tags and abilities,
     * with what it rides from this runtime's rides when the view does not say, which
     * `is_riding_self` reads.
     */
    private playerFilterView(player: ContentEntity): FilterEntityView {
        const view = this.hostPlayerFilterView(player);
        if (view.vehicle !== undefined) return view;
        return {
            ...view,
            vehicle: () => {
                const vehicle = this.rides.vehicleOf(player.id);
                return vehicle === undefined ? undefined : this.store.get(vehicle)?.instance.filterContext().self;
            }
        };
    }

    /** The host's own view of a player, or its family, tags and abilities. */
    private hostPlayerFilterView(player: ContentEntity): FilterEntityView {
        return (
            this.host.playerView?.(player.id) ?? {
                id: () => player.id,
                names: (name) =>
                    name === 'is_family'
                        ? ['player']
                        : name === 'has_tag'
                          ? player.tags
                          : name === 'has_ability'
                            ? playerAbilityNames(
                                  player.spectator === true
                                      ? Gametype.SPECTATOR
                                      : player.creative === true
                                        ? Gametype.CREATIVE
                                        : Gametype.SURVIVAL
                              )
                            : undefined
            }
        );
    }

    /** Where a host player looks: what the host says, or the store player's own rotation. */
    private lookOf(player: ContentEntity): Look | undefined {
        if (player.yaw !== undefined && player.pitch !== undefined) return { yaw: player.yaw, pitch: player.pitch };
        const stored = this.store.get(player.id);
        return stored === undefined ? undefined : { yaw: stored.body.yaw, pitch: stored.body.pitch };
    }

    /** Whether a host player looks at a body, Java's `isLookingAtMe` over the given heights. */
    private looksAt(
        player: ContentEntity,
        body: MobBody,
        heights: readonly number[],
        tolerance: number,
        scaleByDistance: boolean
    ): boolean {
        const look = this.lookOf(player);
        if (look === undefined) return false;
        return isLookingAt({
            eye: { ...player.position, y: player.position.y + EYE_HEIGHT },
            look,
            at: body.position,
            heights,
            tolerance,
            scaleByDistance,
            clear: (from, to) => this.hasLineOfSight(from, to)
        });
    }

    /** The players looking at one body, for `minecraft:looked_at`. */
    private lookers(body: MobBody, query: LookedAtQuery): readonly LookedAtCandidate[] {
        const feet = body.position.y;
        const eyes = feet + body.facts.box.height * ENTITY_EYE_HEIGHT_FRACTION;
        const heights = query.locations.map(
            ({ location, verticalOffset }) =>
                (location === 'head' ? eyes : location === 'body' ? (eyes + feet) / 2 : feet) + verticalOffset
        );
        const found: LookedAtCandidate[] = [];
        for (const player of this.host.players()) {
            if (player.spectator === true || distance(player.position, body.position) > query.searchRadius) continue;
            if (!this.looksAt(player, body, heights, query.tolerance, query.scaleByDistance)) continue;
            found.push({ id: player.id, view: this.playerFilterView(player) });
        }
        return found;
    }

    /** Makes a player that looked at a body its target, unless {@link canTargetPlayer} refuses them. */
    private targetLooker(body: MobBody, instance: EntityInstance, looker: LookedAtCandidate): void {
        const player = this.host.playerById(looker.id);
        if (player !== undefined && !canTargetPlayer(player, this.world.level)) return;
        body.target = looker.id;
        instance.setAttackTarget(looker.view);
    }

    /**
     * Adds to another mob's velocity, Java's `Entity.push`. A player the store does not hold is
     * the host's, which can only knock it along the push's horizontal heading.
     */
    public pushMob(source: MobBody, target: GoalMob, velocity: EntityPosition): void {
        if (typeof target.id !== 'number') return;
        const other = this.store.get(target.id);
        if (other !== undefined) {
            other.body.push(velocity);
            other.body.lastPusher = source.id;
            return;
        }
        const across = Math.hypot(velocity.x, velocity.z);
        if (across > 0) this.host.knockback?.(target.id, velocity.x / across, velocity.z / across, across);
    }

    /** Knocks a mob away from the entity, scaled by what the target resists. */
    public knockback(source: MobBody, target: GoalMob, horizontal: number, vertical: number): void {
        const other = typeof target.id === 'number' ? this.store.get(target.id) : undefined;
        if (other === undefined) return;

        const resisted = 1 - other.facts.knockbackResistance;
        if (resisted <= 0) return;

        const away = distance(source.position, other.position) || 1;
        other.position = {
            x: other.position.x + ((other.position.x - source.position.x) / away) * horizontal * resisted,
            y: other.position.y + vertical * resisted,
            z: other.position.z + ((other.position.z - source.position.z) / away) * horizontal * resisted
        };
        // Being knocked about is what `minecraft:behavior.target_when_pushed` answers to, and
        // it is a separate record from the damage, because a push is not damage.
        other.body.lastPusher = source.id;
    }

    /**
     * Fires one entity's projectile at a mob.
     *
     * The projectile the goal named wins, and `minecraft:shooter` is the
     * fallback, which is where every vanilla shooter writes it. The arrow is
     * created at the shooter's eye with the velocity that points it at the
     * target. Flight and impact are then handled by its `minecraft:projectile`
     * component.
     */
    public shoot(shooter: MobBody, target: GoalMob, projectile: string | undefined): void {
        const identifier = projectile ?? this.shooterDefinitionOf(shooter);
        if (identifier === undefined) {
            this.report(`${shooter.identifier} has no projectile to shoot, and its goal named none`);
            return;
        }

        const from = {
            x: shooter.position.x,
            y: shooter.position.y + shooter.facts.box.height * PROJECTILE_EYE_HEIGHT_FRACTION,
            z: shooter.position.z
        };
        const at = target.position();
        const away = distance(from, at) || 1;
        this.launchProjectile(
            identifier,
            from,
            { x: (at.x - from.x) / away, y: (at.y - from.y) / away, z: (at.z - from.z) / away },
            PROJECTILE_SPEED,
            0,
            shooter.id
        );
    }

    /**
     * Spawns a projectile with its owner and launch velocity recorded in the live entity runtime.
     *
     * Its hits are read from `minecraft:projectile`, and its flight from Java's class for a vanilla
     * type or from that component otherwise ({@link projectileFlight}); a type without the
     * component is refused instead of leaving a body that can only fall like an ordinary entity.
     *
     * @param identifier - The projectile entity definition to instantiate.
     * @param at - The launch position, in world coordinates.
     * @param direction - The direction of travel; it is normalized before speed is applied.
     * @param speed - Launch speed, in blocks per tick.
     * @param inaccuracy - Gaussian spread in degrees, as Java's projectile launch uses it.
     * @param owner - The runtime id responsible for this projectile.
     * @param data - Item-specific payload, such as arrow enchantments or potion contents.
     * @returns The launched projectile, or undefined when its definition is unavailable or invalid.
     */
    public launchProjectile(
        identifier: string,
        at: EntityPosition,
        direction: EntityPosition,
        speed: number,
        inaccuracy: number,
        owner: number,
        data?: Readonly<Record<string, unknown>>
    ): DataEntity | undefined {
        const entity = this.spawn(identifier, at, data === undefined ? undefined : { data });
        if (entity === undefined) return undefined;
        if (!entity.instance.hasComponent('minecraft:projectile')) {
            this.report(`${identifier} was launched without a minecraft:projectile component`);
            this.remove(entity.id, 'invalid_projectile');
            return undefined;
        }

        const velocity = projectileVelocity(direction, speed, inaccuracy, this.world.random);
        entity.body.velocity = velocity;
        this.setOwner(entity.id, owner);
        const eye = entityEyePosition(at, entity.facts.box.height);
        entity.body.lookAt({ x: eye.x + velocity.x, y: eye.y + velocity.y, z: eye.z + velocity.z });
        this.projectiles.set(entity.id, { hitEntities: new Set() });
        entity.body.projectileAge = 0;
        entity.body.projectileStuck = false;
        return entity;
    }

    /**
     * Detonates an entity, which is what `minecraft:behavior.swell` stands
     * still for.
     *
     * Java's ray cast through {@link detonate}, so a creeper now carves the
     * hole it should: the blocks it can reach come out through their own loot
     * tables, everything in range is hurt by how much of the blast it can see,
     * and the entity itself goes with it.
     *
     * `mobGriefing` decides whether the hole is carved at all, which is what
     * Java's `Mob.explode` does with it. With the rule off the blast still
     * hurts and still shoves, because the rule is about the world rather than
     * about the damage.
     */
    public explode(source: MobBody): void {
        const self = this.store.get(source.id);
        if (self === undefined) return;

        const isTnt = self.instance.families().includes('tnt');
        if (isTnt && !ruleIsOn(this.world.level, TNT_EXPLODES)) {
            this.remove(self.id, 'tnt_explodes_disabled');
            return;
        }

        const params = self.instance.componentParams('minecraft:explode');
        const power = isRecord(params) && typeof params.power === 'number' ? params.power : DEFAULT_EXPLOSION_POWER;

        const guard = this.explosionGuard;
        const blast = detonate(this.world, {
            ...(guard === undefined ? {} : { guard: (blocks: readonly BlockPosition[]) => guard(self, blocks) }),
            center: source.position,
            power,
            // From the index, within the engine's reach and a block more, which is all it accepts,
            // dropped stacks included. In ascending runtime id order, which the hits come back in.
            candidates: this.index
                .blastWithin(source.position.x, source.position.z, power * EXPLOSION_ENTITY_REACH + 1)
                .filter((caught) => caught.id !== source.id),
            breaksBlocks: isTnt || ruleIsOn(this.world.level, MOB_GRIEFING),
            content: this.content(),
            // The blocks a blast breaks are still blocks, so `doTileDrops` decides whether they
            // leave anything behind. No sink, and `detonate` rolls no loot at all.
            drop: ruleIsOn(this.world.level, BLOCK_DROPS) ? (at, item) => this.host.drop(at, item) : undefined,
            // The server's own destruction path, which raises each block's `onBreak` before
            // the blast writes over it; that is what spills the chest a creeper caught.
            destroy: (at) =>
                this.host.destroyBlock?.(at, {
                    explosionRadius: power,
                    dropsBlock: ruleIsOn(this.world.level, BLOCK_DROPS),
                    sourceId: source.id
                }) ?? false
        });

        if (blast.canceled) {
            this.remove(self.id, 'explosion');
            return;
        }
        this.world.effects.playSound(blockPositionOf(source.position), 'random.explode');
        this.onExploded?.(self, blast.destroyedBlocks);

        const sourceId = isTnt ? (self.body.owner ?? self.id) : self.id;
        for (const hit of blast.hits) {
            this.hurt(hit.entity, sourceId, 'entity_explosion', hit.damage, { route: 'explosion' });
            hit.entity.body.push(hit.knockback);
        }

        this.remove(self.id, 'explosion');

        if (ruleIsOn(this.world.level, TNT_EXPLODES)) {
            for (const block of blast.destroyedBlocks) {
                if (block.identifier !== 'minecraft:tnt') continue;
                this.spawn(
                    'minecraft:tnt',
                    { x: block.position.x + 0.5, y: block.position.y, z: block.position.z + 0.5 },
                    {
                        cause: 'primed',
                        event: 'from_explosion',
                        ownerId: sourceId,
                        data: { fuse: randomShortFuse(DEFAULT_FUSE_TICKS, this.world.random.nextFloat()) }
                    }
                );
            }
        }
    }

    /** Puts an entity on a mob as a rider, if the mob has a seat free for it. */
    public mount(rider: MobBody, vehicle: GoalMob): void {
        if (typeof vehicle.id !== 'number') return;
        const mount = this.store.get(vehicle.id);
        if (mount === undefined) return;
        if (this.rides.ridersOf(mount.id).length >= seatCountOf(mount)) return;
        this.rides.mount(rider.id, mount.id);
    }

    /** Takes an entity off whatever it rides. */
    public dismount(rider: MobBody): void {
        this.rides.dismount(rider.id);
    }

    /** Throws every rider off an entity, which is Java's `ejectPassengers`. */
    public ejectRiders(vehicle: MobBody): void {
        for (const rider of [...this.rides.ridersOf(vehicle.id)]) this.rides.dismount(rider);
    }

    /**
     * Tames a mount for a player, as Java's `AbstractHorse.tameWithName` does when a buck's temper
     * roll wins: the player owns it and its `minecraft:tamemount` tame event runs.
     */
    public tameMount(mount: MobBody, player: GoalMob): void {
        const entity = this.store.get(mount.id);
        if (entity === undefined || typeof player.id !== 'number') return;
        if (this.tameGuard?.(entity, player.id) === false) return;
        this.setOwner(entity.id, player.id);
        entity.body.conditions.add('is_tamed');
        const trigger = mountTameEvent(entity.instance);
        fireTameEvent(entity, trigger?.event, trigger?.target);
        this.onTamed?.(entity, player.id);
    }

    /**
     * Tames an entity as a script's `tame` does: the owner, when one is given, is recorded, and the
     * `tame_event` of its `minecraft:tameable`, or of its `minecraft:tamemount`, runs.
     * @param owner - The player's runtime id, or undefined for a horse tamed to nobody.
     * @returns False for an entity that is gone or already tamed.
     */
    public tameFor(id: number, owner: number | undefined): boolean {
        const entity = this.store.get(id);
        if (entity === undefined || entity.body.conditions.has('is_tamed') || entity.body.owner !== undefined)
            return false;
        if (owner !== undefined) this.setOwner(id, owner);
        entity.body.conditions.add('is_tamed');
        const tameable = entity.instance.componentParams('minecraft:tameable');
        const trigger =
            isRecord(tameable) && isRecord(tameable.tameEvent)
                ? { event: tameable.tameEvent.event, target: tameable.tameEvent.target }
                : mountTameEvent(entity.instance);
        fireTameEvent(
            entity,
            typeof trigger?.event === 'string' ? trigger.event : undefined,
            EVENT_TARGETS.find((target) => target === trigger?.target)
        );
        return true;
    }

    /**
     * Unties an entity's leash, as a script's `unleash` does, and raises its `on_unleash` event.
     * @returns Whether it was leashed.
     */
    public releaseLead(id: number): boolean {
        const entity = this.store.get(id);
        if (entity === undefined || !this.leashHolders.has(id)) return false;
        this.setLeashHolder(id, undefined);
        this.raiseLeashEvent(entity, 'on_unleash');
        return true;
    }

    /** What an entity rides, or undefined when it rides nothing. */
    public vehicleOf(rider: MobBody): GoalMob | undefined {
        const vehicle = this.rides.vehicleOf(rider.id);
        return vehicle === undefined ? undefined : this.mobById(vehicle);
    }

    /** What entity or player holds one data-driven entity's leash, when it has one. */
    public leashHolderOf(entity: MobBody): GoalMob | undefined {
        const holderId = this.leashHolderIdOf(entity.id);
        return holderId === undefined ? undefined : this.mobById(holderId);
    }

    /**
     * Runtime id of a loaded entity or player holding this entity's leash.
     *
     * @param id - Runtime id of the leashed data-driven entity.
     * @returns The holder's runtime id, or undefined while the holder is not loaded.
     */
    public leashHolderIdOf(id: number): number | undefined {
        const identity = this.leashHolders.get(id);
        if (identity === undefined) return undefined;

        const holder = this.byPersistentIdentity.get(identity);
        if (holder !== undefined) return holder.id;

        const playerIdentity = identity.startsWith(PLAYER_LEASH_HOLDER_PREFIX)
            ? identity.slice(PLAYER_LEASH_HOLDER_PREFIX.length)
            : undefined;
        return playerIdentity === undefined ? undefined : this.host.playerIdForIdentity?.(playerIdentity);
    }

    /** Stable identity of a leash holder, ready to save with the entity's record. */
    public leashHolderIdentityOf(id: number): string | undefined {
        return this.leashHolders.get(id);
    }

    /**
     * The rider that steers a mount steered with an item, Java's `getControllingPassenger` for the
     * pig and the strider: the first rider, when it is a mob, or a player holding an item the
     * mount's `minecraft:item_controllable` names. A player holding none rides along while the
     * mount goes its own way.
     *
     * @returns The rider's runtime id, or undefined when nobody steers it.
     */
    public itemControllingRider(vehicle: DataEntity): number | undefined {
        const control = vehicle.instance.componentParams('minecraft:item_controllable');
        const controlItems = itemsNamed(isRecord(control) ? control.control_items : undefined);
        const rider = this.rides.ridersOf(vehicle.id)[0];
        if (rider === undefined || controlItems.length === 0) return undefined;
        // A mob riding first steers it with its own AI, as `Mob.getControllingPassenger` hands it over.
        const carried = this.store.get(rider);
        if (carried !== undefined && !clientOwnsMovement(carried.identifier)) return rider;
        const held = this.host.heldItemOf?.(rider);
        return held !== undefined && controlItems.includes(normalizedItemIdentifier(held)) ? rider : undefined;
    }

    /** The boost of a mount steered with an item, made the first time anything asks. */
    public steeringOf(vehicle: DataEntity): ItemSteering {
        let steering = this.steerings.get(vehicle);
        if (steering === undefined) {
            steering = new ItemSteering();
            this.steerings.set(vehicle, steering);
        }
        return steering;
    }

    /**
     * Boosts the mount a rider steers with an item, as Java's `FoodOnAStickItem.use` asks
     * `ItemSteerable.boost` to: only a mount whose `minecraft:boostable` takes the item, steered by
     * this rider, and not boosting already.
     *
     * @param riderId - The rider using the item.
     * @param item - The item, such as `minecraft:carrot_on_a_stick`.
     * @returns Whether a boost started, which is when the item pays its durability.
     */
    public boostMount(riderId: number, item: string): boolean {
        const vehicleId = this.rides.vehicleOf(riderId);
        const mount = vehicleId === undefined ? undefined : this.store.get(vehicleId);
        if (mount === undefined || this.itemControllingRider(mount) !== riderId) return false;
        const boostable = mount.instance.componentParams('minecraft:boostable');
        const boostItems = isRecord(boostable) && Array.isArray(boostable.boost_items) ? boostable.boost_items : [];
        const takes = boostItems.some(
            (entry: unknown) => isRecord(entry) && itemsNamed(entry.item).includes(normalizedItemIdentifier(item))
        );
        return takes && this.steeringOf(mount).boost((bound) => this.world.random.nextInt(bound));
    }

    /** Who rides an entity, in the order they got on. */
    public ridersOf(vehicle: MobBody): readonly GoalMob[] {
        return this.rides.ridersOf(vehicle.id).flatMap((rider) => {
            const mob = this.mobById(rider);
            return mob === undefined ? [] : [mob];
        });
    }

    /** Fires the event the active leashable component names for an attachment. */
    private raiseLeashEvent(entity: DataEntity, name: 'on_leash' | 'on_unleash'): void {
        const leashable = entity.instance.componentParams('minecraft:leashable');
        if (!isRecord(leashable)) return;

        const value = leashable[name];
        if (typeof value === 'string') {
            entity.instance.raise(value, 'self', 'minecraft:leashable');
            return;
        }
        if (!isRecord(value) || typeof value.event !== 'string') return;

        const target = parseEventTarget(value.target, (code, message) =>
            this.report(`${entity.identifier}: ${code}: ${message}`)
        );
        entity.instance.raise(value.event, target, 'minecraft:leashable');
    }

    /**
     * What Java's `DifficultyInstance` reads where a mob stands: the world's difficulty, its time,
     * the ticks players have spent in the chunk there and the moon.
     */
    private regionalDifficultyInputs(at: EntityPosition): RegionalDifficultyInputs {
        const { level } = this.world;
        return {
            difficulty: level.difficulty(),
            worldTime: level.gameTime(),
            inhabitedTime: level.inhabitedTime?.(blockPositionOf(at)) ?? 0,
            moonBrightness: moonBrightnessAt(level.gameTime())
        };
    }

    /**
     * Whether a mob whose pickup goal declares `pickup_based_on_chance` may pick up at all. The
     * first ask rolls Java's `canPickUpLoot` chance for the region and the body keeps the answer,
     * so a zombie that spawned unable to pick up stays so, as in Java.
     */
    public canPickUpLoot(taker: MobBody): boolean {
        if (taker.canPickUpLoot !== undefined) return taker.canPickUpLoot;
        const random = this.store.get(taker.id)?.instance.random;
        const rolled =
            random !== undefined && random.next() < canPickUpLootChance(this.regionalDifficultyInputs(taker.position));
        taker.canPickUpLoot = rolled;
        return rolled;
    }

    /**
     * Enchants what a mob holds and wears in the given slots through a Java enchantment provider,
     * with the mob's own random and the regional difficulty where it stands, as Java's
     * `EnchantmentHelper.enchantItemFromProvider` does for a trap skeleton's bow and helmet.
     */
    public enchantEquipmentFromProvider(entity: DataEntity, provider: string, slots: readonly string[]): void {
        const source = enchantmentProviderSourceOf(this.content());
        const own = entity.instance.random;
        const random = {
            nextFloat: () => own.next(),
            nextInt: (bound: number) => own.nextInt?.(bound) ?? Math.floor(own.next() * bound)
        };
        const multiplier = clampedRegionalDifficulty(
            regionalDifficulty(this.regionalDifficultyInputs(entity.position))
        );
        const equipment: Partial<Record<MobEquipmentSlot, ContentItemDrop>> = { ...entity.body.equipment };
        for (const name of slots) {
            const slot = mobEquipmentSlotOf(name);
            const item = slot === undefined ? undefined : equipment[slot];
            if (slot === undefined || item === undefined) continue;
            equipment[slot] = enchantFromProvider(source, provider, item, random, multiplier);
        }
        entity.body.setEquipment(equipment);
    }

    /** Takes up to `count` items from a stack lying in the world into an entity's inventory. */
    public pickUp(taker: MobBody, item: GoalItem, count = item.count(), options?: GoalPickupOptions): void {
        if (typeof item.id !== 'number') return;
        const entity = this.store.get(taker.id);
        // `Fox.canHoldItem`: a fox with something in its mouth leaves the item where it lies. Java
        // also lets it trade a food for another item once it has gone off the food, which the
        // runtime keeps no `ticksSinceEaten` for.
        if (entity?.identifier === FOX && taker.equipment.mainhand !== undefined) return;
        const taken = this.host.takeItem?.(item.id, count);
        if (taken === undefined) return;
        const piglinStarted =
            entity !== undefined &&
            (options?.admire === true || options?.barter === true) &&
            this.startPiglinInteraction(entity, taken.identifier, options.admire, options.barter);
        const carriedForConsumption = !piglinStarted && options?.consumeItem === true && taker.carried === undefined;
        if (carriedForConsumption) taker.carried = taken.identifier;
        const equippedCount =
            !piglinStarted && !carriedForConsumption && options?.canPickupToHandOrEquipment === true
                ? this.equipPickedUpItem(taker, taken)
                : 0;
        const storedInInventory =
            equippedCount === 0 &&
            !piglinStarted &&
            !carriedForConsumption &&
            options?.storedInInventory === true &&
            this.storePickedUpItem(taker, taken);
        if (storedInInventory) return;
        const carried = [...taker.inventory];
        for (let index = piglinStarted || carriedForConsumption ? 1 : equippedCount; index < taken.count; index += 1)
            carried.push(taken.identifier);
        taker.setInventory(carried);
    }

    /**
     * Equips one picked-up item in its declared slot when that slot is empty. A mob whose
     * `minecraft:equip_item` sets `can_wear_armor` to false holds armor in its main hand, as a
     * fox holds anything in its mouth (Java `Fox.pickUpItem`).
     */
    private equipPickedUpItem(taker: MobBody, item: ContentItemDrop): number {
        if (item.count <= 0) return 0;
        const stack = itemOfDrop(item, this.content());
        const equipItem = this.store.get(taker.id)?.instance.componentParams('minecraft:equip_item');
        const wearsArmor = !isRecord(equipItem) || equipItem['can_wear_armor'] !== false;
        const slot = stack === null || !wearsArmor ? 'mainhand' : slotForItem(stack);
        if (taker.equipment[slot] !== undefined) return 0;

        const equipment = { ...taker.equipment };
        equipment[slot] = { ...item, count: 1 };
        taker.setEquipment(equipment);
        return 1;
    }

    /** Which Java class's touch pickup a mob follows, or undefined for one whose class picks up nothing. */
    private lootPickupRuleOf(entity: DataEntity): LootPickupRule | undefined {
        if (entity.brainMob?.id === 'minecraft:piglin') return 'piglin';
        if (entity.brainMob?.id === 'minecraft:villager') return 'villager';
        if (entity.identifier === SULFUR_CUBE) return 'swallow';
        // `pickup_based_on_chance` marks exactly the mobs whose Java class rolls `canPickUpLoot`
        // in `finalizeSpawn`: the zombies, the skeletons and their kin.
        return this.pickupGoalParams(entity)?.pickupBasedOnChance === true ? 'equip' : undefined;
    }

    /** The parsed body of a mob's active `minecraft:behavior.pickup_items`, if it has one. */
    private pickupGoalParams(entity: DataEntity): Record<string, unknown> | undefined {
        const declared = entity.instance.componentParams(PICKUP_ITEMS);
        return isRecord(declared) && isRecord(declared.params) ? declared.params : undefined;
    }

    /**
     * Java's `Mob.aiStep` loot pickup for one mob: each item entity it touches that its class
     * wants, taken by its class's `pickUpItem`. See {@link LootPickupRule}.
     */
    private pickUpLoot(entity: DataEntity): void {
        const rule = this.lootPickupRuleOf(entity);
        if (rule === undefined || entity.removed !== undefined || this.dying.has(entity.id)) return;
        if (!ruleIsOn(this.world.level, MOB_GRIEFING)) return;
        // `canPickUpLoot`: set by the piglin's and the villager's constructors, rolled once from
        // the region for the rest, and false for a sulfur cube that holds a block already.
        if (rule === 'equip' && !this.canPickUpLoot(entity.body)) return;
        if (rule === 'swallow' && entity.body.equipment.mainhand !== undefined) return;

        const { box } = entity.facts;
        const reacher = { position: entity.position, width: box.width, height: box.height };
        const lying = this.host.itemsNear?.(entity.position, pickupQueryRadius(box)) ?? this.host.items?.() ?? [];
        for (const candidate of lying) {
            if (entity.removed !== undefined) return;
            if ((candidate.pickupDelay ?? 0) > 0 || !inPickupReach(reacher, candidate.position)) continue;
            switch (rule) {
                case 'piglin':
                    this.piglinPickUp(entity, candidate);
                    break;
                case 'villager':
                    this.villagerPickUp(entity, candidate);
                    break;
                case 'swallow':
                    this.swallowPickUp(entity, candidate);
                    break;
                case 'equip':
                    this.equipPickUp(entity, candidate);
                    break;
            }
        }
    }

    /**
     * `Mob.pickUpItem` through `equipItemIfPossible`, after `Zombie.wantsToPickUp`: the item goes to
     * the slot it is worn or held in when that slot is empty, armor to the main hand when its own
     * slot is taken, and a hand takes the whole stack where an armor slot takes one.
     */
    private equipPickUp(entity: DataEntity, candidate: ContentItemEntity): void {
        const excluded = this.pickupGoalParams(entity)?.excludedItems;
        if (Array.isArray(excluded) && excluded.includes(candidate.item.identifier)) return;
        const stack = itemOfDrop(candidate.item, this.content());
        if (stack === null) return;
        // `Zombie.canHoldItem`: a baby riding something holds no egg.
        const riding = this.rides.vehicleOf(entity.id) !== undefined;
        if (stack.hasJavaTag('minecraft:eggs') && entity.instance.hasComponent('minecraft:is_baby') && riding) return;
        const { equipment } = entity.body;
        let slot = slotForItem(stack);
        if (equipment[slot] !== undefined && slot !== 'mainhand' && slot !== 'offhand') slot = 'mainhand';
        if (equipment[slot] !== undefined) return;
        const count = slot === 'mainhand' || slot === 'offhand' ? candidate.item.count : 1;
        const taken = this.host.takeItem?.(candidate.id, count);
        if (taken !== undefined) entity.body.setEquipment({ ...equipment, [slot]: taken });
    }

    /**
     * `Villager.wantsToPickUp` and `InventoryCarrier.pickUpItem`: an item the villager gathers,
     * eats or works with goes into its inventory, as much of the stack as fits.
     */
    private villagerPickUp(entity: DataEntity, candidate: ContentItemEntity): void {
        const stack = itemOfDrop(candidate.item, this.content());
        if (stack === null) return;
        const item = {
            identifier: candidate.item.identifier,
            picksUp: stack.hasJavaTag('minecraft:villager_picks_up'),
            villagerFood: stack.hasComponent('minecraft:villager_food')
        };
        if (!villagerWants(item, professionOf(entity.instance))) return;
        const room = flatInventoryRoom(entity.body.inventory, item.identifier, entity.body.containerCapacity, (id) =>
            maxStackSizeOf(id, this.content())
        );
        if (room <= 0) return;
        const taken = this.host.takeItem?.(candidate.id, Math.min(room, candidate.item.count));
        if (taken === undefined) return;
        entity.body.setInventory([
            ...entity.body.inventory,
            ...Array.from({ length: taken.count }, () => taken.identifier)
        ]);
    }

    /**
     * `SulfurCube.canHoldItem` and `pickUpItem`: an adult cube with nothing in its body swallows one
     * block of `#minecraft:sulfur_cube_swallowable`. Java keeps it in the body slot; Bedrock's cube
     * keeps it in its main hand, which its `minecraft:equip_item` (`can_wear_armor: false`) routes
     * every pickup to and its client draws inside the cube.
     */
    private swallowPickUp(entity: DataEntity, candidate: ContentItemEntity): void {
        if (entity.body.equipment.mainhand !== undefined || entity.instance.hasComponent('minecraft:is_baby')) return;
        const stack = itemOfDrop(candidate.item, this.content());
        if (stack === null || !stack.hasJavaTag('minecraft:sulfur_cube_swallowable')) return;
        const taken = this.host.takeItem?.(candidate.id, 1);
        if (taken !== undefined) entity.body.setEquipment({ ...entity.body.equipment, mainhand: taken });
    }

    /**
     * `Piglin.wantsToPickUp` through the brain's `PiglinAi.wantsToPickup`, and `PiglinAi.pickUpItem`:
     * the piglin stops walking, admires a loved item in its off hand (a gold ingot also starts a
     * barter), eats food when it has not eaten lately, and otherwise wears or holds the item, or
     * keeps it in its inventory.
     */
    private piglinPickUp(entity: DataEntity, candidate: ContentItemEntity): void {
        const brain = entity.brain;
        if (brain === undefined) return;
        const context = { world: this.brainWorld(), body: brainMobOf(entity, brain, this) };
        const item = brainItemOf(candidate.item.identifier, this);
        if (!wantsToPickUpAsPiglin(item, context)) return;
        context.body.navigation.stop();
        brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
        const nugget = candidate.item.identifier === 'minecraft:gold_nugget';
        const taken = this.host.takeItem?.(candidate.id, nugget ? candidate.item.count : 1);
        if (taken === undefined) return;
        if (isLovedItem(item)) {
            brain.eraseMemory(MemoryModuleTypes.TIME_TRYING_TO_REACH_ADMIRE_ITEM);
            if (this.startPiglinInteraction(entity, taken.identifier, true, true)) return;
            const held = entity.body.equipment.offhand;
            if (held !== undefined) this.host.drop(blockPositionOf(entity.position), held);
            entity.body.setEquipment({ ...entity.body.equipment, offhand: taken });
            admireGoldItem(context);
            return;
        }
        if (item.tags.has('minecraft:piglin_food') && !brain.hasMemoryValue(MemoryModuleTypes.ATE_RECENTLY)) {
            brain.setMemoryWithExpiry(MemoryModuleTypes.ATE_RECENTLY, true, PIGLIN.eatCooldown);
            return;
        }
        if (this.equipPickedUpItem(entity.body, taken) > 0) return;
        if (!this.storePickedUpItem(entity.body, taken)) this.host.drop(blockPositionOf(entity.position), taken);
    }

    /** Stores a picked-up stack in the first free declared inventory slot. */
    private storePickedUpItem(taker: MobBody, item: ContentItemDrop): boolean {
        for (let index = 0; index < taker.containerCapacity; index += 1) {
            if (taker.containerSlots[index] !== undefined) continue;
            taker.setContainerSlot(index, item);
            return true;
        }
        return false;
    }

    /** Finds a loaded crafting recipe that converts repeated copies of one item into another. */
    public craftInto(
        inputIdentifier: string,
        outputIdentifier: string,
        availableInput: number,
        wantedOutput: number
    ): GoalItemCraft | undefined {
        const available = Math.floor(availableInput);
        const wanted = Math.floor(wantedOutput);
        if (available <= 0 || wanted <= 0) return undefined;

        const recipes = this.content().recipes;
        let cache = this.craftIntoCache.get(recipes);
        if (cache === undefined) {
            cache = new Map();
            this.craftIntoCache.set(recipes, cache);
        }

        for (let inputPerCraft = 1; inputPerCraft <= Math.min(9, available); inputPerCraft += 1) {
            const key = `${inputIdentifier}\0${outputIdentifier}\0${inputPerCraft}`;
            let candidate = cache.get(key);
            if (candidate === undefined) {
                const slots = Array.from({ length: 9 }, (_, index) =>
                    index < inputPerCraft ? { id: inputIdentifier, count: 1 } : null
                );
                for (const match of recipes.matchAll({
                    station: 'crafting',
                    grid: { width: 3, height: 3, slots }
                })) {
                    if (
                        match.result.id !== outputIdentifier ||
                        match.result.count <= 0 ||
                        (match.result.components !== undefined && Object.keys(match.result.components).length > 0) ||
                        match.remainder.some((item) => item !== null)
                    )
                        continue;

                    const consumedPerCraft = match.consumed.reduce((total, count) => total + count, 0);
                    if (consumedPerCraft !== inputPerCraft) continue;
                    candidate = { recipeId: match.recipe.id, consumedPerCraft, resultCount: match.result.count };
                    break;
                }
                cache.set(key, candidate ?? null);
            }
            if (candidate === null || candidate === undefined) continue;

            const crafts = Math.min(
                Math.floor(available / candidate.consumedPerCraft),
                Math.ceil(wanted / candidate.resultCount)
            );
            if (crafts <= 0) continue;
            const craftedCount = candidate.resultCount * crafts;
            return {
                recipeId: candidate.recipeId,
                inputIdentifier,
                inputCount: candidate.consumedPerCraft * crafts,
                outputIdentifier,
                craftedCount,
                outputCount: Math.min(wanted, craftedCount)
            };
        }
        return undefined;
    }

    /** Consumes a prepared crafting recipe's inputs and gives its output to another entity. */
    public giveCraftedItem(giver: MobBody, taker: GoalMob, craft: GoalItemCraft): void {
        const available = this.heldItemCount(giver, craft.inputIdentifier);
        if (available < craft.inputCount) return;
        const verified = this.craftInto(
            craft.inputIdentifier,
            craft.outputIdentifier,
            craft.inputCount,
            craft.outputCount
        );
        if (
            verified === undefined ||
            verified.recipeId !== craft.recipeId ||
            verified.inputCount !== craft.inputCount ||
            verified.craftedCount !== craft.craftedCount ||
            verified.outputCount !== craft.outputCount
        )
            return;

        if (this.takeHeldItems(giver, craft.inputIdentifier, craft.inputCount) !== craft.inputCount) return;
        for (let index = craft.outputCount; index < craft.craftedCount; index += 1)
            giver.setInventory([...giver.inventory, craft.outputIdentifier]);
        this.deliverItem(taker, craft.outputIdentifier, craft.outputCount);
    }

    /**
     * Moves items from an entity's inventory to another entity.
     *
     * A taker this runtime does not hold, such as a player, gets the stack
     * dropped at its feet, which is what the allay and the villager do in
     * vanilla: they throw the item rather than reaching into a container.
     */
    public giveItem(giver: MobBody, taker: GoalMob, identifier: string, count = 1): void {
        const taken = this.takeHeldItems(giver, identifier, Math.max(0, Math.floor(count)));
        if (taken === 0) return;

        this.deliverItem(taker, identifier, taken);
    }

    /** Counts one item across the entity's flat inventory and declared slots. */
    private heldItemCount(entity: MobBody, identifier: string): number {
        return (
            entity.inventory.filter((item) => item === identifier).length +
            entity.containerSlots.reduce((count, item) => count + (item?.identifier === identifier ? item.count : 0), 0)
        );
    }

    /** Removes up to `count` items from an entity's flat inventory and declared slots. */
    private takeHeldItems(entity: MobBody, identifier: string, count: number): number {
        let remaining = count;
        const carried = [...entity.inventory];
        while (remaining > 0) {
            const held = carried.indexOf(identifier);
            if (held === -1) break;
            carried.splice(held, 1);
            remaining -= 1;
        }
        entity.setInventory(carried);

        for (let index = 0; index < entity.containerSlots.length && remaining > 0; index += 1) {
            const item = entity.containerSlots[index];
            if (item === undefined || item.identifier !== identifier) continue;
            const taken = Math.min(item.count, remaining);
            entity.setContainerSlot(index, taken === item.count ? undefined : { ...item, count: item.count - taken });
            remaining -= taken;
        }
        return count - remaining;
    }

    /** Gives one item stack to a runtime entity or drops it at a player. */
    private deliverItem(taker: GoalMob, identifier: string, count: number): void {
        const other = typeof taker.id === 'number' ? this.store.get(taker.id) : undefined;
        if (other === undefined) {
            this.host.drop(blockPositionOf(taker.position()), { identifier, count });
            return;
        }
        other.body.setInventory([...other.body.inventory, ...Array.from({ length: count }, () => identifier)]);
    }

    /**
     * Breaks a block and drops what its loot table rolls.
     *
     * Only a mob ever reaches this, through the goal world, so `mobGriefing` decides whether the
     * block goes at all and `doTileDrops` whether it leaves anything behind. A zombie at a door
     * with the rule off stands there instead of coming through.
     *
     * The host's destruction is the same one a blast and a piston go through: it raises the
     * block's `onBreak`, so a chest a villager harvested over spills what it held, and it rolls
     * Java's table with the position and the level view the conditions read. The write stays
     * here, and it comes after, because a family reads the block entity it is about to lose.
     */
    public breakBlock(at: EntityPosition): void {
        if (!ruleIsOn(this.world.level, MOB_GRIEFING)) return;

        const position = blockPositionOf(at);
        const block = this.world.blocks.get(position);
        if (block === undefined || block.identifier === AIR) return;

        const dropsBlock = ruleIsOn(this.world.level, BLOCK_DROPS);
        const destroyed = this.host.destroyBlock?.(position, { dropsBlock }) ?? false;

        this.world.blocks.set(position, { identifier: AIR, states: {} }, true);
        if (destroyed || !dropsBlock) return;

        // No live world behind the host, so there is no hook to raise and no level view to
        // roll against. The bare table stands in, and a block the loot registry has no table
        // for drops nothing rather than reporting, because that is most of the palette.
        const table = javaBlockLootIdOf(block.identifier);
        if (this.content().loot.table(table) === undefined) return;
        for (const drop of this.rolled(table)) this.host.drop(position, drop);
    }

    /** Notifies nearby block sensors after one block is broken. */
    public blockBroken(position: EntityPosition, identifier: string, sourceId?: number): void {
        const source =
            sourceId === undefined
                ? undefined
                : (this.store.get(sourceId)?.instance.filterContext().self ??
                  this.host.playerView?.(sourceId) ??
                  this.mobById(sourceId)?.view());
        const event: EntityBlockBreakEvent = {
            block: { identifier: () => identifier },
            position,
            ...(source === undefined ? {} : { source })
        };
        const center = { x: position.x + 0.5, y: position.y + 0.5, z: position.z + 0.5 };
        for (const entity of this.near(center, MAX_BLOCK_SENSOR_RADIUS)) {
            if (entity.instance.hasComponent('minecraft:block_sensor'))
                entity.instance.dispatch('onBlockBroken', entity.instance, event);
        }
    }

    /**
     * Opens one entity's trade screen for a player.
     *
     * The merchant is built on the first ask and kept, so the offers a player
     * sees are the ones the entity has had all along.
     */
    public openTrade(trader: MobBody, player: GoalMob): void {
        if (typeof player.id !== 'number') return;
        const entity = this.store.get(trader.id);
        if (entity === undefined) return;
        if (this.merchant(entity) === undefined) {
            this.report(`${trader.identifier} was asked to trade, and it carries no trade table`);
            return;
        }
        trader.tradingPlayer = player.id;
    }

    /**
     * Claims a trader for one player, the way Java's `Villager.startTrading` does.
     *
     * @returns Whether the trader may be traded with: it is alive, awake, grown, not already
     * trading and has offers. A baby only shakes its head, so it does not open a screen.
     */
    public beginTrade(id: number, playerId: number): boolean {
        const entity = this.store.get(id);
        if (entity === undefined || entity.removed !== undefined) return false;
        if (entity.body.tradingPlayer !== undefined || entity.body.sleeping) return false;
        if (entity.instance.hasComponent('minecraft:is_baby')) return false;
        if ((this.merchant(entity)?.offers().length ?? 0) === 0) return false;

        entity.body.tradingPlayer = playerId;
        return true;
    }

    /**
     * What a trader's cured-villager discounts need to know about one player.
     *
     * @returns Whether this player cured the trader, and how many other cured villagers stand
     *   within 16 blocks of it, which is the `nearby_cured_discount` count.
     */
    public curedFacts(id: number, playerId: number): { curedByPlayer: boolean; nearbyCured: number } {
        const entity = this.store.get(id);
        if (entity === undefined) return { curedByPlayer: false, nearbyCured: 0 };

        const identity = this.host.playerIdentityOf?.(playerId);
        let nearbyCured = 0;
        for (const other of this.entities()) {
            if (other.id === id || other.body.curedBy === undefined || other.removed !== undefined) continue;
            if (other.identifier.startsWith('minecraft:zombie_villager')) continue;
            if (distance(entity.position, other.position) <= NEARBY_CURED_RANGE) nearbyCured += 1;
        }
        return { curedByPlayer: identity !== undefined && entity.body.curedBy === identity, nearbyCured };
    }

    /** Frees a trader once its player has left the screen, if that player is still the one it trades with. */
    public endTrade(id: number, playerId: number): void {
        const entity = this.store.get(id);
        if (entity !== undefined && entity.body.tradingPlayer === playerId) entity.body.tradingPlayer = undefined;
    }

    /** Whether two entities may breed with each other now. */
    public canBreedWith(parent: MobBody, mate: GoalMob): boolean {
        const self = this.store.get(parent.id);
        const other = typeof mate.id === 'number' ? this.store.get(mate.id) : undefined;
        if (self === undefined || other === undefined) return false;
        return canBreed(self, other);
    }

    /**
     * Produces the offspring of a successful breeding.
     *
     * The child is born halfway between its parents and runs
     * `minecraft:entity_born`, which is the event that makes it a baby. A type
     * whose `minecraft:breedable` causes pregnancy makes no child: the parent runs
     * its mate's breed event instead. Both parents spend their love and start
     * their cooldown.
     */
    public breedWith(parent: MobBody, mate: GoalMob): void {
        const self = this.store.get(parent.id);
        const other = typeof mate.id === 'number' ? this.store.get(mate.id) : undefined;
        if (self === undefined || other === undefined || !canBreed(self, other)) return;

        if (breedableOf(self.instance)?.causesPregnancy === true) {
            // A turtle, frog or sniffer carries the brood and lays it later.
            const pregnancy = pregnancyOf(self, other);
            spendLove(self);
            spendLove(other);
            if (pregnancy !== undefined) self.instance.fire(pregnancy);
            return;
        }

        const content = this.content();
        const child = offspringOf(self, other, (identifier) => runtimeEntityIdentifierOf(identifier, content));
        if (child === undefined) return;

        spendLove(self);
        spendLove(other);
        // Java's Fox.FoxBreedGoal.breed: the newborn trusts the players who fed its parents.
        const causes = [self, other].flatMap((parent) => {
            const cause = this.loveCauses.get(parent.id);
            this.loveCauses.delete(parent.id);
            return cause === undefined ? [] : [cause];
        });
        const born = this.spawn(child.identifier, midpoint(self.position, other.position), {
            cause: 'born',
            parents: [self, other],
            ...(child.event === undefined ? {} : { event: child.event })
        });
        if (born !== undefined) addTrusted(born.instance, causes);
    }

    /** Records who tamed an entity. */
    public setOwner(id: number, owner: number | undefined): void {
        const entity = this.store.get(id);
        if (entity === undefined) return;
        entity.body.owner = owner;
        entity.body.ownerIdentity = owner === undefined ? undefined : this.host.playerIdentityOf?.(owner);
    }

    /** Rebinds saved player owners when their session assigns them a new runtime id. */
    private refreshOnlineOwners(): void {
        const ownerIdForIdentity = this.host.playerIdForIdentity;
        if (ownerIdForIdentity === undefined) return;

        for (const entity of this.store.values()) {
            const identity = entity.body.ownerIdentity;
            if (identity !== undefined) entity.body.owner = ownerIdForIdentity(identity);
        }
    }

    /**
     * Puts an entity in love for a number of ticks, which is what feeding it
     * a breeding item does in Java's `Animal.setInLove`.
     */
    public setInLove(id: number, ticks: number): void {
        const entity = this.store.get(id);
        if (entity !== undefined) entity.body.loveTicks = Math.max(0, ticks);
    }

    /**
     * Applies one player-held item through the entity's active data components.
     *
     * @param id - Runtime id of the entity being interacted with.
     * @param owner - Runtime id of the player or entity holding the item.
     * @param itemIdentifier - Identifier of the held item.
     * @param other - The holder's filter view, supplied for live players that are outside this runtime.
     * @returns Whether the interaction was accepted, and any change to the held item.
     */
    public interactWithItem(
        id: number,
        owner: number,
        itemIdentifier: string,
        other?: FilterEntityView,
        heldItem: ContentItemDrop = {
            identifier: itemIdentifier,
            count: itemIdentifier === 'minecraft:air' ? 0 : 1
        }
    ): EntityItemInteraction {
        const entity = this.store.get(id);
        if (entity === undefined || entity.removed !== undefined) return { accepted: false };

        // Java's handleEating raises an untamed mount's temper alongside whatever else the food
        // does, and eats the food for the temper alone.
        const temperRose =
            heldItem.count > 0 && entity.body.owner === undefined && feedMount(entity.instance, itemIdentifier);

        if (itemIdentifier === 'minecraft:shears' && heldItem.count > 0 && this.cutLeashesAt(entity)) {
            return { accepted: true, hurtItem: 1, consumeItem: false };
        }

        if (
            itemIdentifier === 'minecraft:golden_apple' &&
            heldItem.count > 0 &&
            entity.identifier.startsWith('minecraft:zombie_villager') &&
            entity.body.statusEffects.has('minecraft:weakness')
        ) {
            // Only a weakened zombie villager starts to cure, so only then does the apple count.
            // The player who feeds it is the one the villager remembers as its cure.
            const identity = this.host.playerIdentityOf?.(owner);
            if (identity !== undefined) entity.body.curedBy = identity;
        }

        const content = this.content();
        const spawnEggData = content.items.types.get(itemIdentifier)?.params(entityData);
        const spawnEggIdentifier =
            isRecord(spawnEggData) && typeof spawnEggData.id === 'string'
                ? runtimeEntityIdentifierOf(spawnEggData.id, content)
                : undefined;
        const spawnEgg =
            spawnEggIdentifier === undefined
                ? undefined
                : {
                      identifier: spawnEggIdentifier,
                      offspringIdentifier:
                          offspringIdentifierOf(entity.instance, entity.identifier, (identifier) =>
                              runtimeEntityIdentifierOf(identifier, content)
                          ) ?? entity.identifier
                  };

        const interaction = entity.instance.interactWithItemResult(
            itemIdentifier,
            other ?? this.mobById(owner)?.view(),
            {
                loveTicks: entity.body.loveTicks,
                breedCooldown: entity.body.breedCooldown,
                javaItemTags: javaItemTagsForBedrock(content.tags, itemIdentifier),
                ...(spawnEgg === undefined ? {} : { spawnEgg })
            }
        );
        if (interaction === false) {
            if (temperRose) return { accepted: true };
            if (this.toggleOrderedToSit(entity, owner)) return { accepted: true, consumeItem: false };
            return { accepted: this.equipDeclaredSlot(entity, heldItem, other ?? this.mobById(owner)?.view()) };
        }
        if (typeof interaction === 'object') {
            const {
                addItems,
                admire,
                barter,
                breed,
                dropItemSlot,
                dropItemYOffset,
                equipItemSlot,
                giveItem,
                healthAmount,
                playSounds,
                repairEntityItem,
                spawnOffspring,
                spawnItems,
                tame,
                takeItem,
                vibration,
                ...itemEffect
            } = interaction;
            if (spawnOffspring !== undefined) {
                // Java's SpawnEggItem.spawnOffspringFromSpawnEgg makes the mob's own breed offspring, sets
                // it a baby and refuses the egg when it is not one. A frog's offspring is a frog,
                // which is never a baby, so Java refuses where Bedrock's offspring data would hatch a
                // tadpole. Bedrock writes a baby as is_baby, or as a growing ageable.
                if (spawnOffspring !== entity.identifier) return { accepted: false };
                const offspring = this.spawn(spawnOffspring, entity.position, {
                    cause: 'born',
                    parents: [entity, entity],
                    admit: (child) =>
                        child.instance.hasComponent('minecraft:is_baby') ||
                        child.instance.hasComponent('minecraft:ageable')
                });
                return offspring === undefined ? { accepted: false } : { accepted: true };
            }
            const hasHeldItem = heldItem.count > 0 && heldItem.identifier !== 'minecraft:air';
            if (breed === true) {
                entity.body.loveTicks = 600;
                const cause = this.host.playerIdentityOf?.(owner);
                if (cause !== undefined) this.loveCauses.set(entity.id, cause);
            }
            if (tame?.succeeded === true && this.tameGuard?.(entity, owner) !== false) {
                this.setOwner(entity.id, owner);
                entity.body.conditions.add('is_tamed');
                fireTameEvent(entity, tame.event, tame.target);
                this.onTamed?.(entity, owner);
            }
            if (admire === true || barter === true)
                this.startPiglinInteraction(entity, itemIdentifier, admire === true, barter === true);
            for (const sound of playSounds ?? []) this.world.effects.playSound(blockPositionOf(entity.position), sound);
            if (spawnItems !== undefined) this.dropInteractionLoot(spawnItems, entity, owner, itemIdentifier);
            if (repairEntityItem !== undefined) this.repairInteractionSlot(entity, repairEntityItem);
            if (dropItemSlot !== undefined) this.dropInteractionSlot(entity, dropItemSlot, dropItemYOffset ?? 0);
            const equippedHeldItem =
                !hasHeldItem ||
                equipItemSlot === undefined ||
                this.equipInteractionSlot(entity, equipItemSlot, heldItem);
            if (giveItem && hasHeldItem) this.equipInteractionEquipment(entity, 'mainhand', heldItem);
            const takenItem =
                takeItem && !hasHeldItem ? this.removeInteractionEquipment(entity, 'mainhand') : undefined;
            const addedItems =
                addItems === undefined
                    ? undefined
                    : this.rollInteractionLoot(addItems.table, entity, owner, itemIdentifier);
            if (vibration !== undefined)
                this.world.effects.emitGameEvent(
                    vibration.includes(':') ? vibration : `minecraft:${vibration}`,
                    blockPositionOf(entity.position),
                    owner
                );
            if (healthAmount !== undefined) {
                if (healthAmount > 0) {
                    const health = entity.instance.attributes.get('health');
                    if (health !== undefined) entity.instance.attributes.set('health', health.current + healthAmount);
                } else if (healthAmount < 0) {
                    this.hurt(entity, owner, 'entity_attack', -healthAmount, { route: 'interaction' });
                }
            }
            return {
                accepted: true,
                ...itemEffect,
                ...(!hasHeldItem ? { consumeItem: false } : {}),
                ...(!equippedHeldItem && !giveItem ? { consumeItem: false } : {}),
                ...(addedItems === undefined ? {} : { addedItems }),
                ...(takenItem === undefined ? {} : { takenItem })
            };
        }
        return { accepted: true };
    }

    /**
     * Java's `TamableAnimal.setOrderedToSit` as `Wolf`, `Cat` and `Parrot.mobInteract` reach it:
     * when nothing else takes the item, the owner's use flips a tamed pet between sitting and
     * standing and drops its attack target. A parrot only sits from the ground, since Java skips
     * the toggle while it flies.
     *
     * @returns Whether the pet's sitting changed.
     */
    private toggleOrderedToSit(entity: DataEntity, player: number): boolean {
        if (!entity.instance.hasComponent('minecraft:sittable')) return false;
        if (entity.body.owner === undefined || entity.body.owner !== player) return false;
        if (entity.instance.hasComponent('minecraft:can_fly') && !entity.body.conditions.has('on_ground')) return false;
        entity.body.sitting = !entity.body.sitting;
        entity.body.target = undefined;
        return true;
    }

    /**
     * The active container's slot count.
     *
     * A container that states no `inventory_size` holds only the equipment its
     * `minecraft:equippable` lists: the camel's saddle, the nautilus's saddle and armor, and
     * nothing for a command block minecart. Java gives none of them storage
     * (`AbstractHorse.getInventoryColumns` and `AbstractNautilus.getInventoryColumns` return 0,
     * and `MinecartCommandBlock` is no container), and Bedrock shows none.
     *
     * With `additional_slots_per_strength`, `inventory_size` is the container at the most strength
     * the mob can have, and each point below that takes those slots away. Bedrock's llama states
     * 16, its carpet and fifteen chest slots at strength 5, and Java's `Llama.getInventoryColumns`
     * gives three slots per point of strength.
     */
    private containerCapacityOf(instance: EntityInstance): number {
        const inventory = instance.componentParams('minecraft:inventory');
        if (!isRecord(inventory) || typeof inventory.inventorySize !== 'number') return 0;
        if (!Number.isSafeInteger(inventory.inventorySize) || inventory.inventorySize < 0) return 0;
        if (inventory.declaresSize === false) return equippableSlotCount(instance);

        const slotsPerStrength = inventory.additionalSlotsPerStrength;
        const strength = instance.componentParams('minecraft:strength');
        if (
            typeof slotsPerStrength !== 'number' ||
            !Number.isSafeInteger(slotsPerStrength) ||
            slotsPerStrength <= 0 ||
            !isStrengthParams(strength)
        )
            return inventory.inventorySize;
        const missing = Math.max(0, strength.max - strength.value) * slotsPerStrength;
        const capacity = inventory.inventorySize - missing;
        return Number.isSafeInteger(capacity) ? Math.max(0, capacity) : 0;
    }

    /** Whether a slot name is a canonical numeric index into this entity's declared container. */
    private containerSlotIndex(entity: DataEntity, name: string): number | undefined {
        if (!/^(0|[1-9]\d*)$/.test(name)) return undefined;
        const index = Number(name);
        if (index >= this.containerCapacityOf(entity.instance)) {
            this.reportInteractionSlotOnce(
                entity,
                name,
                `entity ${entity.identifier} asks for inventory slot ${name} outside its minecraft:inventory`
            );
            return undefined;
        }
        return index;
    }

    /** Removes one equipment slot and its backing inventory slot, returning the held stack. */
    private removeInteractionEquipment(entity: DataEntity, slot: MobEquipmentSlot): ContentItemDrop | undefined {
        const item = entity.body.equipment[slot];
        if (item === undefined) return undefined;

        const projectedIndex = entity.body.equipmentInventorySlots.get(slot);
        if (projectedIndex !== undefined) {
            entity.body.setContainerSlot(projectedIndex, undefined);
            entity.body.equipmentInventorySlots.delete(slot);
        }
        entity.body.setEquipment(withoutEquipmentSlot(entity.body.equipment, slot));
        return item;
    }

    /** Restores durability to an entity item in a named equipment or inventory slot. */
    private repairInteractionSlot(entity: DataEntity, request: EntityRepairItemRequest): void {
        const name = request.slot;
        if (name === undefined) return;

        const equipmentSlot = mobEquipmentSlotOf(name);
        if (equipmentSlot !== undefined) {
            const item = entity.body.equipment[equipmentSlot];
            if (item === undefined || item.damage === undefined || item.damage <= 0) return;

            const repaired = { ...item, damage: Math.max(0, item.damage - request.amount) };
            const equipment = { ...entity.body.equipment, [equipmentSlot]: repaired };
            const projectedIndex = entity.body.equipmentInventorySlots.get(equipmentSlot);
            if (projectedIndex !== undefined) entity.body.setContainerSlot(projectedIndex, repaired);
            entity.body.setEquipment(equipment);
            return;
        }

        const index = this.containerSlotIndex(entity, name);
        if (index === undefined) {
            if (!/^(0|[1-9]\d*)$/.test(name))
                this.reportInteractionSlotOnce(
                    entity,
                    name,
                    `entity ${entity.identifier} asks to repair an unsupported slot ${name}`
                );
            return;
        }

        const item = entity.body.containerSlots[index];
        if (item === undefined || item.damage === undefined || item.damage <= 0) return;

        const repaired = { ...item, damage: Math.max(0, item.damage - request.amount) };
        entity.body.setContainerSlot(index, repaired);
        let equipment = entity.body.equipment;
        let changed = false;
        for (const slot of MOB_EQUIPMENT_SLOTS) {
            if (entity.body.equipmentInventorySlots.get(slot) !== index) continue;
            equipment = { ...equipment, [slot]: repaired };
            changed = true;
        }
        if (changed) entity.body.setEquipment(equipment);
    }

    /** Equips the held stack into an entity inventory slot or a named equipment slot. */
    private equipInteractionSlot(entity: DataEntity, name: string, heldItem: ContentItemDrop): boolean {
        const equipmentSlot = mobEquipmentSlotOf(name);
        if (equipmentSlot !== undefined) {
            this.equipInteractionEquipment(entity, equipmentSlot, heldItem);
            return true;
        }

        const index = this.containerSlotIndex(entity, name);
        if (index === undefined) {
            if (!/^(0|[1-9]\d*)$/.test(name))
                this.reportInteractionSlotOnce(
                    entity,
                    name,
                    `entity ${entity.identifier} asks to equip an unsupported slot ${name}`
                );
            return false;
        }

        const previous = entity.body.containerSlots[index];
        if (previous !== undefined) {
            this.removeEquipmentProjectionAt(entity, index);
            this.host.drop(entity.position, previous);
        }
        const item = { ...heldItem, count: 1 };
        entity.body.setContainerSlot(index, item);
        const projectedSlot = this.equipmentSlotOfDrop(item);
        if (projectedSlot !== undefined) {
            this.equipInteractionEquipment(entity, projectedSlot, item);
            entity.body.equipmentInventorySlots.set(projectedSlot, index);
        }
        return true;
    }

    /**
     * Puts a held item into the empty `minecraft:equippable` slot that takes it, on a tamed adult
     * whose own interactions did not claim the item.
     *
     * Java hands any held item to `Equippable.equipOnInteract` from `Mob.mobInteract`, which puts
     * it on when the item names the mob among its allowed entities and the slot is empty, and
     * `AbstractHorse.canUseSlot` opens a mount's slots only once it is a tamed adult. Bedrock's
     * trader llama declares the llama's carpet slot but, unlike the llama, no interaction that
     * fills it. A sneaking player opens the mount's screen instead.
     *
     * The slot's container index is its place in the component's list, where the llama's own
     * `equip_item_slot` puts its carpet.
     */
    private equipDeclaredSlot(entity: DataEntity, heldItem: ContentItemDrop, holder?: FilterEntityView): boolean {
        if (heldItem.count <= 0 || heldItem.identifier === 'minecraft:air') return false;
        if (!entity.body.conditions.has('is_tamed') || entity.instance.hasComponent('minecraft:is_baby')) return false;
        if (holder?.flag?.('is_sneaking') === true) return false;
        const index = equippableSlotsOf(entity.instance).findIndex((slot) =>
            slot.acceptedItems.some((name) => itemMatchesName(heldItem.identifier, heldItem.meta, name))
        );
        if (index < 0 || entity.body.containerSlots[index] !== undefined) return false;
        return this.equipInteractionSlot(entity, String(index), heldItem);
    }

    /** Replaces one equipment slot, dropping its previous stack if it held one. */
    private equipInteractionEquipment(entity: DataEntity, slot: MobEquipmentSlot, item: ContentItemDrop): void {
        const projectedIndex = entity.body.equipmentInventorySlots.get(slot);
        if (projectedIndex !== undefined) {
            const projectedItem = entity.body.containerSlots[projectedIndex];
            entity.body.setContainerSlot(projectedIndex, undefined);
            entity.body.equipmentInventorySlots.delete(slot);
            entity.body.setEquipment(withoutEquipmentSlot(entity.body.equipment, slot));
            if (projectedItem !== undefined) this.host.drop(entity.position, projectedItem);
        }

        const previous = entity.body.equipment[slot];
        if (previous !== undefined) this.host.drop(entity.position, previous);
        entity.body.setEquipment({ ...entity.body.equipment, [slot]: { ...item, count: 1 } });
    }

    /** Drops an entity's inventory or equipment slot, honoring the configured vertical offset. */
    private dropInteractionSlot(entity: DataEntity, name: string, yOffset: number): void {
        const at = { x: entity.position.x, y: entity.position.y + yOffset, z: entity.position.z };
        const equipmentSlot = mobEquipmentSlotOf(name);
        if (equipmentSlot !== undefined) {
            const item = this.removeInteractionEquipment(entity, equipmentSlot);
            if (item !== undefined) this.host.drop(at, item);
            return;
        }

        const index = this.containerSlotIndex(entity, name);
        if (index === undefined) {
            if (!/^(0|[1-9]\d*)$/.test(name))
                this.reportInteractionSlotOnce(
                    entity,
                    name,
                    `entity ${entity.identifier} asks to drop an unsupported slot ${name}`
                );
            return;
        }
        const item = entity.body.containerSlots[index];
        if (item === undefined) return;
        entity.body.setContainerSlot(index, undefined);
        this.removeEquipmentProjectionAt(entity, index);
        this.host.drop(at, item);
    }

    /** Clears wearable state backed by one container slot without dropping its stack twice. */
    private removeEquipmentProjectionAt(entity: DataEntity, index: number): void {
        let equipment = entity.body.equipment;
        let changed = false;
        for (const slot of MOB_EQUIPMENT_SLOTS) {
            if (entity.body.equipmentInventorySlots.get(slot) !== index) continue;
            equipment = withoutEquipmentSlot(equipment, slot);
            entity.body.equipmentInventorySlots.delete(slot);
            changed = true;
        }
        if (changed) entity.body.setEquipment(equipment);
    }

    /** Resolves the item's declared wearable slot, if it projects into actor equipment. */
    private equipmentSlotOfDrop(item: ContentItemDrop): MobEquipmentSlot | undefined {
        const resolved = itemOfDrop(item, this.content());
        const declared = resolved?.getEquipmentSlot();
        return declared === undefined ? undefined : mobEquipmentSlotOf(declared);
    }

    /** Reports a malformed data-defined slot only once per entity and slot name. */
    private reportInteractionSlotOnce(entity: DataEntity, name: string, message: string): void {
        let reported = this.reportedInteractionSlots.get(entity);
        if (reported === undefined) {
            reported = new Set();
            this.reportedInteractionSlots.set(entity, reported);
        }
        if (reported.has(name)) return;
        reported.add(name);
        this.report(message);
    }

    /** Rolls the Bedrock table a successful data-defined interaction names. */
    private dropInteractionLoot(
        request: EntitySpawnItemsRequest,
        entity: DataEntity,
        owner: number,
        itemIdentifier: string
    ): void {
        const at = { x: entity.position.x, y: entity.position.y + request.yOffset, z: entity.position.z };
        for (const item of this.rollInteractionLoot(request.table, entity, owner, itemIdentifier))
            this.host.drop(at, item);
    }

    /** Starts the piglin behavior requested by a successful data-driven interaction. */
    private startPiglinInteraction(
        entity: DataEntity,
        itemIdentifier: string,
        admire: boolean,
        barter: boolean
    ): boolean {
        if (entity.brain === undefined || entity.brainMob?.id !== 'minecraft:piglin') return false;

        const offered = { id: itemIdentifier, tags: new Set<string>() };
        if (!isBarterCurrency(offered) || entity.body.equipment.offhand !== undefined) return false;

        const admireParams = entity.instance.componentParams('minecraft:admire_item');
        const barterParams = entity.instance.componentParams('minecraft:barter');
        const context = { world: this.brainWorld(), body: brainMobOf(entity, entity.brain, this) };
        if (context.body.baby) return false;
        const canStartAdmiring =
            admire &&
            entity.instance.hasComponent('minecraft:admire_item') &&
            isRecord(admireParams) &&
            canAdmire(context.body, offered) &&
            this.damageCooldownElapsed(entity, admireParams.cooldownAfterBeingAttacked);
        const canStartBartering = barter && entity.instance.hasComponent('minecraft:barter') && isRecord(barterParams);
        if (!canStartAdmiring && !canStartBartering) return false;

        entity.body.setEquipment({
            ...entity.body.equipment,
            offhand: { identifier: itemIdentifier, count: 1 }
        });
        // Java's PiglinAi.mobInteract admires a handed ingot for ADMIRE_DURATION, as long as a
        // picked-up one, whatever `minecraft:admire_item.duration` says.
        if (canStartAdmiring) admireGoldItem(context);
        if (canStartBartering) this.pendingBarters.add(entity);
        return true;
    }

    /** Completes a requested piglin barter after its admire behavior releases the gold ingot. */
    private completePiglinBarter(entity: DataEntity): void {
        if (!this.pendingBarters.has(entity)) return;

        const params = entity.instance.componentParams('minecraft:barter');
        const table = isRecord(params) && typeof params.barterTable === 'string' ? params.barterTable : undefined;
        if (table === undefined || table.length === 0) {
            if (!this.reportedBarterTables.has(entity)) {
                this.reportedBarterTables.add(entity);
                this.report(`${entity.identifier} requested barter without a minecraft:barter.barter_table`);
            }
            this.pendingBarters.delete(entity);
            return;
        }

        const cooldown = isRecord(params) ? params.cooldownAfterBeingAttacked : 10;
        if (!this.damageCooldownElapsed(entity, cooldown)) return;
        if (entity.body.equipment.offhand?.identifier !== 'minecraft:gold_ingot') {
            this.pendingBarters.delete(entity);
            return;
        }

        this.removeInteractionEquipment(entity, 'offhand');
        this.pendingBarters.delete(entity);
        // Java's PiglinAi.getBarterResponseItems rolls gameplay/piglin_bartering. The stack carries it
        // whenever it carries Java's loot, and the pack's own table answers only when it does not.
        const content = this.content();
        const javaTable = content.loot.table(JAVA_BARTER_TABLE) !== undefined;
        const rolled = (javaTable ? content.loot : content.equipmentLoot).roll(javaTable ? JAVA_BARTER_TABLE : table, {
            parameterSet: 'barter',
            parameters: { this_entity: this.lootEntityViewOf(entity) }
        });
        const drops = bedrockItemDrops(rolled.filter((drop) => drop.count > 0).map(dropOfRolledStack));
        const position = blockPositionOf(entity.position);
        for (const drop of drops) {
            this.host.drop(position, drop);
        }
    }

    /** Whether the component's post-damage cooldown has elapsed. */
    private damageCooldownElapsed(entity: DataEntity, cooldownSeconds: unknown): boolean {
        const lastDamage = this.lastDamagedAt.get(entity);
        return (
            lastDamage === undefined ||
            this.world.level.gameTime() - lastDamage >=
                Math.ceil((typeof cooldownSeconds === 'number' ? cooldownSeconds : 10) * TICKS_PER_SECOND)
        );
    }

    /** Stops active admiration and disables new piglin admiration after damage. */
    private disablePiglinAdmirationAfterDamage(entity: DataEntity): void {
        if (entity.brain === undefined || entity.brainMob?.id !== 'minecraft:piglin') return;
        if (!entity.instance.hasComponent('minecraft:admire_item')) return;

        const params = entity.instance.componentParams('minecraft:admire_item');
        const cooldown = isRecord(params) ? params.cooldownAfterBeingAttacked : 10;
        const duration = Math.ceil((typeof cooldown === 'number' ? cooldown : 10) * TICKS_PER_SECOND);
        if (duration <= 0) return;

        entity.brain.setMemoryWithExpiry(MemoryModuleTypes.ADMIRING_DISABLED, true, duration);
        entity.brain.eraseMemory(MemoryModuleTypes.ADMIRING_ITEM);
    }

    /** The active component view supplied to entity-context loot tables. */
    private lootEntityViewOf(entity: DataEntity): EntityView {
        const components = new Map<string, unknown>();
        for (const name of entity.instance.activeComponents()) {
            const value = entity.instance.componentParams(name);
            if (value !== undefined) components.set(name, value);
        }
        if (entity.body.color !== undefined) components.set('minecraft:color', entity.body.color);
        return { type: entity.identifier, components };
    }

    /** Rolls a loot table named by a successful entity interaction. */
    private rollInteractionLoot(
        table: string,
        entity: DataEntity,
        owner: number,
        itemIdentifier: string
    ): readonly ContentItemDrop[] {
        const source = this.lootEntityViewOf(entity);
        const player = this.host.playerById(owner);
        const sourceMob = this.mobById(owner);
        const origin = player?.position ?? sourceMob?.position() ?? entity.position;
        const tool: ItemStack = { id: itemIdentifier, count: 1, components: new Map() };
        const drops = this.content().equipmentLoot.roll(table, {
            parameterSet: 'shearing',
            parameters: { this_entity: source, origin, tool }
        });

        return bedrockItemDrops(drops.filter((stack) => stack.count > 0).map(dropOfRolledStack));
    }

    /**
     * Kills an entity: drops what its `minecraft:loot` table rolls, then
     * removes it.
     *
     * `doMobLoot` decides whether the table is rolled, which is the rule the
     * class-based `Mob.onDeath` already reads.
     */
    public kill(entity: DataEntity): void {
        // A player stays in the store while its death screen is up, dead and with its id, until
        // `revive` brings it back (ADR 0008). It drops nothing here: its loot table is empty.
        if (clientOwnsMovement(entity.identifier)) return;
        // Live, which puts the active component first. Of the 128 vanilla entity files, 29
        // declare `minecraft:loot` only inside a component group: the cow carries it in
        // `minecraft:cow_adult`, so a type-level read finds nothing and a grown cow drops
        // what a calf does, which is nothing.
        const inventory = entity.instance.componentParams('minecraft:inventory');
        if (isRecord(inventory) && inventory.isPrivate !== true) {
            for (const item of entity.body.containerSlots) {
                if (item !== undefined) this.host.drop(entity.position, item);
            }
        }

        const table = entity.facts.lootTable;
        // Only a type with a table or an experience rule drops anything, so only it reads the rule.
        if ((table !== undefined || JAVA_EXPERIENCE.has(entity.identifier)) && ruleIsOn(this.world.level, MOB_DROPS)) {
            if (table !== undefined) this.dropDeathLoot(entity, table);
            this.dropDeathExperience(entity);
        }
        this.remove(entity.id, 'death');
    }

    /**
     * Drops what a dead mob's loot table rolls for its death.
     *
     * Java's `LivingEntity.dropFromLootTable` rolls the type's own `entities/<id>` table with the
     * mob and the blow that killed it, so a player's kill unlocks the rare drops, a sheep drops
     * its own wool and a slime drops slime balls only at the smallest size. The active
     * `minecraft:loot` still decides whether anything drops, which keeps a calf from dropping a
     * cow's beef. A type Java has no table for rolls the table the component names.
     */
    private dropDeathLoot(entity: DataEntity, table: string): void {
        const content = this.content();
        if (mobLootTableOf(content, entity.identifier) === undefined) {
            this.dropLoot(table, entity.position);
            return;
        }

        const drops = rollMobDrops(content, entity.identifier, {
            position: entity.position,
            self: deathLootState(entity),
            damage: deathDamageSource(content, entity.body.damage.last(), this.killerViewOf)
        });
        const position = blockPositionOf(entity.position);
        for (const drop of drops) this.host.drop(position, drop);
    }

    /**
     * Drops the experience a dead mob pays out, as orbs at the spot it died.
     *
     * Java's `LivingEntity.dropExperience` pays only for a mob a player hurt; Java forgets that
     * player after 100 ticks, and this server credits any player in the mob's damage record.
     */
    private dropDeathExperience(entity: DataEntity): void {
        const rule = JAVA_EXPERIENCE.get(entity.identifier);
        if (rule === undefined) return;
        const hurtByPlayer = entity.body.damage
            .records()
            .some((record) => record.sourceId !== undefined && this.host.playerById(record.sourceId) !== undefined);
        if (!hurtByPlayer) return;

        const variant = entity.instance.componentParams('minecraft:variant');
        const points = deathExperience(rule, {
            baby: entity.instance.hasComponent('minecraft:is_baby'),
            equippedItems: Object.entries(entity.body.equipment).filter(
                ([slot, item]) => slot !== 'body' && item !== undefined
            ).length,
            size: typeof variant === 'number' ? variant : 1,
            random: entity.instance.random
        });
        for (const value of experienceOrbs(points))
            this.spawn(EXPERIENCE_ORB, { ...entity.position }, { data: { value } });
    }

    /** The player or mob behind a blow, as a loot predicate reads a killer. */
    private killerViewOf: DeathKiller = (id) => {
        const player = this.host.playerById(id);
        if (player !== undefined) return killerView(this.content(), 'minecraft:player', player.position);
        const mob = this.store.get(id);
        return mob === undefined ? undefined : killerView(this.content(), mob.identifier, mob.position);
    };

    /**
     * Gives one entity what its `minecraft:equipment` table rolls.
     *
     * Only on a spawn. {@link EntityRuntime.restore} deliberately does not call this, for the
     * reason it does not re-run the spawn event either: the save already holds what the first
     * roll produced, and rolling again would re-arm a mob a player had disarmed.
     *
     * The roll reads the regional difficulty where the mob stands, as Java's
     * `Mob.populateDefaultEquipmentSlots` reads its `DifficultyInstance`, so a fresh world's
     * mobs spawn without armor.
     *
     * A component with no `table` is not a mistake - the villager carries one purely to declare
     * that its main hand never drops - so a missing table equips nothing and reports nothing.
     */
    private equip(entity: DataEntity): void {
        const table = entity.instance.equipment()?.table;
        if (table === undefined) return;

        const content = this.content();
        entity.body.setEquipment(
            content.equipmentDifficulty.during(this.regionalDifficultyInputs(entity.position), () =>
                rollMobEquipment({
                    content,
                    table,
                    itemOf: (drop) => itemOfDrop(drop, content),
                    report: (message) => this.report(`${entity.identifier}: ${message}`)
                })
            )
        );
    }

    /**
     * Java's `Zombie.finalizeSpawn` door-breaking roll, `setCanBreakDoors(random.nextFloat() < 0.1F *
     * difficulty.getSpecialMultiplier())`, in place of Bedrock's flat draw: the spawn event of a
     * zombie, husk, drowned or zombie villager adds the group that declares
     * `minecraft:annotation.break_door` on one draw in ten wherever it spawns, where Java's chance
     * is none in a fresh region and one in ten only in a long-inhabited one. A group a raid adds,
     * as the vindicator's, is no spawn event's, and is left to the raid.
     */
    private rollDoorBreaking(entity: DataEntity, event: string): void {
        // Only Java's `Zombie` and its subclasses roll; the drowned's `supportsBreakDoorGoal` is false.
        const supports = JAVA_DOOR_BREAKERS.get(entity.identifier);
        if (supports === undefined) return;
        const definition = entity.instance.type.entity;
        const node = definition.events.get(event);
        if (node === undefined) return;
        const rolled = [...definition.componentGroups]
            .filter(([name, components]) => components.has(BREAK_DOOR) && eventMayAdd(node, name))
            .map(([name]) => name);
        if (rolled.length === 0) return;
        const random = entity.instance.random;
        const chance = supports
            ? JAVA_BREAK_DOORS_CHANCE *
              clampedRegionalDifficulty(regionalDifficulty(this.regionalDifficultyInputs(entity.position)))
            : 0;
        const breaks = random.next() < chance;
        const kept = entity.instance.activeComponentGroups().filter((group) => !rolled.includes(group));
        entity.instance.restoreComponentGroups(breaks ? [...kept, ...rolled] : kept);
    }

    /** Routes default equipment changes to the active slot-specific component. */
    private watchEquipment(entity: DataEntity): void {
        entity.body.onEquipmentChanged = (previous, next) => {
            for (const slot of MOB_EQUIPMENT_SLOTS) {
                if (sameEquipment({ [slot]: previous[slot] }, { [slot]: next[slot] })) continue;
                entity.instance.dispatch(
                    'onEquipmentChanged',
                    entity.instance,
                    COMPONENT_EQUIPMENT_SLOTS[slot],
                    next[slot] !== undefined
                );
            }
        };
    }

    /**
     * Rolls one loot table and drops what it produced.
     *
     * The table is named the way a behavior pack names one,
     * `loot_tables/entities/cow.json`; `ServerContent.loot` is Java's
     * registry, so the path is rewritten into the id that registry carries.
     */
    public dropLoot(table: string, at: EntityPosition): void {
        const id = javaLootIdOf(table);
        if (id === undefined) {
            this.report(`${table} is not a loot table path`);
            return;
        }

        const position = blockPositionOf(at);
        for (const drop of this.rolled(id)) this.host.drop(position, drop);
    }

    /** The block under the sniffer's head, which must carry Java's diggable-block tag. */
    public snifferDigPosition(body: MobBody): EntityPosition | undefined {
        const entity = this.store.get(body.id);
        if (entity?.identifier !== 'minecraft:sniffer') return undefined;

        const radians = (body.yaw * Math.PI) / 180;
        return {
            x: Math.floor(body.position.x - Math.sin(radians) * 2.25),
            y: Math.floor(body.position.y + 0.2) - 1,
            z: Math.floor(body.position.z + Math.cos(radians) * 2.25)
        };
    }

    /** Rolls Java's `sniffer_digging` loot table at the sniffer's head and plays its drop sound. */
    public dropSnifferSeed(body: MobBody): void {
        const entity = this.store.get(body.id);
        if (entity?.identifier !== 'minecraft:sniffer') return;

        const radians = (body.yaw * Math.PI) / 180;
        const head = {
            x: body.position.x - Math.sin(radians) * 0.6,
            y: body.position.y + entity.facts.box.height * 0.8,
            z: body.position.z + Math.cos(radians) * 0.6
        };
        this.dropLoot('loot_tables/gameplay/sniffer_digging.json', head);
        this.world.effects.playSound(blockPositionOf(head), 'minecraft:entity.sniffer.drop_seed');
    }

    /** Resolves one warden sonic boom against the current runtime or host-owned target. */
    public sonicBoom(body: MobBody, targetId: number): void {
        const source = this.store.get(body.id);
        if (source?.identifier !== 'minecraft:warden') return;

        const target = this.store.get(targetId);
        if (target?.removed !== undefined) return;
        const player = target === undefined ? this.host.playerById(targetId) : undefined;
        const targetPosition = target?.position ?? player?.position;
        if (targetPosition === undefined) return;

        const origin = entityEyePosition(source.position, source.facts.box.height);
        const destination =
            target === undefined
                ? { x: targetPosition.x, y: targetPosition.y + 1.62, z: targetPosition.z }
                : entityEyePosition(target.position, target.facts.box.height);
        const delta = {
            x: destination.x - origin.x,
            y: destination.y - origin.y,
            z: destination.z - origin.z
        };
        if (
            Math.hypot(delta.x, delta.z) > WARDEN.sonicBoom.distanceXz ||
            Math.abs(targetPosition.y - source.position.y) > WARDEN.sonicBoom.distanceY
        ) {
            return;
        }

        const length = Math.hypot(delta.x, delta.y, delta.z);
        const direction =
            length === 0 ? { x: 0, y: 0, z: 1 } : { x: delta.x / length, y: delta.y / length, z: delta.z / length };
        const impulse = {
            x: direction.x * WARDEN.sonicBoom.knockbackHorizontal,
            y: direction.y * WARDEN.sonicBoom.knockbackHorizontal + WARDEN.sonicBoom.knockbackVertical,
            z: direction.z * WARDEN.sonicBoom.knockbackHorizontal
        };
        this.world.effects.playSound(blockPositionOf(source.position), 'minecraft:entity.warden.sonic_boom');

        if (target !== undefined) {
            if (!this.hurt(target, source.id, 'sonic_boom', WARDEN.sonicBoom.damage, { route: 'sonic_boom' })) return;
            const remaining = 1 - Math.min(1, Math.max(0, target.facts.knockbackResistance));
            target.body.push({ x: impulse.x * remaining, y: impulse.y * remaining, z: impulse.z * remaining });
            return;
        }

        this.host.applySonicBoom?.(targetId, WARDEN.sonicBoom.damage, source.id, impulse);
    }

    /**
     * Restocks a villager's trades at its job site, by Java's `Villager.shouldRestock` rule: only
     * when something was used, at most {@link RESTOCKS_PER_DAY} times a day and only once more than
     * {@link RESTOCK_GAP_TICKS} have passed since the last one. A villager with a player at its screen waits.
     */
    public villagerRestock(body: MobBody): void {
        const entity = this.store.get(body.id);
        if (entity === undefined || body.tradingPlayer !== undefined) return;
        const merchant = this.merchant(entity);
        if (merchant === undefined || merchant.offers().every((live) => live.uses === 0)) return;

        const now = this.world.level.gameTime();
        const day = Math.floor(now / TICKS_PER_DAY);
        const last = this.restocks.get(entity.id);
        const today = last?.day === day ? last.count : 0;
        if (today >= RESTOCKS_PER_DAY || (last !== undefined && now <= last.at + RESTOCK_GAP_TICKS)) return;

        this.changeMerchant(entity, merchant, () => merchant.resupply());
        this.restocks.set(entity.id, { day, count: today + 1, at: now });
    }

    /** How many villagers one Java point of interest holds: a bed or a workstation one, a bell many. */
    private poiCapacity(block: string | undefined): number {
        return block === 'minecraft:bell' ? 32 : 1;
    }

    /**
     * The Java points of interest of the types `matches` accepts within a radius.
     *
     * The villager brain names them as Java does (`minecraft:home`, `minecraft:farmer`); the block
     * each stands for, and whether a ticket is left on it, come from the dimension and the claims
     * the villagers hold.
     */
    public javaPointsOfInterest(
        center: EntityPosition,
        radius: number,
        matches: (type: string) => boolean
    ): readonly { readonly pos: EntityPosition; readonly type: string; readonly hasSpace: boolean }[] {
        const found: { pos: EntityPosition; type: string; hasSpace: boolean }[] = [];
        for (const type of JAVA_POI_TYPES) {
            if (!matches(type)) continue;
            for (const pos of this.interest.within(type, center, radius)) {
                const taken = this.poiClaims.get(`${pos.x},${pos.y},${pos.z}`)?.size ?? 0;
                found.push({ pos, type, hasSpace: taken < this.poiCapacity(this.world.blocks.get(pos)?.identifier) });
            }
        }
        return found;
    }

    /** Takes a ticket on a point of interest; false when it had none left. */
    public claimPoi(pos: EntityPosition, claimant: number): boolean {
        const key = `${pos.x},${pos.y},${pos.z}`;
        const claimants = this.poiClaims.get(key) ?? new Set<number>();
        if (claimants.has(claimant)) return true;
        if (claimants.size >= this.poiCapacity(this.world.blocks.get(pos)?.identifier)) return false;
        claimants.add(claimant);
        this.poiClaims.set(key, claimants);
        return true;
    }

    /** Gives a ticket back. */
    public releasePoi(pos: EntityPosition, claimant: number): void {
        const key = `${pos.x},${pos.y},${pos.z}`;
        const claimants = this.poiClaims.get(key);
        claimants?.delete(claimant);
        if (claimants?.size === 0) this.poiClaims.delete(key);
    }

    /** The world a villager's work happens in. */
    private villagerWorld() {
        return { blocks: this.world.blocks, effects: this.world.effects, random: this.world.random };
    }

    /** Where a farmer has farming to do, or undefined when there is none or mobs may not grief. */
    public villagerWorkSpot(body: MobBody, task: 'harvest_farmland' | 'use_bonemeal'): EntityPosition | undefined {
        if (!ruleIsOn(this.world.level, MOB_GRIEFING)) return undefined;
        const spot = farmWorkAround(this.villagerWorld(), body.inventory, blockPositionOf(body.position), task);
        return spot === undefined ? undefined : { ...spot };
    }

    /** Whether a free bed is within reach of a villager, which a child needs. */
    private hasVacantBed(body: MobBody): boolean {
        return this.javaPointsOfInterest(body.position, 48, (type) => type === 'minecraft:home').some(
            (poi) => poi.hasSpace
        );
    }

    /** Whether two villagers are both willing and able to have a child now. */
    public villagerCanBreed(body: MobBody, partnerId: number): boolean {
        const self = this.store.get(body.id);
        const partner = this.store.get(partnerId);
        if (self === undefined || partner === undefined || partner.removed !== undefined) return false;
        const ready = (entity: DataEntity): boolean =>
            !entity.instance.hasComponent('minecraft:is_baby') &&
            entity.body.breedCooldown === 0 &&
            foodPointsOf(entity.body.inventory) >= WILLING_FOOD_POINTS;
        return ready(self) && ready(partner) && this.hasVacantBed(body);
    }

    /** Holds one item of a random trade in the villager's hand, or empties the hand. */
    public villagerShowTrade(body: MobBody, shown: boolean): void {
        const entity = this.store.get(body.id);
        if (entity === undefined) return;
        if (!shown) {
            body.carried = undefined;
            return;
        }

        const offers = this.merchant(entity)?.offers() ?? [];
        if (offers.length === 0) return;
        const offer = offers[this.world.random.nextInt(offers.length)];
        const stack = offer === undefined ? undefined : offer.offer.gives[0];
        if (stack !== undefined) body.carried = stack.item;
    }

    /** Whether a player carries Hero of the Village. */
    public isVillageHero(playerId: number): boolean {
        const effects = this.host.playerView?.(playerId)?.names?.('has_mob_effect') ?? [];
        return effects.includes('minecraft:village_hero') || effects.includes('minecraft:hero_of_the_village');
    }

    /**
     * Carries out one piece of villager work for the brain.
     *
     * @param target - The block the work is at, or the runtime id of the entity it is about.
     * @returns Whether anything happened.
     */
    public villagerTask(body: MobBody, task: VillagerTask, target?: EntityPosition | number): boolean {
        const self = this.store.get(body.id);
        if (self === undefined) return false;
        const other = typeof target === 'number' ? this.store.get(target) : undefined;

        switch (task) {
            case 'work_at_composter':
                return (
                    typeof target === 'object' &&
                    editInventory(body, (inventory) => workAtComposter(this.villagerWorld(), inventory, target))
                );
            case 'harvest_farmland':
                return (
                    typeof target === 'object' &&
                    editInventory(body, (inventory) => harvestFarmland(this.villagerWorld(), inventory, target))
                );
            case 'use_bonemeal':
                return (
                    typeof target === 'object' &&
                    editInventory(body, (inventory) => useBonemeal(this.villagerWorld(), inventory, target))
                );
            case 'trade_with_villager':
                return (
                    other !== undefined &&
                    editInventory(body, (inventory) =>
                        editInventory(other.body, (otherInventory) =>
                            shareWithVillager(
                                inventory,
                                otherInventory,
                                professionOf(other.instance) === 'farmer',
                                professionOf(self.instance) === 'farmer'
                            )
                        )
                    )
                );
            case 'give_gift_to_hero': {
                if (typeof target !== 'number' || !this.isVillageHero(target)) return false;
                const profession = professionOf(self.instance) ?? 'unemployed';
                this.dropLoot(`loot_tables/gameplay/hero_of_the_village/${profession}_gift.json`, {
                    x: body.position.x,
                    y: body.position.y + 1,
                    z: body.position.z
                });
                return true;
            }
            case 'make_love': {
                if (other === undefined || !this.villagerCanBreed(body, other.id)) return false;
                editInventory(body, (inventory) => digest(inventory, WILLING_FOOD_POINTS));
                editInventory(other.body, (inventory) => digest(inventory, WILLING_FOOD_POINTS));
                self.body.breedCooldown = VILLAGER_BREED_COOLDOWN_TICKS;
                other.body.breedCooldown = VILLAGER_BREED_COOLDOWN_TICKS;
                return (
                    this.spawn(self.identifier, midpoint(self.position, other.position), {
                        cause: 'born',
                        event: 'minecraft:entity_born'
                    }) !== undefined
                );
            }
        }
    }

    /**
     * The center of the village a position stands in, which Java averages out of every bed, bell
     * and job site within 64 blocks, or undefined when there is none.
     */
    public villageCenterNear(center: EntityPosition): EntityPosition | undefined {
        let count = 0;
        let x = 0;
        let y = 0;
        let z = 0;
        for (const kind of VILLAGE_POI_KINDS) {
            for (const at of this.interest.within(kind, center, VILLAGE_RADIUS)) {
                count += 1;
                x += at.x;
                y += at.y;
                z += at.z;
            }
        }
        return count === 0 ? undefined : { x: x / count, y: y / count, z: z / count };
    }

    /** Identities somebody waits on, see {@link trackIdentity}. */
    private readonly trackedIdentities = new Set<string>();

    /** Tracked identities whose entity is saved in an unloaded chunk. */
    private readonly unloadedIdentities = new Set<string>();

    /** Whether a raider spawned earlier is still alive here. */
    public isAliveByIdentity(identity: string): boolean {
        for (const entity of this.store.values()) {
            if (entity.persistentIdentity === identity) return entity.removed === undefined;
        }
        return this.unloadedIdentities.has(identity);
    }

    /**
     * Asks to be told apart a chunk unload from a death for this entity.
     *
     * Only tracked identities are remembered when their chunk unloads, so the set stays as small
     * as the number of things somebody is waiting on.
     * @param {string} identity - The persistent identity to follow.
     */
    public trackIdentity(identity: string): void {
        this.trackedIdentities.add(identity);
    }

    /** The raid facts at this villager's position, supplied by its host's raid owner. */
    public villagerRaidState(body: MobBody): VillagerRaidState | undefined {
        return this.host.villagerRaidStateAt?.(body.position);
    }

    /** Performs the fallback world effect when the host has not supplied a raid effect handler. */
    public villagerRaidEffect(body: MobBody, effect: VillagerRaidEffect): void {
        if (this.host.villagerRaidEffect !== undefined) {
            this.host.villagerRaidEffect(body.id, effect);
            return;
        }

        switch (effect) {
            case 'ring_bell': {
                const bell = this.poi('meeting', body.position, 48);
                if (bell === undefined) return;
                this.world.effects.playSound(blockPositionOf(bell), 'minecraft:block.bell.use');
                this.world.effects.emitGameEvent('minecraft:block_activate', blockPositionOf(bell), body.id);
                return;
            }
            case 'move_to_sky_seeing_spot': {
                const spot = this.skySeeingSpot(body.position);
                const entity = this.store.get(body.id);
                if (spot === undefined || entity?.brain === undefined) return;
                entity.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
                    target: blockPosTracker({ x: Math.floor(spot.x), y: Math.floor(spot.y), z: Math.floor(spot.z) }),
                    speedModifier: 0.6,
                    closeEnoughDist: 0
                });
                return;
            }
            case 'celebrate_victory':
                this.world.effects.playSound(blockPositionOf(body.position), 'minecraft:entity.villager.celebrate');
                return;
            case 'reset_status':
                return;
        }
    }

    /** Finds the nearest passable position under open sky for a raid activity. */
    private skySeeingSpot(center: EntityPosition): EntityPosition | undefined {
        if (!this.world.level.hasSkyLight || this.world.blocks.skyLight === undefined) return undefined;
        const origin = { x: Math.floor(center.x), y: Math.floor(center.y), z: Math.floor(center.z) };
        for (let radius = 0; radius <= 8; radius += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                for (let dz = -radius; dz <= radius; dz += 1) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
                    const at = { x: origin.x + dx + 0.5, y: origin.y, z: origin.z + dz + 0.5 };
                    const block = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) };
                    if (
                        this.navigation().isPassable(block) &&
                        this.world.blocks.skyLight({ x: block.x, y: block.y + 1, z: block.z }) === 15
                    ) {
                        return at;
                    }
                }
            }
        }
        return undefined;
    }

    /**
     * One loot table's result, as drops the rest of the server carries.
     *
     * Every table here is Java's, so every id out of one is a Java id and every
     * component on a rolled stack is Java's too. `dropOfRolledStack` reads the
     * enchantments, the durability, the name, the lore and the contents off the
     * stack, and `bedrockItemDrops` renames the five ids the two editions spell
     * differently. The three other roll sites, the block break, the mob death
     * and `/loot`, go through the same pair.
     */
    private rolled(table: string): readonly ContentItemDrop[] {
        return bedrockItemDrops(
            this.content()
                .loot.roll(table)
                .filter((stack) => stack.count > 0)
                .map(dropOfRolledStack)
        );
    }

    /** Fires an entity event on a named subject, which a `trigger` with a target does. */
    public trigger(source: MobBody, event: string, target: string): void {
        const self = this.store.get(source.id);
        if (target === 'self') {
            self?.instance.fire(event);
            return;
        }
        const other = source.target === undefined ? undefined : this.store.get(source.target);
        if (target === 'target' && other !== undefined) {
            other.instance.fire(event);
            return;
        }
        this.report(`${source.identifier} triggers ${event} on ${target}, which nothing routes`);
    }

    /**
     * The merchant one entity trades through.
     *
     * Built on first ask and kept, because `persist_trades` means a villager's
     * offers are drawn once and survive until it dies. An entity that carries
     * neither trade component, or names a table the stack has no file for,
     * gets no merchant and does not trade.
     */
    public merchant(entity: DataEntity): Merchant | undefined {
        const cached = this.merchants.get(entity.id);
        if (cached !== undefined) return cached;

        const saved = this.merchantSnapshots.get(entity.id);
        this.merchantSnapshots.delete(entity.id);
        const built = merchantFor(entity.instance, {
            content: this.content(),
            random: this.world.random,
            ...(saved === undefined ? {} : { snapshot: saved }),
            report: (code, message) => this.report(`${entity.identifier} trade table ${code}: ${message}`)
        });
        if (built === undefined) return undefined;
        this.merchants.set(entity.id, built);
        // The first ask draws the offers, or the tiers a save did not hold.
        this.store.written(entity, MERCHANT_FIELD, merchantFieldOf(saved), merchantFieldOf(built.snapshot()));
        return built;
    }

    /**
     * One trader as a trade screen trades with it, with every trade logged.
     * @returns The source, or undefined for an entity that does not trade.
     */
    public tradeSource(entity: DataEntity): TradeSource | undefined {
        const first = this.merchant(entity);
        if (first === undefined) return undefined;
        return loggedMerchantSource(
            () => this.merchant(entity) ?? first,
            (merchant, change) => this.changeMerchant(entity, merchant, change)
        );
    }

    /** Runs a change to a trader's merchant and logs its offers before and after it. */
    private changeMerchant<T>(entity: DataEntity, merchant: Merchant, change: () => T): T {
        const before = merchantFieldOf(merchant.snapshot());
        const result = change();
        this.store.written(entity, MERCHANT_FIELD, before, merchantFieldOf(merchant.snapshot()));
        return result;
    }

    /**
     * What a save has to keep of one trader, or undefined when it has not traded or been asked.
     *
     * A trader nobody has asked has drawn nothing yet, so there is nothing to keep: its offers are
     * drawn on the first ask after a load, exactly as they would have been before the save.
     */
    public merchantSnapshotOf(entity: DataEntity): MerchantSnapshot | undefined {
        return this.merchants.get(entity.id)?.snapshot() ?? this.merchantSnapshots.get(entity.id);
    }

    /** Records what the runtime met and could not carry out. */
    public report(message: string): void {
        this.onReport(message);
    }

    /** Counts down the two timers the body keeps: being in love and waiting to breed again. */
    private tickTimers(body: MobBody): void {
        if (body.loveTicks > 0) body.loveTicks -= 1;
        if (body.breedCooldown > 0) body.breedCooldown -= 1;
    }

    /** Starts, pauses, or advances the active fuse declared by `minecraft:explode`. */
    private tickFuse(entity: DataEntity): boolean {
        const params = entity.instance.componentParams('minecraft:explode');
        if (!isRecord(params) || params.fuse_lit !== true) {
            entity.body.fuseTicks = undefined;
            this.setFuse(entity, undefined);
            return false;
        }

        if (this.fuses.get(entity.id)?.params !== params) this.startFuse(entity);
        if (entity.body.fuseTicks === undefined) return false;

        entity.body.fuseTicks = Math.max(0, entity.body.fuseTicks - 1);
        if (entity.body.fuseTicks > 0) return false;

        this.explode(entity.body);
        return true;
    }

    /**
     * Keeps sunlight fires alive, extinguishes wet entities, and applies their fire ticks.
     *
     * A fire-immune entity never catches fire in the sun, whatever its definition says: Java's
     * `Entity.isOnFire` is false for a fire-immune type, so a magma cube that Bedrock's pack
     * gives `minecraft:burns_in_daylight` stays unlit.
     */
    private tickDaylightBurn(entity: DataEntity): void {
        const { body, instance } = entity;
        const burnsInDaylight =
            instance.hasComponent('minecraft:burns_in_daylight') && !instance.hasComponent('minecraft:fire_immune');
        if (!burnsInDaylight && body.fireTicks <= 0) return;

        const position = blockPositionOf(entity.position);
        const parameters = burnsInDaylight ? instance.componentParams('minecraft:burns_in_daylight') : undefined;
        const protectionSlot =
            isRecord(parameters) && typeof parameters.protectionSlot === 'string'
                ? (mobEquipmentSlotOf(parameters.protectionSlot) ?? 'head')
                : 'head';
        const rainOrWater = body.conditions.has('in_water') || this.world.level.isRainingAt(position);
        const sunlight =
            burnsInDaylight &&
            this.world.level.hasSkyLight &&
            isDay(this.world.level.dayTime()) &&
            this.world.blocks.skyLight?.(position) === 15 &&
            body.equipment[protectionSlot] === undefined;
        const ignited = !rainOrWater && sunlight && body.fireTicks === 0;
        if (rainOrWater) {
            body.fireTicks = 0;
        } else if (sunlight) {
            body.fireTicks = DAYLIGHT_BURN_TICKS;
        } else if (body.fireTicks > 0) {
            body.fireTicks -= 1;
        }

        setCondition(body.conditions, 'on_fire', body.fireTicks > 0);
        if (ignited) instance.trigger('minecraft:on_ignite');
        // `fireDamage` is the pipeline's game-rule guard.
        if (body.conditions.has('on_fire') && this.world.level.gameTime() % FIRE_DAMAGE_INTERVAL_TICKS === 0)
            this.hurt(entity, undefined, 'fire_tick', FIRE_DAMAGE_AMOUNT, { route: 'fire' });
    }

    /**
     * Runs one tick of a lightning bolt, Java's `LightningBolt.tick`.
     *
     * On its first tick the bolt strikes every entity whose position is within
     * {@link LIGHTNING_REACH} blocks of it across and {@link LIGHTNING_REACH} plus 6 above, as
     * Java's inflated box does: `Entity.thunderHit` sets it burning for 8 seconds and deals 5
     * lightning damage, which a `minecraft:damage_sensor` reads to turn a pig into a zombified
     * piglin or power a creeper. The 5 lands whatever the sensor says of it, as Java's axolotl and
     * creeper take it, but for the types in {@link JAVA_THUNDER_HIT_REPLACED}. The bolt goes once
     * its `life` runs out, after {@link LIGHTNING_LIFE_TICKS}.
     */
    private tickLightning(bolt: DataEntity): void {
        const age = this.lightningAges.get(bolt.id) ?? 0;
        this.lightningAges.set(bolt.id, age + 1);
        if (age >= LIGHTNING_LIFE_TICKS) {
            this.remove(bolt.id, 'lightning_spent');
            return;
        }
        // Java's `setVisualOnly`, which the skeleton trap's bolt carries: a flash and nothing else.
        if (age > 0 || bolt.spawnData?.['visual_only'] === true) return;

        const at = bolt.position;
        const struck = this.index.withinBox(
            { x: at.x - LIGHTNING_REACH, y: at.y - LIGHTNING_REACH, z: at.z - LIGHTNING_REACH },
            { x: at.x + LIGHTNING_REACH, y: at.y + LIGHTNING_REACH + 6, z: at.z + LIGHTNING_REACH }
        );
        for (const target of struck) {
            if (target.id === bolt.id || target.identifier === LIGHTNING_BOLT || target.removed !== undefined) continue;
            if (target.body.fireTicks <= 0) target.body.fireTicks = LIGHTNING_FIRE_TICKS;
            this.hurt(target, bolt.id, 'lightning', LIGHTNING_DAMAGE, {
                route: 'component',
                graced: true,
                mitigated: clientOwnsMovement(target.identifier),
                measured: !JAVA_THUNDER_HIT_REPLACED.has(target.identifier)
            });
        }
    }

    /**
     * Takes an entity that fell out of the world.
     *
     * Java's `checkBelowWorld`, {@link VOID_DEPTH} blocks under the dimension's floor. A
     * living thing is hurt four half-hearts every {@link VOID_INTERVAL} ticks, the void's
     * half-second cadence, and dies of it; anything with no health to take, a dropped stack
     * or a stray arrow, is simply discarded, as Java's `onBelowWorld` discards it.
     */
    private tickVoid(entity: DataEntity): void {
        if (entity.position.y >= this.world.level.minY - VOID_DEPTH) return;

        if (entity.instance.attributes.get('health') === undefined) {
            this.remove(entity.id, 'fell_out_of_world');
            return;
        }
        if (this.world.level.gameTime() % VOID_INTERVAL !== 0) return;
        this.hurt(entity, undefined, 'void', VOID_DAMAGE, { route: 'void' });
    }

    /** Activates a newly spawned or restored fuse without spending its first tick. */
    private startFuse(entity: DataEntity): void {
        const params = entity.instance.componentParams('minecraft:explode');
        if (!isRecord(params) || params.fuse_lit !== true) {
            entity.body.fuseTicks = undefined;
            this.setFuse(entity, undefined);
            return;
        }

        const previous = this.fuses.get(entity.id);
        if (previous?.params === params) return;
        this.setFuse(entity, { params });
        const starting = previous === undefined && entity.body.fuseTicks === undefined;

        if (starting && entity.instance.families().includes('tnt')) {
            entity.body.velocity = { ...entity.body.velocity, y: TNT_LAUNCH_SPEED };
        }
        if (entity.body.fuseTicks !== undefined && previous === undefined) return;

        const saved = entity.spawnData?.['fuse'];
        if (typeof saved === 'number' && Number.isFinite(saved)) {
            entity.body.fuseTicks = Math.max(0, Math.trunc(saved));
            return;
        }

        entity.body.fuseTicks = Math.max(
            0,
            Math.round(fuseLengthSeconds(params, () => this.world.random.nextFloat()) * TICKS_PER_SECOND)
        );
    }

    /** Reads the Java friction value of the block directly below an entity's feet. */
    private groundFrictionAt(position: EntityPosition): number {
        const block = this.world.blocks.get({
            x: Math.floor(position.x),
            y: Math.floor(position.y - MOVEMENT_EPSILON),
            z: Math.floor(position.z)
        });
        if (block === undefined) return DEFAULT_BLOCK_FRICTION;

        const content = this.content();
        const palette = content.blocks.palette;
        if (palette.entry(block.identifier) === undefined) return DEFAULT_BLOCK_FRICTION;

        const runtimeId = palette.runtimeId(block.identifier, block.states);
        return content.blocks.table.friction[runtimeId] ?? DEFAULT_BLOCK_FRICTION;
    }

    /**
     * How many ticks of cold a living body has taken in powder snow, up to
     * {@link TICKS_REQUIRED_TO_FREEZE}; 0 for one that is warm.
     */
    public frozenTicksOf(id: number): number {
        return this.frozenTicks.get(id) ?? 0;
    }

    /** Sets a living body's cold, for a host or a test that puts it in or out of the freeze at once. */
    public setFrozenTicks(id: number, ticks: number): void {
        if (ticks <= 0) this.frozenTicks.delete(id);
        else this.frozenTicks.set(id, Math.min(TICKS_REQUIRED_TO_FREEZE, ticks));
    }

    /**
     * Runs one tick of powder snow's cold on a living body, as Java's `LivingEntity.aiStep` does.
     *
     * A body whose box is in powder snow and that can freeze takes a tick of cold, up to
     * {@link TICKS_REQUIRED_TO_FREEZE}; out of the snow it warms by two a tick. A fully frozen
     * body takes a `freezing` blow every {@link FREEZE_HURT_INTERVAL} ticks: 1, or 5 for a type in
     * Java's `freeze_hurts_extra_types` tag or one that declares `minecraft:freezing_vulnerable`.
     * Whether it can freeze is what its damage sensing makes of a freezing blow, which is where
     * `minecraft:freezing_immune` and Java's `freeze_immune_entity_types` tag turn the cold aside.
     */
    private tickFreezing(entity: DataEntity, tick: number): void {
        if (javaEntityStats(entity.identifier, this.content().entities.javaStats) === undefined) return;
        const frozen = this.frozenTicks.get(entity.id) ?? 0;
        const isPowderSnow = (at: EntityPosition) => this.world.blocks.get(at)?.identifier === POWDER_SNOW;
        const [inSnow] = bodyIntersectsMedia(entity.position, entity.facts.box, isPowderSnow, () => false);
        if (!inSnow && frozen === 0) return;
        const canFreeze = !entity.instance.senseDamage({ cause: 'freezing', amount: 1 }).blocked;
        this.setFrozenTicks(entity.id, inSnow && canFreeze ? frozen + 1 : frozen - 2);
        if (!canFreeze || this.frozenTicksOf(entity.id) < TICKS_REQUIRED_TO_FREEZE) return;
        if (tick % FREEZE_HURT_INTERVAL !== 0) return;
        const extra =
            entity.instance.hasTag(FREEZE_HURTS_EXTRA_TAG) ||
            entity.instance.hasComponent('minecraft:freezing_vulnerable');
        this.hurt(entity, undefined, 'freezing', extra ? FREEZE_EXTRA_DAMAGE : FREEZE_DAMAGE, {
            route: 'component',
            graced: true,
            mitigated: true
        });
    }

    /**
     * Adds the tick's drop to a living body's fall and pays for the fall when the body lands,
     * as Java's `Entity.checkFallDamage` does after every move.
     *
     * Water, a climbable block, levitation and slow falling end the fall, as
     * `Entity.updateInWaterStateAndDoFluidPushing`, `LivingEntity.handleOnClimbable` and
     * `LivingEntity.travel` reset `fallDistance`. A landing costs Java's
     * `LivingEntity.calculateFallDamage`: the fall past the type's `safe_fall_distance` attribute
     * times its `fall_damage_multiplier`, floored. Only a type Java's attribute dump lists falls
     * this way, which is exactly the living ones. A landing on what breaks a player's fall is free,
     * as {@link cushions} decides for a player.
     */
    private checkFallDamage(entity: DataEntity, fromY: number): void {
        const stats = javaEntityStats(entity.identifier, this.content().entities.javaStats);
        if (stats === undefined) return;
        const { body } = entity;
        const effects = body.statusEffects;
        if (
            body.conditions.has('in_water') ||
            effects.has('minecraft:levitation') ||
            effects.has('minecraft:slow_falling') ||
            this.onClimbable(entity.position)
        ) {
            this.fallDistances.delete(entity.id);
            return;
        }
        // The tick's drop counts before the landing it ends in, as `checkFallDamage` adds it first.
        const drop = fromY - entity.position.y;
        const fallen = (this.fallDistances.get(entity.id) ?? 0) + Math.max(0, drop);
        if (!body.conditions.has('on_ground')) {
            if (fallen > 0) this.fallDistances.set(entity.id, fallen);
            return;
        }
        this.fallDistances.delete(entity.id);
        if (fallen <= 0 || !ruleIsOn(this.world.level, FALL_DAMAGE)) return;

        const safe = stats.attributes[SAFE_FALL_DISTANCE] ?? DEFAULT_SAFE_FALL_DISTANCE;
        const multiplier = stats.attributes[FALL_DAMAGE_MULTIPLIER] ?? 1;
        const damage = Math.floor((fallen + FALL_EPSILON - safe) * multiplier);
        if (damage <= 0) return;
        const { x, y, z } = blockPositionOf(entity.position);
        const feet = this.world.blocks.get({ x, y, z })?.identifier;
        const below = this.world.blocks.get({ x, y: y - 1, z })?.identifier;
        if (cushions(feet, below)) return;
        this.blow(entity, undefined, 'fall', damage, {
            route: 'component',
            graced: true,
            mitigated: true,
            // A type whose Java class sets its own safe fall has had its fall measured by it,
            // which the pack's own fall modifier, such as the camel's -4, stands in for.
            measured: safe !== DEFAULT_SAFE_FALL_DISTANCE || multiplier !== 1
        });
    }

    /** Stops an entity's fall and raises its landing trigger on an airborne-to-ground transition. */
    private land(entity: DataEntity): void {
        const { body, instance } = entity;
        const startedLanding = body.airborne || body.conditions.has('jumping');
        body.land();
        if (startedLanding) instance.trigger('minecraft:on_start_landing');
    }

    /**
     * Spends one tick of an entity's impulse and configured gravity.
     *
     * The numbers follow Java entity travel: 0.08 gravity, 0.91 horizontal
     * air drag, and 0.98 vertical air drag. Active entity components modify
     * air drag, ground friction, and collision bounce; the block below supplies
     * its Java friction value.
     */
    private coast(entity: DataEntity): void {
        const { body, instance } = entity;
        const projectile = instance.componentParams('minecraft:projectile');
        if (isRecord(projectile)) {
            this.coastProjectile(entity, projectile);
            return;
        }

        const fallingBlock = instance.componentParams('jsprismarine:falling_block');
        if (isRecord(fallingBlock)) {
            this.coastFallingBlock(entity, fallingBlock);
            return;
        }

        if (instance.hasComponent(RAIL_MOVEMENT) && this.coastOnRails(entity)) return;

        const buoyant = instance.componentParams('minecraft:buoyant');
        if (isRecord(buoyant) && this.coastBuoyant(entity, buoyant)) return;
        if (this.floatOnLava(entity)) return;

        const componentFacts = this.componentFactsOf(entity);
        const position = body.position;
        const navigation = this.navigation();
        const grounded =
            componentFacts.hasCollision &&
            body.velocity.y <= 0 &&
            isSupported(position, entity.facts.box, navigation, componentFacts.canStandOnPowderSnow);
        const inWater = body.conditions.has('in_water');
        const inLava = body.conditions.has('in_lava');
        const inFluid = inWater || inLava;
        const primedTnt = body.fuseTicks !== undefined && componentFacts.families.includes('tnt');
        const verticalAirDrag = componentFacts.usesUniformAirDrag ? DRAG : VERTICAL_AIR_DRAG;
        const horizontalDrag = inWater
            ? javaWaterDrag(entity)
            : inLava
              ? LAVA_DRAG
              : primedTnt
                ? TNT_DRAG
                : grounded
                  ? groundDrag(
                        this.groundFrictionAt(position),
                        componentFacts.frictionModifier,
                        componentFacts.airDragModifier
                    )
                  : dragWithModifier(DRAG, componentFacts.airDragModifier);
        const verticalDrag = inFluid
            ? FLUID_DRAG
            : primedTnt
              ? TNT_DRAG
              : dragWithModifier(verticalAirDrag, componentFacts.airDragModifier);
        const bounciness = componentFacts.bounciness;
        // A fish's definition turns gravity off, but Java's `WaterAnimal` falls like any body once it is out of water.
        const pulled = componentFacts.hasGravity || (componentFacts.fallsOutOfWater && !inFluid);
        const gravity = pulled
            ? inFluid
                ? FLUID_GRAVITY
                : primedTnt
                  ? TNT_GRAVITY
                  : (JAVA_DEFAULT_GRAVITY.get(entity.identifier) ?? GRAVITY)
            : 0;

        if (grounded) body.conditions.add('on_ground');
        else body.conditions.delete('on_ground');

        if (!body.airborne && (gravity === 0 || grounded)) return;

        // Java's `LivingEntity.handleOnClimbable` holds a body in a ladder or a vine to 0.15 blocks
        // a tick on each horizontal axis and as a fall, before the tick's move.
        if (componentFacts.movesBeforeGravity && this.onClimbable(position)) {
            const climbing = body.velocity;
            body.velocity = {
                x: Math.min(CLIMB_SPEED, Math.max(-CLIMB_SPEED, climbing.x)),
                y: Math.max(-CLIMB_SPEED, climbing.y),
                z: Math.min(CLIMB_SPEED, Math.max(-CLIMB_SPEED, climbing.z))
            };
        }

        const velocity = body.velocity;
        const resting = grounded && velocity.y <= 0;
        const fallingY = resting ? 0 : velocity.y - gravity;
        // Java's `LivingEntity.travelInAir` moves the body by its velocity and then applies gravity
        // and drag; an item, a minecart or a primed TNT applies its gravity before it moves.
        // A cobweb scales the move itself and then stops the body, as Java's `Entity.move` does.
        const stuck = this.stuckInCobweb(entity);
        const horizontalShare = stuck ? COBWEB_HORIZONTAL_SPEED : 1;
        const travelY =
            (resting ? 0 : componentFacts.movesBeforeGravity ? velocity.y : fallingY) *
            (stuck ? COBWEB_VERTICAL_SPEED : 1);
        const nextY = position.y + travelY;
        const canOccupy = (at: EntityPosition) =>
            !componentFacts.hasCollision ||
            bodyCanOccupy(at, entity.facts.box, navigation, componentFacts.canStandOnPowderSnow);
        const travelX = velocity.x * horizontalShare;
        const travelZ = velocity.z * horizontalShare;
        let next = moveOnAxis(position, position.x + travelX, 'x', canOccupy);
        const hitHorizontalX = Math.abs(next.x - (position.x + travelX)) > MOVEMENT_EPSILON;
        next = moveOnAxis(next, position.z + travelZ, 'z', canOccupy);
        const hitHorizontalZ = Math.abs(next.z - (position.z + travelZ)) > MOVEMENT_EPSILON;
        if (hitHorizontalX || hitHorizontalZ) this.horizontalCollisions.add(entity.id);
        const nextVertical = moveOnAxis(next, nextY, 'y', canOccupy);
        const hitVerticalCollision = Math.abs(nextVertical.y - nextY) > MOVEMENT_EPSILON;
        const horizontalVelocity = {
            x: hitHorizontalX ? (bounciness > 0 ? -velocity.x * bounciness : 0) : velocity.x * horizontalDrag,
            z: hitHorizontalZ ? (bounciness > 0 ? -velocity.z * bounciness : 0) : velocity.z * horizontalDrag
        };
        // Java bounces a body off a floor only when it falls faster than one tick of gravity, and a
        // living body then takes the tick's gravity and drag after the bounce, as after any move.
        const bounced = (stoppedAt: number): number => {
            const restituted = restitutedY(
                travelY,
                stoppedAt - position.y,
                gravity,
                dragWithModifier(verticalAirDrag, componentFacts.airDragModifier),
                bounciness
            );
            return componentFacts.movesBeforeGravity ? (restituted - gravity) * verticalDrag : restituted;
        };

        if (hitVerticalCollision) {
            if (travelY <= 0) {
                const landed = {
                    ...nextVertical,
                    y: landingY(
                        nextVertical,
                        entity.facts.box,
                        navigation,
                        nextVertical.y - nextY,
                        componentFacts.canStandOnPowderSnow
                    )
                };
                body.position = landed;
                if (bounciness > 0 && -travelY > gravity) {
                    body.velocity = { ...horizontalVelocity, y: bounced(landed.y) };
                    body.conditions.delete('jumping');
                    body.conditions.delete('on_ground');
                } else {
                    this.land(entity);
                }
                return;
            }

            next = nextVertical;
            body.velocity = { ...horizontalVelocity, y: bounciness > 0 ? bounced(nextVertical.y) : 0 };
        } else {
            next = nextVertical;
            const fell = fallingY * verticalDrag;
            body.velocity = {
                ...horizontalVelocity,
                // `Chicken.aiStep`, `Blaze.aiStep` and `Parrot.calculateFlapping` slow a fall to 0.6 a tick.
                y: fell < 0 && SLOW_FALLERS.has(entity.identifier) ? fell * SLOW_FALL : fell
            };
        }
        // A living body's gravity applies after the move that zeroed it, so it keeps sinking.
        if (stuck)
            body.velocity = {
                x: 0,
                y: componentFacts.movesBeforeGravity ? -gravity * verticalDrag : 0,
                z: 0
            };

        body.position = next;
    }

    /**
     * Whether a cobweb holds the body: Java's `WebBlock.entityInside` sticks every entity whose
     * box is in one, but a type whose `minecraft:block_movement_slowdown_immunity` lists the web,
     * which is the spider's `Spider.makeStuckInBlock` skipping cobwebs.
     */
    private stuckInCobweb(entity: DataEntity): boolean {
        const immunity = entity.instance.componentParams('minecraft:block_movement_slowdown_immunity');
        const immune = isRecord(immunity) && Array.isArray(immunity.blocks) && immunity.blocks.includes(COBWEB);
        if (immune) return false;
        return bodyTouchesBlock(
            entity.position,
            entity.facts.box,
            (at) => this.world.blocks.get(at)?.identifier === COBWEB
        );
    }

    /**
     * Whether the block a body's feet are in is one Java lets a living body climb: a member of
     * the `minecraft:climbable` block tag, which `LivingEntity.onClimbable` reads.
     */
    private onClimbable(position: EntityPosition): boolean {
        const block = this.world.blocks.get(blockPositionOf(position));
        return block !== undefined && this.content().tags.includes('block', CLIMBABLE_TAG, block.identifier);
    }

    /** Applies projectile gravity and drag ({@link projectileFlight}), swept collisions, and the active component's hit actions. */
    private coastProjectile(entity: DataEntity, params: Record<string, unknown>): void {
        const state = this.projectiles.get(entity.id) ?? { hitEntities: new Set<number>() };
        this.projectiles.set(entity.id, state);
        entity.body.projectileAge += 1;

        const lifetime = typeof params.max_life === 'number' ? params.max_life : PROJECTILE_MAX_LIFE;
        if (entity.body.projectileAge > lifetime) {
            this.remove(entity.id, 'projectile_expired');
            return;
        }
        if (entity.body.projectileStuck) return;

        const { body } = entity;
        const flight = projectileFlight(entity.identifier, params);
        // Java's projectile classes read only water; the component's inertia counts any liquid.
        const inWater =
            body.conditions.has('in_water') || (flight.order === 'component' && body.conditions.has('in_lava'));
        const from = body.position;
        const velocity = velocityBeforeMove(flight, body.velocity, inWater);
        const to = { x: from.x + velocity.x, y: from.y + velocity.y, z: from.z + velocity.z };
        const distance = Math.hypot(velocity.x, velocity.y, velocity.z);
        const steps = Math.max(1, Math.ceil(distance / PROJECTILE_SWEEP_STEP));
        const navigation = this.navigation();
        const componentFacts = this.componentFactsOf(entity);
        // Every Java projectile clips its move against blocks (`ProjectileUtil.getHitResultOnMoveVector`),
        // a shulker bullet too, which Bedrock's file gives no collision.
        const meetsBlocks = componentFacts.hasCollision || entity.identifier.startsWith('minecraft:');
        let lastSafe = from;

        for (let step = 1; step <= steps; step += 1) {
            const fraction = step / steps;
            const at = {
                x: from.x + (to.x - from.x) * fraction,
                y: from.y + (to.y - from.y) * fraction,
                z: from.z + (to.z - from.z) * fraction
            };
            const target = this.projectileTargetAt(entity, at, state);
            if (target instanceof DataEntity && target.instance.type.hasTag(DEFLECTS_PROJECTILES_TAG)) {
                // `Projectile.hitTargetOrDeflectSelf`: a type in Java's `deflects_projectiles`
                // turns the projectile back with `ProjectileDeflection.REVERSE` and takes no hit,
                // and `lastDeflectedBy` keeps the same entity from touching it again.
                state.hitEntities.add(target.id);
                body.position = lastSafe;
                body.velocity = {
                    x: -velocity.x * REVERSE_SPEED,
                    y: -velocity.y * REVERSE_SPEED,
                    z: -velocity.z * REVERSE_SPEED
                };
                body.yaw += REVERSE_TURN + this.world.random.nextFloat() * REVERSE_TURN_SPREAD;
                return;
            }
            if (target !== undefined) {
                const evaded =
                    target instanceof DataEntity &&
                    target.instance.notifyProjectileHit(entity.instance.filterContext().self);
                if (evaded) {
                    state.hitEntities.add(target.id);
                    continue;
                }
                // A perched dragon sets the arrow alight, takes nothing and turns it back.
                if (target instanceof DataEntity && deflectsArrow(target, entity.identifier)) {
                    state.hitEntities.add(target.id);
                    body.fireTicks = Math.max(body.fireTicks, DEFLECTED_ARROW_FIRE_TICKS);
                    body.velocity = {
                        x: velocity.x * DEFLECTED_ARROW_SPEED,
                        y: velocity.y * DEFLECTED_ARROW_SPEED,
                        z: velocity.z * DEFLECTED_ARROW_SPEED
                    };
                    body.position = lastSafe;
                    return;
                }
                if (typeof target.id === 'number') this.onProjectileHit?.(entity, { entity: target.id }, at, velocity);
                if (this.hitProjectile(entity, target, params, at, from) && entity.removed !== undefined) return;
                if (entity.removed !== undefined || body.projectileStuck) return;
            }

            if (meetsBlocks && !bodyCanOccupy(at, entity.facts.box, navigation, componentFacts.canStandOnPowderSnow)) {
                this.onProjectileHit?.(
                    entity,
                    { block: { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) } },
                    at,
                    velocity
                );
                const onHit = isRecord(params.on_hit) ? params.on_hit : {};
                this.applyProjectileHitEffects(onHit, at, false);
                this.landProjectile(entity, onHit, lastSafe, from, undefined);
                if (entity.identifier === DRAGON_FIREBALL) this.breathe(entity, at);
                if (isThrownPotion(entity.identifier)) this.breakPotion(entity, at);
                const sound = typeof params.hit_ground_sound === 'string' ? params.hit_ground_sound : undefined;
                if (sound !== undefined) this.world.effects.playSound(blockPositionOf(at), sound);

                if (entity.removed !== undefined) return;
                if (this.waitsToExplode(entity, onHit)) {
                    body.position = lastSafe;
                    body.velocity = { x: 0, y: 0, z: 0 };
                    body.projectileStuck = true;
                } else if (isRecord(onHit.stick_in_ground)) {
                    body.position = lastSafe;
                    this.land(entity);
                    body.projectileStuck = true;
                } else {
                    this.remove(entity.id, 'projectile_hit_block');
                }
                return;
            }

            lastSafe = at;
        }

        body.position = lastSafe;
        body.velocity = velocityAfterMove(flight, velocity, inWater);
    }

    /** Finds the first entity whose current hitbox intersects the projectile. */
    private projectileTargetAt(
        projectile: DataEntity,
        at: EntityPosition,
        state: ProjectileState
    ): DataEntity | ContentEntity | undefined {
        const projectileBox = projectile.facts.box;
        const owner = projectile.body.owner;
        for (const target of this.index.within(at, 16)) {
            // A player is the host's below, which a projectile passes in creative or spectator.
            if (
                clientOwnsMovement(target.identifier) ||
                target.id === projectile.id ||
                target.instance.hasComponent('minecraft:projectile') ||
                (target.id === owner && projectile.body.projectileAge <= PROJECTILE_OWNER_GRACE) ||
                state.hitEntities.has(target.id)
            )
                continue;
            if (projectileOverlaps(at, projectileBox, target.position, target.facts.box.width, target.facts.box.height))
                return target;
        }

        for (const target of this.host.players()) {
            if (
                (target.id === owner && projectile.body.projectileAge <= PROJECTILE_OWNER_GRACE) ||
                target.creative === true ||
                target.spectator === true ||
                state.hitEntities.has(target.id)
            )
                continue;
            if (projectileOverlaps(at, projectileBox, target.position, PLAYER_WIDTH, PLAYER_HEIGHT)) return target;
        }

        return undefined;
    }

    /**
     * Runs an entity hit through the damage route and hit actions in its projectile data, with
     * Java's rules where a vanilla projectile's class differs from its file ({@link JAVA_PROJECTILE_HITS}):
     * every blow pushes the way `LivingEntity.knockback` does, and the effects, fire and owner
     * teleport the hit carries land only when the blow did.
     * @param from - Where the projectile was at the start of the tick, which an ender pearl takes its owner to.
     */
    private hitProjectile(
        projectile: DataEntity,
        target: DataEntity | ContentEntity,
        params: Record<string, unknown>,
        at: EntityPosition,
        from: EntityPosition
    ): boolean {
        const onHit = isRecord(params.on_hit) ? params.on_hit : {};
        const impact = isRecord(onHit.impact_damage) ? onHit.impact_damage : undefined;
        const java = JAVA_PROJECTILE_HITS.get(projectile.identifier);
        const owner = projectile.body.owner;
        let damage = 0;
        let blow = false;

        if (java?.damage !== undefined) {
            const owned =
                owner !== undefined &&
                (this.store.get(owner) !== undefined || this.host.playerById?.(owner) !== undefined);
            const amount = owned ? java.damage.owned : java.damage.unowned;
            blow = amount !== undefined;
            damage = amount ?? 0;
        } else if (impact !== undefined) {
            // Java hurts every entity its projectiles hit, for nothing where the filter would
            // pass it by, as a snowball does anything but a blaze.
            blow = true;
            if (this.projectileFilterAllows(impact.filter, target)) damage = this.impactDamage(projectile, impact);
        }

        let landed = blow && damage === 0;
        if (damage > 0) {
            if (target instanceof DataEntity)
                landed = this.hurt(target, owner, 'projectile', damage, { route: 'projectile' });
            else {
                landed = true;
                if (this.host.hurtByProjectile !== undefined)
                    this.host.hurtByProjectile(target.id, damage, projectile.id, owner);
                else this.host.hurt?.(target.id, damage, 'projectile', owner);
                if (owner !== undefined) this.markPlayerBlow(target.id, 'hurtBy', owner);
            }
        }

        this.projectiles.get(projectile.id)?.hitEntities.add(target.id);
        this.applyProjectileHitEffects(onHit, at, true);
        // Java's `DragonFireball.onHit` leaves no cloud on the dragon that breathed it.
        if (projectile.identifier === DRAGON_FIREBALL && target.id !== projectile.body.owner)
            this.breathe(projectile, at);
        if (isThrownPotion(projectile.identifier))
            this.breakPotion(
                projectile,
                closestPointOf(
                    target instanceof DataEntity
                        ? boxAt(target.position, target.facts.box.width, target.facts.box.height)
                        : boxAt(target.position, PLAYER_BOX.width, PLAYER_BOX.height),
                    at
                )
            );
        const sound = typeof params.hit_sound === 'string' ? params.hit_sound : undefined;
        if (sound !== undefined) this.world.effects.playSound(blockPositionOf(at), sound);

        const pushes = java?.knockback ?? impact?.knockback === true;
        if (pushes && landed && target instanceof DataEntity) {
            const punch = typeof projectile.spawnData?.['punch'] === 'number' ? projectile.spawnData['punch'] : 0;
            target.body.velocity = projectileKnockback({
                velocity: target.body.velocity,
                direction: { x: projectile.body.velocity.x, z: projectile.body.velocity.z },
                resistance: target.facts.knockbackResistance,
                onGround: target.body.conditions.has('on_ground'),
                punch: Math.max(0, punch)
            });
            target.body.conditions.delete('on_ground');
            target.body.lastPusher = owner;
        } else if (pushes && landed && damage === 0 && !('instance' in target)) {
            const flatSpeed = Math.hypot(projectile.body.velocity.x, projectile.body.velocity.z) || 1;
            this.host.knockback?.(
                target.id,
                projectile.body.velocity.x / flatSpeed,
                projectile.body.velocity.z / flatSpeed,
                PROJECTILE_KNOCKBACK
            );
        }

        if (landed || !blow) {
            if (
                impact?.catch_fire === true &&
                target instanceof DataEntity &&
                !target.instance.hasComponent('minecraft:fire_immune')
            )
                target.body.fireTicks = Math.max(target.body.fireTicks, PROJECTILE_IGNITE_TICKS);
            for (const effect of projectileHitEffects(onHit, this.world.level.difficulty()))
                this.applyStatusEffectToId(projectile.instance, target.id, effect);
        }
        this.landProjectile(projectile, onHit, at, from, target);

        if (projectile.removed !== undefined) return true;
        if (this.waitsToExplode(projectile, onHit)) {
            projectile.body.velocity = { x: 0, y: 0, z: 0 };
            projectile.body.projectileStuck = true;
            return false;
        }
        const destroyOnHit =
            impact?.destroy_on_hit === true || onHit.remove_on_hit !== undefined || isRecord(onHit.wind_burst_on_hit);
        if (destroyOnHit) this.remove(projectile.id, 'projectile_hit_entity');
        return destroyOnHit;
    }

    /** Leaves the cloud of dragon's breath a dragon fireball makes where it lands; see {@link dragonBreathOf}. */
    private breathe(fireball: DataEntity, at: EntityPosition): void {
        const { min, max } = breathSearchBox(at, fireball.facts.box.width / 2);
        const inside = (position: EntityPosition): boolean =>
            position.x >= min.x &&
            position.x <= max.x &&
            position.y >= min.y &&
            position.y <= max.y &&
            position.z >= min.z &&
            position.z <= max.z;
        const living = [
            ...this.index
                .withinBox(min, max)
                .filter((other) => other.id !== fireball.id && other.instance.attributes.get('health') !== undefined),
            ...this.host.players().filter((player) => inside(player.position))
        ];
        const breath = dragonBreathOf(at, living);
        const owner = fireball.body.owner;
        this.spawn(AREA_EFFECT_CLOUD, breath.at, {
            data: breath.data,
            ...(owner === undefined ? {} : { ownerId: owner })
        });
    }

    /**
     * Java's `AbstractThrownPotion.onHit` where a thrown potion breaks (`thrownPotion.ts`): a water
     * bottle hurts the water-sensitive mobs and puts out the burning ones within 4 blocks, a splash
     * potion gives the living things around it its effects scaled by their distance, and a
     * lingering one leaves its cloud.
     */
    private breakPotion(potion: DataEntity, at: EntityPosition): void {
        const contents = thrownPotionContentsOf(potion.spawnData);
        const named = contents.potion;
        const owner = potion.body.owner;
        const { tags, items } = this.content();
        const tagged = (tag: string): boolean => named !== undefined && tags.members('potion', tag).includes(named);
        const hurts = tagged(HURTS_WATER_SENSITIVE_TAG);
        const extinguishes = tagged(EXTINGUISHES_TAG);
        const { width, height } = potion.facts.box;
        if (hurts || extinguishes) {
            const across = width / 2 + WATER_REACH.across;
            for (const target of this.index.withinBox(
                { x: at.x - across, y: at.y - WATER_REACH.up, z: at.z - across },
                { x: at.x + across, y: at.y + height + WATER_REACH.up, z: at.z + across }
            )) {
                if (target.id === potion.id || target.instance.attributes.get('health') === undefined) continue;
                const { x, y, z } = target.position;
                if ((x - at.x) ** 2 + (y - at.y) ** 2 + (z - at.z) ** 2 >= REACH_SQUARED) continue;
                if (hurts && WATER_SENSITIVE.has(target.identifier))
                    this.hurt(target, owner, 'magic', WATER_DAMAGE, { route: 'projectile' });
                if (extinguishes && target.removed === undefined) target.body.fireTicks = 0;
            }
        }

        const effects = [...(named === undefined ? [] : javaPotionEffects(named)), ...contents.customEffects].map(
            ({ id, durationTicks, amplifier }) => ({ id, durationTicks, amplifier })
        );
        if (effects.length === 0) return;
        const patched = potion.spawnData?.['minecraft:potion_duration_scale'];
        const scale =
            typeof patched === 'number'
                ? patched
                : (items.types.get(potion.identifier)?.params(potionDurationScale) ?? 1);
        if (potion.identifier === LINGERING_POTION) {
            this.spawn(AREA_EFFECT_CLOUD, potion.position, {
                data: lingeringCloudData(effects, scale),
                ...(owner === undefined ? {} : { ownerId: owner })
            });
            return;
        }

        // `ThrownSplashPotion.onHitAsPotion` searches the potion's box inflated by 4, 2 and 4.
        const splash = boxAt(at, width, height);
        const across = width / 2 + WATER_REACH.across;
        for (const target of this.index.withinBox(
            { x: at.x - across, y: at.y - WATER_REACH.up, z: at.z - across },
            { x: at.x + across, y: at.y + height + WATER_REACH.up, z: at.z + across }
        )) {
            if (target.id === potion.id || target.instance.attributes.get('health') === undefined) continue;
            const strength = splashStrength(
                splash,
                boxAt(target.position, target.facts.box.width, target.facts.box.height)
            );
            if (strength === undefined) continue;
            for (const effect of effects) {
                const instant = instantEffect(
                    effect.id,
                    effect.amplifier,
                    strength,
                    target.instance.families().includes('undead')
                );
                if (instant?.kind === 'heal') this.heal(target.id, instant.amount);
                else if (instant?.kind === 'hurt')
                    this.hurt(target, owner, 'magic', instant.amount, { route: 'projectile' });
                else {
                    const durationTicks = splashDuration(effect.durationTicks, strength, scale);
                    if (durationTicks !== undefined)
                        this.applyStatusEffectToId(potion.instance, target.id, { ...effect, durationTicks });
                }
            }
        }
        for (const player of this.host.players()) {
            const strength = splashStrength(splash, boxAt(player.position, PLAYER_BOX.width, PLAYER_BOX.height));
            if (strength === undefined) continue;
            for (const effect of effects) {
                if (instantEffect(effect.id, effect.amplifier, strength, false) !== undefined) continue;
                const durationTicks = splashDuration(effect.durationTicks, strength, scale);
                if (durationTicks !== undefined)
                    this.applyStatusEffectToId(potion.instance, player.id, { ...effect, durationTicks });
            }
        }
    }

    /** The damage an `impact_damage` deals: a fixed range, or an arrow's speed times its power with a critical bonus. */
    private impactDamage(projectile: DataEntity, impact: Record<string, unknown>): number {
        const range = isRecord(impact.damage) ? impact.damage : {};
        const minimum =
            typeof range.min === 'number' ? range.min : typeof range.range_min === 'number' ? range.range_min : 0;
        const maximum =
            typeof range.max === 'number' ? range.max : typeof range.range_max === 'number' ? range.range_max : minimum;
        const powerMultiplier = typeof impact.power_multiplier === 'number' ? impact.power_multiplier : 0;
        if (minimum === 0 && maximum === 0 && powerMultiplier > 0) {
            const { velocity } = projectile.body;
            let damage = Math.ceil(Math.hypot(velocity.x, velocity.y, velocity.z) * powerMultiplier);
            if (projectile.spawnData?.['critical'] === true)
                damage += this.world.random.nextInt(Math.floor(damage / 2) + 2);
            const power = projectile.spawnData?.['power'];
            if (typeof power === 'number' && power > 0) damage += power * 0.5 + 0.5;
            return damage;
        }
        return maximum >= minimum ? minimum + this.world.random.nextInt(Math.floor(maximum - minimum) + 1) : 0;
    }

    /**
     * What a projectile does where it lands, on an entity or a block, beyond the blow: it takes
     * its owner there (`teleport_owner`, Java's `ThrownEnderpearl.onHit`, which hurts a player
     * owner 5), fires its `definition_event`, bursts (`wind_burst_on_hit`), drops its
     * experience and leaves its area effect cloud.
     */
    private landProjectile(
        projectile: DataEntity,
        onHit: Record<string, unknown>,
        at: EntityPosition,
        from: EntityPosition,
        target: DataEntity | ContentEntity | undefined
    ): void {
        const java = JAVA_PROJECTILE_HITS.get(projectile.identifier);
        const owner = projectile.body.owner === undefined ? undefined : this.store.get(projectile.body.owner);

        if (isRecord(onHit.teleport_owner) && owner !== undefined) {
            if (clientOwnsMovement(owner.identifier)) {
                this.teleportPlayer(owner.id, from);
                this.hurt(owner, undefined, 'fall', ENDER_PEARL_DAMAGE, { route: 'component' });
            } else {
                owner.position = { ...from };
            }
        }

        const event = projectileHitEvent(onHit);
        if (event !== undefined) {
            if (event.projectile) projectile.instance.fire(event.event);
            if (event.target && target instanceof DataEntity) target.instance.fire(event.event);
            if (event.shooter) owner?.instance.fire(event.event);
        }

        const points =
            java?.experience !== undefined
                ? java.experience(this.world.random)
                : grantedExperience(onHit, this.world.random);
        for (const value of experienceOrbs(points)) this.spawn(EXPERIENCE_ORB, { ...at }, { data: { value } });

        if (java?.cloud !== undefined)
            this.spawn(
                AREA_EFFECT_CLOUD,
                { ...at },
                {
                    data: java.cloud,
                    ...(projectile.body.owner === undefined ? {} : { ownerId: projectile.body.owner })
                }
            );

        if (isRecord(onHit.wind_burst_on_hit)) this.explode(projectile.body);
    }

    /** Whether a projectile fired an event at itself on landing that lights its `minecraft:explode`, so it waits for the blast. */
    private waitsToExplode(projectile: DataEntity, onHit: Record<string, unknown>): boolean {
        if (projectile.removed !== undefined || projectileHitEvent(onHit)?.projectile !== true) return false;
        projectile.instance.applyQueuedEvents();
        const explode = projectile.instance.componentParams('minecraft:explode');
        return isRecord(explode);
    }

    /** Applies the particle and child-spawn actions carried by `on_hit`. */
    private applyProjectileHitEffects(onHit: Record<string, unknown>, at: EntityPosition, entityHit: boolean): void {
        const particle = isRecord(onHit.particle_on_hit) ? onHit.particle_on_hit : undefined;
        const showParticle =
            particle !== undefined && (entityHit ? particle.on_entity_hit === true : particle.on_other_hit === true);
        if (showParticle && typeof particle.particle_type === 'string') {
            const count =
                typeof particle.num_particles === 'number' ? Math.max(1, Math.floor(particle.num_particles)) : 1;
            for (let index = 0; index < count; index += 1) this.world.effects.spawnParticle(at, particle.particle_type);
        }

        const spawn = isRecord(onHit.spawn_chance) ? onHit.spawn_chance : undefined;
        if (spawn === undefined || typeof spawn.spawn_definition !== 'string') return;
        const firstChance = typeof spawn.first_spawn_chance === 'number' ? spawn.first_spawn_chance : 0;
        if (this.world.random.nextFloat() >= Math.max(0, Math.min(1, firstChance))) return;

        let count = typeof spawn.first_spawn_count === 'number' ? Math.max(1, Math.floor(spawn.first_spawn_count)) : 1;
        const secondChance = typeof spawn.second_spawn_chance === 'number' ? spawn.second_spawn_chance : 0;
        if (secondChance > 0 && this.world.random.nextFloat() < Math.min(1, secondChance))
            count =
                typeof spawn.second_spawn_count === 'number'
                    ? Math.max(1, Math.floor(spawn.second_spawn_count))
                    : count;

        const cause = spawn.spawn_baby === true ? 'born' : 'spawned';
        for (let index = 0; index < count; index += 1) this.spawn(spawn.spawn_definition, at, { cause });
    }

    /** Applies a component's family filter to the entity the projectile hit. */
    private projectileFilterAllows(filter: unknown, target: DataEntity | ContentEntity): boolean {
        if (typeof filter !== 'string' || filter.length === 0) return true;
        if (target instanceof DataEntity) return target.instance.families().includes(filter);
        return target.identifier === filter || target.identifier === `minecraft:${filter}`;
    }

    /**
     * Applies the block's configured falling motion and turns it back into a block on landing.
     *
     * Java's `FallingBlockEntity.tick`: gravity first, then the move, then the drag, so a block
     * dropped from rest falls 0.04 in its first tick. On landing the block takes the cell it came
     * to rest in only when Java's `minecraft:replaceable` tag holds what is there, so sand dropped
     * onto a torch or a flower breaks into its item and leaves the torch standing. A block the
     * component names in `hurts_entities`, the anvils, hurts every living thing it lands in by its
     * damage per block fallen past the first, up to its cap, as `FallingBlockEntity.causeFallDamage`
     * does.
     */
    private coastFallingBlock(entity: DataEntity, params: Record<string, unknown>): void {
        const blockName = entity.spawnData?.['block'];
        if (typeof blockName !== 'string') {
            this.report(`${entity.identifier} has no block payload and was removed`);
            this.remove(entity.id, 'invalid_spawn_data');
            return;
        }

        let state = this.fallingBlocks.get(entity.id);
        if (state === undefined) {
            const fallThrough = new Set(
                Array.isArray(params['fall_through'])
                    ? params['fall_through'].filter((name): name is string => typeof name === 'string')
                    : []
            );
            state = { startY: entity.position.y, fallThrough };
            this.fallingBlocks.set(entity.id, state);
        }

        const gravity = typeof params['gravity'] === 'number' ? params['gravity'] : 0.04;
        const drag = typeof params['drag'] === 'number' ? params['drag'] : 0.02;
        const maxFallDistance = typeof params['max_fall_distance'] === 'number' ? params['max_fall_distance'] : 512;
        const position = entity.position;
        const velocity = entity.body.velocity;
        const fallingY = velocity.y - gravity;
        const nextY = position.y + fallingY;

        if (position.y - state.startY < -maxFallDistance || nextY < this.world.level.minY) {
            this.remove(entity.id, 'fell_out_of_world');
            return;
        }

        const target = {
            x: Math.floor(position.x),
            y: Math.floor(nextY),
            z: Math.floor(position.z)
        };
        const occupying = this.world.blocks.get(target);
        if (occupying === undefined) return;

        const passes = (identifier: string): boolean => state.fallThrough.has(identifier) || fallsThrough(identifier);
        if (!passes(occupying.identifier)) {
            const landing = { ...target, y: target.y + 1 };
            const resting = this.world.blocks.get(landing);
            if (resting === undefined) return;

            this.remove(entity.id, 'landed');
            this.hurtLandedOn(entity, blockName, params, state.startY - landing.y, landing.y);
            const tags = javaBlockTagsForBedrock(this.content().tags, resting.identifier, resting.states);
            if (resting.identifier === AIR || tags.includes(REPLACEABLE_TAG)) {
                if (resting.identifier !== AIR) this.world.blocks.destroy?.(landing);
                this.world.blocks.set(landing, { identifier: blockName, states: {} }, true);
            } else {
                this.host.drop(
                    { x: landing.x + 0.5, y: landing.y + 0.5, z: landing.z + 0.5 },
                    { identifier: blockName, count: 1 }
                );
            }
            return;
        }

        entity.body.velocity = { x: velocity.x * (1 - drag), y: fallingY * (1 - drag), z: velocity.z * (1 - drag) };
        entity.body.position = { ...position, y: nextY };
    }

    /**
     * Hurts every living thing a landed block of a kind that `hurts_entities` names came down in:
     * Java's `causeFallDamage`, `min(floor(ceil(fallen - 1) * per_block), max)`.
     */
    private hurtLandedOn(
        entity: DataEntity,
        blockName: string,
        params: Record<string, unknown>,
        fallen: number,
        floorY: number
    ): void {
        const hurting = isRecord(params['hurts_entities']) ? params['hurts_entities'][blockName] : undefined;
        if (!isRecord(hurting)) return;
        const perBlock = typeof hurting['per_block'] === 'number' ? hurting['per_block'] : 0;
        const max = typeof hurting['max'] === 'number' ? hurting['max'] : 0;
        const blocks = Math.ceil(fallen - 1);
        if (blocks < 0) return;
        const damage = Math.min(Math.floor(blocks * perBlock), max);
        if (damage <= 0) return;

        const half = entity.facts.box.width / 2;
        const { x, z } = entity.position;
        const reached = this.index.withinBox(
            { x: x - half, y: floorY, z: z - half },
            { x: x + half, y: floorY + entity.facts.box.height, z: z + half }
        );
        for (const target of reached) {
            if (target.id === entity.id || target.instance.attributes.get('health') === undefined) continue;
            this.hurt(target, undefined, 'anvil', damage, { route: 'area_attack' });
        }
    }

    /**
     * Runs a minecart's tick on a rail: Java's `OldMinecartBehavior.tick` moves it along the rail
     * with `moveAlongTrack` (`minecartTrack.ts`), and an activator rail then calls its
     * `activateMinecart` (`railSensor.ts`). The gravity Java applies first changes nothing on a
     * rail, since `applyNaturalSlowdown` drops the vertical speed.
     * @returns Whether the cart was on a rail. Off one, {@link coast} moves it as a plain body,
     *   which is what `AbstractMinecart.comeOffTrack` does.
     */
    private coastOnRails(entity: DataEntity): boolean {
        const { body } = entity;
        const blocks = { block: (at: EntityPosition) => this.world.blocks.get(at) };
        const rail = railPositionOf(body.position, blocks);
        const block = blocks.block(rail);
        if (block === undefined || railShapeOf(block) === undefined) return false;

        const facts = this.componentFactsOf(entity);
        const navigation = this.navigation();
        const canOccupy = (at: EntityPosition) =>
            !facts.hasCollision || bodyCanOccupy(at, entity.facts.box, navigation, facts.canStandOnPowderSnow);
        const host: TrackHost = {
            ...blocks,
            isRedstoneConductor: (at) => this.world.blocks.isRedstoneConductor?.(at) ?? navigation.isSolid(at),
            move: (from, by) =>
                moveOnAxis(moveOnAxis(from, from.x + by.x, 'x', canOccupy), from.z + by.z, 'z', canOccupy)
        };
        const ridden = this.rides.ridersOf(entity.id).length > 0;
        const capacity = body.containerCapacity;
        const cart = {
            position: body.position,
            velocity: body.velocity,
            ridden,
            inWater: body.conditions.has('in_water'),
            slowdown: cartSlowdown(
                ridden,
                capacity > 0 ? containerSignal({ capacity, items: body.containerSlots }) : undefined
            )
        };
        moveAlongTrack(cart, rail, block, host);
        body.position = cart.position;
        body.velocity = cart.velocity;
        body.conditions.add('on_ground');
        if (block.identifier === ACTIVATOR_RAIL) activateMinecart(entity, isPoweredRail(block), this.railSensorHost);
        return true;
    }

    /**
     * Applies Java's boat float step when the active definition declares buoyancy.
     *
     * `apply_gravity: false` limits the component to its liquids: a horse, a donkey or an
     * experience orb that touches none of them falls under its ordinary physics instead, and
     * this returns `false` so {@link coast} runs that step.
     * @returns Whether this step moved the entity.
     */
    private coastBuoyant(entity: DataEntity, buoyant: Record<string, unknown>): boolean {
        const { body } = entity;
        const position = body.position;
        const box = entity.facts.box;
        const names = new Set(
            Array.isArray(buoyant.liquid_blocks)
                ? buoyant.liquid_blocks.filter((name): name is string => typeof name === 'string')
                : []
        );
        const minX = Math.floor(position.x - box.width / 2 + MOVEMENT_EPSILON);
        const maxX = Math.floor(position.x + box.width / 2 - MOVEMENT_EPSILON);
        const minZ = Math.floor(position.z - box.width / 2 + MOVEMENT_EPSILON);
        const maxZ = Math.floor(position.z + box.width / 2 - MOVEMENT_EPSILON);
        const minY = Math.floor(position.y);
        const maxY = Math.floor(position.y + box.height);
        let liquidSurface: number | undefined;
        let underwaterSource = false;
        let underwaterFlowing = false;

        for (let x = minX; x <= maxX; x += 1) {
            for (let z = minZ; z <= maxZ; z += 1) {
                for (let y = minY; y <= maxY; y += 1) {
                    const block = this.world.blocks.get({ x, y, z });
                    if (block === undefined || !buoyantIn(names, block.identifier)) continue;
                    const fluid = liquidStateOf({ identifier: block.identifier, states: block.states });
                    if (fluid === undefined) continue;

                    const surface = y + (fluid.source || fluid.falling ? 1 : fluid.amount / 9);
                    if (surface > position.y && y < position.y + box.height) {
                        liquidSurface = Math.max(liquidSurface ?? Number.NEGATIVE_INFINITY, surface);
                    }
                    if (surface > position.y + box.height + MOVEMENT_EPSILON) {
                        if (fluid.source) underwaterSource = true;
                        else underwaterFlowing = true;
                    }
                }
            }
        }

        const applyGravity = buoyant.apply_gravity !== false;
        if (!applyGravity && liquidSurface === undefined && !underwaterSource && !underwaterFlowing) return false;

        const componentFacts = this.componentFactsOf(entity);
        const navigation = this.navigation();
        const grounded =
            componentFacts.hasCollision &&
            body.velocity.y <= 0 &&
            isSupported(position, box, navigation, componentFacts.canStandOnPowderSnow);
        if (grounded) body.conditions.add('on_ground');
        else body.conditions.delete('on_ground');

        // Java's `AbstractBoat.floatBoat`: a boat that comes down out of the air onto water is set
        // on the water's surface, 0.101 blocks under its own top, and stops falling.
        const touchesLiquid = liquidSurface !== undefined || underwaterSource || underwaterFlowing;
        const cameFromAir = this.wasInLiquid.get(entity) === false && !grounded;
        this.wasInLiquid.set(entity, touchesLiquid);
        if (touchesLiquid && cameFromAir && componentFacts.families.includes('boat')) {
            let top = Math.floor(position.y);
            while (
                buoyantIn(
                    names,
                    this.world.blocks.get({ x: Math.floor(position.x), y: top + 1, z: Math.floor(position.z) })
                        ?.identifier ?? ''
                )
            )
                top += 1;
            body.position = { ...position, y: top + 1 - box.height + BOAT_WATERLINE };
            body.velocity = { ...body.velocity, y: 0 };
            return true;
        }

        const baseBuoyancy = typeof buoyant.base_buoyancy === 'number' ? buoyant.base_buoyancy : 1;
        const submerged = underwaterFlowing ? 'flowing' : underwaterSource ? 'source' : undefined;
        const inLiquid = submerged === undefined && liquidSurface !== undefined;
        const gravity =
            !applyGravity || (grounded && !submerged && !inLiquid)
                ? 0
                : submerged === 'flowing'
                  ? -0.0007
                  : -BUOYANT_GRAVITY;
        const airDragModifier = componentFacts.airDragModifier;
        const frictionModifier = componentFacts.frictionModifier;
        const bounciness = componentFacts.bounciness;
        const uniformAirDrag = componentFacts.usesUniformAirDrag;
        const horizontalDrag =
            submerged === 'source'
                ? 0.45
                : inLiquid || submerged !== undefined
                  ? BUOYANT_DRAG
                  : grounded
                    ? groundDrag(this.groundFrictionAt(position), frictionModifier, airDragModifier)
                    : dragWithModifier(BUOYANT_DRAG, airDragModifier);
        const verticalAirDrag = uniformAirDrag ? BUOYANT_DRAG : 1;
        const verticalDrag =
            inLiquid || submerged === 'source'
                ? BUOYANT_WATER_VERTICAL_DRAG
                : dragWithModifier(verticalAirDrag, airDragModifier);
        const buoyancy =
            submerged === 'source'
                ? 0.01
                : inLiquid && liquidSurface !== undefined
                  ? ((liquidSurface - position.y) / box.height) * baseBuoyancy
                  : 0;
        const velocity = body.velocity;
        const fallingY = grounded ? 0 : velocity.y + gravity + buoyancy * (BUOYANT_GRAVITY / BUOYANT_STEADY_FRACTION);
        const nextVelocity = {
            x: velocity.x * horizontalDrag,
            y: fallingY * verticalDrag,
            z: velocity.z * horizontalDrag
        };
        const nextY = position.y + nextVelocity.y;
        function canOccupy(at: EntityPosition): boolean {
            return (
                !componentFacts.hasCollision || bodyCanOccupy(at, box, navigation, componentFacts.canStandOnPowderSnow)
            );
        }
        let next = moveOnAxis(position, position.x + nextVelocity.x, 'x', canOccupy);
        const hitHorizontalX = Math.abs(next.x - (position.x + nextVelocity.x)) > MOVEMENT_EPSILON;
        next = moveOnAxis(next, position.z + nextVelocity.z, 'z', canOccupy);
        const hitHorizontalZ = Math.abs(next.z - (position.z + nextVelocity.z)) > MOVEMENT_EPSILON;
        const nextVertical = moveOnAxis(next, nextY, 'y', canOccupy);
        const hitVerticalCollision = Math.abs(nextVertical.y - nextY) > MOVEMENT_EPSILON;
        const horizontalVelocity = {
            x: hitHorizontalX ? (bounciness > 0 ? -nextVelocity.x * bounciness : 0) : nextVelocity.x,
            z: hitHorizontalZ ? (bounciness > 0 ? -nextVelocity.z * bounciness : 0) : nextVelocity.z
        };

        if (hitVerticalCollision && fallingY <= 0) {
            const landed = {
                ...nextVertical,
                y: landingY(nextVertical, box, navigation, nextVertical.y - nextY, componentFacts.canStandOnPowderSnow)
            };
            body.position = landed;
            if (bounciness > 0) {
                body.velocity = { ...horizontalVelocity, y: -nextVelocity.y * bounciness };
                body.conditions.delete('jumping');
                body.conditions.delete('on_ground');
            } else {
                this.land(entity);
            }
            return true;
        }

        body.velocity = {
            ...horizontalVelocity,
            y: hitVerticalCollision ? (bounciness > 0 ? -nextVelocity.y * bounciness : 0) : nextVelocity.y
        };
        body.position = nextVertical;
        return true;
    }

    /**
     * Holds a strider on a lava pool's surface, or floats it up to it.
     *
     * Java gives a mob whose `canStandOnFluid` takes lava a collision shape half a block tall on a
     * lava source with no lava over it (`LiquidBlock.getCollisionShape`'s `STABLE_SHAPE`), once the
     * mob is above that half; under it, `Strider.floatStrider` halves the strider's velocity and adds
     * 0.05 blocks a tick upward until it gets there.
     *
     * @returns Whether the strider was in lava, which this tick's travel then was.
     */
    private floatOnLava(entity: DataEntity): boolean {
        const { body } = entity;
        if (!LAVA_WALKERS.has(entity.identifier) || !body.conditions.has('in_lava')) return false;
        const navigation = this.navigation();
        const position = body.position;
        const cell = blockPositionOf(position);
        const surface = cell.y + LAVA_STABLE_HEIGHT;
        const standable = navigation.isLava(cell) && !navigation.isLava({ ...cell, y: cell.y + 1 });
        const velocity = body.velocity;
        if (standable && position.y >= surface - MOVEMENT_EPSILON) {
            body.position = { ...position, y: surface };
            body.velocity = { ...velocity, y: 0 };
            body.conditions.add('on_ground');
            return true;
        }

        const rising = velocity.y * 0.5 + LAVA_FLOAT_SPEED;
        const risen = position.y + rising;
        const capped = standable && risen > surface ? surface : risen;
        body.position = { ...position, y: capped };
        body.velocity = { x: velocity.x * 0.5, y: capped === surface ? 0 : rising, z: velocity.z * 0.5 };
        body.conditions.delete('on_ground');
        return true;
    }

    /** Moves a body along its current waypoint using its active navigation rules. */
    private step(entity: DataEntity): void {
        if (entity.instance.hasComponent('minecraft:projectile') || !entity.body.walking) {
            if (!entity.body.walking) {
                const navigation = this.navigation();
                const hasCollision = this.componentFactsOf(entity).hasCollision;
                entity.body.driftInWater(
                    javaWaterDrag(entity),
                    (at) => !hasCollision || bodyCanOccupy(at, entity.facts.box, navigation)
                );
            }
            entity.body.rest();
            return;
        }

        const navigation = this.navigation();
        const profile = navigationProfile(entity.instance);
        const componentFacts = this.componentFactsOf(entity);
        const feet = blockPositionOf(entity.position);
        const inLiquid = navigation.isWater(feet) || navigation.isLava(feet);
        // A mob that breathes water swims it in three dimensions whatever its navigation says, as
        // Java's squid does along its movement vector with no path finder at all.
        const breathable = entity.instance.componentParams('minecraft:breathable');
        const aquatic = isRecord(breathable) && breathable['breathesWater'] === true;
        const swims = inLiquid && (profile.canSwim || profile.canFloat || profile.isAmphibious || aquatic);
        const climbs =
            (profile.kind === 'climb' && navigation.isClimbable?.(feet) === true) ||
            (profile.canClimbLadders === true && navigation.isLadder?.(feet) === true);
        // `minecraft:movement.jump`, the slime's, waits a draw from `jump_delay` seconds between hops.
        const hop = entity.instance.componentParams('minecraft:movement.jump');
        const [shortest, longest]: unknown[] = isRecord(hop) && Array.isArray(hop.jumpDelay) ? hop.jumpDelay : [];
        const java = entity.instance.javaNavigation;
        const maxTurn = java === undefined ? undefined : javaMoveControlTurn(java);
        // `minecraft:movement.glide` is the phantom's flight, which declares no navigation: Java's
        // `PhantomMoveControl` steers it in three dimensions.
        const glides = entity.instance.hasComponent('minecraft:movement.glide');
        const turnShare = JAVA_EASED_TURNS.get(entity.identifier);
        entity.step({
            ...(maxTurn === undefined ? {} : { maxTurn }),
            ...(turnShare === undefined ? {} : { turnShare }),
            allowVertical:
                profile.canFly || profile.kind === 'fly' || profile.kind === 'hover' || glides || swims || climbs,
            canJump: profile.canJump,
            stepHeight: profile.stepHeight,
            maxUpStep: componentFacts.maxUpStep,
            ...(this.stuckInCobweb(entity) ? { stuckSpeed: COBWEB_HORIZONTAL_SPEED } : {}),
            // In a ladder the body descends at most Java's 0.15 a tick. While it is airborne the
            // fall already moves it down by that much, so the step adds no descent of its own.
            ...(componentFacts.movesBeforeGravity && this.onClimbable(entity.position)
                ? { maxDescent: entity.body.airborne ? 0 : CLIMB_SPEED }
                : {}),
            groundFriction: this.groundFrictionAt(entity.position),
            floorAt: (waypoint) => floorUnder(waypoint, navigation),
            ...(typeof shortest === 'number' && typeof longest === 'number'
                ? {
                      nextHopDelay: () =>
                          Math.round(
                              (shortest + (longest - shortest) * this.world.random.nextFloat()) * TICKS_PER_SECOND
                          )
                  }
                : {}),
            canOccupy(position: EntityPosition): boolean {
                return (
                    !componentFacts.hasCollision ||
                    bodyCanOccupy(position, entity.facts.box, navigation, profile.canStandOnPowderSnow === true)
                );
            }
        });
    }

    /**
     * Java's `Enderman.teleport(x, y, z)` and the `LivingEntity.randomTeleport` it calls. An
     * enderman riding something stays where it is. Otherwise the destination drops to the first
     * block under it that blocks motion, and when that is no water the entity lands on it if its
     * box fits there clear of liquid. A teleport that lands sends the `teleport` game event from
     * where the entity stood.
     * @returns Whether the entity moved.
     */
    private endermanTeleport(id: number, destination: EntityPosition): boolean {
        const entity = this.store.get(id);
        // `Enderman.teleport(x, y, z)` refuses at once for a passenger, so a riding enderman stays put.
        if (entity === undefined || this.vehicleOf(entity.body) !== undefined) return false;
        const navigation = this.navigation();
        const minY = this.world.level.minY;
        const column = blockPositionOf(destination);
        let y = column.y;
        while (y > minY && !navigation.isSolid({ ...column, y: y - 1 })) y -= 1;
        const ground = { ...column, y: y - 1 };
        if (!navigation.isSolid(ground) || navigation.isWater(ground)) return false;
        const landing = { ...destination, y: destination.y - (column.y - y) };
        const box = entity.facts.box;
        const [water, lava] = bodyIntersectsMedia(landing, box, navigation.isWater, navigation.isLava);
        if (water || lava || !bodyCanOccupy(landing, box, navigation)) return false;
        const from = blockPositionOf(entity.position);
        entity.body.teleportTo(landing);
        this.world.effects.emitGameEvent(TELEPORT_EVENT, from, entity.id);
        return true;
    }

    /**
     * Whether the entity ran into a wall this tick, Java's `horizontalCollision`: its coast was
     * stopped on a horizontal axis, or it walks with a block pressed against its side.
     */
    private collidedHorizontally(entity: DataEntity): boolean {
        if (this.horizontalCollisions.has(entity.id)) return true;
        if (!entity.body.walking) return false;
        const box = entity.facts.box;
        return !bodyCanOccupy(
            entity.position,
            { ...box, width: box.width + 2 * WALL_CONTACT },
            this.navigation(),
            this.componentFactsOf(entity).canStandOnPowderSnow
        );
    }

    /** Applies Java's horizontal push impulse after this entity has moved for the tick. */
    private pushIntersectingEntity(first: DataEntity): void {
        // A Java projectile is never pushable and pushes nothing, so no body is shoved by one it overlaps.
        if (!this.hasEntityCollision(first) || first.instance.hasComponent('minecraft:projectile')) return;

        const firstPosition = first.position;
        const firstId = first.id;
        const firstBox = first.facts.box;
        const firstWidth = firstBox.width;
        const firstHeight = firstBox.height;
        let firstVehicle: number | undefined;
        let firstVehicleResolved = false;
        let pushableFirst: boolean | undefined;
        const halfWidth = firstWidth / 2;
        const collisionCandidates = this.inBox(
            {
                x: firstPosition.x - halfWidth,
                y: firstPosition.y,
                z: firstPosition.z - halfWidth
            },
            {
                x: firstPosition.x + halfWidth,
                y: firstPosition.y + firstHeight,
                z: firstPosition.z + halfWidth
            }
        );
        for (const second of collisionCandidates) {
            const secondId = second.id;
            if (
                firstId === secondId ||
                !this.hasEntityCollision(second) ||
                second.instance.hasComponent('minecraft:projectile')
            )
                continue;
            if (!firstVehicleResolved) {
                firstVehicle = this.rides.vehicleOf(firstId);
                firstVehicleResolved = true;
            }
            const secondVehicle = this.rides.vehicleOf(secondId);
            if (firstVehicle === secondId || secondVehicle === firstId) continue;
            if (firstVehicle !== undefined && firstVehicle === secondVehicle) continue;

            const secondPosition = second.position;
            const secondBox = second.facts.box;
            const dx = secondPosition.x - firstPosition.x;
            const dz = secondPosition.z - firstPosition.z;
            const collisionReach = (firstWidth + secondBox.width) / 2;
            if (
                Math.abs(dx) >= collisionReach ||
                Math.abs(dz) >= collisionReach ||
                firstPosition.y >= secondPosition.y + secondBox.height ||
                secondPosition.y >= firstPosition.y + firstHeight
            )
                continue;

            pushableFirst ??= this.isPushable(first);
            const pushableSecond = this.isPushable(second);
            if (!pushableFirst && !pushableSecond) continue;
            const impulse = entityPushImpulse(dx, dz);
            if (impulse === undefined) continue;
            if (pushableFirst) first.body.push({ x: -impulse.x, y: 0, z: -impulse.z });
            if (pushableSecond) second.body.push(impulse);
        }
    }

    /** Whether the entity's active definition lets it collide with entities. */
    private hasEntityCollision(entity: DataEntity): boolean {
        return this.componentFactsOf(entity).hasCollision;
    }

    /**
     * Whether Java's entity type or its active custom component allows pushing.
     *
     * A mob answers from Java's navigation dump. Any other living body is pushable unless its
     * `minecraft:pushable` says otherwise, as `LivingEntity.isPushable` is. A vanilla body that is
     * not living is pushable only as a boat or a minecart, whose `AbstractBoat.isPushable` and
     * `AbstractMinecart.isPushable` return true where `Entity.isPushable` returns false: Bedrock
     * marks a fireball, a trident or an end crystal pushable as well, and Java does not. A pack's
     * own entity type, which Java has no class for, answers from its components.
     */
    private isPushable(entity: DataEntity): boolean {
        // The client pushes its own body; it still pushes mobs it walks into.
        if (clientOwnsMovement(entity.identifier)) return false;
        const java = entity.instance.javaNavigation;
        if (java !== undefined) return java.pushable;

        const facts = this.componentFactsOf(entity);
        const component = entity.instance.componentParams('minecraft:pushable');
        const declared =
            isRecord(component) && typeof component.isPushable === 'boolean' ? component.isPushable : undefined;
        if (facts.movesBeforeGravity) return declared ?? true;
        if (entity.identifier.startsWith(VANILLA_NAMESPACE))
            return facts.families.includes('boat') || facts.families.includes('minecart');
        return (
            declared ??
            (entity.instance.hasComponent('minecraft:pushable_by_entity') ||
                entity.instance.attributes.get('health') !== undefined)
        );
    }

    /**
     * Moves an entity by an offset where its body fits, as a piston carries one: Java's
     * `PistonMovingBlockEntity.moveCollidedEntities` moves it with `MoverType.PISTON`, which
     * collides with the blocks around it. A player's client moves its own body, so it is left alone.
     */
    public carry(id: number, by: EntityPosition): void {
        const entity = this.store.get(id);
        if (entity === undefined || entity.removed !== undefined || clientOwnsMovement(entity.identifier)) return;
        const facts = this.componentFactsOf(entity);
        const navigation = this.navigation();
        const canOccupy = (at: EntityPosition) =>
            !facts.hasCollision || bodyCanOccupy(at, entity.facts.box, navigation, facts.canStandOnPowderSnow);
        let next = entity.position;
        next = moveOnAxis(next, next.x + by.x, 'x', canOccupy);
        next = moveOnAxis(next, next.y + by.y, 'y', canOccupy);
        next = moveOnAxis(next, next.z + by.z, 'z', canOccupy);
        entity.position = next;
    }

    /** Keeps every rider where its vehicle is, which is what being carried means. */
    private carryRiders(vehicle: DataEntity): void {
        for (const rider of this.rides.ridersOf(vehicle.id)) {
            const carried = this.store.get(rider);
            if (carried === undefined) continue;
            carried.position = vehicle.position;
            carried.body.stopMoving();
        }
    }

    /**
     * Gives the player riders of a nautilus or a zombie nautilus Breath of the Nautilus for 60
     * ticks, as Java's `AbstractNautilus.applyEffects` does for its rider wherever the mount is,
     * in water or out: when the rider has none, and again every 40 game ticks. Any other mount
     * with `minecraft:underwater_mount_breathing` gives it only in water, as Bedrock's does.
     */
    private giveRidersBreath(vehicle: DataEntity): void {
        if (
            !ABSTRACT_NAUTILUS.has(vehicle.identifier) &&
            !(
                vehicle.instance.hasComponent('minecraft:underwater_mount_breathing') &&
                vehicle.body.conditions.has('in_water')
            )
        )
            return;
        const renew = this.world.level.gameTime() % NAUTILUS_BREATH_RENEW_TICKS === 0;
        for (const rider of this.rides.ridersOf(vehicle.id)) {
            const carried = this.store.get(rider);
            const player =
                carried === undefined
                    ? this.host.players().some((candidate) => candidate.id === rider)
                    : clientOwnsMovement(carried.identifier);
            if (!player) continue;
            if (!renew && carried?.body.statusEffects.has(NAUTILUS_BREATH) === true) continue;
            this.applyStatusEffectToId(vehicle.instance, rider, {
                id: NAUTILUS_BREATH,
                durationTicks: NAUTILUS_BREATH_TICKS,
                amplifier: 0,
                ambient: true
            });
        }
    }

    /** The `def` of the entity's `minecraft:shooter`, which names what it fires. */
    private shooterDefinitionOf(shooter: MobBody): string | undefined {
        const params = this.store.get(shooter.id)?.instance.componentParams('minecraft:shooter');
        if (!isRecord(params)) return undefined;
        return typeof params.def === 'string' ? params.def : undefined;
    }

    /** Routes an event one entity triggered on another. */
    private route(trigger: OutgoingTrigger, from: EntityInstance): void {
        const source = this.bodyOf(from);
        if (source === undefined) return;
        // Bedrock's engine event that stores an entity in the block it just turned into, as the
        // copper golem does with its statue. Java's `CopperGolem.turnToStatue` discards the golem.
        if (trigger.target === 'block' && trigger.event === SERIALIZE_INTO_BLOCK) {
            this.remove(source.id, 'serialized');
            return;
        }
        this.trigger(source, trigger.event, trigger.target);
    }

    /** Takes an entity out, by the instance the component asking holds. */
    private removeInstance(instance: EntityInstance, reason: string): void {
        const entity = this.byInstance.get(instance);
        if (entity !== undefined) this.remove(entity.id, reason);
    }

    /** Replaces an entity with another type, which `minecraft:transformation` asks for. */
    private transform(instance: EntityInstance, request: TransformRequest): void {
        const entity = this.byInstance.get(instance);
        if (entity === undefined) return;

        const into = LEGACY_ENTITY_IDENTIFIERS.get(request.identifier) ?? request.identifier;
        const replacement = this.spawn(into, entity.position, {
            cause: 'transformed',
            event: request.event
        });
        if (replacement !== undefined) {
            for (const group of request.addGroups) replacement.instance.applyEffects(addGroup(group));
            if (entity.identifier.startsWith('minecraft:zombie_villager'))
                replacement.body.curedBy = entity.body.curedBy;
        }
        this.remove(entity.id, 'transformation');
    }
}

/**
 * Bedrock's legacy names for entity types, which a vanilla file can still write and the client
 * resolves: the pig's `minecraft:transformation` names the zombified piglin by its old
 * `pig_zombie`.
 */
const LEGACY_ENTITY_IDENTIFIERS: ReadonlyMap<string, string> = new Map([
    ['minecraft:pig_zombie', 'minecraft:zombie_pigman']
]);

/** The effects of adding one component group, with nothing else in them. */
const addGroup = (group: string) => ({ ...noEffects('minecraft:transformation'), addGroups: [group] });

/** Fires the optional `minecraft:tameable` event after ownership is recorded. */
const fireTameEvent = (entity: DataEntity, event: string | undefined, target: EventTarget | undefined): void => {
    if (event === undefined) return;
    if (target === undefined || target === 'self') entity.instance.fire(event);
    else entity.instance.raise(event, target, 'minecraft:tameable');
};

/** Adds or clears one environmental condition on an entity's body. */
const setCondition = (conditions: Set<string>, name: string, active: boolean): void => {
    if (active) conditions.add(name);
    else conditions.delete(name);
};

/** Epsilon for checking whether a collision sweep reached its requested coordinate. */
const MOVEMENT_EPSILON = 1e-7;

/** How fast a fired projectile leaves the shooter, from Java's `AbstractArrow` launch velocity. */
const PROJECTILE_SPEED = 1.6;

/** Java's `LivingEntity` gravity, in blocks per tick per tick. */
const GRAVITY = 0.08;

/** Java's vertical air drag, applied after gravity once a tick. */
const VERTICAL_AIR_DRAG = 0.98;

/** The fastest a body moves on each axis in a climbable block, from Java's `LivingEntity.handleOnClimbable`. */
const CLIMB_SPEED = 0.15;

/** The block tag Java's `LivingEntity.onClimbable` reads. */
const CLIMBABLE_TAG = 'minecraft:climbable';

/** The entities Java marks `noPhysics`, which move themselves and fall under no gravity. */
const JAVA_NO_PHYSICS: ReadonlySet<string> = new Set(['minecraft:ender_dragon']);

/**
 * The gravity Java gives a body that is not a living entity, where it differs from the living
 * entity's 0.08, by the Bedrock type it spawns as: each class's `getDefaultGravity`. An end
 * crystal, an area effect cloud and a firework keep `Entity`'s 0.
 */
const JAVA_DEFAULT_GRAVITY: ReadonlyMap<string, number> = new Map([
    // `AbstractMinecart.getDefaultGravity` out of water.
    ...[
        'minecraft:minecart',
        'minecraft:chest_minecart',
        'minecraft:hopper_minecart',
        'minecraft:tnt_minecart',
        'minecraft:command_block_minecart'
    ].map((identifier) => [identifier, 0.04] as const),
    ['minecraft:xp_orb', 0.03],
    ['minecraft:ender_crystal', 0],
    ['minecraft:area_effect_cloud', 0],
    ['minecraft:fireworks_rocket', 0]
]);

/** The block whose cold freezes a living body inside it. */
const POWDER_SNOW = 'minecraft:powder_snow';

/** Java's `Entity.getTicksRequiredToFreeze`: how many ticks of cold freeze a body through. */
const TICKS_REQUIRED_TO_FREEZE = 140;

/** How often `LivingEntity.aiStep` hurts a fully frozen body: when `tickCount % 40` is 0. */
const FREEZE_HURT_INTERVAL = 40;

/** The freezing blow, and the blow on a type in {@link FREEZE_HURTS_EXTRA_TAG}. */
const FREEZE_DAMAGE = 1;
const FREEZE_EXTRA_DAMAGE = 5;

/** Java's entity type tag of the types the cold hurts five times over. */
const FREEZE_HURTS_EXTRA_TAG = 'minecraft:freeze_hurts_extra_types';

/** Java's attribute of how far a living body falls before the landing hurts, and its registry default. */
const SAFE_FALL_DISTANCE = 'minecraft:safe_fall_distance';
const DEFAULT_SAFE_FALL_DISTANCE = 3;

/** Java's attribute that scales fall damage. */
const FALL_DAMAGE_MULTIPLIER = 'minecraft:fall_damage_multiplier';

/** What `LivingEntity.calculateFallPower` adds to a fall, so a fall of exactly a whole block counts it. */
const FALL_EPSILON = 1e-6;

/** The item names a component field holds, one or a list, with the names the files write from before a rename replaced. */
const itemsNamed = (value: unknown): readonly string[] =>
    (Array.isArray(value) ? value : [value]).flatMap((name) =>
        typeof name === 'string' ? [normalizedItemIdentifier(name)] : []
    );

/** How long the Breath of the Nautilus a nautilus gives its rider lasts. */
const NAUTILUS_BREATH_TICKS = 60;
/** `AbstractNautilus.applyEffects` renews its rider's breath every 40 game ticks. */
const NAUTILUS_BREATH_RENEW_TICKS = 40;
const NAUTILUS_BREATH = 'minecraft:breath_of_the_nautilus';
/** The mounts Java's `AbstractNautilus` covers. */
const ABSTRACT_NAUTILUS: ReadonlySet<string> = new Set(['minecraft:nautilus', 'minecraft:zombie_nautilus']);

/** The mobs whose Java `canStandOnFluid` takes lava: `Strider.canStandOnFluid`. */
const LAVA_WALKERS: ReadonlySet<string> = new Set(['minecraft:strider']);

/** The height of the surface a lava source gives a mob that stands on it, `LiquidBlock.STABLE_SHAPE`. */
const LAVA_STABLE_HEIGHT = 0.5;

/** What `Strider.floatStrider` adds to a sunk strider's upward speed each tick. */
const LAVA_FLOAT_SPEED = 0.05;

/**
 * The mobs whose Java class keeps another share of its speed each tick in water than
 * `LivingEntity.getWaterSlowDown`'s 0.8: the polar bear's and skeleton horse's own
 * `getWaterSlowDown`, and the swimmers whose `travel` override scales the velocity by 0.9
 * (`AbstractFish`, `Dolphin`, `Guardian`, `Turtle`, `Axolotl`, `Frog`, `Tadpole`, `Drowned` and
 * `AbstractNautilus`).
 */
const JAVA_WATER_DRAG: ReadonlyMap<string, number> = new Map([
    ['minecraft:polar_bear', 0.98],
    ['minecraft:skeleton_horse', 0.96],
    ...[
        'minecraft:cod',
        'minecraft:salmon',
        'minecraft:pufferfish',
        'minecraft:tropicalfish',
        'minecraft:tadpole',
        'minecraft:dolphin',
        'minecraft:guardian',
        'minecraft:elder_guardian',
        'minecraft:turtle',
        'minecraft:axolotl',
        'minecraft:frog',
        'minecraft:drowned',
        'minecraft:nautilus',
        'minecraft:zombie_nautilus'
    ].map((identifier) => [identifier, 0.9] as const)
]);

/** The share of its horizontal speed an entity keeps each tick in water, by its Java class. */
const javaWaterDrag = (entity: DataEntity): number => JAVA_WATER_DRAG.get(entity.identifier) ?? WATER_DRAG;

/**
 * The mobs that ease their own body toward where they swim rather than have a move control turn
 * it, with the share of the turn left they take each tick: `Squid.aiStep` adds a tenth of the
 * difference to `yBodyRot`.
 */
const JAVA_EASED_TURNS: ReadonlyMap<string, number> = new Map([
    ['minecraft:squid', 0.1],
    ['minecraft:glow_squid', 0.1]
]);

/** The zombies whose pack draws door breaking at spawn, with whether their Java class can break doors at all. */
const JAVA_DOOR_BREAKERS: ReadonlyMap<string, boolean> = new Map([
    ['minecraft:zombie', true],
    ['minecraft:husk', true],
    ['minecraft:zombie_villager', true],
    ['minecraft:zombie_villager_v2', true],
    // Drowned.supportsBreakDoorGoal is false.
    ['minecraft:drowned', false]
]);

/**
 * The melee effects a mob's Java class decides in its own `doHurtTarget`, by the effective local
 * difficulty, where they differ from the effect the pack's `minecraft:attack` declares.
 */
const JAVA_MELEE_EFFECTS: ReadonlyMap<string, (difficulty: number) => EntityStatusEffect | undefined> = new Map([
    // Husk.doHurtTarget: Hunger for 140 ticks per whole point of effective difficulty.
    [
        'minecraft:husk',
        (difficulty: number) => {
            const durationTicks = 140 * Math.trunc(difficulty);
            return durationTicks > 0 ? { id: 'hunger', durationTicks, amplifier: 0 } : undefined;
        }
    ],
    // Java's stray slows only with its arrows; its melee blow adds nothing.
    ['minecraft:stray', () => undefined]
]);

/** The mobs whose Java code slows a fall, and the share of the falling speed they keep each tick. */
const SLOW_FALLERS: ReadonlySet<string> = new Set(['minecraft:chicken', 'minecraft:blaze', 'minecraft:parrot']);
const SLOW_FALL = 0.6;

/** The namespace of the vanilla entity types, whose Java classes decide how they behave. */
const VANILLA_NAMESPACE = 'minecraft:';

/** Bedrock's name for the cobweb. */
const COBWEB = 'minecraft:web';

/** The component a minecart runs along rails with. */
const RAIL_MOVEMENT = 'minecraft:rail_movement';

/** The bubble column block, which pushes and drags what floats in and over it. */
const BUBBLE_COLUMN = 'minecraft:bubble_column';

/**
 * Whether a buoyant body floats in a block, given the liquids its `minecraft:buoyant` lists. A
 * bubble column holds a water source, as Java's `BubbleColumnBlock.getFluidState` answers, so a
 * body that floats in water floats in it too.
 */
const buoyantIn = (liquids: ReadonlySet<string>, identifier: string): boolean =>
    liquids.has(identifier) || (identifier === BUBBLE_COLUMN && liquids.has('minecraft:water'));

/** The horizontal share of a move a cobweb lets through, from Java's `WebBlock.entityInside`. */
const COBWEB_HORIZONTAL_SPEED = 0.25;

/** The vertical share of a move a cobweb lets through, from Java's `WebBlock.entityInside`. */
const COBWEB_VERTICAL_SPEED = 0.05;

/** The fire timeout sunlight maintains until an entity reaches shade, in ticks. */
const DAYLIGHT_BURN_TICKS = 160;

/** The Java block tag of what a landing falling block may take the place of, Java's `canBeReplaced`. */
const REPLACEABLE_TAG = 'minecraft:replaceable';

/** The entity a lightning strike is. */
const LIGHTNING_BOLT = 'minecraft:lightning_bolt';

/** Java's `Entity.thunderHit`: 5 lightning damage, and 8 seconds of fire. */
const LIGHTNING_DAMAGE = 5;
const LIGHTNING_FIRE_TICKS = 160;

/**
 * The types whose Java `thunderHit` override deals no lightning damage of its own and does
 * something else, which the type's damage sensor carries: `Pig.thunderHit` and
 * `Villager.thunderHit` convert the mob, `MushroomCow.thunderHit` changes its variant and
 * `Turtle.thunderHit` kills it. Every other type runs `Entity.thunderHit`'s 5 damage, or an
 * override that calls it, as `Creeper.thunderHit` does before it powers the creeper.
 */
const JAVA_THUNDER_HIT_REPLACED: ReadonlySet<string> = new Set([
    'minecraft:pig',
    'minecraft:villager',
    'minecraft:villager_v2',
    'minecraft:mooshroom',
    'minecraft:turtle'
]);

/** How far Java's `LightningBolt.tick` inflates the bolt's box to find what it strikes. */
const LIGHTNING_REACH = 3;

/** Java's `LightningBolt.life` of 2, run down to below zero, so a bolt with no extra flashes lasts three ticks. */
const LIGHTNING_LIFE_TICKS = 3;

/** The engine event that turns an entity into the block it placed, which the copper golem's statue fires. */
const SERIALIZE_INTO_BLOCK = 'minecraft:serialize_entity';

/** Java's tag of the blocks a leash knot ties to, which `LeashFenceKnotEntity.survives` reads. */
const FENCES_TAG = 'minecraft:fences';

/** Java's entity type tag of the mobs that turn projectiles back, the breeze's. */
const DEFLECTS_PROJECTILES_TAG = 'minecraft:deflects_projectiles';

/** `ProjectileDeflection.REVERSE` scales the projectile's speed by -0.5. */
const REVERSE_SPEED = 0.5;

/** `ProjectileDeflection.REVERSE` turns the projectile 170 degrees plus a draw of up to 20 more. */
const REVERSE_TURN = 170;
const REVERSE_TURN_SPREAD = 20;

/** How far past its box a walking body looks for a wall it is pressed against. */
const WALL_CONTACT = 0.01;

/** Java's tag of the `LeavesBlock`s, which `Ravager.aiStep` breaks. */
const LEAVES_TAG = 'minecraft:leaves';

/** Bedrock's snow layer, Java's `Blocks.SNOW`. */
const SNOW_LAYER = 'minecraft:snow_layer';

/** The blocks `SnowLayerBlock.canSurvive` refuses and accepts whatever their top face. */
const SNOW_CANNOT_SURVIVE_ON_TAG = 'minecraft:snow_layer_cannot_survive_on';
const SNOW_CAN_SURVIVE_ON_TAG = 'minecraft:snow_layer_can_survive_on';

/** The game event an enderman's teleport sends. */
const TELEPORT_EVENT = 'minecraft:teleport';

/** The game event a placed block sends. */
const BLOCK_PLACE_EVENT = 'minecraft:block_place';

/** Java's block tag of the fire blocks, which `Cushion.destroyIfInFire` looks for. */
const FIRE_TAG = 'minecraft:fire';

/** How often a burning entity takes fire damage, in ticks. */
const FIRE_DAMAGE_INTERVAL_TICKS = 20;

/** Java's `Villager` allows two restocks a day, at least this many ticks apart. */
const RESTOCKS_PER_DAY = 2;

/** The Java loot table a piglin's barter rolls, from `PiglinAi.getBarterResponseItems`. */
const JAVA_BARTER_TABLE = 'minecraft:gameplay/piglin_bartering';

/** The component a mob carries while Java's `Zombie.canBreakDoors` or a raid lets it break doors. */
const BREAK_DOOR = 'minecraft:annotation.break_door';

/** `Zombie.finalizeSpawn`'s door-breaking chance, which the special multiplier scales. */
const JAVA_BREAK_DOORS_CHANCE = 0.1;

/** Whether an event node, or a node under it, adds a component group. */
const eventMayAdd = (node: EventNode, group: string): boolean =>
    node.add.includes(group) ||
    node.sequence.some((child) => eventMayAdd(child, group)) ||
    node.firstValid.some((child) => eventMayAdd(child, group)) ||
    node.randomize.some((child) => eventMayAdd(child.node, group));

/** The fox, whose Java class holds one item in its mouth. */
const FOX = 'minecraft:fox';

/** The sulfur cube, whose Java class swallows what it picks up. */
const SULFUR_CUBE = 'minecraft:sulfur_cube';

/** The goal whose `pickup_based_on_chance` marks a mob that rolls Java's `canPickUpLoot`. */
const PICKUP_ITEMS = 'minecraft:behavior.pickup_items';
/** How close another cured villager counts as nearby for the trading discount, in blocks. */
const NEARBY_CURED_RANGE = 16;
/** Java stops a villager from breeding again for five minutes. */
const VILLAGER_BREED_COOLDOWN_TICKS = 6000;
const RESTOCK_GAP_TICKS = 2400;
const TICKS_PER_DAY = 24000;

/** Damage from one fire tick, in half-hearts. */
const FIRE_DAMAGE_AMOUNT = 1;

/** Java's horizontal drag in water, applied once per tick. */
const WATER_DRAG = 0.8;

/** Java's horizontal drag in lava, applied once per tick. */
const LAVA_DRAG = 0.5;

/** Java's vertical drag in either liquid, applied once per tick. */
const FLUID_DRAG = 0.8;

/** Java reduces downward acceleration to one sixteenth in a liquid. */
const FLUID_GRAVITY = GRAVITY / 16;

/** Java's `AbstractBoat.getDefaultGravity`. */
const BUOYANT_GRAVITY = 0.04;

/** Java's boat horizontal damping outside a water column. */
const BUOYANT_DRAG = 0.9;

/** Java damps vertical velocity after applying the water surface impulse. */
const BUOYANT_WATER_VERTICAL_DRAG = 0.75;

/** How far a boat that lands on water sits over the water level less its height, from `AbstractBoat.floatBoat`. */
const BOAT_WATERLINE = 0.101;

/** The waterline fraction `AbstractBoat.floatBoat` uses to counter gravity. */
const BUOYANT_STEADY_FRACTION = 0.65;

/** The `power` a `minecraft:explode` with none declared uses, which is the creeper's. */
const DEFAULT_EXPLOSION_POWER = 3;

/** The identifier a broken block leaves behind. */
const AIR = 'minecraft:air';

/** Java's loot table id for one block, which is where its drops are declared. */
const javaBlockLootIdOf = (identifier: string): string =>
    `minecraft:blocks/${identifier.startsWith('minecraft:') ? identifier.slice('minecraft:'.length) : identifier}`;

/** How many riders an entity's `minecraft:rideable` seats, or none when it carries none. */
const seatCountOf = (vehicle: DataEntity): number => {
    const params = vehicle.instance.componentParams('minecraft:rideable');
    if (params === null || typeof params !== 'object' || !('seatCount' in params)) return 0;
    return typeof params.seatCount === 'number' ? params.seatCount : 0;
};

/** Halfway between two positions, which is where a child is born. */
const midpoint = (from: EntityPosition, to: EntityPosition): EntityPosition => ({
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    z: (from.z + to.z) / 2
});

/**
 * Runs villager work that edits an inventory list in place on a copy, then writes the copy back
 * through the body's setter, so the change is logged once.
 */
const editInventory = <T>(body: MobBody, work: (inventory: string[]) => T): T => {
    const inventory = [...body.inventory];
    const result = work(inventory);
    body.setInventory(inventory);
    return result;
};

export type { EntityFacts };
