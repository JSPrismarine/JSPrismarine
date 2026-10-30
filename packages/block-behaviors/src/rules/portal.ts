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

import { isVertical, offset } from '../geometry';
import { AIR, isAir, OBSIDIAN } from '../identifiers';
import { bareName } from '../state';
import type { WorldActions } from '../world';

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
