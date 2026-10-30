import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import ActorEventPacket, { ActorEvent } from '@jsprismarine/protocol/packet/ActorEventPacket';
import ActorEventHandler from './ActorEventHandler';

const setup = () => {
    const sendActorEvent = vi.fn<World['sendActorEvent']>(async () => {});
    const verbose = vi.fn();
    const player = stub<Player>({
        getName: () => 'runner',
        getRuntimeId: () => 7n,
        getWorld: () => stub<World>({ sendActorEvent })
    });
    const server = stub<Server>({ getLogger: () => stub<Logger>({ verbose }) });
    const session = stub<PlayerSession>({ getPlayer: () => player });

    return { sendActorEvent, verbose, player, server, session };
};

const event = (runtimeEntityId: bigint, kind: ActorEvent, data = 0) =>
    Object.assign(new ActorEventPacket(), { runtimeEntityId, event: kind, data });

describe('ActorEventHandler', () => {
    it('relays a FEED about the sender to the players watching it', async () => {
        const { sendActorEvent, verbose, player, server, session } = setup();

        await new ActorEventHandler().handle(event(7n, ActorEvent.FEED, 260), server, session);

        expect(sendActorEvent).toHaveBeenCalledExactlyOnceWith(player, ActorEvent.FEED, 260);
        expect(verbose).not.toHaveBeenCalled();
    });

    it('drops an event that names another actor', async () => {
        // A vanilla client echoes a FEED it was sent about somebody else, so this is logged
        // rather than treated as an attack. A modified client naming a mob lands here too.
        const { sendActorEvent, verbose, server, session } = setup();

        await new ActorEventHandler().handle(event(8n, ActorEvent.FEED, 260), server, session);

        expect(sendActorEvent).not.toHaveBeenCalled();
        expect(verbose).toHaveBeenCalledExactlyOnceWith(
            'Dropped actor event 57 from runner: it names actor 8, not the sender',
            'ActorEventHandler/handle'
        );
    });

    it('drops a server-only event, even about the sender', async () => {
        const { sendActorEvent, verbose, server, session } = setup();

        await new ActorEventHandler().handle(event(7n, ActorEvent.HURT_ANIMATION), server, session);

        expect(sendActorEvent).not.toHaveBeenCalled();
        expect(verbose).toHaveBeenCalledExactlyOnceWith(
            'Dropped actor event 2 from runner: a client does not send it',
            'ActorEventHandler/handle'
        );
    });
});
