import type { NavigationView } from '@jsprismarine/entity-goals';
import type { EntityPosition } from '@jsprismarine/entities';

import type { EntityBox } from './facts';

/** Small inset that keeps a box resting exactly on a block face out of that block. */
const COLLISION_EPSILON = 1e-7;

/** The furthest one collision check advances along an axis, in blocks. */
const MAX_COLLISION_STEP = 0.2;

/**
 * Whether the entity's collision box fits in passable cells at a position.
 * @param canStandOnPowderSnow - Whether powder snow counts as a collision surface.
 */
export const bodyCanOccupy = (
    position: EntityPosition,
    box: EntityBox,
    navigation: NavigationView,
    canStandOnPowderSnow = false
): boolean => {
    const minX = Math.floor(position.x - box.width / 2 + COLLISION_EPSILON);
    const maxX = Math.floor(position.x + box.width / 2 - COLLISION_EPSILON);
    const minY = Math.floor(position.y + COLLISION_EPSILON);
    const maxY = Math.floor(position.y + box.height - COLLISION_EPSILON);
    const minZ = Math.floor(position.z - box.width / 2 + COLLISION_EPSILON);
    const maxZ = Math.floor(position.z + box.width / 2 - COLLISION_EPSILON);

    for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
            for (let z = minZ; z <= maxZ; z += 1) {
                const at = { x, y, z };
                if (
                    !navigation.isPassable(at) ||
                    (canStandOnPowderSnow && navigation.blockAt(at) === 'minecraft:powder_snow')
                )
                    return false;
            }
        }
    }

    return true;
};

/**
 * Checks whether a body intersects water and lava in one scan of its bounds.
 * @param containsWater - The active world's water classifier.
 * @param containsLava - The active world's lava classifier.
 * @returns Whether the body intersects water, then lava.
 */
export const bodyIntersectsMedia = (
    position: EntityPosition,
    box: EntityBox,
    containsWater: (block: EntityPosition) => boolean,
    containsLava: (block: EntityPosition) => boolean
): readonly [water: boolean, lava: boolean] => {
    const minX = Math.floor(position.x - box.width / 2 + COLLISION_EPSILON);
    const maxX = Math.floor(position.x + box.width / 2 - COLLISION_EPSILON);
    const minY = Math.floor(position.y + COLLISION_EPSILON);
    const maxY = Math.floor(position.y + box.height - COLLISION_EPSILON);
    const minZ = Math.floor(position.z - box.width / 2 + COLLISION_EPSILON);
    const maxZ = Math.floor(position.z + box.width / 2 - COLLISION_EPSILON);

    let water = false;
    let lava = false;
    outer: for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
            for (let z = minZ; z <= maxZ; z += 1) {
                const at = { x, y, z };
                if (!water) water = containsWater(at);
                if (!lava) lava = containsLava(at);
                if (water && lava) break outer;
            }
        }
    }

    return [water, lava];
};

/**
 * Whether a line between two eye positions crosses a solid block.
 *
 * Walks the crossed block cells directly, stopping before the target's cell so
 * the target's own collision box does not hide it from view.
 * @param from - The observer's eye position.
 * @param to - The target's eye position.
 * @param navigation - The current block view.
 * @returns Whether no crossed cell blocks the view.
 */
export const hasLineOfSight = (
    from: EntityPosition,
    to: EntityPosition,
    navigation: Pick<NavigationView, 'isSolid'>
): boolean => {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const deltaZ = to.z - from.z;
    if (![from.x, from.y, from.z, to.x, to.y, to.z].every(Number.isFinite)) return false;

    let x = Math.floor(from.x);
    let y = Math.floor(from.y);
    let z = Math.floor(from.z);
    const targetX = Math.floor(to.x);
    const targetY = Math.floor(to.y);
    const targetZ = Math.floor(to.z);
    if (x === targetX && y === targetY && z === targetZ) return true;

    const stepX = Math.sign(deltaX);
    const stepY = Math.sign(deltaY);
    const stepZ = Math.sign(deltaZ);
    const deltaDistanceX = deltaX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / deltaX);
    const deltaDistanceY = deltaY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / deltaY);
    const deltaDistanceZ = deltaZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / deltaZ);
    let nextX = stepX === 0 ? Number.POSITIVE_INFINITY : ((stepX > 0 ? x + 1 : x) - from.x) / deltaX;
    let nextY = stepY === 0 ? Number.POSITIVE_INFINITY : ((stepY > 0 ? y + 1 : y) - from.y) / deltaY;
    let nextZ = stepZ === 0 ? Number.POSITIVE_INFINITY : ((stepZ > 0 ? z + 1 : z) - from.z) / deltaZ;

    while (x !== targetX || y !== targetY || z !== targetZ) {
        const next = Math.min(nextX, nextY, nextZ);
        if (next > 1) return true;

        const tolerance = Number.EPSILON * Math.max(1, Math.abs(next)) * 8;
        if (nextX <= next + tolerance) {
            x += stepX;
            nextX += deltaDistanceX;
        }
        if (nextY <= next + tolerance) {
            y += stepY;
            nextY += deltaDistanceY;
        }
        if (nextZ <= next + tolerance) {
            z += stepZ;
            nextZ += deltaDistanceZ;
        }

        if (x === targetX && y === targetY && z === targetZ) return true;
        if (navigation.isSolid({ x, y, z })) return false;
    }

    return true;
};

/**
 * Whether an entity with level feet is supported by at least one solid block.
 * @param canStandOnPowderSnow - Whether powder snow can support the entity.
 */
export const isSupported = (
    position: EntityPosition,
    box: EntityBox,
    navigation: NavigationView,
    canStandOnPowderSnow = false
): boolean => {
    const feetY = Math.floor(position.y);
    if (Math.abs(position.y - feetY) > COLLISION_EPSILON) return false;

    const minX = Math.floor(position.x - box.width / 2 + COLLISION_EPSILON);
    const maxX = Math.floor(position.x + box.width / 2 - COLLISION_EPSILON);
    const minZ = Math.floor(position.z - box.width / 2 + COLLISION_EPSILON);
    const maxZ = Math.floor(position.z + box.width / 2 - COLLISION_EPSILON);

    for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
            const below = { x, y: feetY - 1, z };
            if (
                navigation.isSolid(below) ||
                (canStandOnPowderSnow && navigation.blockAt(below) === 'minecraft:powder_snow')
            )
                return true;
        }
    }

    return false;
};

/** Moves one axis in short checked steps, stopping at the first collision. */
export const moveOnAxis = (
    from: EntityPosition,
    target: number,
    axis: keyof EntityPosition,
    canOccupy: (position: EntityPosition) => boolean
): EntityPosition => {
    const delta = target - from[axis];
    const steps = Math.ceil(Math.abs(delta) / MAX_COLLISION_STEP);
    if (steps === 0) return from;

    let moved = from;
    for (let step = 1; step <= steps; step += 1) {
        const position = { ...from, [axis]: from[axis] + (delta * step) / steps };
        if (!canOccupy(position)) break;
        moved = position;
    }

    return moved;
};
