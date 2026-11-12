import type { Logger } from '@jsprismarine/logger';
import { LevelSoundEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { Position } from '../../world/Position';
import type { OccurrenceKinds } from '../../world/changelog/ChangeEntry';
import type { World } from '../../world/World';
import type { StubMembers } from '../../testing/stub.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import LevelSoundEventPacket from '@jsprismarine/protocol/packet/LevelSoundEventPacket';
import LevelSoundEventHandler from './LevelSoundEventHandler';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { inputContext } from '../../testing/handlerContext.test.helper';

const SENDER_ID = 7n;

/** A sender at the origin, in a world that records the sounds it is asked to relay. */
const fakeSession = () => {
    const played: OccurrenceKinds['relayed-sound'][] = [];
    const world = stub<World>({ relaySound: (sound) => void played.push(sound) });
    const player = stubPlayerPort({ getPosition: () => new Position(0, 64, 0, world) });

    const session = stub<PlayerSession>({
        runtimeId: SENDER_ID,
        identity: identityNamed('tester'),
        getPlayer: () => player,
        getWorld: () => world
    });
    const { context } = inputContext(session, { log: stub<Logger>({ verbose: () => {} }) });

    return { played, context };
};

const soundAt = (x: number, y: number, z: number, fields: StubMembers<LevelSoundEventPacket> = {}) =>
    Object.assign(new LevelSoundEventPacket(), {
        sound: LevelSoundEvent.ATTACK_NODAMAGE,
        positionX: x,
        positionY: y,
        positionZ: z,
        ...fields
    });

describe('LevelSoundEventHandler', () => {
    it('relays a sound the sender is standing next to', () => {
        const { played, context } = fakeSession();

        new LevelSoundEventHandler().handle(soundAt(2, 64, 1), context);

        expect(played.map(({ sender, x, y, z }) => [sender, x, y, z])).toEqual([[SENDER_ID, 2, 64, 1]]);
    });

    it('relays a sound the sender attributes to itself', () => {
        const { played, context } = fakeSession();

        new LevelSoundEventHandler().handle(
            soundAt(0, 64, 0, { entityUniqueId: SENDER_ID, entityType: 'minecraft:player' }),
            context
        );

        expect(played).toHaveLength(1);
    });

    it('drops a sound reported from somewhere the sender is not', () => {
        const { played, context } = fakeSession();

        new LevelSoundEventHandler().handle(soundAt(5000, 64, -5000), context);

        expect(played).toEqual([]);
    });

    it('drops a sound attributed to another actor', () => {
        const { played, context } = fakeSession();

        new LevelSoundEventHandler().handle(soundAt(0, 64, 0, { entityUniqueId: 99n }), context);

        expect(played).toEqual([]);
    });

    it('drops a sound attributed to another kind of actor', () => {
        const { played, context } = fakeSession();

        new LevelSoundEventHandler().handle(soundAt(0, 64, 0, { entityType: 'minecraft:zombie' }), context);

        expect(played).toEqual([]);
    });
});
