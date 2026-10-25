/**
 * Java's `ServerExplosion`, transcribed from the pinned 26.3 jar.
 *
 * A blast is a ray cast, not a sphere. Java fires one ray at every cell on the surface of a
 * 16 by 16 by 16 grid, 1352 of them, each starting with an intensity of
 * `radius * (0.7 + random * 0.6)` and stepping 0.3 blocks at a time. Every block the ray
 * crosses takes `(blastResistance + 0.3) * 0.3` off that intensity and every step takes
 * another 0.22500001, and the ray marks each position it reaches with intensity to spare.
 * That is why a blast carves an irregular hole rather than a ball, why the blocks behind a
 * wall survive, and why one block of water stops what a block of stone does not.
 *
 * Entity damage runs off the same geometry. `getSeenPercent` fires a grid of rays from the
 * entity's own box back at the center and reports the fraction that arrive, so cover grades
 * rather than switching, and both the damage and the knockback are multiplied by it.
 *
 * Nothing here writes a drop or hurts an entity. This package has no item model and no entity
 * model, so {@link explode} returns the hits for the host to apply and calls
 * {@link ExplosionOptions.onBlockDestroyed} for each block before it clears it.
 */

import { bedrockBlockPropertiesOf } from '@jsprismarine/mapping';

import { isFullCube } from './blockRules';
import type { BlockPosition, BlockRef, WorldAccess } from './world';
import { AIR } from './world';

/** The cube of ray origins Java walks, 16 cells on a side. */
export const EXPLOSION_RAY_GRID = 16;

/** How far a ray travels per step, Java's `(double) 0.3F`. */
export const EXPLOSION_RAY_STEP = Math.fround(0.3);

/** What a ray loses per step regardless of what it passes through. */
export const EXPLOSION_RAY_DECAY = Math.fround(0.22500001);

/**
 * The scale on a block's absorption, `(resistance + 0.3) * 0.3`.
 *
 * The same `0.3F` the step length is, which is why Java's step constant reads as
 * 0.30000001192092896, and a separate idea: it is what makes a block with no blast resistance
 * at all still cost a ray 0.09.
 */
export const EXPLOSION_ABSORPTION_SCALE = Math.fround(0.3);

/** The low end of a ray's starting intensity, as a fraction of the radius. */
export const EXPLOSION_INTENSITY_FLOOR = Math.fround(0.7);

/** How much random spread sits on top of {@link EXPLOSION_INTENSITY_FLOOR}. */
export const EXPLOSION_INTENSITY_SPREAD = Math.fround(0.6);

/** How far past its radius a blast reaches entities, and the divisor its damage curve uses. */
export const EXPLOSION_ENTITY_REACH = 2;

/** The multiplier in `ExplosionDamageCalculator.getEntityDamageAmount`. */
export const EXPLOSION_DAMAGE_CURVE = 7;

/** Below this radius `hurtEntities` returns without touching anything. */
export const MIN_EXPLOSION_RADIUS = Math.fround(1.0e-5);

/** A point in world coordinates, with no integer requirement. */
export interface Point {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** An axis-aligned box in world coordinates, Java's `AABB`. */
export interface BoundingBox {
    readonly minX: number;
    readonly minY: number;
    readonly minZ: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly maxZ: number;
}

/**
 * What a blast reads and writes.
 *
 * Narrower than {@link WorldAccess} on purpose: an explosion never schedules a tick, reads a
 * block entity, plays a sound or asks about the weather, so a host can drive one without
 * standing up the rest of the engine. Every {@link WorldAccess} is one of these.
 */
export type ExplosionWorld = Pick<
    WorldAccess,
    'getBlock' | 'setBlock' | 'randomInt' | 'randomFloat' | 'getMinY' | 'getMaxY'
>;

/**
 * An entity a blast may catch, as the ray math needs it.
 *
 * The host fills this in from its own entity model and gets the same object back on the hit,
 * so nothing in this package needs to know what an entity is.
 */
export interface ExplosionEntity {
    /** The collision box, which `getSeenPercent` samples a grid of ray origins over. */
    readonly box: BoundingBox;
    /** Java's `Entity.position()`, the feet, which the distance falloff measures to. */
    readonly position: Point;
    /** Java's `Entity.getEyePosition()`, which the knockback direction points along. */
    readonly eye: Point;
    /** `Attributes.EXPLOSION_KNOCKBACK_RESISTANCE`, 0 to 1, defaulting to 0. */
    readonly knockbackResistance?: number;
    /** `ExplosionDamageCalculator.getKnockbackMultiplier`, defaulting to 1. */
    readonly knockbackMultiplier?: number;
    /** `Entity.ignoreExplosion`: the blast passes over it without hurting or shoving it. */
    readonly immune?: boolean;
}

/** What a blast did to one entity. */
export interface ExplosionHit<T extends ExplosionEntity> {
    /** The entity the host handed in. */
    readonly entity: T;
    /** The fraction of the rays from its box that reached the center, 0 to 1. */
    readonly seen: number;
    /**
     * Half-hearts of damage, Java's `getEntityDamageAmount`.
     *
     * Never below 1 for an entity in range: the curve adds a flat one at the end, so being
     * fully behind a wall still costs half a heart.
     */
    readonly damage: number;
    /** The impulse Java's `Entity.pushFromExplosion` adds to the entity's motion. */
    readonly knockback: Point;
}

/** What to set off, and what the host wants back. */
export interface ExplosionOptions<T extends ExplosionEntity> {
    /** Where the blast starts, in world coordinates rather than block coordinates. */
    readonly center: Point;
    /** Java's radius: TNT is 4, a creeper 3, a charged creeper 6. */
    readonly radius: number;
    /**
     * Everything that might be caught.
     *
     * Filtered here against Java's own range test, so the host may hand in anything within
     * `radius * 2 + 1` of the center and let the blast decide.
     */
    readonly entities?: readonly T[];
    /** Whether blocks come out, which is Java's `DESTROY_WITH_DECAY` against `KEEP`. */
    readonly breaksBlocks?: boolean;
    /**
     * Called for each block about to be cleared, in the order Java shuffled them into.
     *
     * Air is skipped, as `BlockStateBase.onExplosionHit` skips it. This is where a host rolls
     * the block's loot table with an `explosion_radius` of {@link ExplosionOptions.radius}.
     */
    readonly onBlockDestroyed?: (at: BlockPosition, block: BlockRef) => void;
}

/** What one blast came to. */
export interface ExplosionResult<T extends ExplosionEntity> {
    /**
     * Every position a ray reached with intensity to spare, Java's
     * `calculateExplodedPositions`.
     *
     * Air is in here, because Java puts it in: an air position costs a ray nothing and still
     * joins the set, which is what `createFire` later picks over.
     */
    readonly positions: readonly BlockPosition[];
    /** What to do to each entity the blast caught, in the order the host handed them in. */
    readonly hits: readonly ExplosionHit<T>[];
    /** How many positions held a block that was cleared. */
    readonly broken: number;
}

/**
 * How much of a ray one block absorbs, Java's
 * `ExplosionDamageCalculator.getBlockExplosionResistance`.
 *
 * @returns The block's blast resistance, or undefined for air, which costs a ray nothing.
 *   A block the mapping table does not know answers 0, which still costs a ray the flat
 *   `0.3 * 0.3` every non-air block costs.
 */
export const explosionResistanceOf = (block: BlockRef): number | undefined => {
    if (block.name === AIR.name) return undefined;
    return bedrockBlockPropertiesOf(block.name, block.states)?.blastResistance ?? 0;
};

/** Java's `Mth.lerp`. */
const lerp = (t: number, from: number, to: number): number => from + t * (to - from);

/** Java's `isInWorldBounds`, which is the height bounds plus the ±30,000,000 block edge. */
const WORLD_EDGE = 30_000_000;

/**
 * Whether anything solid stands between two points.
 *
 * Java clips against collision shapes with `ClipContext.Block.COLLIDER` and
 * `ClipContext.Fluid.NONE`. Neither edition publishes collision shapes, so this walks the
 * voxels the segment crosses and treats {@link isFullCube} as the only occluder, which is the
 * same approximation the rest of this package makes and the README records. A fence or a slab
 * therefore casts no shadow here, and water casts none in Java either.
 */
const isObstructed = (world: ExplosionWorld, from: Point, to: Point): boolean => {
    let x = Math.floor(from.x);
    let y = Math.floor(from.y);
    let z = Math.floor(from.z);

    const endX = Math.floor(to.x);
    const endY = Math.floor(to.y);
    const endZ = Math.floor(to.z);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const stepZ = Math.sign(dz);

    // How far along the segment the next plane crossing on each axis sits, and how far apart
    // the crossings on that axis are. A zero delta never crosses, hence the infinities.
    let nextX = dx === 0 ? Number.POSITIVE_INFINITY : (stepX > 0 ? x + 1 - from.x : from.x - x) / Math.abs(dx);
    let nextY = dy === 0 ? Number.POSITIVE_INFINITY : (stepY > 0 ? y + 1 - from.y : from.y - y) / Math.abs(dy);
    let nextZ = dz === 0 ? Number.POSITIVE_INFINITY : (stepZ > 0 ? z + 1 - from.z : from.z - z) / Math.abs(dz);

    const spanX = dx === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(dx);
    const spanY = dy === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(dy);
    const spanZ = dz === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(dz);

    for (;;) {
        if (isFullCube(world.getBlock({ x, y, z }))) return true;
        if (x === endX && y === endY && z === endZ) return false;

        if (nextX < nextY && nextX < nextZ) {
            if (nextX > 1) return false;
            x += stepX;
            nextX += spanX;
        } else if (nextY < nextZ) {
            if (nextY > 1) return false;
            y += stepY;
            nextY += spanY;
        } else {
            if (nextZ > 1) return false;
            z += stepZ;
            nextZ += spanZ;
        }
    }
};

/**
 * The fraction of a box that can see a point, Java's `ServerExplosion.getSeenPercent`.
 *
 * The sample spacing is `1 / (side * 2 + 1)` per axis, so a player's box is sampled 3 by 5 by
 * 3 and a cow's 3 by 4 by 3. The x and z samples are nudged inwards by half the leftover so
 * the grid sits centered on the box; Java leaves y alone.
 *
 * @returns 0 for a box with a negative side, which is what Java answers for one.
 */
export const getSeenPercent = (world: ExplosionWorld, center: Point, box: BoundingBox): number => {
    const stepX = 1 / ((box.maxX - box.minX) * 2 + 1);
    const stepY = 1 / ((box.maxY - box.minY) * 2 + 1);
    const stepZ = 1 / ((box.maxZ - box.minZ) * 2 + 1);
    if (stepX < 0 || stepY < 0 || stepZ < 0) return 0;

    const insetX = (1 - Math.floor(1 / stepX) * stepX) / 2;
    const insetZ = (1 - Math.floor(1 / stepZ) * stepZ) / 2;

    let clear = 0;
    let total = 0;

    for (let tx = 0; tx <= 1; tx += stepX) {
        for (let ty = 0; ty <= 1; ty += stepY) {
            for (let tz = 0; tz <= 1; tz += stepZ) {
                const from = {
                    x: lerp(tx, box.minX, box.maxX) + insetX,
                    y: lerp(ty, box.minY, box.maxY),
                    z: lerp(tz, box.minZ, box.maxZ) + insetZ
                };

                if (!isObstructed(world, from, center)) clear += 1;
                total += 1;
            }
        }
    }

    return Math.fround(clear / total);
};

/**
 * Half-hearts of damage, Java's `ExplosionDamageCalculator.getEntityDamageAmount`.
 *
 * `((impact² + impact) / 2) * 7 * reach + 1`, where impact is how close the entity is as a
 * fraction of the reach, times how much of it the blast can see. The flat one at the end is
 * why an entity in range always loses something.
 *
 * @param radius - The blast's radius, not its reach.
 * @param distance - From the center to the entity's feet.
 * @param seen - The exposure {@link getSeenPercent} measured, 0 to 1.
 */
export const explosionDamage = (radius: number, distance: number, seen: number): number => {
    const reach = radius * EXPLOSION_ENTITY_REACH;
    const impact = (1 - distance / reach) * seen;

    return Math.fround(((impact * impact + impact) / 2) * EXPLOSION_DAMAGE_CURVE * reach + 1);
};

/** The resistance slot of a cell no ray has read yet. Air reads back as -1. */
const UNREAD = -2;

/**
 * Every position a ray reached with intensity left, Java's `calculateExplodedPositions`.
 *
 * One ray per cell on the surface of the 16-cube, which is 1352 of them: the interior cells
 * are skipped because their direction is already covered by a surface cell. Each ray draws
 * its own starting intensity, so two blasts of the same radius at the same spot do not carve
 * the same hole.
 *
 * Rays overlap heavily near the center, so a ray's 0.3-block step reads the same block several
 * times over and the 1352 rays read each other's blocks thousands of times. Two flat arrays
 * over the cube a ray can possibly reach hold the resistance already read and whether the
 * position is already marked, which takes a radius-4 blast from about 24,000 block reads down
 * to about 800.
 *
 * @returns The positions in no particular order, air included.
 */
export const calculateExplodedPositions = (
    world: ExplosionWorld,
    center: Point,
    radius: number
): readonly BlockPosition[] => {
    const last = EXPLOSION_RAY_GRID - 1;
    const minY = world.getMinY();
    const maxY = world.getMaxY();

    // A ray cannot outlast `maxIntensity / decay` steps, so every block it can touch sits
    // inside this cube around the center.
    const reach = Math.ceil(((radius * 1.3) / EXPLOSION_RAY_DECAY) * EXPLOSION_RAY_STEP) + 2;
    const span = reach * 2 + 1;
    const originX = Math.floor(center.x) - reach;
    const originY = Math.floor(center.y) - reach;
    const originZ = Math.floor(center.z) - reach;

    // Float32 because Java's `Block.getExplosionResistance` is a float, so the cache rounds
    // the value exactly as the jar holds it.
    const resistances = new Float32Array(span * span * span).fill(UNREAD);
    const marked = new Uint8Array(span * span * span);
    const found: BlockPosition[] = [];

    for (let gridX = 0; gridX < EXPLOSION_RAY_GRID; gridX += 1) {
        for (let gridY = 0; gridY < EXPLOSION_RAY_GRID; gridY += 1) {
            for (let gridZ = 0; gridZ < EXPLOSION_RAY_GRID; gridZ += 1) {
                const onSurface =
                    gridX === 0 || gridX === last || gridY === 0 || gridY === last || gridZ === 0 || gridZ === last;
                if (!onSurface) continue;

                let dirX = Math.fround(Math.fround(Math.fround(gridX / last) * 2) - 1);
                let dirY = Math.fround(Math.fround(Math.fround(gridY / last) * 2) - 1);
                let dirZ = Math.fround(Math.fround(Math.fround(gridZ / last) * 2) - 1);

                const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
                dirX /= length;
                dirY /= length;
                dirZ /= length;

                let intensity = Math.fround(
                    radius *
                        Math.fround(
                            EXPLOSION_INTENSITY_FLOOR +
                                Math.fround(Math.fround(world.randomFloat()) * EXPLOSION_INTENSITY_SPREAD)
                        )
                );

                let x = center.x;
                let y = center.y;
                let z = center.z;

                while (intensity > 0) {
                    const blockX = Math.floor(x);
                    const blockY = Math.floor(y);
                    const blockZ = Math.floor(z);
                    if (blockY < minY || blockY > maxY) break;
                    if (Math.abs(blockX) > WORLD_EDGE || Math.abs(blockZ) > WORLD_EDGE) break;

                    const cellX = blockX - originX;
                    const cellY = blockY - originY;
                    const cellZ = blockZ - originZ;
                    if (cellX < 0 || cellY < 0 || cellZ < 0 || cellX >= span || cellY >= span || cellZ >= span) break;
                    const cell = (cellX * span + cellY) * span + cellZ;

                    let resistance = resistances[cell]!;
                    if (resistance === UNREAD) {
                        resistance = explosionResistanceOf(world.getBlock({ x: blockX, y: blockY, z: blockZ })) ?? -1;
                        resistances[cell] = resistance;
                    }

                    if (resistance >= 0) {
                        intensity = Math.fround(
                            intensity -
                                Math.fround(
                                    Math.fround(resistance + EXPLOSION_ABSORPTION_SCALE) * EXPLOSION_ABSORPTION_SCALE
                                )
                        );
                    }

                    if (intensity > 0 && marked[cell] === 0) {
                        marked[cell] = 1;
                        found.push({ x: blockX, y: blockY, z: blockZ });
                    }

                    x += dirX * EXPLOSION_RAY_STEP;
                    y += dirY * EXPLOSION_RAY_STEP;
                    z += dirZ * EXPLOSION_RAY_STEP;
                    intensity = Math.fround(intensity - EXPLOSION_RAY_DECAY);
                }
            }
        }
    }

    return found;
};

/**
 * Java's `Util.shuffle`, a Fisher-Yates walked from the end.
 *
 * The order only decides which dropped stacks merge with which, and Java shuffles for exactly
 * that reason, but the draw count has to match or every later draw in the same tick shifts.
 */
const shuffle = <T>(items: T[], world: ExplosionWorld): void => {
    for (let index = items.length; index > 1; index -= 1) {
        const other = world.randomInt(index);
        const held = items[index - 1]!;
        items[index - 1] = items[other]!;
        items[other] = held;
    }
};

/** What a blast does to one entity, or undefined when it is out of range or immune. */
const hitOf = <T extends ExplosionEntity>(
    world: ExplosionWorld,
    center: Point,
    radius: number,
    entity: T
): ExplosionHit<T> | undefined => {
    if (entity.immune === true) return undefined;

    const reach = radius * EXPLOSION_ENTITY_REACH;
    const distance = Math.hypot(
        entity.position.x - center.x,
        entity.position.y - center.y,
        entity.position.z - center.z
    );

    const ratio = distance / reach;
    if (ratio > 1) return undefined;

    const awayX = entity.eye.x - center.x;
    const awayY = entity.eye.y - center.y;
    const awayZ = entity.eye.z - center.z;
    const awayLength = Math.hypot(awayX, awayY, awayZ);

    const knockbackMultiplier = entity.knockbackMultiplier ?? 1;
    const seen = getSeenPercent(world, center, entity.box);
    const push = (1 - ratio) * seen * knockbackMultiplier * (1 - (entity.knockbackResistance ?? 0));

    // Java's `Vec3.normalize` answers zero for a zero-length vector, which is what an entity
    // whose eye sits exactly on the center gets: all of the damage and none of the shove.
    const scale = awayLength < 1.0e-4 ? 0 : push / awayLength;

    return {
        entity,
        seen,
        damage: explosionDamage(radius, distance, seen),
        knockback: { x: awayX * scale, y: awayY * scale, z: awayZ * scale }
    };
};

/**
 * Sets a blast off.
 *
 * The order is Java's `ServerExplosion.explode`: the rays are cast first, so the hole does not
 * change what the next ray passes through; then the entities are measured against the world as
 * it still stands, which is why a wall shields you even though it is about to go; then the
 * blocks come out.
 *
 * @returns The positions the rays reached, what to do to each entity, and how many blocks were
 *   cleared. Applying the hits is the host's, because this package has no entity model.
 * @example
 * ```typescript
 * const blast = explode(world, { center: { x: 0.5, y: 64, z: 0.5 }, radius: 4 });
 * for (const hit of blast.hits) hurt(hit.entity, hit.damage);
 * ```
 */
export const explode = <T extends ExplosionEntity>(
    world: ExplosionWorld,
    options: ExplosionOptions<T>
): ExplosionResult<T> => {
    const { center, radius, entities = [], breaksBlocks = true, onBlockDestroyed } = options;

    const positions = calculateExplodedPositions(world, center, radius);

    const hits: ExplosionHit<T>[] = [];
    if (radius >= MIN_EXPLOSION_RADIUS) {
        for (const entity of entities) {
            const hit = hitOf(world, center, radius, entity);
            if (hit !== undefined) hits.push(hit);
        }
    }

    let broken = 0;
    if (breaksBlocks) {
        const order = [...positions];
        shuffle(order, world);

        for (const at of order) {
            const block = world.getBlock(at);
            if (block.name === AIR.name) continue;

            onBlockDestroyed?.(at, block);
            world.setBlock(at, AIR, true);
            broken += 1;
        }
    }

    return { positions, hits, broken };
};
