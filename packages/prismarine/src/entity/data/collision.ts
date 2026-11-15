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

/**
 * Whether the block cell at a position stops a box, or undefined when its chunk is not loaded.
 * Every cell that collides at all counts as a full cube.
 */
export type CellSolidity = (cell: EntityPosition) => boolean | undefined;

/** An axis-aligned box, by its lowest and highest corners. */
export interface BoxBounds {
    readonly min: EntityPosition;
    readonly max: EntityPosition;
}

/**
 * Whether any solid cell overlaps a box, ignoring a face it only touches.
 * @returns Undefined when a cell the box overlaps is not loaded and none before it was solid.
 */
export const boundsHitSolid = (bounds: BoxBounds, solid: CellSolidity): boolean | undefined => {
    const maxX = Math.floor(bounds.max.x - COLLISION_EPSILON);
    const maxY = Math.floor(bounds.max.y - COLLISION_EPSILON);
    const maxZ = Math.floor(bounds.max.z - COLLISION_EPSILON);
    for (let x = Math.floor(bounds.min.x + COLLISION_EPSILON); x <= maxX; x += 1)
        for (let y = Math.floor(bounds.min.y + COLLISION_EPSILON); y <= maxY; y += 1)
            for (let z = Math.floor(bounds.min.z + COLLISION_EPSILON); z <= maxZ; z += 1) {
                const hit = solid({ x, y, z });
                if (hit !== false) return hit;
            }
    return false;
};

/**
 * Moves a box along one axis until the first solid cell layer it would enter stops it, flush
 * against that layer's face, as Java's `Entity.move` clips one axis.
 *
 * Unlike {@link moveOnAxis}, which stops at the last free step of up to 0.2 blocks, the box ends
 * touching the face, so a falling body lands on the block rather than above it. Every layer
 * between the start and the end of the move is tried, so a fast box cannot pass through a block.
 * @param delta - How far to move, in blocks; the sign is the direction.
 * @returns The box's new lowest coordinate on that axis, or undefined when a cell the move would
 *   cross is not loaded.
 */
export const sweepAxis = (
    bounds: BoxBounds,
    axis: keyof EntityPosition,
    delta: number,
    solid: CellSolidity
): number | undefined => {
    const min = bounds.min[axis];
    const max = bounds.max[axis];
    const layer = (index: number): BoxBounds => ({
        min: { ...bounds.min, [axis]: index },
        max: { ...bounds.max, [axis]: index + 1 }
    });

    if (delta > 0) {
        const last = Math.floor(max + delta - COLLISION_EPSILON);
        for (let index = Math.floor(max - COLLISION_EPSILON) + 1; index <= last; index += 1) {
            const hit = boundsHitSolid(layer(index), solid);
            if (hit !== false) return hit === undefined ? undefined : Math.max(min, index - (max - min));
        }
    } else if (delta < 0) {
        const last = Math.floor(min + delta + COLLISION_EPSILON);
        for (let index = Math.floor(min + COLLISION_EPSILON) - 1; index >= last; index -= 1) {
            const hit = boundsHitSolid(layer(index), solid);
            if (hit !== false) return hit === undefined ? undefined : Math.min(min, index + 1);
        }
    }
    return min + delta;
};

/** One face of a block cell, by the axis it faces along and the direction. */
export interface CellFace {
    readonly axis: keyof EntityPosition;
    readonly step: 1 | -1;
}

/** The top face of a cell, which a body stuck with every side closed is pushed through. */
const UP: CellFace = { axis: 'y', step: 1 };

/** The faces Java's `Entity.moveTowardsClosestSpace` tries, in its order; down is never one. */
const CLOSEST_SPACE_FACES: readonly CellFace[] = [
    { axis: 'z', step: -1 },
    { axis: 'z', step: 1 },
    { axis: 'x', step: -1 },
    { axis: 'x', step: 1 },
    UP
];

/**
 * The face of the cell a point is in that lies nearest the point and opens onto a cell that is not
 * solid, which is the way Java's `Entity.moveTowardsClosestSpace` pushes a body stuck in a block.
 * Up when every face it tries is closed.
 * @returns The face, or undefined when a neighboring cell is not loaded.
 */
export const closestOpenFace = (point: EntityPosition, solid: CellSolidity): CellFace | undefined => {
    const cell = { x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z) };
    let best = UP;
    let distance = Number.POSITIVE_INFINITY;
    for (const face of CLOSEST_SPACE_FACES) {
        const closed = solid({ ...cell, [face.axis]: cell[face.axis] + face.step });
        if (closed === undefined) return undefined;
        if (closed) continue;
        const within = point[face.axis] - cell[face.axis];
        const to = face.step > 0 ? 1 - within : within;
        if (to < distance) {
            distance = to;
            best = face;
        }
    }
    return best;
};
