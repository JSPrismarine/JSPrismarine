import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type { NetworkWorldReplicator, WorldReplicators } from '../NetworkWorldReplicator';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import LevelSoundEventHandler from './LevelSoundEventHandler';

/** A sender at the origin, and a replicator that records where it was asked to play a sound. */
const fakeSession = () => {
    const played: Vector3[] = [];
    const world = stub<World>({});
    const player = stub<Player>({
        getName: () => 'tester',
        getPosition: () => new Position(0, 64, 0, world),
        getWorld: () => world
    });

    const replicator = stub<NetworkWorldReplicator>({
        sendAround: (position) => void played.push(position)
    });

    return {
        played,
        server: stub<Server>({
            getLogger: () => stub<Logger>({ verbose: () => {} }),
            getWorldReplicators: () => stub<WorldReplicators>({ for: () => replicator })
        }),
        session: stub<PlayerSession>({ getPlayer: () => player })
    };
};

const soundAt = (x: number, y: number, z: number) =>
    Object.assign(new LevelSoundEventPacket(), { sound: 1, positionX: x, positionY: y, positionZ: z });

describe('LevelSoundEventHandler', () => {
    it('relays a sound the sender is standing next to', async () => {
        const { played, server, session } = fakeSession();

        await new LevelSoundEventHandler().handle(soundAt(2, 64, 1), server, session);

        expect(played).toEqual([new Vector3(2, 64, 1)]);
    });

    it('drops a sound reported from somewhere the sender is not', async () => {
        const { played, server, session } = fakeSession();

        await new LevelSoundEventHandler().handle(soundAt(5000, 64, -5000), server, session);

        expect(played).toEqual([]);
    });
});
