/**
 * The connection states a fence, a pane and a wall recompute from their
 * neighbors.
 *
 * The three shapes use two different state spellings. Fences, panes and bars
 * carry the `minecraft:connection_*` trait states as booleans; walls carry
 * `wall_connection_type_*` with a height and a `wall_post_bit`. A family
 * patches only the states its block actually has, so a block whose palette
 * entry carries neither is left alone.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import type { HorizontalFace } from '../geometry';
import { HORIZONTAL_FACES, offset } from '../geometry';
import { bareName, hasState } from '../state';
import type { BlockStates, WorldActions } from '../world';
import { isSolidSupport } from './support';

/** Which connection rule a block follows. */
export type ConnectionKind = 'fence' | 'pane' | 'wall';

/** The trait state a fence, a pane or a set of bars carries per direction. */
export const CONNECTION_STATES: Readonly<Record<HorizontalFace, string>> = {
    north: 'minecraft:connection_north',
    south: 'minecraft:connection_south',
    west: 'minecraft:connection_west',
    east: 'minecraft:connection_east'
};

/** The state a wall carries per direction, which holds a height rather than a flag. */
export const WALL_CONNECTION_STATES: Readonly<Record<HorizontalFace, string>> = {
    north: 'wall_connection_type_north',
    south: 'wall_connection_type_south',
    west: 'wall_connection_type_west',
    east: 'wall_connection_type_east'
};

/** The three heights a wall connection takes. */
export type WallConnection = 'none' | 'short' | 'tall';

const isFenceName = (name: string): boolean => name.endsWith('fence') && !name.endsWith('fence_gate');

const isNetherFenceName = (name: string): boolean => name === 'nether_brick_fence';

const isPaneName = (name: string): boolean => name.endsWith('_pane') || name.endsWith('_bars');

const isWallName = (name: string): boolean => name.endsWith('_wall') && !name.endsWith('_wall_sign');

const isGateName = (name: string): boolean => name.endsWith('fence_gate');

/**
 * Whether a thin block connects to the neighbor on one face.
 *
 * A fence joins fences of its own group, walls, gates and solid blocks, and
 * a nether brick fence counts as its own group so it refuses wooden ones.
 * Panes and bars join each other, walls and solid blocks, and refuse fences.
 */
export const connectsTo = (
    world: WorldActions,
    kind: ConnectionKind,
    block: HookBlock,
    face: HorizontalFace
): boolean => {
    const position = offset(block.position, face);
    const neighbor = world.getBlock(position);
    if (neighbor === undefined) return false;

    const self = bareName(block.identifier);
    const other = bareName(neighbor.identifier);

    if (isFenceName(other)) {
        if (kind === 'pane') return false;
        if (kind === 'wall') return true;
        return isNetherFenceName(other) === isNetherFenceName(self);
    }
    if (isPaneName(other)) return kind !== 'fence';
    if (isWallName(other) || isGateName(other)) return true;

    return isSolidSupport(world, position);
};

/** The states a fence, a pane or a set of bars takes from its four neighbors. */
export const connectionStates = (world: WorldActions, kind: ConnectionKind, block: HookBlock): BlockStates => {
    const states: Record<string, boolean> = {};
    for (const face of HORIZONTAL_FACES) {
        const name = CONNECTION_STATES[face];
        if (!hasState(block, name)) continue;
        states[name] = connectsTo(world, kind, block, face);
    }
    return states;
};

/**
 * The states a wall takes from its neighbors.
 *
 * A connection is tall when a solid block sits on the wall, which is the
 * rule that makes a wall under a slab reach up to it, and the post bit is set
 * when the wall is not a straight run of exactly two opposite connections.
 */
export const wallStates = (world: WorldActions, block: HookBlock): BlockStates => {
    const above = isSolidSupport(world, offset(block.position, 'up'));
    const states: Record<string, string | boolean> = {};
    const connected: HorizontalFace[] = [];

    for (const face of HORIZONTAL_FACES) {
        const name = WALL_CONNECTION_STATES[face];
        if (!hasState(block, name)) continue;
        const connection: WallConnection = connectsTo(world, 'wall', block, face) ? (above ? 'tall' : 'short') : 'none';
        states[name] = connection;
        if (connection !== 'none') connected.push(face);
    }

    if (hasState(block, 'wall_post_bit')) {
        const straight =
            connected.length === 2 &&
            ((connected.includes('north') && connected.includes('south')) ||
                (connected.includes('west') && connected.includes('east')));
        states['wall_post_bit'] = above || !straight;
    }

    return states;
};
