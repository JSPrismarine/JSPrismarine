/**
 * The seam between a brain and the world it reads from and writes to.
 *
 * Java's behaviors reach straight into `ServerLevel`, `Mob`, `PathNavigation` and `PoiManager`.
 * This package keeps none of those, so everything a behavior or a sensor needs from outside the
 * brain arrives through the three interfaces here: {@link BrainWorld} for the level,
 * {@link BrainMob} for the body, and {@link BrainNavigation} for path following.
 *
 * `src/testWorld.ts` carries a typed double for all three.
 */

import type { Brain } from './brain.js';

/** A position in world space. Java's `Vec3`. */
export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** The size of an entity's box, measured across and up from its feet. */
export interface EntityDimensions {
    /** The width across both horizontal axes. */
    readonly width: number;
    /** The height above the entity's position. */
    readonly height: number;
}

/** An axis-aligned query box, with strict overlap matching Java's `AABB.intersects`. */
export interface EntityBounds {
    readonly min: Vec3;
    readonly max: Vec3;
}

/** Java's `Entity.getBoundingBox().inflate(amount)`. */
export const inflatedEntityBounds = (position: Vec3, dimensions: EntityDimensions, amount: number): EntityBounds => ({
    min: {
        x: position.x - dimensions.width / 2 - amount,
        y: position.y - amount,
        z: position.z - dimensions.width / 2 - amount
    },
    max: {
        x: position.x + dimensions.width / 2 + amount,
        y: position.y + dimensions.height + amount,
        z: position.z + dimensions.width / 2 + amount
    }
});

/** Whether an entity's box strictly intersects a query box, as Java's `AABB.intersects` does. */
export const entityIntersectsBounds = (position: Vec3, dimensions: EntityDimensions, bounds: EntityBounds): boolean => {
    const halfWidth = dimensions.width / 2;
    return (
        position.x - halfWidth < bounds.max.x &&
        position.x + halfWidth > bounds.min.x &&
        position.y < bounds.max.y &&
        position.y + dimensions.height > bounds.min.y &&
        position.z - halfWidth < bounds.max.z &&
        position.z + halfWidth > bounds.min.z
    );
};

/** A whole-block position. Java's `BlockPos`. */
export interface BlockPos {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** A block position qualified by its dimension. Java's `GlobalPos`. */
export interface GlobalPos {
    readonly dimension: string;
    readonly pos: BlockPos;
}

/** The raid facts Java's villager brain reads from its host raid manager. */
export interface VillagerRaidState {
    /** At least one wave has spawned. */
    readonly hasStarted: boolean;
    /** The raid is between waves and its villagers should prepare for the next one. */
    readonly betweenWaves: boolean;
    /** The villagers won and may celebrate. */
    readonly victory: boolean;
}

/** A world effect requested by a villager raid behavior. */
export type VillagerRaidEffect = 'ring_bell' | 'move_to_sky_seeing_spot' | 'celebrate_victory' | 'reset_status';

/**
 * Java's `PositionTracker`: either a fixed block (`BlockPosTracker`) or a moving entity
 * (`EntityTracker`). A walk or look target holds one of these rather than a bare position, which is
 * what lets a mob keep following a target that moves.
 */
export interface PositionTracker {
    /** The position to aim at this tick. */
    currentPosition(): Vec3;
    /** The block the tracker currently occupies. */
    currentBlockPosition(): BlockPos;
    /** The entity being tracked, when the tracker follows one. */
    readonly entity?: BrainEntity;
}

/** Java's `WalkTarget`: where to walk, how fast, and how close counts as arrival. */
export interface WalkTarget {
    readonly target: PositionTracker;
    readonly speedModifier: number;
    readonly closeEnoughDist: number;
}

/**
 * An item as a brain reads it. Brains only ever ask whether an item is in a tag or which item it
 * is, never about its components, so this stays to two fields.
 */
export interface BrainItem {
    /** The item id, such as `minecraft:gold_ingot`. */
    readonly id: string;
    /** Every item tag the item is in, such as `minecraft:piglin_loved`. */
    readonly tags: ReadonlySet<string>;
}

/** An item lying on the ground, as `NearestItemSensor` reads it. */
export interface BrainItemEntity extends BrainEntity {
    readonly item: BrainItem;
    readonly count: number;
}

/**
 * The boolean facts about a mob that Java reads off the concrete mob class rather than off the
 * brain, such as `Armadillo::isScared` or `Camel::refuseToMove`.
 *
 * They live in one set rather than in one accessor each for the same reason
 * `@jsprismarine/entities` keeps its filter view small: one member answers every one of them, and a
 * host that cannot answer one simply leaves it out. {@link EntityCondition} names the ones this
 * package reads.
 */
export type EntityConditions = ReadonlySet<string>;

/** The {@link EntityConditions} members this package reads, with the Java accessor each mirrors. */
export const EntityCondition = {
    /** `Entity::isInWater`. */
    IN_WATER: 'in_water',
    /** `Entity::onGround`. */
    ON_GROUND: 'on_ground',
    /** `Entity::isOnFire`, which is what makes a panicking animal look for water. */
    ON_FIRE: 'on_fire',
    /** `Entity::isPassenger`. */
    PASSENGER: 'passenger',
    /** `LivingEntity::isLeashed`. */
    LEASHED: 'leashed',
    /** `Animal::isInLove`. */
    IN_LOVE: 'in_love',
    /** `AgeableMob::canBreed`. */
    CAN_BREED: 'can_breed',
    /** `TamableAnimal::isTame`, and `AbstractNautilus::isTame`. */
    TAME: 'tame',
    /** `Armadillo::isScared`. */
    SCARED: 'scared',
    /** `Camel::refuseToMove`. */
    REFUSE_TO_MOVE: 'refuse_to_move',
    /** `Camel::isCamelSitting`. */
    SITTING: 'sitting',
    /** `Goat::isScreamingGoat`. */
    SCREAMING: 'screaming',
    /** `Creaking::canMove`. */
    CAN_MOVE: 'can_move',
    /** `Creaking::isActive`. */
    ACTIVE: 'active',
    /** `Piglin::isDancing`. */
    DANCING: 'dancing',
    /** `Piglin::isAdult` negated, and `AgeableMob::isBaby` for the mobs that read it as a flag. */
    ADULT: 'adult',
    /** `Hoglin::canBeHunted`. */
    CAN_BE_HUNTED: 'can_be_hunted',
    /** `Sniffer::canSniff`. */
    CAN_SNIFF: 'can_sniff',
    /** `Sniffer::canDig`. */
    CAN_DIG: 'can_dig',
    /** `Mob::isAggressive`. */
    AGGRESSIVE: 'aggressive'
} as const;

/** One of the {@link EntityCondition} names. */
export type EntityConditionName = (typeof EntityCondition)[keyof typeof EntityCondition];

/**
 * An entity as a brain sees it. Sensors build memories out of these and behaviors read them back,
 * so this is the only entity shape the package knows.
 */
export interface BrainEntity {
    /** A stable identity, used wherever Java stores a `UUID` in a memory. */
    readonly id: string;
    /** The entity type id, such as `minecraft:piglin`. */
    readonly type: string;
    /** The entity type tags, such as `minecraft:axolotl_hunt_targets`. */
    readonly typeTags: ReadonlySet<string>;
    readonly position: Vec3;
    /** Its Java collision box, when the host can provide it. */
    readonly dimensions?: EntityDimensions;
    /** Where its eyes are, when the world can provide that detail. */
    readonly eyePosition?: Vec3;
    readonly alive: boolean;
    readonly baby: boolean;
    readonly spectator: boolean;
    /** A live check for whether combat AI may choose this entity as a target. */
    canBeTargeted?(): boolean;
    /** See {@link EntityConditions}. */
    readonly conditions: EntityConditions;
    readonly mainHandItem?: BrainItem;
    readonly offHandItem?: BrainItem;
    readonly armorItems?: readonly BrainItem[];
}

/** Path following, the one capability a brain needs that `@jsprismarine/entity-goals` also owns. */
export interface BrainNavigation {
    /**
     * Starts walking to a position. Returns false when no path exists, which is what makes
     * `MoveToTargetSink` record `CANT_REACH_WALK_TARGET_SINCE`.
     */
    moveTo(target: Vec3, speedModifier: number): boolean;
    /** Whether the current path is finished or was never started. */
    isDone(): boolean;
    /** Whether the mob has stopped making progress along its path. */
    isStuck(): boolean;
    /** Whether a path to the position exists without starting to follow it. */
    canReach(target: Vec3): boolean;
    stop(): void;
}

/** The body a brain drives. */
export interface BrainMob extends BrainEntity {
    readonly brain: Brain;
    readonly navigation: BrainNavigation;
    /** Writes one of the {@link EntityCondition} flags back, as `Mob::setAggressive` does. */
    setCondition(condition: string, value: boolean): void;
    /** Java's `LookControl::setLookAt`. */
    lookAt(position: Vec3): void;
    /** Java's `JumpControl::jump`. */
    jump(): void;
    /** Java's `Mob::doHurtTarget`, with the swing. */
    attack(target: BrainEntity): void;
    /** Java's `Entity::playSound`, by sound event id. */
    playSound(sound: string): void;
    /** An attribute value, such as `minecraft:follow_range` or `minecraft:tempt_range`. */
    attribute(attribute: string): number;
}

/**
 * What {@link BrainWorld.randomPos} should look for.
 *
 * This one member stands in for Java's whole `ai/util` tree: `LandRandomPos`, `AirRandomPos`,
 * `AirAndWaterRandomPos`, `DefaultRandomPos` and `HoverRandomPos`, nine classes whose only job is
 * to draw a reachable position subject to a medium and a direction.
 */
export interface RandomPosRequest {
    readonly xzRange: number;
    readonly yRange: number;
    /** `land` is `LandRandomPos`, `air` is `AirRandomPos`, `water` is the swimmable draw. */
    readonly medium: 'land' | 'air' | 'water';
    /** Bias the draw away from this position. Java's `getPosAway`. */
    readonly away?: Vec3;
    /** Bias the draw towards this position. Java's `getPosTowards`. */
    readonly towards?: Vec3;
}

/** A claimed or free point of interest, as Java's `PoiManager` reports one. */
export interface PoiRecord {
    readonly pos: BlockPos;
    /** The point of interest type id, such as `minecraft:home`. */
    readonly type: string;
    /** Whether the point of interest still has a free ticket. */
    readonly hasSpace: boolean;
}

/** The level a brain reads. */
export interface BrainWorld {
    /** The dimension id, used to qualify a {@link GlobalPos}. */
    readonly dimension: string;
    /** Java's `ServerLevel::getGameTime`: ticks since the world was created. */
    gameTime(): number;
    /** Java's `ServerLevel::getDayTime`: ticks into the current day, wrapped to the day length. */
    dayTime(): number;
    /** A float in `[0, 1)`. */
    random(): number;
    /** An integer in `[0, bound)`. */
    randomInt(bound: number): number;
    /** Every living entity whose box intersects `exclude`'s box inflated by `radius`, nearest first. */
    livingEntitiesNear(
        center: Vec3,
        radius: number,
        exclude: BrainEntity,
        excludeDimensions?: EntityDimensions
    ): readonly BrainEntity[];
    /** Every player in the level, including ones far away; sensors filter by range themselves. */
    players(): readonly BrainEntity[];
    /** Every dropped item within the given box half-extents of `center`. */
    itemEntitiesNear(center: Vec3, xzRange: number, yRange: number): readonly BrainItemEntity[];
    /** Whether `body` can see `target`, Java's `Mob::hasLineOfSight`. */
    canSee(body: BrainEntity, target: BrainEntity): boolean;
    /**
     * Java's `TargetingConditions.forNonCombat()` test: close enough, visible, and not excluded.
     * Sensors call this for a look or follow target.
     */
    isTargetable(body: BrainEntity, target: BrainEntity): boolean;
    /**
     * Java's `TargetingConditions.forCombat()` test, which adds `Mob::canAttack` and the difficulty
     * and game mode rules on top of {@link BrainWorld.isTargetable}.
     */
    isAttackable(body: BrainEntity, target: BrainEntity): boolean;
    /** Java's `Mob::isWithinMeleeAttackRange`. */
    isWithinMeleeRange(body: BrainEntity, target: BrainEntity): boolean;
    /** The block id at a position, such as `minecraft:note_block`. */
    blockAt(pos: BlockPos): string;
    /** Whether the block at a position has Java's water fluid tag. */
    isWaterAt(pos: BlockPos): boolean;
    /** Every block tag at a position, such as `minecraft:piglin_repellents`. */
    blockTagsAt(pos: BlockPos): ReadonlySet<string>;
    /**
     * Java's `Level::findBlocksInBoxByManhattanDistance`: the nearest block in the box around
     * `center` whose tag set or id satisfies `test`.
     */
    findBlock(
        center: BlockPos,
        xzRange: number,
        yRange: number,
        test: (block: string, tags: ReadonlySet<string>, position: BlockPos) => boolean
    ): BlockPos | undefined;
    /** Whether Java would accept this position as a dry place to stand. */
    canStandAt(position: BlockPos): boolean;
    /** A reachable position matching the request, or `undefined` when the draw found none. */
    randomPos(body: BrainEntity, request: RandomPosRequest): Vec3 | undefined;
    /** Java's `PoiManager::findAll`: points of interest of a type within `radius` of `center`. */
    pointsOfInterest(center: BlockPos, radius: number, type: (type: string) => boolean): readonly PoiRecord[];
    /** Takes a ticket on a point of interest; false when it had no space left. */
    claimPoi(pos: BlockPos, claimant: BrainEntity): boolean;
    /** Releases a ticket taken by {@link BrainWorld.claimPoi}. */
    releasePoi(pos: BlockPos, claimant: BrainEntity): void;
    /** Plays a sound event at a position, for the behaviors whose whole effect is a sound. */
    playSound(sound: string, pos: Vec3): void;
    /** Emits a game event at a position, which is what a warden's vibration listener hears. */
    emitGameEvent(event: string, pos: Vec3, source?: BrainEntity): void;
    /** The block beneath the sniffer's head, or undefined when its host cannot resolve it. */
    snifferDigPosition(body: BrainMob): BlockPos | undefined;
    /** Rolls and drops the sniffer's seed loot at its head. */
    dropSnifferSeed(body: BrainMob): void;
    /** Deals the warden's sonic-boom damage and applies its target effect. */
    sonicBoom(body: BrainMob, target: BrainEntity): void;
    /** Reads the active raid near a villager, if its host tracks one. */
    villagerRaidState(body: BrainMob): VillagerRaidState | undefined;
    /** Performs a world-owned effect requested by a villager raid behavior. */
    villagerRaidEffect(body: BrainMob, effect: VillagerRaidEffect): void;
}

/** Everything one brain tick needs. Every behavior and sensor takes exactly this. */
export interface BrainContext {
    readonly world: BrainWorld;
    readonly body: BrainMob;
}

/** Squared distance between two positions. */
export function distanceSquared(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

/** Java's `BlockPos::distManhattan`, which is what decides a walk target is close enough. */
export function distanceManhattan(a: BlockPos, b: BlockPos): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

/**
 * Java's `BlockPos.withinBoxByManhattanDistance` position order.
 *
 * Each Manhattan shell visits x from negative to positive, then y from negative
 * to positive, and z positive before its negative mirror. Callers can stop the
 * iterator at the first matching block without allocating the whole search box.
 *
 * @param center - The block at the center of the search.
 * @param xzRange - The horizontal extent in both x and z.
 * @param yRange - The vertical extent.
 */
export function* blockPositionsInManhattanOrder(
    center: BlockPos,
    xzRange: number,
    yRange: number
): Generator<BlockPos> {
    const maxDepth = xzRange * 2 + yRange;
    for (let depth = 0; depth <= maxDepth; depth += 1) {
        const maxX = Math.min(xzRange, depth);
        for (let dx = -maxX; dx <= maxX; dx += 1) {
            const maxY = Math.min(yRange, depth - Math.abs(dx));
            for (let dy = -maxY; dy <= maxY; dy += 1) {
                const dz = depth - Math.abs(dx) - Math.abs(dy);
                if (dz > xzRange) continue;
                yield { x: center.x + dx, y: center.y + dy, z: center.z + dz };
                if (dz > 0) yield { x: center.x + dx, y: center.y + dy, z: center.z - dz };
            }
        }
    }
}

/** Java's `BlockPos.containing`: the block a position falls inside. */
export function blockContaining(position: Vec3): BlockPos {
    return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

/** Java's `Vec3.atBottomCenterOf`: the center of a block's bottom face. */
export function bottomCenterOf(pos: BlockPos): Vec3 {
    return { x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 };
}

/** A {@link PositionTracker} over a fixed block. Java's `BlockPosTracker`. */
export function blockPosTracker(pos: BlockPos): PositionTracker {
    const position = bottomCenterOf(pos);
    return {
        currentPosition: () => position,
        currentBlockPosition: () => pos
    };
}

/** A {@link PositionTracker} that follows an entity. Java's `EntityTracker`. */
export function entityTracker(entity: BrainEntity): PositionTracker {
    return {
        currentPosition: () => entity.position,
        currentBlockPosition: () => blockContaining(entity.position),
        entity
    };
}

/** Builds a {@link WalkTarget} over a block, a position, an entity or a tracker. */
export function walkTarget(
    target: PositionTracker | BrainEntity | Vec3,
    speedModifier: number,
    closeEnoughDist: number
): WalkTarget {
    return { target: toPositionTracker(target), speedModifier, closeEnoughDist };
}

/** Coerces the three shapes Java's `WalkTarget` constructors accept into a tracker. */
export function toPositionTracker(target: PositionTracker | BrainEntity | Vec3): PositionTracker {
    if ('currentPosition' in target) {
        return target;
    }
    if ('id' in target) {
        return entityTracker(target);
    }
    return blockPosTracker(blockContaining(target));
}
