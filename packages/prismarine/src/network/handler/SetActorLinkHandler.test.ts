import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import { ActorLinkType } from '@jsprismarine/protocol/wire/definitions/addActor';
import type { ActorLink } from '@jsprismarine/protocol/wire/definitions/addActor';
import SetActorLinkPacket from '@jsprismarine/protocol/packet/SetActorLinkPacket';
import SetActorLinkHandler from './SetActorLinkHandler';

const setup = () => {
    const debug = vi.fn();
    const verbose = vi.fn();
    const log = stub<Logger>({ debug, verbose });
    const session = stub<PlayerSession>({ runtimeId: 34n, identity: STEVE });
    return { debug, verbose, context: sessionContext(session, { log }) };
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
        const { debug, verbose, context } = setup();

        new SetActorLinkHandler().handle(packet(12n, 34n), context);

        expect(debug).toHaveBeenCalledExactlyOnceWith(
            'Steve reported actor link type 1 between 12 and 34. Riding is not modeled',
            'SetActorLinkHandler/handle'
        );
        expect(verbose).not.toHaveBeenCalled();
    });

    it('logs a link with the sender as the vehicle', () => {
        const { debug, context } = setup();

        new SetActorLinkHandler().handle(packet(34n, 12n), context);

        expect(debug).toHaveBeenCalledOnce();
    });

    it('drops a link between two other actors', () => {
        const { debug, verbose, context } = setup();

        new SetActorLinkHandler().handle(packet(12n, 56n), context);

        expect(debug).not.toHaveBeenCalled();
        expect(verbose).toHaveBeenCalledExactlyOnceWith(
            'Dropped actor link type 1 from Steve: it joins 12 and 56, neither of them the sender',
            'SetActorLinkHandler/handle'
        );
    });
});
