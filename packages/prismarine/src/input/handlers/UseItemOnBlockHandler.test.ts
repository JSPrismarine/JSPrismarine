import type { Logger } from '@jsprismarine/logger';
import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { ServerItemActorPort } from '../../item/actorPort';
import type Chunk from '../../world/chunk/Chunk';
import { Dimensions } from '../../world/DimensionType';
import type { Level } from '../../world/Level';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type { Intent } from '../Intent';
import UseItemOnBlockHandler from './UseItemOnBlockHandler';

/** A player at the origin whose world has its chunks loaded or not; every content lookup is counted. */
const scene = (gamemode: Gametype, { loaded = true } = {}) => {
    const offered: string[] = [];
    const world = stub<World>({
        getLoadedChunk: () => (loaded ? stub<Chunk>({}) : null),
        getDimension: () => Dimensions.Overworld,
        getLevel: () => stub<Level>({ name: 'test' })
    });
    const session = stub<PlayerSession>({
        identity: identityNamed('tester'),
        getWorld: () => world,
        getPlayer: () => stubPlayerPort({ gamemode, getPosition: () => new Position(0, 0, 0, world) })
    });
    const use = (position: Intent<'useItemOnBlock'>['position']) => {
        const { context } = inputContext(session, {
            log: stub<Logger>({ verbose: () => {}, error: () => {} }),
            services: {
                contentWorld: {
                    actorsAt: () => {
                        offered.push(`${position.x},${position.y},${position.z}`);
                        return stub<ServerItemActorPort>();
                    }
                }
            }
        });
        new UseItemOnBlockHandler().handle(
            { kind: 'useItemOnBlock', position, face: 1, faceLocation: { x: 0.5, y: 1, z: 0.5 } },
            context
        );
    };
    return { offered, use };
};

describe('UseItemOnBlockHandler', () => {
    it('offers a click within reach in a loaded chunk to the content', () => {
        const { offered, use } = scene(Gametype.SURVIVAL);

        use({ x: 1, y: -1, z: 1 });

        expect(offered).toEqual(['1,-1,1']);
    });

    it('drops a spectator, a block out of reach and one in a chunk that is not loaded', () => {
        const spectator = scene(Gametype.SPECTATOR);
        spectator.use({ x: 1, y: -1, z: 1 });
        const far = scene(Gametype.SURVIVAL);
        far.use({ x: 500, y: 0, z: 0 });
        const unloaded = scene(Gametype.SURVIVAL, { loaded: false });
        unloaded.use({ x: 1, y: -1, z: 1 });

        expect([...spectator.offered, ...far.offered, ...unloaded.offered]).toEqual([]);
    });
});
