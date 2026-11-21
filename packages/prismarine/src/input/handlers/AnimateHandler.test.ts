import { AnimateAction } from '@jsprismarine/protocol/bedrock/packet/AnimatePacket';
import { describe, expect, it } from 'vitest';

import type { OccurrenceKinds } from '../../world/changelog/ChangeEntry';
import type { World } from '../../world/World';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../../network/PlayerSession';
import AnimateHandler from './AnimateHandler';

const SELF = 7n;

/** The sender in a world that records the animations it is asked to show, and the events posted. */
const fakeWorld = () => {
    const relayed: OccurrenceKinds['animate'][] = [];
    const posted: string[] = [];
    const world = stub<World>({ relayAnimation: (animation) => void relayed.push(animation) });
    const session = stub<PlayerSession>({
        runtimeId: SELF,
        identity: { ...STEVE, name: 'tester' },
        getWorld: () => world
    });
    const { context, outputs } = inputContext(session, {
        services: {
            events: {
                post: (name, _event) => {
                    posted.push(name);
                    return 0;
                }
            }
        }
    });
    return { context, outputs, relayed, posted };
};

describe('input/handlers/AnimateHandler', () => {
    it('relays the swing under the sender runtime id as Bedrock action code, with its data and source', () => {
        const { context, relayed, posted } = fakeWorld();

        new AnimateHandler().handle({ kind: 'animate', animation: 'swing', data: 2.5, swingSource: 'attack' }, context);

        expect(relayed).toStrictEqual([
            { entity: SELF, action: AnimateAction.Swing, data: 2.5, swingSource: 'attack' }
        ]);
        expect(posted).toEqual(['playerSwing']);
    });

    it('maps each animation name onto its action code and posts no swing event for the others', () => {
        const { context, relayed, posted } = fakeWorld();
        const handler = new AnimateHandler();

        handler.handle({ kind: 'animate', animation: 'wakeUp', data: 0, swingSource: null }, context);
        handler.handle({ kind: 'animate', animation: 'criticalHit', data: 0, swingSource: null }, context);
        handler.handle({ kind: 'animate', animation: 'magicCriticalHit', data: 0, swingSource: null }, context);

        expect(relayed.map(({ action }) => action)).toEqual([
            AnimateAction.WakeUp,
            AnimateAction.CriticalHit,
            AnimateAction.MagicCriticalHit
        ]);
        expect(posted).toEqual([]);
    });

    it('logs the relay in its own unit and waits for nothing', () => {
        // The world sends it after the tick seals, so a handler that throws takes it back.
        const { context, outputs, relayed } = fakeWorld();

        const returned = new AnimateHandler().handle(
            { kind: 'animate', animation: 'swing', data: 0, swingSource: null },
            context
        );

        expect(returned).toBeUndefined();
        expect(outputs).toHaveLength(0);
        expect(relayed).toHaveLength(1);
    });
});
