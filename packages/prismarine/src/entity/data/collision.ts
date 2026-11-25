import type { BedrockCollisionBox } from '@jsprismarine/blocks/geometry';
import { FULL_CUBE_SHAPE, isFullCubeShape } from '@jsprismarine/blocks/geometry';
import type { NavigationView } from '@jsprismarine/entity-goals';
import type { EntityPosition } from '@jsprismarine/entities';

import type { EntityBox } from './facts';
import type { EntityBlockView } from './navigationView';

/** Small inset that keeps a box resting exactly on a block face out of that block. */
const COLLISION_EPSILON = 1e-7;

/** The furthest one collision check advances along an axis, in blocks. */
const MAX_COLLISION_STEP = 0.2;

/** The block reads a body's collision needs: each cell's shape, and its identifier for powder snow. */
export type BodyBlocks = Pick<EntityBlockView, 'collisionAt' | 'blockAt'>;

/** How far under a body's feet {@link isSupported} looks for a surface, in blocks. */
const SUPPORT_PROBE = 1e-4;

/**
 * The cell shapes a body collides with: each block's own boxes, with powder snow a full cube for a
 * body that can stand on it.
 */
export const bodyShape =
    (blocks: BodyBlocks, canStandOnPowderSnow = false): CellShape =>
    (cell) =>
        canStandOnPowderSnow && blocks.blockAt(cell) === 'minecraft:powder_snow'
            ? FULL_CUBE_SHAPE
            : blocks.collisionAt(cell);

/** The box a body of this size fills with its feet at a position. */
export const bodyBounds = (position: EntityPosition, box: EntityBox): BoxBounds => ({
    min: { x: position.x - box.width / 2, y: position.y, z: position.z - box.width / 2 },
    max: { x: position.x + box.width / 2, y: position.y + box.height, z: position.z + box.width / 2 }
});

/**
 * Whether the entity's collision box fits clear of every block's collision box at a position.
 * A cell that is not loaded does not fit.
 * @param canStandOnPowderSnow - Whether powder snow counts as a collision surface.
 */
export const bodyCanOccupy = (
    position: EntityPosition,
    box: EntityBox,
    blocks: BodyBlocks,
    canStandOnPowderSnow = false
): boolean => boundsHitSolid(bodyBounds(position, box), bodyShape(blocks, canStandOnPowderSnow)) === false;

/**
 * {@link bodyCanOccupy} for one move that starts at `from`, where a block box the body already
 * overlaps there does not count.
 *
 * Java's `Shapes.collide` only stops a box at a shape ahead of it, so a mob that ended up
 * partly inside a block, such as one that spawned into a spawner's side before the spawn box was
 * checked, walks out of it. Counting that block would refuse every step, and the mob would stand
 * there with its goals running and never move.
 * @javaSee Shapes.collide
 * @param canStandOnPowderSnow - Whether powder snow counts as a collision surface.
 */
export const bodyCanOccupyFrom = (
    from: EntityPosition,
    box: EntityBox,
    blocks: BodyBlocks,
    canStandOnPowderSnow = false
): ((position: EntityPosition) => boolean) => {
    const shape = bodyShape(blocks, canStandOnPowderSnow);
    const start = bodyBounds(from, box);
    const inside = new Set<string>();
    visitBoxes(start, shape, (cell, cellBox) => {
        if (overlaps(start, cell, cellBox)) inside.add(boxKey(cell, cellBox));
        return false;
    });
    if (inside.size === 0) return (position) => bodyCanOccupy(position, box, blocks, canStandOnPowderSnow);
    return (position) => {
        const bounds = bodyBounds(position, box);
        return (
            visitBoxes(
                bounds,
                shape,
                (cell, cellBox) => overlaps(bounds, cell, cellBox) && !inside.has(boxKey(cell, cellBox))
            ) === false
        );
    };
};

/** One block collision box, by its cell and its extent within it. */
const boxKey = (cell: EntityPosition, box: BedrockCollisionBox): string =>
    `${cell.x},${cell.y},${cell.z}:${box.join()}`;

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
 * Whether any block a body's box overlaps passes a test, such as being a cobweb.
 * @param position - The body's feet, centered horizontally.
 * @param box - The body's box.
 * @param matches - The test for one block position.
 */
export const bodyTouchesBlock = (
    position: EntityPosition,
    box: EntityBox,
    matches: (block: EntityPosition) => boolean
): boolean => {
    const minX = Math.floor(position.x - box.width / 2 + COLLISION_EPSILON);
    const maxX = Math.floor(position.x + box.width / 2 - COLLISION_EPSILON);
    const minY = Math.floor(position.y + COLLISION_EPSILON);
    const maxY = Math.floor(position.y + box.height - COLLISION_EPSILON);
    const minZ = Math.floor(position.z - box.width / 2 + COLLISION_EPSILON);
    const maxZ = Math.floor(position.z + box.width / 2 - COLLISION_EPSILON);
    for (let x = minX; x <= maxX; x += 1)
        for (let y = minY; y <= maxY; y += 1)
            for (let z = minZ; z <= maxZ; z += 1) if (matches({ x, y, z })) return true;
    return false;
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
 * Whether an entity's feet rest on a block's collision box: the top of a full block, a slab, a
 * carpet or a fence, wherever under the body's footprint it is.
 * @param canStandOnPowderSnow - Whether powder snow can support the entity.
 */
export const isSupported = (
    position: EntityPosition,
    box: EntityBox,
    blocks: BodyBlocks,
    canStandOnPowderSnow = false
): boolean => {
    const half = box.width / 2;
    const probe: BoxBounds = {
        min: { x: position.x - half, y: position.y - SUPPORT_PROBE, z: position.z - half },
        max: { x: position.x + half, y: position.y, z: position.z + half }
    };
    return boundsHitSolid(probe, bodyShape(blocks, canStandOnPowderSnow)) === true;
};

/**
 * Whether a body's eyes are inside a block that suffocates, as Java's `Entity.isInWall` asks: a
 * box four fifths of the body's width and a millionth of a block tall around the eyes, against
 * every block whose collision shape fills its cell. A block in a chunk that is not loaded does not
 * suffocate.
 * @param eyes - The eye position.
 * @param width - The body's width.
 */
export const eyesInWall = (eyes: EntityPosition, width: number, blocks: Pick<BodyBlocks, 'collisionAt'>): boolean => {
    const half = (width * 0.8) / 2;
    const halfHeight = 5e-7;
    const bounds: BoxBounds = {
        min: { x: eyes.x - half, y: eyes.y - halfHeight, z: eyes.z - half },
        max: { x: eyes.x + half, y: eyes.y + halfHeight, z: eyes.z + half }
    };
    const suffocating: CellShape = (cell) => {
        const shape = blocks.collisionAt(cell);
        return shape !== undefined && isFullCubeShape(shape) ? FULL_CUBE_SHAPE : [];
    };
    return boundsHitSolid(bounds, suffocating) === true;
};

/**
 * Where the feet of a body standing at a path waypoint are. A waypoint sits on top of the cell
 * under it, which the path finder takes as a full block; a slab or a carpet there holds the feet
 * lower, and a cell with nothing to stand on leaves the waypoint's own height.
 */
export const floorUnder = (waypoint: EntityPosition, blocks: Pick<BodyBlocks, 'collisionAt'>): number => {
    const below = { x: Math.floor(waypoint.x), y: Math.floor(waypoint.y) - 1, z: Math.floor(waypoint.z) };
    const top = Math.max(0, ...(blocks.collisionAt(below) ?? []).map((box) => box[4]));
    return top > 0 && top < 1 ? below.y + top : waypoint.y;
};

/**
 * Where a falling body comes to rest: its feet flush on the first collision box within `drop`
 * blocks below it.
 * @param drop - How far it may still fall, in blocks, as a positive number.
 * @returns The resting feet height, or the starting height when a cell below is not loaded.
 */
export const landingY = (
    position: EntityPosition,
    box: EntityBox,
    blocks: BodyBlocks,
    drop: number,
    canStandOnPowderSnow = false
): number => sweepAxis(bodyBounds(position, box), 'y', -drop, bodyShape(blocks, canStandOnPowderSnow)) ?? position.y;

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

/** How many halvings {@link riseWithin} takes to find the head room, to within a millionth of a block. */
const CLEARANCE_HALVINGS = 20;

/**
 * Rises toward `target` as far as the head room allows: {@link moveOnAxis}'s steps, then a
 * bisection of the step that would hit the ceiling, so the rise ends within a millionth of a
 * block of it rather than up to a fifth of a block short.
 */
const riseWithin = (
    from: EntityPosition,
    target: number,
    canOccupy: (position: EntityPosition) => boolean
): EntityPosition => {
    const stepped = moveOnAxis(from, target, 'y', canOccupy);
    if (stepped.y >= target) return stepped;
    let free = stepped.y;
    let hit = Math.min(target, free + MAX_COLLISION_STEP);
    for (let halving = 0; halving < CLEARANCE_HALVINGS; halving += 1) {
        const middle = (free + hit) / 2;
        if (canOccupy({ ...from, y: middle })) free = middle;
        else hit = middle;
    }
    return { ...from, y: free };
};

/**
 * Java's `Entity.collide` step: when a ledge stops a walker, the same horizontal move is tried with
 * the feet raised as high as `maxStep` and the head room allow, and kept when it goes further.
 * Gravity then settles the feet onto the ledge's real top.
 * @param from - Where the move started.
 * @param proposed - Where the move was headed.
 * @param blocked - Where the move stopped without a step.
 * @param maxStep - The highest the feet rise, in blocks.
 * @returns The stepped position, or `blocked` when stepping gets no further.
 */
export const stepUp = (
    from: EntityPosition,
    proposed: EntityPosition,
    blocked: EntityPosition,
    maxStep: number,
    canOccupy: (position: EntityPosition) => boolean
): EntityPosition => {
    const raised = riseWithin(from, from.y + maxStep, canOccupy);
    if (raised.y === from.y) return blocked;
    let stepped = moveOnAxis(raised, proposed.x, 'x', canOccupy);
    stepped = moveOnAxis(stepped, proposed.z, 'z', canOccupy);
    const reached = (at: EntityPosition) => Math.hypot(at.x - from.x, at.z - from.z);
    return reached(stepped) > reached(blocked) + 1e-9 ? stepped : blocked;
};

/**
 * The collision boxes of the block cell at a position, normalized to the cell, or undefined when
 * its chunk is not loaded. A box may reach past its cell, as a fence's reaches half a block up.
 */
export type CellShape = (cell: EntityPosition) => readonly BedrockCollisionBox[] | undefined;

/** An axis-aligned box, by its lowest and highest corners. */
export interface BoxBounds {
    readonly min: EntityPosition;
    readonly max: EntityPosition;
}

/** Where an axis's minimum and maximum sit in a {@link BedrockCollisionBox}. */
const AXIS_INDEX = { x: [0, 3], y: [1, 4], z: [2, 5] } as const;

/**
 * Calls `visit` with every box of every cell a region reaches, until it returns true.
 *
 * The layer under the region is read too, because a box can reach up out of its own cell: a fence
 * one cell below a body still stands half a block into the body's layer.
 * @returns True when `visit` stopped the scan, undefined when a cell is not loaded first, and
 *   false otherwise.
 */
const visitBoxes = (
    bounds: BoxBounds,
    shape: CellShape,
    visit: (cell: EntityPosition, box: BedrockCollisionBox) => boolean
): boolean | undefined => {
    const maxX = Math.floor(bounds.max.x - COLLISION_EPSILON);
    const maxY = Math.floor(bounds.max.y - COLLISION_EPSILON);
    const maxZ = Math.floor(bounds.max.z - COLLISION_EPSILON);
    for (let x = Math.floor(bounds.min.x + COLLISION_EPSILON); x <= maxX; x += 1)
        for (let y = Math.floor(bounds.min.y + COLLISION_EPSILON) - 1; y <= maxY; y += 1)
            for (let z = Math.floor(bounds.min.z + COLLISION_EPSILON); z <= maxZ; z += 1) {
                const cell = { x, y, z };
                const boxes = shape(cell);
                if (boxes === undefined) return undefined;
                for (const box of boxes) if (visit(cell, box)) return true;
            }
    return false;
};

/** Whether a cell's box and a region overlap on one axis by more than a touch. */
const overlapsOn = (
    bounds: BoxBounds,
    cell: EntityPosition,
    box: BedrockCollisionBox,
    axis: keyof EntityPosition
): boolean => {
    const [low, high] = AXIS_INDEX[axis];
    return (
        cell[axis] + box[low] < bounds.max[axis] - COLLISION_EPSILON &&
        cell[axis] + box[high] > bounds.min[axis] + COLLISION_EPSILON
    );
};

/**
 * Whether any block's collision box overlaps a box, ignoring a face it only touches.
 * @returns Undefined when a cell the box reaches is not loaded and no box before it overlapped.
 */
export const boundsHitSolid = (bounds: BoxBounds, shape: CellShape): boolean | undefined =>
    visitBoxes(bounds, shape, (cell, box) => overlaps(bounds, cell, box));

/** Whether a cell's box and a region overlap on all three axes by more than a touch. */
const overlaps = (bounds: BoxBounds, cell: EntityPosition, box: BedrockCollisionBox): boolean =>
    overlapsOn(bounds, cell, box, 'x') && overlapsOn(bounds, cell, box, 'y') && overlapsOn(bounds, cell, box, 'z');

/**
 * Moves a box along one axis until the first block collision box in the way stops it, flush
 * against that box's face, as Java's `Entity.move` clips one axis against block shapes.
 *
 * Unlike {@link moveOnAxis}, which stops at the last free step of up to 0.2 blocks, the box ends
 * touching the face, so a falling body lands on a slab half a block up and on a carpet a
 * sixteenth up. Every box between the start and the end of the move is tried, so a fast box
 * cannot pass through a block. A box the moving box already overlaps does not stop it.
 * @param delta - How far to move, in blocks; the sign is the direction.
 * @returns The box's new lowest coordinate on that axis, or undefined when a cell the move would
 *   reach is not loaded.
 */
export const sweepAxis = (
    bounds: BoxBounds,
    axis: keyof EntityPosition,
    delta: number,
    shape: CellShape
): number | undefined => {
    const min = bounds.min[axis];
    if (delta === 0) return min;
    const max = bounds.max[axis];
    const region: BoxBounds = {
        min: { ...bounds.min, [axis]: Math.min(min, min + delta) },
        max: { ...bounds.max, [axis]: Math.max(max, max + delta) }
    };
    const [lowIndex, highIndex] = AXIS_INDEX[axis];
    const others = (['x', 'y', 'z'] as const).filter((other) => other !== axis);
    let allowed = delta;
    const reached = visitBoxes(region, shape, (cell, box) => {
        if (!others.every((other) => overlapsOn(bounds, cell, box, other))) return false;
        const low = cell[axis] + box[lowIndex];
        const high = cell[axis] + box[highIndex];
        if (allowed > 0 && low >= max - COLLISION_EPSILON) allowed = Math.min(allowed, low - max);
        else if (allowed < 0 && high <= min + COLLISION_EPSILON) allowed = Math.max(allowed, high - min);
        return false;
    });
    if (reached === undefined) return undefined;
    return min + (delta > 0 ? Math.max(0, allowed) : Math.min(0, allowed));
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
 * a full cube, which is the way Java's `Entity.moveTowardsClosestSpace` pushes a body stuck in a block.
 * Up when every face it tries is closed.
 * @returns The face, or undefined when a neighboring cell is not loaded.
 */
export const closestOpenFace = (point: EntityPosition, shape: CellShape): CellFace | undefined => {
    const cell = { x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z) };
    let best = UP;
    let distance = Number.POSITIVE_INFINITY;
    for (const face of CLOSEST_SPACE_FACES) {
        const neighbor = shape({ ...cell, [face.axis]: cell[face.axis] + face.step });
        if (neighbor === undefined) return undefined;
        if (isFullCubeShape(neighbor)) continue;
        const within = point[face.axis] - cell[face.axis];
        const to = face.step > 0 ? 1 - within : within;
        if (to < distance) {
            distance = to;
            best = face;
        }
    }
    return best;
};
