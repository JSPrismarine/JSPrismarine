import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import type { ActorLink } from '../packet/AddActorPacket';
import { ActorLinkType } from '../packet/AddActorPacket';
import SetActorLinkPacket from '../packet/SetActorLinkPacket';
import SetActorLinkHandler from './SetActorLinkHandler';

const setup = () => {
    const debug = vi.fn();
    const verbose = vi.fn();
    const server = stub<Server>({ getLogger: () => stub<Logger>({ debug, verbose }) });
    const session = stub<PlayerSession>({
        getPlayer: () => stub<Player>({ getName: () => 'Steve', getRuntimeId: () => 34n })
    });
    return { debug, verbose, server, session };
};

const packet = (targetA: bigint, targetB: bigint) => {
    const link: ActorLink = {
        targetA,
        targetB,
        type: ActorLinkType.Riding,
        immediate: false,
        passengerInitiated: true,
        vehicleAngularVelocity: 0
    };
    return Object.assign(new SetActorLinkPacket(), { link });
};

describe('SetActorLinkHandler', () => {
    it('logs a link with the sender as the rider', () => {
        const { debug, verbose, server, session } = setup();

        new SetActorLinkHandler().handle(packet(12n, 34n), server, session);

        expect(debug).toHaveBeenCalledExactlyOnceWith(
            'Steve reported actor link type 1 between 12 and 34. Riding is not modeled',
            'SetActorLinkHandler/handle'
        );
        expect(verbose).not.toHaveBeenCalled();
    });

    it('logs a link with the sender as the vehicle', () => {
        const { debug, server, session } = setup();

        new SetActorLinkHandler().handle(packet(34n, 12n), server, session);

        expect(debug).toHaveBeenCalledOnce();
    });

    it('drops a link between two other actors', () => {
        const { debug, verbose, server, session } = setup();

        new SetActorLinkHandler().handle(packet(12n, 56n), server, session);

        expect(debug).not.toHaveBeenCalled();
        expect(verbose).toHaveBeenCalledExactlyOnceWith(
            'Dropped actor link type 1 from Steve: it joins 12 and 56, neither of them the sender',
            'SetActorLinkHandler/handle'
        );
    });
});
