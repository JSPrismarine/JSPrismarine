import type { NavigationView } from '@jsprismarine/entity-goals';
import type { EntityPosition } from '@jsprismarine/entities';

import type { EntityBox } from './facts';

/** Small inset that keeps a box resting exactly on a block face out of that block. */
const COLLISION_EPSILON = 1e-7;

/** The furthest one collision check advances along an axis, in blocks. */
const MAX_COLLISION_STEP = 0.2;

/** Whether the entity's collision box fits in passable cells at a position. */
export const bodyCanOccupy = (position: EntityPosition, box: EntityBox, navigation: NavigationView): boolean => {
    const minX = Math.floor(position.x - box.width / 2 + COLLISION_EPSILON);
    const maxX = Math.floor(position.x + box.width / 2 - COLLISION_EPSILON);
    const minY = Math.floor(position.y + COLLISION_EPSILON);
    const maxY = Math.floor(position.y + box.height - COLLISION_EPSILON);
    const minZ = Math.floor(position.z - box.width / 2 + COLLISION_EPSILON);
    const maxZ = Math.floor(position.z + box.width / 2 - COLLISION_EPSILON);

    for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
            for (let z = minZ; z <= maxZ; z += 1) {
                if (!navigation.isPassable({ x, y, z })) return false;
            }
        }
    }

    return true;
};

/** Whether any block under a body's box belongs to the requested medium. */
export const bodyIntersectsMedium = (
    position: EntityPosition,
    box: EntityBox,
    contains: (block: EntityPosition) => boolean
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
                if (contains({ x, y, z })) return true;
            }
        }
    }

    return false;
};

/** Whether an entity with level feet is supported by at least one solid block. */
export const isSupported = (position: EntityPosition, box: EntityBox, navigation: NavigationView): boolean => {
    const feetY = Math.floor(position.y);
    if (Math.abs(position.y - feetY) > COLLISION_EPSILON) return false;

    const minX = Math.floor(position.x - box.width / 2 + COLLISION_EPSILON);
    const maxX = Math.floor(position.x + box.width / 2 - COLLISION_EPSILON);
    const minZ = Math.floor(position.z - box.width / 2 + COLLISION_EPSILON);
    const maxZ = Math.floor(position.z + box.width / 2 - COLLISION_EPSILON);

    for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
            if (navigation.isSolid({ x, y: feetY - 1, z })) return true;
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
