/**
 * The 24 entries of `minecraft:sensor_type` in the 26.3 server jar.
 *
 * Every scan rate, range and distance threshold here is the Java constant. Ranges that Java reads
 * off `minecraft:follow_range` are read off {@link BrainMob.attribute} for the same reason.
 */

import type { MemoryModuleType, NearestVisibleLivingEntities } from '../memory.js';
import { MemoryModuleTypes, UNIT, visibleEntities } from '../memory.js';
import type { BrainContext, BrainEntity, BrainItem } from '../world.js';
import { blockContaining, distanceSquared, EntityCondition } from '../world.js';
import { DEFAULT_SCAN_RATE, Sensor } from './sensor.js';

/** Java's `Attributes.FOLLOW_RANGE`, the range every untargeted sensor scans. */
export const FOLLOW_RANGE_ATTRIBUTE = 'minecraft:follow_range';

/** Java's `Attributes.TEMPT_RANGE`, which `TemptingSensor` scans instead. */
export const TEMPT_RANGE_ATTRIBUTE = 'minecraft:tempt_range';

/** A sensor that writes nothing. Java's `DummySensor`, registered as `minecraft:dummy`. */
export class DummySensor extends Sensor {
    public readonly name = 'DummySensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [];

    protected doTick(): void {
        // Java's body is empty too; the registry entry exists so a datapack can name a no-op.
    }
}

/**
 * Java's `NearestLivingEntitySensor`: the base every "what is around me" memory is built on.
 *
 * It writes both `NEAREST_LIVING_ENTITIES`, the distance-sorted list, and
 * `NEAREST_VISIBLE_LIVING_ENTITIES`, the line-of-sight-filtered view over it. Nine other sensors
 * read those two rather than scanning again.
 */
export class NearestLivingEntitySensor extends Sensor {
    public readonly name: string = 'NearestLivingEntitySensor';

    public get requires(): readonly MemoryModuleType<unknown>[] {
        return [MemoryModuleTypes.NEAREST_LIVING_ENTITIES, MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES];
    }

    protected doTick(context: BrainContext): void {
        const range = context.body.attribute(FOLLOW_RANGE_ATTRIBUTE);
        const found = context.world
            .livingEntitiesNear(context.body.position, range, context.body)
            .filter((entity) => entity.alive);
        const sorted = [...found].sort(
            (a, b) =>
                distanceSquared(a.position, context.body.position) - distanceSquared(b.position, context.body.position)
        );
        context.body.brain.setMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES, sorted);
        context.body.brain.setMemory(
            MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES,
            visibleEntities(sorted.filter((entity) => context.world.canSee(context.body, entity)))
        );
    }
}

/**
 * Java's `PlayerSensor`: four player memories from one scan.
 *
 * `NEAREST_PLAYERS` is every player in follow range, `NEAREST_VISIBLE_PLAYER` the closest that
 * passes the non-combat targeting test, and the two attackable memories the closest and the whole
 * list that pass the combat test.
 */
export class PlayerSensor extends Sensor {
    public readonly name = 'PlayerSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [
        MemoryModuleTypes.NEAREST_PLAYERS,
        MemoryModuleTypes.NEAREST_VISIBLE_PLAYER,
        MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYER,
        MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYERS
    ];

    protected doTick(context: BrainContext): void {
        const range = context.body.attribute(FOLLOW_RANGE_ATTRIBUTE);
        const players = context.world
            .players()
            .filter((player) => !player.spectator)
            .filter((player) => distanceSquared(player.position, context.body.position) <= range * range)
            .sort(
                (a, b) =>
                    distanceSquared(a.position, context.body.position) -
                    distanceSquared(b.position, context.body.position)
            );
        const brain = context.body.brain;
        brain.setMemory(MemoryModuleTypes.NEAREST_PLAYERS, players);
        const visible = players.filter((player) => context.world.isTargetable(context.body, player));
        brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_PLAYER, visible[0]);
        const attackable = visible.filter((player) => context.world.isAttackable(context.body, player));
        brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYERS, attackable);
        brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYER, attackable[0]);
    }
}

/** Java's `NearestItemSensor.XZ_RANGE`, `Y_RANGE` and `MAX_DISTANCE_TO_WANTED_ITEM`. */
export const NEAREST_ITEM_RANGES = { xz: 32, y: 16, maxDistanceToWantedItem: 32 };

/** Decides whether a mob wants to pick an item up. Java's `Mob::wantsToPickUp`. */
export type WantsToPickUp = (item: BrainItem, context: BrainContext) => boolean;

/**
 * Java's `NearestItemSensor`: the nearest visible item within 32 blocks the mob wants.
 *
 * Java asks the mob itself through `wantsToPickUp`; this takes the predicate, which is where the
 * piglin's gold rules and the allay's held-item match plug in.
 */
export class NearestItemSensor extends Sensor {
    public readonly name = 'NearestItemSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [MemoryModuleTypes.NEAREST_VISIBLE_WANTED_ITEM];

    public constructor(private readonly wantsToPickUp: WantsToPickUp = () => true) {
        super();
    }

    protected doTick(context: BrainContext): void {
        const maxSqr = NEAREST_ITEM_RANGES.maxDistanceToWantedItem ** 2;
        const nearest = [
            ...context.world.itemEntitiesNear(context.body.position, NEAREST_ITEM_RANGES.xz, NEAREST_ITEM_RANGES.y)
        ]
            .sort(
                (a, b) =>
                    distanceSquared(a.position, context.body.position) -
                    distanceSquared(b.position, context.body.position)
            )
            .find(
                (item) =>
                    this.wantsToPickUp(item.item, context) &&
                    distanceSquared(item.position, context.body.position) <= maxSqr &&
                    context.world.canSee(context.body, item)
            );
        context.body.brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_WANTED_ITEM, nearest);
    }
}

/**
 * Java's `HurtBySensor`: copies the last damage source and its attacker into memory.
 *
 * It is what makes `AnimalPanic` fire, and it forgets the attacker once it dies or leaves.
 */
export class HurtBySensor extends Sensor {
    public readonly name = 'HurtBySensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [
        MemoryModuleTypes.HURT_BY,
        MemoryModuleTypes.HURT_BY_ENTITY
    ];

    protected doTick(context: BrainContext): void {
        const brain = context.body.brain;
        const hurtBy = brain.getMemory(MemoryModuleTypes.HURT_BY);
        if (hurtBy?.entity !== undefined) {
            brain.setMemory(MemoryModuleTypes.HURT_BY_ENTITY, hurtBy.entity);
        }
        const attacker = brain.getMemory(MemoryModuleTypes.HURT_BY_ENTITY);
        if (attacker !== undefined && !attacker.alive) {
            brain.eraseMemory(MemoryModuleTypes.HURT_BY_ENTITY);
        }
    }
}

/** Java's `IsInWaterSensor`: holds the `IS_IN_WATER` unit while the mob is submerged. */
export class IsInWaterSensor extends Sensor {
    public readonly name = 'IsInWaterSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [MemoryModuleTypes.IS_IN_WATER];

    protected doTick(context: BrainContext): void {
        if (context.body.conditions.has(EntityCondition.IN_WATER)) {
            context.body.brain.setMemory(MemoryModuleTypes.IS_IN_WATER, UNIT);
        } else {
            context.body.brain.eraseMemory(MemoryModuleTypes.IS_IN_WATER);
        }
    }
}

/** Java's `AdultSensor`: the nearest visible adult of the body's own type. */
export class AdultSensor extends Sensor {
    public readonly name: string = 'AdultSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [
        MemoryModuleTypes.NEAREST_VISIBLE_ADULT,
        MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES
    ];

    protected doTick(context: BrainContext): void {
        const visible = context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES);
        if (visible === undefined) {
            return;
        }
        context.body.brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_ADULT, this.findAdult(context, visible));
    }

    protected findAdult(context: BrainContext, visible: NearestVisibleLivingEntities): BrainEntity | undefined {
        return visible.findClosest((entity) => entity.type === context.body.type && !entity.baby);
    }
}

/**
 * Java's `AdultSensorAnyType`: the nearest visible adult in `minecraft:followable_friendly_mobs`,
 * whatever its type. Only the happy ghast registers it.
 */
export class AdultSensorAnyType extends AdultSensor {
    public override readonly name = 'AdultSensorAnyType';

    protected override findAdult(
        _context: BrainContext,
        visible: NearestVisibleLivingEntities
    ): BrainEntity | undefined {
        return visible.findClosest(
            (entity) => entity.typeTags.has('minecraft:followable_friendly_mobs') && !entity.baby
        );
    }
}

/**
 * Java's `MobSensor`: holds a boolean memory while a mob matching a test is nearby.
 *
 * The only registration is `armadillo_scare_detected`, built as
 * `new MobSensor(5, Armadillo::isScaredBy, Armadillo::canStayRolledUp, DANGER_DETECTED_RECENTLY, 80)`.
 */
export class MobSensor extends Sensor {
    public readonly name = 'MobSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [MemoryModuleTypes.NEAREST_LIVING_ENTITIES];

    public constructor(
        scanRate: number,
        private readonly mobTest: (context: BrainContext, entity: BrainEntity) => boolean,
        private readonly readyTest: (context: BrainContext) => boolean,
        private readonly toSet: MemoryModuleType<boolean>,
        private readonly memoryTimeToLive: number
    ) {
        super(scanRate);
    }

    protected doTick(context: BrainContext): void {
        if (!this.readyTest(context)) {
            context.body.brain.eraseMemory(this.toSet);
            return;
        }
        const nearby = context.body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES) ?? [];
        if (nearby.some((entity) => this.mobTest(context, entity))) {
            context.body.brain.setMemoryWithExpiry(this.toSet, true, this.memoryTimeToLive);
        }
    }
}

/** Java's `GolemSensor.GOLEM_SCAN_RATE` and `MEMORY_TIME_TO_LIVE`. */
export const GOLEM_SENSOR = { scanRate: 200, memoryTimeToLive: 599 };

/**
 * Java's `GolemSensor`: holds `GOLEM_DETECTED_RECENTLY` for 599 ticks after seeing an iron golem.
 *
 * The 200-tick scan rate and the 599-tick memory overlap by one tick on purpose, so a villager
 * that keeps seeing the golem never drops the memory between scans.
 */
export class GolemSensor extends Sensor {
    public readonly name = 'GolemSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [
        MemoryModuleTypes.NEAREST_LIVING_ENTITIES,
        MemoryModuleTypes.GOLEM_DETECTED_RECENTLY
    ];

    public constructor(scanRate: number = GOLEM_SENSOR.scanRate) {
        super(scanRate);
    }

    protected doTick(context: BrainContext): void {
        const nearby = context.body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES) ?? [];
        if (nearby.some((entity) => entity.type === 'minecraft:iron_golem')) {
            context.body.brain.setMemoryWithExpiry(
                MemoryModuleTypes.GOLEM_DETECTED_RECENTLY,
                true,
                GOLEM_SENSOR.memoryTimeToLive
            );
        }
    }
}

/** The base of the four sensors that pick one entity out of the visible set. */
export abstract class NearestVisibleLivingEntitySensor extends Sensor {
    public abstract readonly name: string;

    protected abstract readonly memoryToSet: MemoryModuleType<BrainEntity>;

    protected abstract isMatchingEntity(context: BrainContext, entity: BrainEntity): boolean;

    public get requires(): readonly MemoryModuleType<unknown>[] {
        return [this.memoryToSet, MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES];
    }

    protected doTick(context: BrainContext): void {
        const visible = context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES);
        context.body.brain.setMemory(
            this.memoryToSet,
            visible?.findClosest((entity) => this.isMatchingEntity(context, entity))
        );
    }
}

/** Java's `AxolotlAttackablesSensor.TARGET_DETECTION_DISTANCE`, and its squared form. */
export const AXOLOTL_TARGET_DETECTION_DISTANCE = 8;

/**
 * Java's `AxolotlAttackablesSensor`: a submerged target within 8 blocks that is either always
 * hostile to axolotls or a hunt target, and only when the hunting cooldown is clear.
 */
export class AxolotlAttackablesSensor extends NearestVisibleLivingEntitySensor {
    public readonly name = 'AxolotlAttackablesSensor';
    protected readonly memoryToSet = MemoryModuleTypes.NEAREST_ATTACKABLE;

    public override get requires(): readonly MemoryModuleType<unknown>[] {
        return [...super.requires, MemoryModuleTypes.HAS_HUNTING_COOLDOWN];
    }

    protected isMatchingEntity(context: BrainContext, entity: BrainEntity): boolean {
        const close = distanceSquared(entity.position, context.body.position) <= AXOLOTL_TARGET_DETECTION_DISTANCE ** 2;
        const hostile = entity.typeTags.has('minecraft:axolotl_always_hostiles');
        const hunt =
            !context.body.brain.hasMemoryValue(MemoryModuleTypes.HAS_HUNTING_COOLDOWN) &&
            entity.typeTags.has('minecraft:axolotl_hunt_targets');
        return (
            close &&
            entity.conditions.has(EntityCondition.IN_WATER) &&
            (hostile || hunt) &&
            context.world.isAttackable(context.body, entity)
        );
    }
}

/** Java's `FrogAttackablesSensor.TARGET_DETECTION_DISTANCE`. */
export const FROG_TARGET_DETECTION_DISTANCE = 10;

/**
 * Java's `FrogAttackablesSensor`: anything in `minecraft:frog_food` within 10 blocks that is not
 * already on the unreachable list.
 */
export class FrogAttackablesSensor extends NearestVisibleLivingEntitySensor {
    public readonly name = 'FrogAttackablesSensor';
    protected readonly memoryToSet = MemoryModuleTypes.NEAREST_ATTACKABLE;

    public override get requires(): readonly MemoryModuleType<unknown>[] {
        return [...super.requires, MemoryModuleTypes.UNREACHABLE_TONGUE_TARGETS];
    }

    protected isMatchingEntity(context: BrainContext, entity: BrainEntity): boolean {
        const unreachable = context.body.brain.getMemory(MemoryModuleTypes.UNREACHABLE_TONGUE_TARGETS) ?? [];
        return (
            context.world.isAttackable(context.body, entity) &&
            entity.typeTags.has('minecraft:frog_food') &&
            !unreachable.includes(entity.id) &&
            distanceSquared(entity.position, context.body.position) <= FROG_TARGET_DETECTION_DISTANCE ** 2
        );
    }
}

/**
 * Java's `VillagerHostilesSensor`: the eleven mob types a villager flees, each with its own
 * distance. The map is the whole content of the class and it is reproduced exactly.
 */
export const VILLAGER_HOSTILE_DISTANCES: ReadonlyMap<string, number> = new Map([
    ['minecraft:drowned', 8],
    ['minecraft:evoker', 12],
    ['minecraft:husk', 8],
    ['minecraft:illusioner', 12],
    ['minecraft:pillager', 15],
    ['minecraft:ravager', 12],
    ['minecraft:vex', 8],
    ['minecraft:vindicator', 10],
    ['minecraft:zoglin', 10],
    ['minecraft:zombie', 8],
    ['minecraft:zombie_villager', 8]
]);

/** Java's `VillagerHostilesSensor`. */
export class VillagerHostilesSensor extends NearestVisibleLivingEntitySensor {
    public readonly name = 'VillagerHostilesSensor';
    protected readonly memoryToSet = MemoryModuleTypes.NEAREST_HOSTILE;

    protected isMatchingEntity(context: BrainContext, entity: BrainEntity): boolean {
        const threshold = VILLAGER_HOSTILE_DISTANCES.get(entity.type);
        return threshold !== undefined && distanceSquared(entity.position, context.body.position) <= threshold ** 2;
    }
}

/** Java's `VillagerBabiesSensor`: every visible baby villager, which is what play tag reads. */
export class VillagerBabiesSensor extends Sensor {
    public readonly name = 'VillagerBabiesSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [MemoryModuleTypes.VISIBLE_VILLAGER_BABIES];

    protected doTick(context: BrainContext): void {
        const visible = context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES);
        context.body.brain.setMemory(
            MemoryModuleTypes.VISIBLE_VILLAGER_BABIES,
            visible?.findAll((entity) => entity.type === 'minecraft:villager' && entity.baby) ?? []
        );
    }
}

/** Java's `SecondaryPoiSensor.SCAN_RATE`, and the box it walks. */
export const SECONDARY_POI_SENSOR = { scanRate: 40, horizontalSearch: 4, verticalSearch: 2 };

/**
 * Java's `SecondaryPoiSensor`: the blocks of a villager profession's secondary point of interest
 * inside a 9 by 5 by 9 box, which is how a farmer finds its farmland.
 */
export class SecondaryPoiSensor extends Sensor {
    public readonly name = 'SecondaryPoiSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [MemoryModuleTypes.SECONDARY_JOB_SITE];

    public constructor(private readonly secondaryPoiBlocks: ReadonlySet<string>) {
        super(SECONDARY_POI_SENSOR.scanRate);
    }

    protected doTick(context: BrainContext): void {
        const center = blockContaining(context.body.position);
        const found: { dimension: string; pos: { x: number; y: number; z: number } }[] = [];
        const { horizontalSearch: h, verticalSearch: v } = SECONDARY_POI_SENSOR;
        for (let x = -h; x <= h; x++) {
            for (let y = -v; y <= v; y++) {
                for (let z = -h; z <= h; z++) {
                    const pos = { x: center.x + x, y: center.y + y, z: center.z + z };
                    if (this.secondaryPoiBlocks.has(context.world.blockAt(pos))) {
                        found.push({ dimension: context.world.dimension, pos });
                    }
                }
            }
        }
        context.body.brain.setMemory(MemoryModuleTypes.SECONDARY_JOB_SITE, found);
    }
}

/** Java's `NearestBedSensor.CACHE_TIMEOUT`, `BATCH_SIZE` and `RATE`. */
export const NEAREST_BED_SENSOR = { cacheTimeout: 40, batchSize: 5, rate: 20, searchRadius: 48 };

/**
 * Java's `NearestBedSensor`: the nearest reachable `minecraft:home` point of interest.
 *
 * It only runs for a baby, which is the one surprising thing about it: an adult villager finds its
 * bed through `AcquirePoi` instead, and this exists so a baby can be herded home without claiming
 * a bed it cannot use.
 */
export class NearestBedSensor extends Sensor {
    public readonly name = 'NearestBedSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [MemoryModuleTypes.NEAREST_BED];

    public constructor() {
        super(NEAREST_BED_SENSOR.rate);
    }

    protected doTick(context: BrainContext): void {
        if (!context.body.baby) {
            return;
        }
        const nearest = context.world
            .pointsOfInterest(
                blockContaining(context.body.position),
                NEAREST_BED_SENSOR.searchRadius,
                (type) => type === 'minecraft:home'
            )
            .slice(0, NEAREST_BED_SENSOR.batchSize)
            .find((poi) => context.body.navigation.canReach({ x: poi.pos.x + 0.5, y: poi.pos.y, z: poi.pos.z + 0.5 }));
        if (nearest !== undefined) {
            context.body.brain.setMemory(MemoryModuleTypes.NEAREST_BED, nearest.pos);
        }
    }
}

/**
 * Java's `TemptingSensor`: the nearest player holding one of the mob's temptations.
 *
 * Four of the 24 sensor types are this class with a different item predicate: `food_temptations`
 * (the animal's own `isFood`), `frog_temptations` (`minecraft:frog_food`), and
 * `nautilus_temptations` (`minecraft:nautilus_food`). The range is `minecraft:tempt_range`, not
 * follow range, and the targeting ignores line of sight.
 */
export class TemptingSensor extends Sensor {
    public readonly name = 'TemptingSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [MemoryModuleTypes.TEMPTING_PLAYER];

    public constructor(private readonly isTemptation: (item: BrainItem, context: BrainContext) => boolean) {
        super();
    }

    /** Java's `TemptingSensor.forAnimal`, which defers to the animal's own `isFood`. */
    public static forAnimal(isFood: (item: BrainItem) => boolean): TemptingSensor {
        return new TemptingSensor((item) => isFood(item));
    }

    /** The `frog_temptations` and `nautilus_temptations` form: one item tag. */
    public static forTag(tag: string): TemptingSensor {
        return new TemptingSensor((item) => item.tags.has(tag));
    }

    protected doTick(context: BrainContext): void {
        const range = context.body.attribute(TEMPT_RANGE_ATTRIBUTE);
        const holding = (player: BrainEntity): boolean =>
            (player.mainHandItem !== undefined && this.isTemptation(player.mainHandItem, context)) ||
            (player.offHandItem !== undefined && this.isTemptation(player.offHandItem, context));
        const nearest = context.world
            .players()
            .filter((player) => !player.spectator)
            .filter((player) => distanceSquared(player.position, context.body.position) <= range * range)
            .filter(holding)
            .sort(
                (a, b) =>
                    distanceSquared(a.position, context.body.position) -
                    distanceSquared(b.position, context.body.position)
            )[0];
        context.body.brain.setMemory(MemoryModuleTypes.TEMPTING_PLAYER, nearest);
    }
}

/**
 * Java's `WardenEntitySensor`: `NearestLivingEntitySensor` plus one extra memory.
 *
 * `NEAREST_ATTACKABLE` goes to the closest targetable player, and only to the closest non-player
 * when there is no player at all. That ordering is why a warden prefers a player standing further
 * away over a mob at its feet.
 */
export class WardenEntitySensor extends NearestLivingEntitySensor {
    public override readonly name = 'WardenEntitySensor';

    public constructor(private readonly canTargetEntity: (context: BrainContext, entity: BrainEntity) => boolean) {
        super();
    }

    public override get requires(): readonly MemoryModuleType<unknown>[] {
        return [
            MemoryModuleTypes.NEAREST_LIVING_ENTITIES,
            MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES,
            MemoryModuleTypes.NEAREST_ATTACKABLE
        ];
    }

    protected override doTick(context: BrainContext): void {
        super.doTick(context);
        const nearby = (context.body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES) ?? []).filter(
            (entity) => this.canTargetEntity(context, entity)
        );
        const target =
            nearby.find((entity) => entity.type === 'minecraft:player') ??
            nearby.find((entity) => entity.type !== 'minecraft:player');
        context.body.brain.setMemory(MemoryModuleTypes.NEAREST_ATTACKABLE, target);
    }
}

/**
 * Java's `BreezeAttackEntitySensor`: `NearestLivingEntitySensor` plus the closest attackable
 * entity that is not a creative or spectator player.
 */
export class BreezeAttackEntitySensor extends NearestLivingEntitySensor {
    public override readonly name = 'BreezeAttackEntitySensor';

    public override get requires(): readonly MemoryModuleType<unknown>[] {
        return [
            MemoryModuleTypes.NEAREST_LIVING_ENTITIES,
            MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES,
            MemoryModuleTypes.NEAREST_ATTACKABLE
        ];
    }

    protected override doTick(context: BrainContext): void {
        super.doTick(context);
        const target = (context.body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES) ?? []).find(
            (entity) => !entity.spectator && context.world.isAttackable(context.body, entity)
        );
        context.body.brain.setMemory(MemoryModuleTypes.NEAREST_ATTACKABLE, target);
    }
}

/** Java's `PiglinAi.REPELLENT_DETECTION_RANGE_HORIZONTAL` and `_VERTICAL`, shared with the hoglin. */
export const REPELLENT_DETECTION_RANGE = { horizontal: 8, vertical: 4 };

/**
 * Java's `PiglinSpecificSensor`: one pass over the visible set that writes ten memories.
 *
 * The nemesis branch reads oddly in the decompiled form and it is worth stating plainly: a wither
 * skeleton or a wither becomes `NEAREST_VISIBLE_NEMESIS` only while no nemesis has been found yet,
 * so the first one wins and later ones fall through to the zombified check.
 */
export class PiglinSpecificSensor extends Sensor {
    public readonly name = 'PiglinSpecificSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [
        MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES,
        MemoryModuleTypes.NEAREST_LIVING_ENTITIES,
        MemoryModuleTypes.NEAREST_VISIBLE_NEMESIS,
        MemoryModuleTypes.NEAREST_TARGETABLE_PLAYER_NOT_WEARING_GOLD,
        MemoryModuleTypes.NEAREST_PLAYER_HOLDING_WANTED_ITEM,
        MemoryModuleTypes.NEAREST_VISIBLE_HUNTABLE_HOGLIN,
        MemoryModuleTypes.NEAREST_VISIBLE_BABY_HOGLIN,
        MemoryModuleTypes.NEAREST_VISIBLE_ADULT_PIGLINS,
        MemoryModuleTypes.NEARBY_ADULT_PIGLINS,
        MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT,
        MemoryModuleTypes.VISIBLE_ADULT_HOGLIN_COUNT,
        MemoryModuleTypes.NEAREST_REPELLENT,
        MemoryModuleTypes.NEAREST_VISIBLE_ZOMBIFIED
    ];

    public constructor(
        private readonly isWearingSafeArmor: (player: BrainEntity) => boolean,
        private readonly isPlayerHoldingLovedItem: (player: BrainEntity) => boolean
    ) {
        super();
    }

    protected doTick(context: BrainContext): void {
        const brain = context.body.brain;
        brain.setMemory(
            MemoryModuleTypes.NEAREST_REPELLENT,
            context.world.findBlock(
                blockContaining(context.body.position),
                REPELLENT_DETECTION_RANGE.horizontal,
                REPELLENT_DETECTION_RANGE.vertical,
                (_block, tags) => tags.has('minecraft:piglin_repellents')
            )
        );

        let nemesis: BrainEntity | undefined;
        let huntableHoglin: BrainEntity | undefined;
        let babyHoglin: BrainEntity | undefined;
        let zombified: BrainEntity | undefined;
        let playerNotWearingGold: BrainEntity | undefined;
        let playerHoldingWantedItem: BrainEntity | undefined;
        let visibleAdultHoglinCount = 0;
        const visibleAdultPiglins: BrainEntity[] = [];

        for (const entity of context.body.brain
            .getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
            ?.findAll(() => true) ?? []) {
            if (entity.type === 'minecraft:hoglin') {
                if (entity.baby) {
                    babyHoglin ??= entity;
                } else {
                    visibleAdultHoglinCount++;
                    if (huntableHoglin === undefined && entity.conditions.has(EntityCondition.CAN_BE_HUNTED)) {
                        huntableHoglin = entity;
                    }
                }
            } else if (entity.type === 'minecraft:piglin_brute') {
                visibleAdultPiglins.push(entity);
            } else if (entity.type === 'minecraft:piglin') {
                if (!entity.baby) {
                    visibleAdultPiglins.push(entity);
                }
            } else if (entity.type === 'minecraft:player') {
                if (playerNotWearingGold === undefined && !this.isWearingSafeArmor(entity)) {
                    playerNotWearingGold = entity;
                }
                if (
                    playerHoldingWantedItem === undefined &&
                    !entity.spectator &&
                    this.isPlayerHoldingLovedItem(entity)
                ) {
                    playerHoldingWantedItem = entity;
                }
            } else if (
                nemesis === undefined &&
                (entity.type === 'minecraft:wither_skeleton' || entity.type === 'minecraft:wither')
            ) {
                nemesis = entity;
            } else if (zombified === undefined && entity.typeTags.has('minecraft:zombified')) {
                zombified = entity;
            }
        }

        brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_NEMESIS, nemesis);
        brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_HUNTABLE_HOGLIN, huntableHoglin);
        brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_BABY_HOGLIN, babyHoglin);
        brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_ZOMBIFIED, zombified);
        brain.setMemory(MemoryModuleTypes.NEAREST_TARGETABLE_PLAYER_NOT_WEARING_GOLD, playerNotWearingGold);
        brain.setMemory(MemoryModuleTypes.NEAREST_PLAYER_HOLDING_WANTED_ITEM, playerHoldingWantedItem);
        brain.setMemory(MemoryModuleTypes.NEARBY_ADULT_PIGLINS, findNearbyAdultPiglins(context));
        brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_ADULT_PIGLINS, visibleAdultPiglins);
        brain.setMemory(MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT, visibleAdultPiglins.length);
        brain.setMemory(MemoryModuleTypes.VISIBLE_ADULT_HOGLIN_COUNT, visibleAdultHoglinCount);
    }
}

/** Java's `PiglinAi.findNearbyAdultPiglins`: adults in the unfiltered nearby list. */
export function findNearbyAdultPiglins(context: BrainContext): readonly BrainEntity[] {
    return (context.body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES) ?? []).filter(
        (entity) => (entity.type === 'minecraft:piglin' && !entity.baby) || entity.type === 'minecraft:piglin_brute'
    );
}

/** Java's `PiglinBruteSpecificSensor`: the two memories a brute needs out of the piglin set. */
export class PiglinBruteSpecificSensor extends Sensor {
    public readonly name = 'PiglinBruteSpecificSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [
        MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES,
        MemoryModuleTypes.NEAREST_VISIBLE_NEMESIS,
        MemoryModuleTypes.NEARBY_ADULT_PIGLINS
    ];

    protected doTick(context: BrainContext): void {
        const nemesis = context.body.brain
            .getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
            ?.findClosest(
                (entity) => entity.type === 'minecraft:wither_skeleton' || entity.type === 'minecraft:wither'
            );
        context.body.brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_NEMESIS, nemesis);
        context.body.brain.setMemory(MemoryModuleTypes.NEARBY_ADULT_PIGLINS, findNearbyAdultPiglins(context));
    }
}

/** Java's `HoglinSpecificSensor`: the piglin and hoglin counts a hoglin uses to decide to flee. */
export class HoglinSpecificSensor extends Sensor {
    public readonly name = 'HoglinSpecificSensor';
    public readonly requires: readonly MemoryModuleType<unknown>[] = [
        MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES,
        MemoryModuleTypes.NEAREST_REPELLENT,
        MemoryModuleTypes.NEAREST_VISIBLE_ADULT_PIGLIN,
        MemoryModuleTypes.NEAREST_VISIBLE_ADULT_HOGLINS,
        MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT,
        MemoryModuleTypes.VISIBLE_ADULT_HOGLIN_COUNT
    ];

    protected doTick(context: BrainContext): void {
        const brain = context.body.brain;
        brain.setMemory(
            MemoryModuleTypes.NEAREST_REPELLENT,
            context.world.findBlock(
                blockContaining(context.body.position),
                REPELLENT_DETECTION_RANGE.horizontal,
                REPELLENT_DETECTION_RANGE.vertical,
                (_block, tags) => tags.has('minecraft:hoglin_repellents')
            )
        );
        const adults =
            brain
                .getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
                ?.findAll(
                    (entity) =>
                        !entity.baby && (entity.type === 'minecraft:piglin' || entity.type === 'minecraft:hoglin')
                ) ?? [];
        const adultPiglins = adults.filter((entity) => entity.type === 'minecraft:piglin');
        const adultHoglins = adults.filter((entity) => entity.type === 'minecraft:hoglin');
        brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_ADULT_PIGLIN, adultPiglins[0]);
        brain.setMemory(MemoryModuleTypes.NEAREST_VISIBLE_ADULT_HOGLINS, adultHoglins);
        brain.setMemory(MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT, adultPiglins.length);
        brain.setMemory(MemoryModuleTypes.VISIBLE_ADULT_HOGLIN_COUNT, adultHoglins.length);
    }
}

/** Java's `Armadillo` scare rules, the only {@link MobSensor} registration. */
export const ARMADILLO_SCARE_SENSOR = { scanRate: 5, memoryTimeToLive: 80 };

/** The 24 registered sensor type names, in registration order. */
export const SENSOR_TYPE_NAMES = [
    'dummy',
    'nearest_items',
    'nearest_living_entities',
    'nearest_players',
    'nearest_bed',
    'hurt_by',
    'villager_hostiles',
    'villager_babies',
    'secondary_pois',
    'golem_detected',
    'armadillo_scare_detected',
    'piglin_specific_sensor',
    'piglin_brute_specific_sensor',
    'hoglin_specific_sensor',
    'nearest_adult',
    'nearest_adult_any_type',
    'axolotl_attackables',
    'food_temptations',
    'frog_temptations',
    'nautilus_temptations',
    'frog_attackables',
    'is_in_water',
    'warden_entity_sensor',
    'breeze_attack_entity_sensor'
] as const;

/** One of the 24 registered sensor type names. */
export type SensorTypeName = (typeof SENSOR_TYPE_NAMES)[number];

/** Re-exported so a sensor's scan rate can be named without importing `sensor.ts`. */
export { DEFAULT_SCAN_RATE };
