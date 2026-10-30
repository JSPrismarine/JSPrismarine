/**
 * Portal geometry: the nether portal frame scan, the end portal frame ring,
 * where a new portal goes and what it writes, and the End platform.
 *
 * Everything here is a pure function over {@link WorldActions}. The constants
 * are Java's `PortalShape`, `PortalForcer` and `EndPlatformFeature`, read from
 * the class files and recorded in
 * `docs/research/portals-and-dimension-travel.md`. Travel between dimensions
 * is the server's: it owns the dimension list and the client sequence, and
 * `portalFamily` only lights, collapses and activates.
 */
import type { BlockFace, BlockPosition, HookBlock } from '@jsprismarine/blocks';
import { PORTAL_BLOCK_NAMES } from '@jsprismarine/blocks';

import type { HorizontalFace } from '../geometry';
import { FACE_STEPS, HORIZONTAL_FACES, isVertical, offset, opposite } from '../geometry';
import { AIR, isAir, isLiquid, isReplaceable, OBSIDIAN } from '../identifiers';
import { bareName, stateBoolean } from '../state';
import { isSolidSupport } from './support';
import type { WorldActions } from '../world';
import { difficultyIdOf } from '../world';

const namespaced = (name: string): string => `minecraft:${name}`;

/** The dimension no nether portal can be lit in. */
export const THE_END = 'minecraft:the_end';

/** The lit nether portal block Bedrock writes, which is the first name in the shared list. */
export const NETHER_PORTAL = namespaced(PORTAL_BLOCK_NAMES.netherPortal[0]);

/** Every identifier that reads as a lit nether portal block. */
export const NETHER_PORTAL_BLOCKS: readonly string[] = PORTAL_BLOCK_NAMES.netherPortal.map(namespaced);

/** The blocks a nether portal frame is made of. Crying obsidian is not one of them. */
export const NETHER_PORTAL_FRAME_BLOCKS: readonly string[] = [OBSIDIAN];

/** The end portal block the frame ring fills with. */
export const END_PORTAL = namespaced(PORTAL_BLOCK_NAMES.endPortal[0]);

/** The blocks an end portal ring is made of. */
export const END_PORTAL_FRAME_BLOCKS: readonly string[] = PORTAL_BLOCK_NAMES.endPortalFrame.map(namespaced);

/** The fires that light a nether portal frame. */
export const PORTAL_LIGHTING_FIRES: readonly string[] = PORTAL_BLOCK_NAMES.fire.map(namespaced);

/** Java's `PortalShape.MIN_WIDTH`: the narrowest interior, in blocks. */
export const PORTAL_MIN_WIDTH = 2;
/** Java's `PortalShape.MAX_WIDTH`: the widest interior, in blocks. */
export const PORTAL_MAX_WIDTH = 21;
/** Java's `PortalShape.MIN_HEIGHT`: the shortest interior, in blocks. */
export const PORTAL_MIN_HEIGHT = 3;
/** Java's `PortalShape.MAX_HEIGHT`: the tallest interior, in blocks. */
export const PORTAL_MAX_HEIGHT = 21;

/** The horizontal axis a nether portal's plane runs along. */
export type PortalAxis = 'x' | 'z';

/** The `portal_axis` state name on `minecraft:portal`. */
export const PORTAL_AXIS_STATE = 'portal_axis';

/**
 * A nether portal's interior rectangle.
 *
 * `bottomLeft` is the interior block with the lowest y and the lowest
 * coordinate along the axis, so the interior extends toward positive
 * `axis` by `width` and upward by `height`. The frame sits one block outside
 * that rectangle on all four sides.
 */
export interface PortalFrame {
    readonly bottomLeft: BlockPosition;
    readonly axis: PortalAxis;
    /** Interior blocks along the axis, 2 to 21. */
    readonly width: number;
    /** Interior blocks upward, 3 to 21. */
    readonly height: number;
}

/** Whether the identifier is a lit nether portal block. */
export const isNetherPortal = (identifier: string): boolean => NETHER_PORTAL_BLOCKS.includes(identifier);

/** Whether the identifier is a nether portal frame block. */
export const isNetherPortalFrame = (identifier: string): boolean => NETHER_PORTAL_FRAME_BLOCKS.includes(identifier);

/** Whether the identifier is an end portal frame block. */
export const isEndPortalFrame = (identifier: string): boolean => END_PORTAL_FRAME_BLOCKS.includes(identifier);

/** Whether the identifier is one of the fires that light a portal. */
export const isPortalLightingFire = (identifier: string): boolean => PORTAL_LIGHTING_FIRES.includes(identifier);

/**
 * Java's `PortalShape.isEmpty`: what may sit inside a frame before it lights.
 * Air, either fire, or a portal block that is already there.
 */
const isPortalInterior = (block: HookBlock | undefined): boolean =>
    block !== undefined &&
    (isAir(block.identifier) || isPortalLightingFire(block.identifier) || isNetherPortal(block.identifier));

const isFrameAt = (world: WorldActions, position: BlockPosition): boolean => {
    const block = world.getBlock(position);
    return block !== undefined && isNetherPortalFrame(block.identifier);
};

/** The position `distance` blocks along the axis. */
const along = (position: BlockPosition, axis: PortalAxis, distance: number): BlockPosition =>
    axis === 'x' ? { ...position, x: position.x + distance } : { ...position, z: position.z + distance };

const up = (position: BlockPosition, distance: number): BlockPosition => ({ ...position, y: position.y + distance });

/**
 * Java's `getDistanceUntilEdgeAboveFrame`: how many interior blocks lie from
 * `from` toward `sign` before a frame block, each standing on a frame block.
 * Zero when the run ends in anything but a frame block, or runs past the
 * widest portal.
 */
const distanceUntilEdgeAboveFrame = (
    world: WorldActions,
    from: BlockPosition,
    axis: PortalAxis,
    sign: 1 | -1
): number => {
    for (let distance = 0; distance <= PORTAL_MAX_WIDTH; distance += 1) {
        const position = along(from, axis, distance * sign);
        const block = world.getBlock(position);
        if (!isPortalInterior(block)) return isFrameAt(world, position) ? distance : 0;
        if (!isFrameAt(world, up(position, -1))) return 0;
    }
    return 0;
};

/**
 * Java's `PortalShape` constructor for one axis: walk down to the floor, then
 * to the negative end of the axis, then measure the width and the height.
 */
const scanPortalShape = (world: WorldActions, at: BlockPosition, axis: PortalAxis): PortalFrame | undefined => {
    let position = at;
    const floor = position.y - PORTAL_MAX_HEIGHT;
    while (position.y > floor && isPortalInterior(world.getBlock(up(position, -1)))) position = up(position, -1);

    const toEdge = distanceUntilEdgeAboveFrame(world, position, axis, -1) - 1;
    if (toEdge < 0) return undefined;
    const bottomLeft = along(position, axis, -toEdge);

    const width = distanceUntilEdgeAboveFrame(world, bottomLeft, axis, 1);
    if (width < PORTAL_MIN_WIDTH || width > PORTAL_MAX_WIDTH) return undefined;

    let height = PORTAL_MAX_HEIGHT;
    let portalBlocks = 0;
    rows: for (let row = 0; row < PORTAL_MAX_HEIGHT; row += 1) {
        const left = up(along(bottomLeft, axis, -1), row);
        const right = up(along(bottomLeft, axis, width), row);
        if (!isFrameAt(world, left) || !isFrameAt(world, right)) {
            height = row;
            break;
        }
        for (let column = 0; column < width; column += 1) {
            const block = world.getBlock(up(along(bottomLeft, axis, column), row));
            if (!isPortalInterior(block)) {
                height = row;
                break rows;
            }
            if (block !== undefined && isNetherPortal(block.identifier)) portalBlocks += 1;
        }
    }
    if (height < PORTAL_MIN_HEIGHT || height > PORTAL_MAX_HEIGHT) return undefined;
    for (let column = 0; column < width; column += 1) {
        if (!isFrameAt(world, up(along(bottomLeft, axis, column), height))) return undefined;
    }
    if (portalBlocks > 0) return undefined;

    return { bottomLeft, axis, width, height };
};

/**
 * Java's `PortalShape.findEmptyPortalShape`: the unlit frame around a
 * position, trying the x axis and then the z axis.
 *
 * The interior may hold air, fire or nothing else, 2 to 21 blocks wide and
 * 3 to 21 tall, and the corners of the frame are not checked.
 *
 * @param at - A position inside the frame, which is where the fire appeared.
 * @returns The frame, or undefined when no valid, unlit frame surrounds the position.
 */
export const findEmptyPortalShape = (world: WorldActions, at: BlockPosition): PortalFrame | undefined =>
    scanPortalShape(world, at, 'x') ?? scanPortalShape(world, at, 'z');

/** Every interior position of a frame, column by column from the bottom left. */
export const portalInterior = (frame: PortalFrame): BlockPosition[] => {
    const positions: BlockPosition[] = [];
    for (let column = 0; column < frame.width; column += 1) {
        for (let row = 0; row < frame.height; row += 1) {
            positions.push(up(along(frame.bottomLeft, frame.axis, column), row));
        }
    }
    return positions;
};

/**
 * Lights the frame around a fire, if there is one: writes `minecraft:portal`
 * with the frame's `portal_axis` into every interior block.
 *
 * Refuses in the End, where no nether portal can be lit.
 *
 * @param dimension - The dimension the fire is in.
 * @returns The frame that was lit, or undefined when nothing happened.
 */
export const lightNetherPortal = (
    world: WorldActions,
    at: BlockPosition,
    dimension: string
): PortalFrame | undefined => {
    if (bareName(dimension) === bareName(THE_END)) return undefined;
    const frame = findEmptyPortalShape(world, at);
    if (frame === undefined) return undefined;
    for (const position of portalInterior(frame)) {
        world.setBlock(position, NETHER_PORTAL, { [PORTAL_AXIS_STATE]: frame.axis }, false);
    }
    return frame;
};

/** The `portal_axis` a portal block carries, or undefined for `unknown`, which a command wrote. */
export const portalAxisOf = (block: Pick<HookBlock, 'states'>): PortalAxis | undefined => {
    const axis = block.states[PORTAL_AXIS_STATE];
    return axis === 'x' || axis === 'z' ? axis : undefined;
};

/** Whether a face lies in a portal's plane: vertical, or along its axis. An unknown axis counts every face. */
const isInPortalPlane = (face: BlockFace, axis: PortalAxis | undefined): boolean => {
    if (isVertical(face) || axis === undefined) return true;
    return axis === 'x' ? face === 'east' || face === 'west' : face === 'north' || face === 'south';
};

const keyOf = (position: BlockPosition): string => `${position.x},${position.y},${position.z}`;

/**
 * Dragonfly's `connectedNetherPortal`: every portal block reachable from one
 * through other portal blocks within the portal's plane.
 *
 * Steps go up, down and along the axis the starting block carries. A block
 * whose axis is `unknown` steps in every horizontal direction. An unlit
 * position returns nothing.
 */
export const connectedPortalBlocks = (world: WorldActions, at: BlockPosition): BlockPosition[] => {
    const start = world.getBlock(at);
    if (start === undefined || !isNetherPortal(start.identifier)) return [];
    const axis = portalAxisOf(start);
    const faces: readonly BlockFace[] =
        axis === 'x'
            ? ['up', 'down', 'east', 'west']
            : axis === 'z'
              ? ['up', 'down', 'north', 'south']
              : ['up', 'down', 'north', 'south', 'east', 'west'];

    const seen = new Set<string>([keyOf(at)]);
    const found: BlockPosition[] = [at];
    const queue: BlockPosition[] = [at];
    while (queue.length > 0) {
        const current = queue.pop()!;
        for (const face of faces) {
            const next = offset(current, face);
            const key = keyOf(next);
            if (seen.has(key)) continue;
            seen.add(key);
            const block = world.getBlock(next);
            if (block === undefined || !isNetherPortal(block.identifier)) continue;
            found.push(next);
            queue.push(next);
        }
    }
    return found;
};

/**
 * Java's `NetherPortalBlock.updateShape` with Dragonfly's one-go collapse: when
 * the neighbor on a face in the portal's plane is neither a portal block nor a
 * frame block, every connected portal block becomes air.
 *
 * @returns The positions cleared, empty when the portal stands.
 */
export const collapseNetherPortal = (
    world: WorldActions,
    block: HookBlock,
    face: BlockFace,
    neighbor: HookBlock
): BlockPosition[] => {
    if (!isInPortalPlane(face, portalAxisOf(block))) return [];
    if (isNetherPortal(neighbor.identifier) || isNetherPortalFrame(neighbor.identifier)) return [];
    const cleared = connectedPortalBlocks(world, block.position);
    for (const position of cleared) world.setBlock(position, AIR, undefined, false);
    for (const position of cleared) world.notifyNeighbors(position);
    return cleared;
};

/** The state an end portal frame sets once an eye of ender is in it. */
export const END_PORTAL_EYE_STATE = 'end_portal_eye_bit';

/** The state that says which way an end portal frame faces. */
export const END_PORTAL_FACING_STATE = 'minecraft:cardinal_direction';

/** The sound Bedrock plays when a ring fills with end portal. */
export const END_PORTAL_SPAWN_SOUND = 'block.end_portal.spawn';

/** The twelve frame positions around a 3 by 3 center, each with the facing it must carry. */
const endRingFrames = (center: BlockPosition): { position: BlockPosition; facing: HorizontalFace }[] => {
    const frames: { position: BlockPosition; facing: HorizontalFace }[] = [];
    for (const side of HORIZONTAL_FACES) {
        const step = FACE_STEPS[side];
        for (let lateral = -1; lateral <= 1; lateral += 1) {
            frames.push({
                position: {
                    x: center.x + step.x * 2 + step.z * lateral,
                    y: center.y,
                    z: center.z + step.z * 2 + step.x * lateral
                },
                facing: opposite(side)
            });
        }
    }
    return frames;
};

/** Whether a position holds an end portal frame with an eye, facing the given way. */
const isEyedFrameFacing = (world: WorldActions, position: BlockPosition, facing: HorizontalFace): boolean => {
    const block = world.getBlock(position);
    if (block === undefined || !isEndPortalFrame(block.identifier)) return false;
    return stateBoolean(block, END_PORTAL_EYE_STATE) && block.states[END_PORTAL_FACING_STATE] === facing;
};

/**
 * Java's end portal frame pattern as Bedrock accepts it, the flat ring only:
 * twelve `end_portal_frame` blocks around a 3 by 3, every one holding an eye
 * and facing the center.
 *
 * The frame's own facing says which side of the ring it is on, so there are
 * three centers to try, two blocks inward and up to one block sideways.
 *
 * @param frameAt - The frame that was just filled.
 * @returns The center of the 3 by 3 the ring surrounds, or undefined when no complete ring includes the frame.
 */
export const findEndPortalRing = (world: WorldActions, frameAt: BlockPosition): BlockPosition | undefined => {
    const frame = world.getBlock(frameAt);
    if (frame === undefined || !isEndPortalFrame(frame.identifier)) return undefined;
    const facing = frame.states[END_PORTAL_FACING_STATE];
    const inward = HORIZONTAL_FACES.find((face) => face === facing);
    if (inward === undefined) return undefined;

    const step = FACE_STEPS[inward];
    for (let lateral = -1; lateral <= 1; lateral += 1) {
        const center = {
            x: frameAt.x + step.x * 2 + step.z * lateral,
            y: frameAt.y,
            z: frameAt.z + step.z * 2 + step.x * lateral
        };
        if (endRingFrames(center).every((ring) => isEyedFrameFacing(world, ring.position, ring.facing))) return center;
    }
    return undefined;
};

/**
 * Fills the ring around a frame with `end_portal` when the frame completes it,
 * overwriting whatever the 3 by 3 holds, and plays the activation sound.
 *
 * @returns The center that was filled, or undefined when the ring is not complete.
 */
export const activateEndPortal = (world: WorldActions, frameAt: BlockPosition): BlockPosition | undefined => {
    const center = findEndPortalRing(world, frameAt);
    if (center === undefined) return undefined;
    for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
            world.setBlock({ x: center.x + dx, y: center.y, z: center.z + dz }, END_PORTAL, undefined, false);
        }
    }
    world.playSound(center, END_PORTAL_SPAWN_SOUND);
    return center;
};

/** Java's `PortalForcer` search radius around the scaled target, in blocks. */
export const PORTAL_CREATION_RADIUS = 16;

/** The lowest y a forced portal is written at, Java's `bipush 70`. */
export const PORTAL_FORCED_MIN_Y = 70;

/** How far below the dimension's height limit a forced portal stays. */
export const PORTAL_FORCED_TOP_MARGIN = 10;

/** The block Bedrock flanks a forced portal's platform with. */
export const NETHERRACK = 'minecraft:netherrack';

/** The vertical range portal creation may use in one dimension. */
export interface PortalCreationBounds {
    /** The lowest y a block can occupy. */
    readonly minY: number;
    /** The first y above the build limit, 128 in the Nether and 320 in the Overworld. */
    readonly maxY: number;
}

/** Where a new portal goes, as {@link portalCreationSite} decided it. */
export interface PortalCreationSite {
    /** The bottom-left interior block of the portal to write. */
    readonly at: BlockPosition;
    /** True when no footing was found and the portal floats on its own platform. */
    readonly forced: boolean;
}

/** The position `distance` blocks across the axis, which is the other horizontal axis. */
const across = (position: BlockPosition, axis: PortalAxis, distance: number): BlockPosition =>
    axis === 'x' ? { ...position, z: position.z + distance } : { ...position, x: position.x + distance };

/** Java's `canPortalReplaceBlock`: replaceable and not a liquid. An unloaded position is not. */
const canPortalReplace = (world: WorldActions, position: BlockPosition): boolean => {
    const block = world.getBlock(position);
    return block !== undefined && isReplaceable(block.identifier) && !isLiquid(block.identifier);
};

/**
 * Java's `canHostFrame`: the 4 by 5 frame footprint at an offset across the
 * axis is replaceable, and the row under it is solid.
 */
const canHostFrame = (world: WorldActions, at: BlockPosition, axis: PortalAxis, sideOffset: number): boolean => {
    for (let a = -1; a <= 2; a += 1) {
        for (let dy = -1; dy <= 3; dy += 1) {
            const position = up(across(along(at, axis, a), axis, sideOffset), dy);
            if (dy < 0 ? !isSolidSupport(world, position) : !canPortalReplace(world, position)) return false;
        }
    }
    return true;
};

const squaredDistance = (a: BlockPosition, b: BlockPosition): number =>
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/**
 * Java's `PortalForcer.createPortal` search: where a portal for `target` goes.
 *
 * Every column within {@link PORTAL_CREATION_RADIUS} is walked from the top
 * down for a replaceable run standing on a solid floor with room for the 4 by
 * 5 frame. The first pass wants the footprint and one block on each side of
 * it; the second pass, used only when the first finds nothing, wants the
 * footprint alone. The closest candidate by 3D distance wins. When neither
 * pass finds anything the portal is forced one block back along the axis from
 * the target, with y clamped to `[70, maxY - 10]`, and the caller writes a
 * platform under it.
 *
 * @param target - The scaled arrival position in the destination dimension.
 * @param axis - The source portal's axis, which the new portal keeps.
 */
export const portalCreationSite = (
    world: WorldActions,
    target: BlockPosition,
    axis: PortalAxis,
    bounds: PortalCreationBounds
): PortalCreationSite => {
    const top = bounds.maxY - 1;
    let best: BlockPosition | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    let fallback: BlockPosition | undefined;
    let fallbackDistance = Number.POSITIVE_INFINITY;

    for (let dx = -PORTAL_CREATION_RADIUS; dx <= PORTAL_CREATION_RADIUS; dx += 1) {
        for (let dz = -PORTAL_CREATION_RADIUS; dz <= PORTAL_CREATION_RADIUS; dz += 1) {
            const column = { x: target.x + dx, y: 0, z: target.z + dz };
            for (let y = top; y >= bounds.minY; y -= 1) {
                if (!canPortalReplace(world, { ...column, y })) continue;
                const first = y;
                while (y > bounds.minY && canPortalReplace(world, { ...column, y: y - 1 })) y -= 1;
                if (y + 4 > top) continue;
                const run = first - y;
                if (run > 0 && run < 3) continue;
                const candidate = { ...column, y };
                if (!canHostFrame(world, candidate, axis, 0)) continue;
                const distance = squaredDistance(target, candidate);
                if (canHostFrame(world, candidate, axis, -1) && canHostFrame(world, candidate, axis, 1)) {
                    if (distance < bestDistance) {
                        best = candidate;
                        bestDistance = distance;
                    }
                } else if (distance < fallbackDistance) {
                    fallback = candidate;
                    fallbackDistance = distance;
                }
            }
        }
    }

    const found = best ?? fallback;
    if (found !== undefined) return { at: found, forced: false };

    const lowest = Math.max(bounds.minY + 1, PORTAL_FORCED_MIN_Y);
    const highest = Math.max(lowest, bounds.maxY - PORTAL_FORCED_TOP_MARGIN);
    return {
        at: { ...along(target, axis, -1), y: Math.min(highest, Math.max(lowest, target.y)) },
        forced: true
    };
};

/**
 * Writes a new 4 by 5 nether portal, corners included, with its six interior
 * blocks lit on `axis`.
 *
 * When the site was forced, a platform goes under it first: obsidian under the
 * interior and one block to each side, netherrack beyond that along the whole
 * frame as Bedrock does, and three blocks of air above the platform so there
 * is room to stand on both sides. Nothing is notified; the server that
 * created the portal sends the chunk.
 *
 * @param site - The bottom-left interior block, from {@link portalCreationSite}.
 */
export const writeNetherPortal = (
    world: WorldActions,
    site: BlockPosition,
    axis: PortalAxis,
    forced: boolean
): void => {
    if (forced) {
        for (let a = -1; a <= 2; a += 1) {
            for (let side = -2; side <= 2; side += 1) {
                const floor = up(across(along(site, axis, a), axis, side), -1);
                if (Math.abs(side) === 2) {
                    world.setBlock(floor, NETHERRACK, undefined, false);
                } else if (a >= 0 && a <= 1) {
                    world.setBlock(floor, OBSIDIAN, undefined, false);
                    for (let dy = 0; dy <= 2; dy += 1) world.setBlock(up(floor, dy + 1), AIR, undefined, false);
                }
            }
        }
    }
    for (let a = -1; a <= 2; a += 1) {
        for (let dy = -1; dy <= 3; dy += 1) {
            const edge = a === -1 || a === 2 || dy === -1 || dy === 3;
            const position = up(along(site, axis, a), dy);
            if (edge) world.setBlock(position, OBSIDIAN, undefined, false);
            else world.setBlock(position, NETHER_PORTAL, { [PORTAL_AXIS_STATE]: axis }, false);
        }
    }
};

/**
 * Java's `EndPlatformFeature.createEndPlatform`: 5 by 5 obsidian one block
 * under `center` and air in the three rows above it. A block that is not
 * already what the platform wants is destroyed with its drops first, so the
 * platform can be regenerated on every arrival.
 *
 * @param center - The arrival block, (100, 49, 0) for a player in the End.
 */
export const writeEndPlatform = (world: WorldActions, center: BlockPosition): void => {
    for (let dx = -2; dx <= 2; dx += 1) {
        for (let dz = -2; dz <= 2; dz += 1) {
            for (let dy = -1; dy <= 2; dy += 1) {
                const position = { x: center.x + dx, y: center.y + dy, z: center.z + dz };
                const wanted = dy === -1 ? OBSIDIAN : AIR;
                const current = world.getBlock(position);
                if (current !== undefined && current.identifier === wanted) continue;
                if (current !== undefined && !isAir(current.identifier)) world.destroyBlock?.(position);
                world.setBlock(position, wanted, undefined, false);
            }
        }
    }
};

/** The dimension whose portals spawn zombified piglins. */
export const OVERWORLD_DIMENSION = 'minecraft:overworld';

/** The Bedrock identifier of the zombified piglin. */
export const ZOMBIFIED_PIGLIN = 'minecraft:zombie_pigman';

/** Java's `NetherPortalBlock.randomTick` denominator: `random.nextInt(2000) < difficulty.getId()`. */
export const PIGLIN_SPAWN_ROLL_BOUND = 2000;

/** The `PortalCooldown` a spawned piglin starts with, so it does not walk straight back in. */
export const PIGLIN_PORTAL_COOLDOWN_TICKS = 300;

/**
 * Java's zombified piglin spawn roll on a portal's random tick: one chance in
 * 2000 on easy, two on normal, three on hard, none on peaceful.
 *
 * @param random - A draw in `[0, 1)`.
 * @param difficultyId - Java's difficulty id, 0 for peaceful through 3 for hard.
 */
export const piglinSpawnRoll = (random: () => number, difficultyId: number): boolean =>
    random() * PIGLIN_SPAWN_ROLL_BOUND < difficultyId;

/** The lowest portal block in the column under a portal block. */
const bottomPortalBlock = (world: WorldActions, at: BlockPosition): BlockPosition => {
    let position = at;
    for (let step = 0; step < PORTAL_MAX_HEIGHT; step += 1) {
        const below = world.getBlock(up(position, -1));
        if (below === undefined || !isNetherPortal(below.identifier)) break;
        position = up(position, -1);
    }
    return position;
};

/**
 * Rolls and performs the zombified piglin spawn for a portal block's random
 * tick. Bedrock places the piglin beside the portal rather than in it: south
 * of a portal running east to west, east of one running north to south, next
 * to the bottom block of the column.
 *
 * Only an Overworld portal spawns them, and only when the world's difficulty
 * is above peaceful.
 *
 * @returns The spawned entity's id, or undefined when nothing spawned.
 */
export const spawnPiglinFromPortal = (world: WorldActions, block: HookBlock): number | undefined => {
    if (bareName(block.dimension) !== bareName(OVERWORLD_DIMENSION)) return undefined;
    const difficultyId = difficultyIdOf(world.difficulty?.() ?? 'normal');
    if (!piglinSpawnRoll(() => world.random(), difficultyId)) return undefined;
    const bottom = bottomPortalBlock(world, block.position);
    const beside = offset(bottom, portalAxisOf(block) === 'x' ? 'south' : 'east');
    return world.spawnEntity(beside, ZOMBIFIED_PIGLIN, { PortalCooldown: PIGLIN_PORTAL_COOLDOWN_TICKS });
};
