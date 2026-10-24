import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import { ActorLinkType } from '../packet/AddActorPacket';
import SetActorLinkPacket from '../packet/SetActorLinkPacket';
import SetActorLinkHandler from './SetActorLinkHandler';

describe('SetActorLinkHandler', () => {
    it('logs the two actors and the link type', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new SetActorLinkPacket(), {
            link: {
                targetA: 12n,
                targetB: 34n,
                type: ActorLinkType.Riding,
                immediate: false,
                passengerInitiated: true,
                vehicleAngularVelocity: 0
            }
        });

        new SetActorLinkHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve reported actor link type 1 between 12 and 34. Riding is not modeled']);
    });
});
