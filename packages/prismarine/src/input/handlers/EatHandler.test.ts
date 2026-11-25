import { ActorEvent } from '@jsprismarine/protocol/bedrock/packet/ActorEventPacket';
import { describe, expect, it } from 'vitest';

import type { StorePlayerActor } from '../../entity/data/storePlayers';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type PlayerSession from '../../player/PlayerSession';
import EatHandler from './EatHandler';

/** The sender in a world that records the actor events it is asked to send. */
const setup = (actor: StorePlayerActor | undefined) => {
    const sent: Parameters<World['sendActorEvent']>[] = [];
    const session = stub<PlayerSession>({
        runtimeId: 7n,
        identity: identityNamed('runner'),
        getActor: () => actor,
        getWorld: () => stub<World>({ sendActorEvent: (...args) => void sent.push(args) })
    });
    return { sent, ...inputContext(session) };
};

describe('EatHandler', () => {
    it('relays a feed about the sender to the players watching it', () => {
        const actor = stub<StorePlayerActor>({ getRuntimeId: () => 7n });
        const { sent, context, outputs } = setup(actor);

        expect(new EatHandler().handle({ kind: 'eat', item: 260 }, context)).toBeUndefined();

        expect(sent).toStrictEqual([[actor, ActorEvent.FEED, 260]]);
        // Logged in the handler's unit, so there is nothing to hand the input step.
        expect(outputs).toHaveLength(0);
    });

    it('relays nothing for a player whose entity is in no store', () => {
        const { sent, context } = setup(undefined);

        new EatHandler().handle({ kind: 'eat', item: 260 }, context);

        expect(sent).toEqual([]);
    });
});
