import type { Logger } from '@jsprismarine/logger';
import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { EntityStore } from '../../entity/data/EntityStore';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import type { ServerItemActorPort } from '../../item/actorPort';
import type Chunk from '../../world/chunk/Chunk';
import { Dimensions } from '../../world/DimensionType';
import type { Level } from '../../world/Level';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type { Intent } from '../Intent';
import { enderEyeEcho } from './eyeOfEnderEcho';
import UseItemOnBlockHandler from './UseItemOnBlockHandler';

/** A player at the origin whose world has its chunks loaded or not; every content lookup is counted. */
const scene = (gamemode: Gametype, { loaded = true, held }: { loaded?: boolean; held?: Item } = {}) => {
    const offered: string[] = [];
    const world = stub<World>({
        getEntityStore: () => new EntityStore(),
        getLoadedChunk: () => (loaded ? stub<Chunk>({}) : null),
        getDimension: () => Dimensions.Overworld,
        getLevel: () => stub<Level>({ name: 'test' })
    });
    const inventory = new HumanInventory();
    if (held !== undefined) inventory.container('inventory').set(inventory.getHandSlot(), held);
    const session = stub<PlayerSession>({
        runtimeId: 7n,
        identity: identityNamed('tester'),
        getWorld: () => world,
        getPlayer: () =>
            stubPlayerPort({
                gamemode,
                getPosition: () => new Position(0, 0, 0, world),
                getInventory: () => inventory
            })
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
    return { offered, use, session };
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

    it('leaves no echo to refuse after an eye of ender the block declined, so the air use throws it', () => {
        const { offered, use, session } = scene(Gametype.SURVIVAL, {
            held: new Item({ runtimeId: 2, name: 'minecraft:ender_eye' })
        });

        // Nothing in the test content takes the click, so the block declines the eye.
        use({ x: 1, y: -1, z: 1 });

        expect(offered).toEqual(['1,-1,1']);
        expect(enderEyeEcho.isEcho(session.runtimeId, 0)).toBe(false);
    });
});
