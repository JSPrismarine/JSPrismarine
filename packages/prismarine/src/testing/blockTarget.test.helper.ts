import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import type Player from '../Player';
import type Server from '../Server';
import { BlockState } from '../block/state/BlockState';
import type PlayerSession from '../network/PlayerSession';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import type Chunk from '../world/chunk/Chunk';
import type { StubMembers } from './stub.test.helper';
import { stub } from './stub.test.helper';

/** What a test's logger recorded, by level. */
export interface LoggedLines {
    debug: string[];
    verbose: string[];
}

/**
 * A player called Steve standing at the origin of a world whose only loaded chunk is the one
 * at the origin, for handlers that check a block position a client sent.
 *
 * `blocks` says what stands where, as `"x,y,z"` to a block name; every other position is
 * air. Asking for any other chunk gets null, the way `World.getLoadedChunk` answers for a
 * chunk that is not in memory. The logger keeps each line said at debug and verbose level.
 *
 * @param blocks - Block names by `"x,y,z"` position inside the origin chunk.
 * @param player - Members to add to or replace on the player, such as an inventory.
 */
export const sessionNearBlocks = (blocks: Record<string, string>, player: StubMembers<Player> = {}) => {
    const logged: LoggedLines = { debug: [], verbose: [] };

    const chunk = stub<Chunk>({
        getBlock: (x: Vector3 | number, y = 0, z = 0) => {
            const key = x instanceof Vector3 ? `${x.getX()},${x.getY()},${x.getZ()}` : `${x},${y},${z}`;
            return new BlockState(blocks[key] ?? 'minecraft:air');
        }
    });
    const world = stub<World>({ getLoadedChunk: (cx, cz) => (cx === 0 && cz === 0 ? chunk : null) });
    const steve = stub<Player>({
        getName: () => 'Steve',
        getPosition: () => new Position(0, 0, 0, world),
        getWorld: () => world,
        ...player
    });
    const server = stub<Server>({
        getLogger: () =>
            stub<Logger>({
                debug: (...message) => void logged.debug.push(message[0] ?? ''),
                verbose: (...message) => void logged.verbose.push(message[0] ?? '')
            })
    });
    const session = stub<PlayerSession>({ getPlayer: () => steve });

    return { logged, player: steve, server, session };
};
