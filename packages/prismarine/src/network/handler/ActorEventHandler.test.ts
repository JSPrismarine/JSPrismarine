import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type { StorePlayerActor } from '../../entity/data/storePlayers';
import type PlayerSession from '../PlayerSession';
import ActorEventPacket, { ActorEvent } from '@jsprismarine/protocol/packet/ActorEventPacket';
import ActorEventHandler from './ActorEventHandler';

const setup = () => {
    const sendActorEvent = vi.fn<World['sendActorEvent']>(async () => {});
    const verbose = vi.fn();
    const player = stubPlayerPort({ getRuntimeId: () => 7n });
    const actor = stub<StorePlayerActor>({ getRuntimeId: () => 7n });
    const log = stub<Logger>({ verbose });
    const session = stub<PlayerSession>({
        runtimeId: 7n,
        identity: identityNamed('runner'),
        getPlayer: () => player,
        getActor: () => actor,
        getWorld: () => stub<World>({ sendActorEvent })
    });

    return { sendActorEvent, verbose, player, actor, log, session };
};

const event = (runtimeEntityId: bigint, kind: ActorEvent, data = 0) =>
    Object.assign(new ActorEventPacket(), { runtimeEntityId, event: kind, data });

describe('ActorEventHandler', () => {
    it('relays a FEED about the sender to the players watching it', async () => {
        const { sendActorEvent, verbose, actor, log, session } = setup();
        const { context, outputs, settled } = inputContext(session, { log });

        new ActorEventHandler().handle(event(7n, ActorEvent.FEED, 260), context);
        await settled();

        expect(sendActorEvent).toHaveBeenCalledExactlyOnceWith(actor, ActorEvent.FEED, 260);
        // Handed to the input step rather than awaited.
        expect(outputs).toHaveLength(1);
        expect(verbose).not.toHaveBeenCalled();
    });

    it('drops an event that names another actor', async () => {
        // A vanilla client echoes a FEED it was sent about somebody else, so this is logged
        // rather than treated as an attack. A modified client naming a mob lands here too.
        const { sendActorEvent, verbose, log, session } = setup();
        const { context, outputs } = inputContext(session, { log });

        new ActorEventHandler().handle(event(8n, ActorEvent.FEED, 260), context);

        expect(sendActorEvent).not.toHaveBeenCalled();
        expect(outputs).toHaveLength(0);
        expect(verbose).toHaveBeenCalledExactlyOnceWith(
            'Dropped actor event 57 from runner: it names actor 8, not the sender',
            'ActorEventHandler/handle'
        );
    });

    it('drops a server-only event, even about the sender', async () => {
        const { sendActorEvent, verbose, log, session } = setup();
        const { context, outputs } = inputContext(session, { log });

        new ActorEventHandler().handle(event(7n, ActorEvent.HURT_ANIMATION), context);

        expect(sendActorEvent).not.toHaveBeenCalled();
        expect(outputs).toHaveLength(0);
        expect(verbose).toHaveBeenCalledExactlyOnceWith(
            'Dropped actor event 2 from runner: a client does not send it',
            'ActorEventHandler/handle'
        );
    });
});
