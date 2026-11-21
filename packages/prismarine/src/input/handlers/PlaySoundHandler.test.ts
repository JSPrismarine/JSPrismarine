import { LevelSoundEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { OccurrenceKinds } from '../../world/changelog/ChangeEntry';
import type { World } from '../../world/World';
import type PlayerSession from '../../network/PlayerSession';
import type { Intent } from '../Intent';
import PlaySoundHandler from './PlaySoundHandler';

const SENDER_ID = 7n;

/** A sender at the origin, in a world that records the sounds it is asked to relay. */
const fakeSession = () => {
    const played: OccurrenceKinds['relayed-sound'][] = [];
    const logged: string[] = [];
    const world = stub<World>({ relaySound: (sound) => void played.push(sound) });
    const player = stubPlayerPort({ getPosition: () => new Position(0, 64, 0, world) });
    const session = stub<PlayerSession>({
        runtimeId: SENDER_ID,
        identity: identityNamed('tester'),
        getPlayer: () => player,
        getWorld: () => world
    });
    const log = stub<Logger>({ verbose: (...message) => void logged.push(String(message[0] ?? '')) });
    return { played, logged, context: inputContext(session, { log }).context };
};

const soundAt = (x: number, y: number, z: number): Intent<'playSound'> => ({
    kind: 'playSound',
    x,
    y,
    z,
    sound: LevelSoundEvent.ATTACK_NODAMAGE,
    data: -1,
    type: '',
    baby: false,
    global: false,
    actor: -1n,
    firedAt: null
});

describe('PlaySoundHandler', () => {
    it('relays a sound the sender is standing next to, from its own position and under the sender', () => {
        const { played, logged, context } = fakeSession();

        new PlaySoundHandler().handle(soundAt(2, 64, 1), context);

        expect(played.map(({ sender, x, y, z }) => [sender, x, y, z])).toEqual([[SENDER_ID, 2, 64, 1]]);
        expect(logged).toEqual([]);
    });

    it('drops a sound reported from somewhere the sender is not', () => {
        const { played, logged, context } = fakeSession();

        new PlaySoundHandler().handle(soundAt(5000, 64, -5000), context);

        expect(played).toEqual([]);
        expect(logged).toEqual([
            `Dropped sound attack.nodamage from tester: reported ${Math.hypot(5000, 5000).toFixed(1)} away`
        ]);
    });

    it('drops a sound at a position that is not a number', () => {
        const { played, context } = fakeSession();

        new PlaySoundHandler().handle(soundAt(Number.NaN, 64, 0), context);

        expect(played).toEqual([]);
    });
});
