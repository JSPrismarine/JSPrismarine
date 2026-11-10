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
 * The camel and the happy ghast run both 1 and 2, which is what
 * `BrainMobDefinition.alsoRunsGoals` is for.
 */
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
    MAX_BLOCK_SENSOR_RADIUS,
    noEffects,
    parseEventTarget
} from '@jsprismarine/entities';
import { liquidStateOf } from '@jsprismarine/block-behaviors';
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
import { entityData } from '@jsprismarine/items';
import type { RecipeBook } from '@jsprismarine/recipes';
import { EXPLOSION_ENTITY_REACH } from '@jsprismarine/engine-systems';
import type {
    BlockQuery,
    GoalBlock,
    GoalItem,
    GoalItemCraft,
    GoalMob,
    GoalPickupOptions,
    GoalWorld,
    NavigationView
} from '@jsprismarine/entity-goals';
import { navigationProfile } from '@jsprismarine/entity-goals';
import type { SpawnRequest, SpawnWorld } from '@jsprismarine/spawning';
import { Spawner, despawnReason } from '@jsprismarine/spawning';
import type { Merchant, MerchantSnapshot } from '@jsprismarine/trading';
import type { EntityView, ItemStack } from '@jsprismarine/predicates';

import type { ContentEntity, ContentItemDrop } from '../../content/world/adapter';
import {
    BLOCK_DROPS,
    FIRE_DAMAGE,
    MOB_DROPS,
    MOB_GRIEFING,
    SPAWN_MOBS,
    TNT_EXPLODES,
    ruleIsOn
} from '../../content/world/gameRules';
import type { ServerContent } from '../../content/ServerContent';
import { bedrockItemDrops } from '../../item/bedrockDrops';
import { dropOfRolledStack } from '../../item/lootStack';
import { itemOfDrop } from '../../inventory/persistence';
import { canBreed, offspringIdentifierOf, offspringOf, spendLove } from './breeding';
import { DataEntity, MobBody, distance } from './DataEntity';
import { EntityIndex } from './entityIndex';
import { detonate } from './explosion';
import {
    MOB_EQUIPMENT_SLOTS,
    mobEquipmentSlotOf,
    rollMobEquipment,
    sameEquipment,
    slotForItem,
    withoutEquipmentSlot
} from '../equipment';
import type { MobEquipmentSlot } from '../equipment';
import { EntityFactsLookup, javaLootIdOf, PLAYER_BOX } from './facts';
import type { EntityFacts } from './facts';
import {
    bodyCanOccupy,
    bodyIntersectsMedia,
    hasLineOfSight as hasBlockLineOfSight,
    isSupported,
    moveOnAxis
} from './collision';
import { actuatorOf, goalMobOf, goalWorldOf, playerGoalMob } from './goalWorld';
import { ENTITY_EYE_HEIGHT_FRACTION, blockPositionOf, entityEyePosition } from './position';
import { brainMobFor } from './brainIdentifiers';
import { brainMobOf, brainWorldOf, tickBrainNavigation } from './brainWorld';
import { entityFilterContextOf } from './filterView';
import type { ContentItemEntity, EntityHostFacts, EntityWorldFacts } from './host';
import { DroppedItems, isDroppedItem } from './droppedItems';
import { EyeOfEnderSignals, isEyeOfEnderSignal } from './eyeOfEnderSignals';
import { itemDropOf } from '../../inventory/persistence';
import { maxStackSizeOf, resistsDamageOf } from '../../item/Item';
import { navigationViewOf } from './navigationView';
import type { CachedNavigationView } from './navigationView';
import type { DataEntityRecord } from './persistence';
import { applyDataEntityRecord, dataEntityRecordFrom, dataEntityRecordOf } from './persistence';
import { EntityStore } from './EntityStore';
import { DamagePipeline } from './damagePipeline';
import type { DamageComputation, DamageCommitResult, DamageIntent, DamageOutcome, DamageRoute } from './damagePipeline';
import { DamageSensingSlot, damageGuards, damageModifiers } from './damageStages';
import { INVULNERABILITY_TICKS } from '../Damage';
import type { HitGrace } from './damageStages';
import { KNOCKBACK_LIFT, knockbackOf } from '../knockback';
import {
    attributeIn,
    attributeNamed,
    bodyFieldValue,
    componentStateIn,
    equipmentInventorySlotsIn,
    identityIn,
    isBodyField,
    linkIn,
    LoggedFieldError,
    propertyIn,
    statusEffectsIn,
    stringsIn
} from './entityFields';
import type { StateEntry } from '../../world/changelog/ChangeEntry';
import type { PlainData, PlainRecord } from '../../world/changelog/PlainData';
import { isPlainRecord, plainOf } from '../../world/changelog/PlainData';
import type { EntityItemInteraction } from './itemInteraction';
import { JAVA_POI_TYPES, PointsOfInterest } from './poi';
import { RideIndex } from './riding';
import type { EntityScene, SpawnOptions } from './scene';
import { merchantFor, professionOf } from './trading';
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
import type { GameEventListener } from '../../world/GameEventListenerRegistry';
import { VOID_DAMAGE, VOID_DEPTH, VOID_INTERVAL } from '../Environment';
import type { StatusEffectInput } from '../StatusEffect';
import { mergeStatusEffect, normalizeStatusEffectId, removeStatusEffectFromMap } from '../StatusEffect';

/** The interval between projectile samples, small enough not to skip a target. */
const PROJECTILE_SWEEP_STEP = 0.25;

/** Vanilla expands a projectile target by this amount before checking a hit. */
const PROJECTILE_HIT_MARGIN = 0.3;

/** Prefix that keeps saved player holders distinct from data-entity identities. */
const PLAYER_LEASH_HOLDER_PREFIX = 'player:';

/** How long a projectile ignores its owner and stays alive, in ticks. */
const PROJECTILE_OWNER_GRACE = 5;
const PROJECTILE_MAX_LIFE = 1200;
/** Java's mob no-despawn distance; a nearby player resets `noActionTime`. */
const MOB_NO_DESPAWN_DISTANCE = 32;
const PROJECTILE_KNOCKBACK = 0.4;
const PROJECTILE_KNOCKBACK_LIFT = 0.1;

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

/** Applies an entity's friction modifier without reversing its remaining momentum. */
const groundDragWithModifier = (drag: number, modifier: number): number =>
    Math.max(0, dragWithModifier(drag, modifier));

/** The immutable recipe facts `craftInto` uses after a book accepts its trial grid. */
interface CraftIntoCandidate {
    readonly recipeId: string;
    readonly consumedPerCraft: number;
    readonly resultCount: number;
}

/** Resolves an entity name through the shared Java-to-Bedrock table and the active content registry. */
const runtimeEntityIdentifierOf = (identifier: string, content: ServerContent): string | undefined =>
    bedrockEntityIdentifierOf(identifier, (candidate) => content.entities.registry.has(candidate));

/** Whether an active data-driven entity accepts the named status effect. */
const acceptsStatusEffect = (entity: EntityInstance, identifier: string): boolean => {
    const immunity = entity.componentParams('minecraft:mob_effect_immunity');
    if (!isRecord(immunity) || !Array.isArray(immunity.mob_effects)) return true;
    const normalized = normalizeStatusEffectId(identifier);
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
    onSpawn?(entity: DataEntity): void;
    /** Called once per entity, after it has left the index. */
    onRemove?(entity: DataEntity, reason: string): void;
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
    /** Entities whose death is running, which refuse every further blow until it ends. */
    private readonly dying = new Set<number>();
    /** The grace period after a hit, by entity, for the blows that keep one. */
    private readonly hitGraces = new Map<number, HitGrace>();
    /** The sensing of the damage run in progress, which the sensor guard and modifier share. */
    private readonly damageSensing: DamageSensingSlot;
    /**
     * Every blow an entity in the store takes runs through this, as intent, guards, modifiers and
     * commit ([ADR 0013](../../../../../docs/adr/0013-vetoable-actions-are-staged.md)). A host
     * adds before-hooks to it.
     */
    public readonly damagePipeline: DamagePipeline;
    /**
     * Where every entity of the dimension stands, this runtime's and the world's legacy ones,
     * which is what makes a neighbor search cheaper than a scan. See ADR 0007.
     */
    public readonly index = new EntityIndex();

    /** The dropped stacks among this runtime's entities, and the system that runs them. */
    public readonly droppedItems: DroppedItems;

    /** The eyes of ender in flight among this runtime's entities, and the system that flies them. */
    public readonly eyesOfEnder: EyeOfEnderSignals;
    /** The entity each `EntityInstance` belongs to, which is how the AI seams resolve a body. */
    private readonly byInstance = new Map<EntityInstance, DataEntity>();
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
    /** The active explode component instance behind each body's ticking fuse. */
    private readonly fuses = new Map<number, FuseState>();
    /** One merchant per trading entity, kept because `persist_trades` means the offers are drawn once. */
    private readonly merchants = new Map<number, Merchant>();
    /** When each trader last restocked, and how often that day. */
    private readonly restocks = new Map<
        number,
        { readonly day: number; readonly count: number; readonly at: number }
    >();
    /** What a save kept of a restored trader, held until its merchant is first built from it. */
    private readonly merchantSnapshots = new Map<number, MerchantSnapshot>();
    /** Who rides whom, which both the rider's and the vehicle's goals read. */
    private readonly rides = new RideIndex();
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
    private readonly onSpawn: (entity: DataEntity) => void;
    private readonly onRemove: (entity: DataEntity, reason: string) => void;
    private readonly gameEvents: EntityRuntimeOptions['gameEvents'];
    private readonly gameEventListeners = new Map<number, EntityGameEventRegistration>();
    private readonly drawId: () => number;
    private facts: EntityFactsLookup | undefined;
    private factsGeneration = -1;
    private spawner: Spawner | undefined;
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
            damagerView: (id: number) => this.mobById(id)?.view(),
            gameRule: (rule: 'fireDamage') => rule === 'fireDamage' && ruleIsOn(this.world.level, FIRE_DAMAGE),
            grace: (id: number) => this.hitGraces.get(id),
            mitigation: (target: DataEntity, intent: DamageIntent) => this.host.damageMitigation?.(target, intent),
            canAttack: (attacker: DataEntity, target: DataEntity) =>
                canEntityAttack(attacker.instance, target.instance),
            resists: (target: DataEntity, cause: string) =>
                isDroppedItem(target) && this.droppedItems.resistsDamage(target, cause)
        };
        this.damageSensing = new DamageSensingSlot(damageReads);
        this.damagePipeline = new DamagePipeline({
            guards: damageGuards(damageReads, this.damageSensing),
            modifiers: damageModifiers(damageReads, this.damageSensing),
            commit: (intent, computation) => this.commitDamage(intent, computation),
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
            solidAt: (position) => {
                const navigation = this.navigation();
                if (navigation.isSolid(position)) return true;
                return navigation.isPassable(position) ? false : undefined;
            },
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
        this.eyesOfEnder = new EyeOfEnderSignals({
            spawn: (identifier, at, options) => this.spawn(identifier, at, options),
            remove: (id, reason) => this.remove(id, reason),
            random: () => this.world.random.nextFloat(),
            playSoundAt: (at, sound) => this.host.playSoundAt?.(at, sound),
            levelEvent: (at, event, data) => this.host.levelEvent?.(at, event, data),
            drop: (at, stack) => void this.droppedItems.spawn(at, { stack })
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

    /** Every live entity, in spawn order. */
    public all(): readonly DataEntity[] {
        return [...this.store.values()];
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
        const entity = this.create(identifier, at, options);
        if (entity === undefined) return undefined;
        options.prepare?.(entity);
        if (
            !this.hasValidFallingBlockData(entity) ||
            !this.droppedItems.isValid(entity) ||
            !this.eyesOfEnder.isValid(entity)
        ) {
            this.remove(entity.id, 'invalid_spawn_data');
            return undefined;
        }

        entity.instance.spawn(options.cause ?? 'spawned', options.event);
        this.syncGameEventListener(entity);
        this.startFuse(entity);
        // Between the spawn event and the body, for the same reason the body comes last. The
        // event is what activates the component group a mob's `minecraft:equipment` usually
        // sits in - a piglin's weapon depends on whether `melee_unit` or `ranged_unit` was
        // added - so a roll before it would find no component, and a roll after the body
        // would leave the client a frame of an empty-handed skeleton.
        this.watchEquipment(entity);
        this.equip(entity);
        // Everything up to here built the entity, so it enters the log with the form it has now.
        this.store.enter(entity, this.savedFormOf(entity));
        // After the spawn event, so the body a client is sent already carries whatever the
        // event added: a baby is born a baby rather than growing into one on the next tick.
        this.onSpawn(entity);
        return entity;
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
     * @param id - The runtime id to give it, which only undoing a removal passes; a restore from
     *   a save draws a new one.
     * @returns The entity, or undefined when no loaded pack declares its type,
     *   in which case the caller restores the saved body the way it always did.
     */
    public restore(record: DataEntityRecord, at: EntityPosition, id?: number): DataEntity | undefined {
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
        this.store.enter(entity, this.savedFormOf(entity));
        this.onSpawn(entity);
        return entity;
    }

    /**
     * The saved form of one live entity, as a change log membership entry carries it: the
     * persistence record and what the actor compound holds beside it, which is also what a
     * client is sent when it first sees the entity.
     *
     * @returns Plain data with the runtime id, the position, the velocity, the record as it would
     *   be written, the tags, the status effects and the vehicle it rides.
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
            throw new LoggedFieldError(`${entity.identifier} ${entity.id} has no plain record`);
        return {
            id: entity.id,
            position: { x: body.position.x, y: body.position.y, z: body.position.z },
            velocity: { x: body.velocity.x, y: body.velocity.y, z: body.velocity.z },
            record: written,
            tags: [...body.tags],
            statusEffects: [...body.statusEffects.values()].map((effect) => ({ ...effect })),
            vehicle: this.rides.vehicleOf(entity.id) ?? null
        };
    }

    /**
     * Adds an entity back from the saved form a membership entry carries, with the runtime id it
     * had. This is the inverse of a removal.
     */
    private reenter(saved: PlainRecord): void {
        const { id, position, velocity, record, tags, statusEffects, vehicle } = saved;
        const restored = record === undefined ? undefined : dataEntityRecordFrom(record);
        const at = bodyFieldValue('position', position ?? null);
        if (typeof id !== 'number' || restored === undefined)
            throw new LoggedFieldError('a membership entry carries no record to add the entity back from');
        const entity = this.restore(restored, at, id);
        if (entity === undefined) throw new LoggedFieldError(`${restored.identifier} ${id} could not be added back`);
        entity.body.restore('velocity', bodyFieldValue('velocity', velocity ?? null));
        entity.body.tags.replace(stringsIn('tags', tags ?? []));
        entity.body.statusEffects.replace(statusEffectsIn(statusEffects ?? []).map((effect) => [effect.id, effect]));
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
            case 'leash': {
                const holder = identityIn(field, value);
                if (holder === undefined) this.leashHolders.delete(entity.id);
                else this.leashHolders.set(entity.id, holder);
                return;
            }
        }
        throw new LoggedFieldError(`no writer for ${field}`);
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

        const id = fixedId ?? this.drawId();

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
            environment: {
                actuator: actuatorOf(body, this),
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
                attributeWritten: (changed, write) =>
                    this.instanceWritten(changed, `attribute:${write.name}`, write.before, write.after),
                propertyWritten: (changed, write) =>
                    this.instanceWritten(changed, `property:${write.name}`, write.before, write.after),
                componentGroupsWritten: (changed, write) =>
                    this.instanceWritten(changed, 'groups', write.before, write.after),
                entitySensorCandidates: (_entity, query) => this.entitySensorCandidates(body, query),
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
        this.store.admit(entity);
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
        const saved = this.store.tickOpen && this.store.hasEntered(entity) ? this.savedFormOf(entity) : undefined;
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
        this.dying.delete(id);
        this.hitGraces.delete(id);
        this.byInstance.delete(entity.instance);
        entity.body.onEquipmentChanged = undefined;
        this.index.remove(entity);
        this.removeGameEventListener(id);
        entity.body.onMove = undefined;
        this.pools.delete(id);
        this.merchants.delete(id);
        this.restocks.delete(id);
        for (const [key, claimants] of this.poiClaims) {
            claimants.delete(id);
            if (claimants.size === 0) this.poiClaims.delete(key);
        }
        this.merchantSnapshots.delete(id);
        this.fallingBlocks.delete(id);
        this.projectiles.delete(id);
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
        const allEntities = this.all();
        const entities =
            shouldTick === undefined ? allEntities : allEntities.filter((entity) => shouldTick(entity.position));
        for (const entity of entities) {
            if (entity.removed !== undefined || this.store.isSkipped(entity.id)) continue;
            if (this.store.broken !== undefined) break;
            // One unit per update (ADR 0015): a throw undoes what this update wrote, skips the
            // entity for the rest of the tick and counts against it, and the pass goes on.
            const outcome = this.store.unit(() => this.updateEntity(entity, tick));
            if (!outcome.failed) {
                this.store.succeeded(entity.id);
                continue;
            }
            this.report(
                `${entity.identifier} ${entity.id} threw in its update, which was undone: ${String(outcome.error)}`
            );
            if (this.store.failed(entity.id) && this.store.broken === undefined)
                this.remove(entity.id, 'update_failed');
        }
        if (this.store.broken !== undefined) return;
        this.runSpawnCycle(tick);
        this.runDespawnCycle(shouldTick);
    }

    /** One entity's update in the entity pass, which {@link EntityRuntime.tickEntities} runs as a unit. */
    private updateEntity(entity: DataEntity, tick: number): void {
        if (isDroppedItem(entity)) {
            this.droppedItems.update(entity);
            return;
        }
        if (isEyeOfEnderSignal(entity)) {
            this.eyesOfEnder.update(entity);
            return;
        }
        this.tickHitGrace(entity.id);
        this.updateMedium(entity);
        this.tickTimers(entity.body);
        if (entity.runsGoals) this.resetNoActionTimeNearPlayers(entity);
        entity.instance.tick(entity.runsGoals);
        this.tickDaylightBurn(entity);
        this.tickVoid(entity);
        if (entity.removed !== undefined) return;
        entity.body.containerCapacity = this.containerCapacityOf(entity.instance);
        this.syncGameEventListener(entity);
        this.index.refreshFamilies(entity);
        this.tickBrain(entity);
        tickBrainNavigation(entity);
        this.coast(entity);
        if (entity.removed !== undefined) return;
        this.step(entity);
        this.updateMedium(entity);
        this.updateGrounded(entity);
        this.tickAreaAttack(entity, tick);
        if (entity.removed !== undefined) return;
        if (this.tickFuse(entity)) return;
        this.carryRiders(entity);
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
        this.interest.invalidateBlockCache();
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
            rules: this.content().spawnRules,
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

        for (const entity of this.all()) {
            if (shouldTick !== undefined && !shouldTick(entity.position)) continue;
            if (!this.pools.has(entity.id)) continue;
            const reason = despawnReason({ position: blockPositionOf(entity.position) }, world);
            if (reason !== undefined) this.remove(entity.id, reason);
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
        const componentFacts: RuntimeComponentFacts = {
            componentToken,
            hasGravity: physicsRecord?.hasGravity === true,
            hasCollision: physicsRecord === undefined || physicsRecord.hasCollision !== false,
            canStandOnPowderSnow: instance.hasComponent('minecraft:can_stand_on_powder_snow'),
            usesUniformAirDrag: instance.hasComponent('minecraft:uses_uniform_air_drag'),
            airDragModifier: typeof airDrag === 'number' ? airDrag : 1,
            frictionModifier: typeof friction === 'number' ? friction : 1,
            bounciness: typeof bounciness === 'number' ? bounciness : 0,
            families: instance.families()
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
        definition.updateActivity(context);
        brain.tick(context);
    }

    /** Refreshes body facts that depend on the sniffer's live position and relationships. */
    private updateBrainConditions(entity: DataEntity): void {
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
    public navigation(): NavigationView {
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
                  this.host.playerView?.(player.id)
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
                if (entity.identifier === 'minecraft:warden')
                    this.recordPointOfInterest('suspicious_location', event.at);
                if (entity.identifier === 'minecraft:allay' && event.event === 'minecraft:note_block_play')
                    this.recordPointOfInterest('noteblock', event.at);
            }
        };
        const remove = this.gameEvents?.add(listener);
        if (remove !== undefined) this.gameEventListeners.set(entity.id, { listener, remove });
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
     * Deals one entity's melee damage to another.
     *
     * A target this index does not hold is a player, and a player's health is
     * the server's rather than the runtime's, so the blow goes out through
     * {@link EntityHostFacts.hurt}. A host that supplies no route for it is
     * told once per swing rather than letting the mob connect with nothing.
     */
    public attack(attacker: MobBody, target: GoalMob): void {
        if (typeof target.id !== 'number') return;
        const damage = attacker.facts.attackDamage;

        const other = this.store.get(target.id);
        const hurtPlayer = this.host.hurt;
        if (other === undefined && hurtPlayer === undefined) {
            this.report(`${attacker.identifier} hit entity ${target.id}, which nothing routes damage to`);
            return;
        }

        const attackerEntity = this.store.get(attacker.id);
        const targetView = target.view();
        if (attackerEntity !== undefined) {
            if (!canEntityAttackView(attackerEntity.instance, targetView)) return;
            attackerEntity.instance.notifyAttack(targetView);
        }

        if (other !== undefined) {
            this.hurt(other, attacker.id, 'entity_attack', damage);
            if (attackerEntity !== undefined) this.applyAttackStatusEffect(attackerEntity, target.id);
            return;
        }

        hurtPlayer?.(target.id, damage, 'entity_attack', attacker.id);
        if (attackerEntity !== undefined) this.applyAttackStatusEffect(attackerEntity, target.id);
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
            } else this.hurt(target, sourceId, cause, damage, { route: 'area_attack' });

            if (params.playAttackSound) this.host.attackSound?.(entity.id);
            entity.instance.notifyAttack(view);
            lastHits.set(id, tick);
        };

        for (const target of this.inBox(queryMin, queryMax)) {
            damageTarget(target.id, target.position, target.facts.box, target.instance.filterContext().self, target);
        }

        for (const player of this.host.players()) {
            if (player.creative === true || player.spectator === true) continue;
            const view = this.host.playerView?.(player.id) ?? this.mobById(player.id)?.view();
            if (view !== undefined) damageTarget(player.id, player.position, PLAYER_ENTITY_BOX, view);
        }
    }

    /** Applies the active attack component's configured effect after a melee hit. */
    private applyAttackStatusEffect(attacker: DataEntity, targetId: number): void {
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

    /** Adds an effect through the host, or updates an indexed body before it is mirrored. */
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
        options: { readonly feedback?: boolean; readonly route?: DamageRoute } = {}
    ): boolean {
        const outcome = this.damage({
            target: entity.id,
            ...(sourceId === undefined ? {} : { attacker: sourceId }),
            cause,
            amount,
            source: {
                route: options.route ?? 'mob_attack',
                ...(options.feedback === undefined ? {} : { feedback: options.feedback })
            }
        });
        return outcome.committed && outcome.taken > 0;
    }

    /**
     * Runs one damage intent through the pipeline: guards, modifiers, then the commit, in which a
     * death runs too. Synchronous, so the blow and any death it caused have happened when this
     * returns.
     */
    public damage(intent: DamageIntent): DamageOutcome {
        this.damageSensing.clear();
        return this.damagePipeline.run(intent);
    }

    /**
     * The commit stage: applies a computed blow through the logged setters.
     *
     * The order is the one the legacy damage pipeline and the runtime kept between them: the
     * grace period, the hurt feedback and the shove, then the health with the sensor's events and
     * the hurt triggers, then the damage record, then the host's observers, then the death.
     */
    private commitDamage(intent: DamageIntent, computation: DamageComputation): DamageCommitResult {
        const sensing = this.damageSensing.of(intent);
        const entity = this.store.get(intent.target);
        if (entity === undefined) return { taken: 0, died: false };
        const source = intent.source;

        let fresh = true;
        if (source.graced === true) {
            const grace = this.hitGraces.get(entity.id);
            fresh = grace === undefined || grace.ticks <= 0 || source.bypassesGrace === true;
            this.hitGraces.set(entity.id, {
                ticks: fresh || grace === undefined ? INVULNERABILITY_TICKS : grace.ticks,
                last: intent.amount
            });
        }

        const absorbed = computation.modifiers.find((modifier) => modifier.name === 'absorption');
        const absorption = entity.instance.attributes.get('absorption');
        if (absorbed !== undefined && absorption !== undefined)
            entity.instance.attributes.set('absorption', absorption.current + absorbed.value);

        const taken = computation.amount;
        if (fresh && taken > 0 && source.feedback !== false) this.host.hurtFeedback?.(entity.id);
        if (fresh && source.knockback !== undefined) this.shove(entity, source.knockback);

        const damager = intent.attacker === undefined ? undefined : this.mobById(intent.attacker)?.view();
        const result = entity.instance.applyDamage(
            { cause: intent.cause, amount: intent.amount, damager },
            taken,
            sensing?.events ?? []
        );
        if (result.amount > 0 && source.remembered !== false) {
            entity.body.damage.record(intent.attacker, intent.cause, result.amount);
            this.lastDamagedAt.set(entity, this.world.level.gameTime());
            this.disablePiglinAdmirationAfterDamage(entity);
        }
        if (result.died) {
            this.dying.add(entity.id);
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
     * Gives health back to one entity, up to its maximum. A dead entity is not healed.
     *
     * @returns Whether any health was restored.
     */
    public heal(id: number, amount: number): boolean {
        const entity = this.store.get(id);
        const health = entity?.instance.attributes.get('health');
        if (entity === undefined || health === undefined || amount <= 0) return false;
        if (health.current <= 0 || health.current >= health.max) return false;

        entity.instance.attributes.set('health', Math.min(health.max, health.current + amount));
        return true;
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
                this.dying.delete(entity.id);
                this.host.startDeathAnimation?.(entity.id);
                return;
            }
            if (this.explodeOnDeath(entity)) return;
        }
        this.kill(entity);
    }

    /** Counts one entity's grace period down, forgetting the last blow when it runs out. */
    private tickHitGrace(id: number): void {
        const grace = this.hitGraces.get(id);
        if (grace === undefined) return;
        if (grace.ticks <= 1) this.hitGraces.delete(id);
        else this.hitGraces.set(id, { ticks: grace.ticks - 1, last: grace.last });
    }

    /**
     * Shoves an entity away from where a blow came from.
     *
     * The damping first, because vanilla's rule is that each shove halves whatever motion the
     * last one left before adding its own. The lift is vanilla's cap, and the runtime's gravity
     * brings the entity back down.
     */
    private shove(entity: DataEntity, knockback: { readonly origin: EntityPosition; readonly levels: number }): void {
        const shove = knockbackOf({
            target: entity.position,
            origin: knockback.origin,
            resistance: entity.facts.knockbackResistance,
            levels: knockback.levels,
            tieBreak: entity.id % 8
        });
        if (shove === undefined) return;

        const carried = entity.body.velocity;
        entity.body.velocity = { x: carried.x * shove.damping, y: carried.y, z: carried.z * shove.damping };
        entity.body.push({
            x: shove.directionX * shove.strength,
            y: KNOCKBACK_LIFT,
            z: shove.directionZ * shove.strength
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
                if (targetPlayer?.creative === true || targetPlayer?.spectator === true) continue;
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
                if (candidate.id === body.id) continue;
                include(candidate.position, candidate.instance.filterContext().self);
            }
        }

        for (const player of this.host.players()) {
            const position = player.position;
            const view = this.host.playerView?.(player.id) ?? {
                id: () => player.id,
                names: (name) => (name === 'is_family' ? ['player'] : name === 'has_tag' ? player.tags : undefined)
            };
            include(position, view);
        }
        return candidates;
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
     * Its flight is read from `minecraft:projectile`; a type without that component is refused
     * instead of leaving a body that can only fall like an ordinary entity.
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

        this.world.effects.playSound(blockPositionOf(source.position), 'random.explode');

        const blast = detonate(this.world, {
            center: source.position,
            power,
            // From the index, within the engine's reach and a block more, which is all it accepts.
            // The same entities in the same order as the whole list it replaced.
            candidates: this.index
                .within(source.position, power * EXPLOSION_ENTITY_REACH + 1)
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

    /** Takes up to `count` items from a stack lying in the world into an entity's inventory. */
    public pickUp(taker: MobBody, item: GoalItem, count = item.count(), options?: GoalPickupOptions): void {
        if (typeof item.id !== 'number') return;
        const taken = this.host.takeItem?.(item.id, count);
        if (taken === undefined) return;
        const entity = this.store.get(taker.id);
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

    /** Equips one picked-up item in its declared slot when that slot is empty. */
    private equipPickedUpItem(taker: MobBody, item: ContentItemDrop): number {
        if (item.count <= 0) return 0;
        const stack = itemOfDrop(item, this.content());
        const slot = stack === null ? 'mainhand' : slotForItem(stack);
        if (taker.equipment[slot] !== undefined) return 0;

        const equipment = { ...taker.equipment };
        equipment[slot] = { ...item, count: 1 };
        taker.setEquipment(equipment);
        return 1;
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
        for (const other of this.all()) {
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
     * `minecraft:entity_born`, which is the event that makes it a baby. Both
     * parents spend their love and start their cooldown.
     */
    public breedWith(parent: MobBody, mate: GoalMob): void {
        const self = this.store.get(parent.id);
        const other = typeof mate.id === 'number' ? this.store.get(mate.id) : undefined;
        if (self === undefined || other === undefined || !canBreed(self, other)) return;

        const content = this.content();
        const child = offspringOf(self, other, (identifier) => runtimeEntityIdentifierOf(identifier, content));
        if (child === undefined) return;

        spendLove(self);
        spendLove(other);
        this.spawn(child.identifier, midpoint(self.position, other.position), {
            cause: 'born',
            ...(child.event === undefined ? {} : { event: child.event })
        });
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
                ...(spawnEgg === undefined ? {} : { spawnEgg })
            }
        );
        if (interaction === false) return { accepted: false };
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
                const offspring = this.spawn(spawnOffspring, entity.position, { cause: 'born' });
                return offspring === undefined ? { accepted: false } : { accepted: true };
            }
            const hasHeldItem = heldItem.count > 0 && heldItem.identifier !== 'minecraft:air';
            if (breed === true) entity.body.loveTicks = 600;
            if (tame?.succeeded === true) {
                this.setOwner(entity.id, owner);
                entity.body.conditions.add('is_tamed');
                fireTameEvent(entity, tame.event, tame.target);
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

    /** The active inventory size, including slots contributed by entity strength. */
    private containerCapacityOf(instance: EntityInstance): number {
        const inventory = instance.componentParams('minecraft:inventory');
        if (!isRecord(inventory) || typeof inventory.inventorySize !== 'number') return 0;
        if (!Number.isSafeInteger(inventory.inventorySize) || inventory.inventorySize < 0) return 0;

        const slotsPerStrength = inventory.additionalSlotsPerStrength;
        const strengthValue = instance.componentParams('minecraft:strength');
        const extraSlots =
            Number.isSafeInteger(slotsPerStrength) && typeof slotsPerStrength === 'number' && slotsPerStrength > 0
                ? (isStrengthParams(strengthValue) ? strengthValue.value : 0) * slotsPerStrength
                : 0;
        const capacity = inventory.inventorySize + extraSlots;
        return Number.isSafeInteger(capacity) ? capacity : 0;
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
        if (canStartAdmiring) {
            const duration =
                isRecord(admireParams) && typeof admireParams.duration === 'number' ? admireParams.duration : 10;
            admireGoldItem(context, Math.ceil(duration * TICKS_PER_SECOND));
        }
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
        const drops = bedrockItemDrops(
            this.content()
                .equipmentLoot.roll(table, {
                    parameterSet: 'barter',
                    parameters: { this_entity: this.lootEntityViewOf(entity) }
                })
                .filter((drop) => drop.count > 0)
                .map(dropOfRolledStack)
        );
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
        if (table !== undefined && ruleIsOn(this.world.level, MOB_DROPS)) this.dropLoot(table, entity.position);
        this.remove(entity.id, 'death');
    }

    /**
     * Gives one entity what its `minecraft:equipment` table rolls.
     *
     * Only on a spawn. {@link EntityRuntime.restore} deliberately does not call this, for the
     * reason it does not re-run the spawn event either: the save already holds what the first
     * roll produced, and rolling again would re-arm a mob a player had disarmed.
     *
     * A component with no `table` is not a mistake - the villager carries one purely to declare
     * that its main hand never drops - so a missing table equips nothing and reports nothing.
     */
    private equip(entity: DataEntity): void {
        const table = entity.instance.equipment()?.table;
        if (table === undefined) return;

        const content = this.content();
        entity.body.setEquipment(
            rollMobEquipment({
                content,
                table,
                itemOf: (drop) => itemOfDrop(drop, content),
                report: (message) => this.report(`${entity.identifier}: ${message}`)
            })
        );
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
     * when something was used, at most {@link RESTOCKS_PER_DAY} times a day and no sooner than
     * {@link RESTOCK_GAP_TICKS} after the last one. A villager with a player at its screen waits.
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
        if (today >= RESTOCKS_PER_DAY || (last !== undefined && now < last.at + RESTOCK_GAP_TICKS)) return;

        merchant.resupply();
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
        if (built !== undefined) this.merchants.set(entity.id, built);
        return built;
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
            this.fuses.delete(entity.id);
            return false;
        }

        if (this.fuses.get(entity.id)?.params !== params) this.startFuse(entity);
        if (entity.body.fuseTicks === undefined) return false;

        entity.body.fuseTicks = Math.max(0, entity.body.fuseTicks - 1);
        if (entity.body.fuseTicks > 0) return false;

        this.explode(entity.body);
        return true;
    }

    /** Keeps sunlight fires alive, extinguishes wet entities, and applies their fire ticks. */
    private tickDaylightBurn(entity: DataEntity): void {
        const { body, instance } = entity;
        const burnsInDaylight = instance.hasComponent('minecraft:burns_in_daylight');
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
            this.fuses.delete(entity.id);
            return;
        }

        const previous = this.fuses.get(entity.id);
        if (previous?.params === params) return;
        this.fuses.set(entity.id, { params });
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

        const buoyant = instance.componentParams('minecraft:buoyant');
        if (isRecord(buoyant)) {
            this.coastBuoyant(entity, buoyant);
            return;
        }

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
            ? WATER_DRAG
            : inLava
              ? LAVA_DRAG
              : primedTnt
                ? TNT_DRAG
                : grounded
                  ? groundDragWithModifier(this.groundFrictionAt(position) * DRAG, componentFacts.frictionModifier)
                  : dragWithModifier(DRAG, componentFacts.airDragModifier);
        const verticalDrag = inFluid
            ? FLUID_DRAG
            : primedTnt
              ? TNT_DRAG
              : dragWithModifier(verticalAirDrag, componentFacts.airDragModifier);
        const bounciness = componentFacts.bounciness;
        const gravity = componentFacts.hasGravity ? (inFluid ? FLUID_GRAVITY : primedTnt ? TNT_GRAVITY : GRAVITY) : 0;

        if (grounded) body.conditions.add('on_ground');
        else body.conditions.delete('on_ground');

        if (!body.airborne && (!componentFacts.hasGravity || grounded)) return;

        const velocity = body.velocity;
        const fallingY = grounded && velocity.y <= 0 ? 0 : velocity.y - gravity;
        const nextY = position.y + (grounded && velocity.y <= 0 ? 0 : fallingY);
        const canOccupy = (at: EntityPosition) =>
            !componentFacts.hasCollision ||
            bodyCanOccupy(at, entity.facts.box, navigation, componentFacts.canStandOnPowderSnow);
        let next = moveOnAxis(position, position.x + velocity.x, 'x', canOccupy);
        const hitHorizontalX = Math.abs(next.x - (position.x + velocity.x)) > MOVEMENT_EPSILON;
        next = moveOnAxis(next, position.z + velocity.z, 'z', canOccupy);
        const hitHorizontalZ = Math.abs(next.z - (position.z + velocity.z)) > MOVEMENT_EPSILON;
        const nextVertical = moveOnAxis(next, nextY, 'y', canOccupy);
        const hitVerticalCollision = Math.abs(nextVertical.y - nextY) > MOVEMENT_EPSILON;
        const horizontalVelocity = {
            x: hitHorizontalX ? (bounciness > 0 ? -velocity.x * bounciness : 0) : velocity.x * horizontalDrag,
            z: hitHorizontalZ ? (bounciness > 0 ? -velocity.z * bounciness : 0) : velocity.z * horizontalDrag
        };

        if (hitVerticalCollision) {
            if (fallingY <= 0) {
                const landed = { ...nextVertical, y: Math.floor(nextVertical.y + MOVEMENT_EPSILON) };
                body.position = landed;
                if (bounciness > 0) {
                    body.velocity = { ...horizontalVelocity, y: -fallingY * bounciness };
                    body.conditions.delete('jumping');
                    body.conditions.delete('on_ground');
                } else {
                    this.land(entity);
                }
                return;
            }

            next = nextVertical;
            body.velocity = { ...horizontalVelocity, y: bounciness > 0 ? -fallingY * bounciness : 0 };
        } else {
            next = nextVertical;
            body.velocity = {
                ...horizontalVelocity,
                y: fallingY * verticalDrag
            };
        }

        body.position = next;
    }

    /** Applies projectile gravity, swept collisions, and the active component's hit actions. */
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
        const from = body.position;
        const velocity = body.velocity;
        const to = { x: from.x + velocity.x, y: from.y + velocity.y, z: from.z + velocity.z };
        const distance = Math.hypot(velocity.x, velocity.y, velocity.z);
        const steps = Math.max(1, Math.ceil(distance / PROJECTILE_SWEEP_STEP));
        const navigation = this.navigation();
        const componentFacts = this.componentFactsOf(entity);
        let lastSafe = from;

        for (let step = 1; step <= steps; step += 1) {
            const fraction = step / steps;
            const at = {
                x: from.x + (to.x - from.x) * fraction,
                y: from.y + (to.y - from.y) * fraction,
                z: from.z + (to.z - from.z) * fraction
            };
            const target = this.projectileTargetAt(entity, at, state);
            if (target !== undefined) {
                const evaded =
                    target instanceof DataEntity &&
                    target.instance.notifyProjectileHit(entity.instance.filterContext().self);
                if (evaded) {
                    state.hitEntities.add(target.id);
                    continue;
                }
                if (this.hitProjectile(entity, target, params, at) && entity.removed !== undefined) return;
            }

            if (
                componentFacts.hasCollision &&
                !bodyCanOccupy(at, entity.facts.box, navigation, componentFacts.canStandOnPowderSnow)
            ) {
                const onHit = isRecord(params.on_hit) ? params.on_hit : {};
                this.applyProjectileHitEffects(onHit, at, false);
                const sound = typeof params.hit_ground_sound === 'string' ? params.hit_ground_sound : undefined;
                if (sound !== undefined) this.world.effects.playSound(blockPositionOf(at), sound);

                if (isRecord(onHit.stick_in_ground)) {
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
        const inFluid = body.conditions.has('in_water') || body.conditions.has('in_lava');
        const inertia = inFluid
            ? typeof params.liquid_inertia === 'number'
                ? params.liquid_inertia
                : 0.6
            : typeof params.air_inertia === 'number'
              ? params.air_inertia
              : typeof params.inertia === 'number'
                ? params.inertia
                : 0.99;
        const gravity = typeof params.gravity === 'number' ? params.gravity : 0.03;
        body.velocity = {
            x: velocity.x * inertia,
            y: (velocity.y - gravity) * inertia,
            z: velocity.z * inertia
        };
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
            if (
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

    /** Runs an entity hit through the damage route and hit actions in its projectile data. */
    private hitProjectile(
        projectile: DataEntity,
        target: DataEntity | ContentEntity,
        params: Record<string, unknown>,
        at: EntityPosition
    ): boolean {
        const onHit = isRecord(params.on_hit) ? params.on_hit : {};
        const impact = isRecord(onHit.impact_damage) ? onHit.impact_damage : undefined;
        let damage = 0;

        if (impact !== undefined && this.projectileFilterAllows(impact.filter, target)) {
            const range = isRecord(impact.damage) ? impact.damage : {};
            const minimum =
                typeof range.min === 'number' ? range.min : typeof range.range_min === 'number' ? range.range_min : 0;
            const maximum =
                typeof range.max === 'number'
                    ? range.max
                    : typeof range.range_max === 'number'
                      ? range.range_max
                      : minimum;
            const powerMultiplier = typeof impact.power_multiplier === 'number' ? impact.power_multiplier : 0;
            if (minimum === 0 && maximum === 0 && powerMultiplier > 0) {
                const speed = Math.hypot(
                    projectile.body.velocity.x,
                    projectile.body.velocity.y,
                    projectile.body.velocity.z
                );
                damage = Math.ceil(speed * powerMultiplier);
                if (projectile.spawnData?.['critical'] === true)
                    damage += this.world.random.nextInt(Math.floor(damage / 2) + 2);
                const power = projectile.spawnData?.['power'];
                if (typeof power === 'number' && power > 0) damage += power * 0.5 + 0.5;
            } else if (maximum >= minimum) {
                damage = minimum + this.world.random.nextInt(Math.floor(maximum - minimum) + 1);
            }

            if (damage > 0) {
                if (target instanceof DataEntity)
                    this.hurt(target, projectile.body.owner, 'projectile', damage, { route: 'projectile' });
                else if (this.host.hurtByProjectile !== undefined)
                    this.host.hurtByProjectile(target.id, damage, projectile.id, projectile.body.owner);
                else this.host.hurt?.(target.id, damage, 'projectile', projectile.body.owner);
            }
        }

        this.projectiles.get(projectile.id)?.hitEntities.add(target.id);
        this.applyProjectileHitEffects(onHit, at, true);
        const sound = typeof params.hit_sound === 'string' ? params.hit_sound : undefined;
        if (sound !== undefined) this.world.effects.playSound(blockPositionOf(at), sound);

        if (impact?.knockback === true && target instanceof DataEntity) {
            const resistance = Math.min(1, Math.max(0, target.facts.knockbackResistance));
            const punch = typeof projectile.spawnData?.['punch'] === 'number' ? projectile.spawnData['punch'] : 0;
            const strength = (PROJECTILE_KNOCKBACK + Math.max(0, punch) * 0.5) * (1 - resistance);
            const flatSpeed = Math.hypot(projectile.body.velocity.x, projectile.body.velocity.z) || 1;
            target.body.push({
                x: (projectile.body.velocity.x / flatSpeed) * strength,
                y: PROJECTILE_KNOCKBACK_LIFT * (1 - resistance),
                z: (projectile.body.velocity.z / flatSpeed) * strength
            });
            target.body.lastPusher = projectile.body.owner;
        } else if (impact?.knockback === true && damage === 0 && !('instance' in target)) {
            const flatSpeed = Math.hypot(projectile.body.velocity.x, projectile.body.velocity.z) || 1;
            this.host.knockback?.(
                target.id,
                projectile.body.velocity.x / flatSpeed,
                projectile.body.velocity.z / flatSpeed,
                PROJECTILE_KNOCKBACK
            );
        }

        const destroyOnHit = impact?.destroy_on_hit === true || onHit.remove_on_hit !== undefined;
        if (destroyOnHit) this.remove(projectile.id, 'projectile_hit_entity');
        return destroyOnHit;
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

    /** Applies the block's configured falling motion and turns it back into a block on landing. */
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
        const fallingY = (velocity.y - gravity) * (1 - drag);
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

        if (!state.fallThrough.has(occupying.identifier)) {
            const landing = { ...target, y: target.y + 1 };
            const resting = this.world.blocks.get(landing);
            if (resting === undefined) return;

            this.remove(entity.id, 'landed');
            if (state.fallThrough.has(resting.identifier)) {
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

        entity.body.velocity = { x: velocity.x * (1 - drag), y: fallingY, z: velocity.z * (1 - drag) };
        entity.body.position = { ...position, y: nextY };
    }

    /** Applies Java's boat float step when the active definition declares buoyancy. */
    private coastBuoyant(entity: DataEntity, buoyant: Record<string, unknown>): void {
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
                    if (block === undefined || !names.has(block.identifier)) continue;
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

        const componentFacts = this.componentFactsOf(entity);
        const navigation = this.navigation();
        const grounded =
            componentFacts.hasCollision &&
            body.velocity.y <= 0 &&
            isSupported(position, box, navigation, componentFacts.canStandOnPowderSnow);
        if (grounded) body.conditions.add('on_ground');
        else body.conditions.delete('on_ground');

        const applyGravity = buoyant.apply_gravity !== false;
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
                    ? groundDragWithModifier(this.groundFrictionAt(position) * DRAG, frictionModifier)
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
            const landed = { ...nextVertical, y: Math.floor(nextVertical.y + MOVEMENT_EPSILON) };
            body.position = landed;
            if (bounciness > 0) {
                body.velocity = { ...horizontalVelocity, y: -nextVelocity.y * bounciness };
                body.conditions.delete('jumping');
                body.conditions.delete('on_ground');
            } else {
                this.land(entity);
            }
            return;
        }

        body.velocity = {
            ...horizontalVelocity,
            y: hitVerticalCollision ? (bounciness > 0 ? -nextVelocity.y * bounciness : 0) : nextVelocity.y
        };
        body.position = nextVertical;
    }

    /** Moves a body along its current waypoint using its active navigation rules. */
    private step(entity: DataEntity): void {
        if (entity.instance.hasComponent('minecraft:projectile') || !entity.body.walking) return;

        const navigation = this.navigation();
        const profile = navigationProfile(entity.instance);
        const componentFacts = this.componentFactsOf(entity);
        const feet = blockPositionOf(entity.position);
        const inLiquid = navigation.isWater(feet) || navigation.isLava(feet);
        const swims = inLiquid && (profile.canSwim || profile.canFloat || profile.isAmphibious);
        const climbs =
            (profile.kind === 'climb' && navigation.isClimbable?.(feet) === true) ||
            (profile.canClimbLadders === true && navigation.isLadder?.(feet) === true);
        entity.step({
            allowVertical: profile.canFly || profile.kind === 'fly' || profile.kind === 'hover' || swims || climbs,
            canJump: profile.canJump,
            stepHeight: profile.stepHeight,
            canOccupy(position: EntityPosition): boolean {
                return (
                    !componentFacts.hasCollision ||
                    bodyCanOccupy(position, entity.facts.box, navigation, profile.canStandOnPowderSnow === true)
                );
            }
        });
    }

    /** Applies Java's horizontal push impulse after this entity has moved for the tick. */
    private pushIntersectingEntity(first: DataEntity): void {
        if (!this.hasEntityCollision(first)) return;

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
            if (firstId === secondId || !this.hasEntityCollision(second)) continue;
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
            const largestDifference = Math.max(Math.abs(dx), Math.abs(dz));
            // Java's Entity.push skips pairs whose horizontal centers are within 0.01 blocks.
            if (largestDifference < 0.01) continue;

            const direction = { x: dx, z: dz };
            const root = Math.sqrt(Math.max(Math.abs(direction.x), Math.abs(direction.z)));
            const scale = Math.min(1, 1 / root);
            const impulse = {
                x: (direction.x / root) * scale * 0.05,
                y: 0,
                z: (direction.z / root) * scale * 0.05
            };
            if (pushableFirst) first.body.push({ x: -impulse.x, y: 0, z: -impulse.z });
            if (pushableSecond) second.body.push(impulse);
        }
    }

    /** Whether the entity's active definition lets it collide with entities. */
    private hasEntityCollision(entity: DataEntity): boolean {
        return this.componentFactsOf(entity).hasCollision;
    }

    /** Whether Java's entity type or its active custom component allows pushing. */
    private isPushable(entity: DataEntity): boolean {
        const java = entity.instance.javaNavigation;
        if (java !== undefined) return java.pushable;

        const component = entity.instance.componentParams('minecraft:pushable');
        if (isRecord(component) && typeof component.isPushable === 'boolean') return component.isPushable;
        return entity.instance.attributes.get('health') !== undefined;
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

        const replacement = this.spawn(request.identifier, entity.position, {
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

/** Java's horizontal drag on an airborne entity, applied once a tick. */
const DRAG = 0.91;

/** Java's vertical air drag, applied after gravity once a tick. */
const VERTICAL_AIR_DRAG = 0.98;

/** Java's default slipperiness for a block the loaded world cannot resolve. */
const DEFAULT_BLOCK_FRICTION = 0.6;

/** The fire timeout sunlight maintains until an entity reaches shade, in ticks. */
const DAYLIGHT_BURN_TICKS = 160;

/** How often a burning entity takes fire damage, in ticks. */
const FIRE_DAMAGE_INTERVAL_TICKS = 20;

/** Java's `Villager` allows two restocks a day, at least this many ticks apart. */
const RESTOCKS_PER_DAY = 2;
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
