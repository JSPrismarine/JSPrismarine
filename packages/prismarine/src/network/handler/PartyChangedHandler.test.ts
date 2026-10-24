import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import type { LoggedLines } from '../../testing/blockTarget.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import PartyChangedPacket from '../packet/PartyChangedPacket';
import PartyChangedHandler from './PartyChangedHandler';

const fakeSession = () => {
    const logged: LoggedLines = { debug: [], verbose: [] };
    const server = stub<Server>({
        getLogger: () =>
            stub<Logger>({
                debug: (...message) => void logged.debug.push(message[0] ?? ''),
                verbose: (...message) => void logged.verbose.push(message[0] ?? '')
            })
    });
    const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });

    return { logged, server, session };
};

const change = (partyId: string, isPartyLeader = false) =>
    Object.assign(new PartyChangedPacket(), { partyId, isPartyLeader });

describe('PartyChangedHandler', () => {
    it('logs the party and the leader role', () => {
        const { logged, server, session } = fakeSession();

        new PartyChangedHandler().handle(change('party-1', true), server, session);

        expect(logged.debug).toEqual(['Steve is in party party-1 as its leader. Parties are not tracked']);
        expect(logged.verbose).toEqual([]);
    });

    it('logs a member without the leader role', () => {
        const { logged, server, session } = fakeSession();

        new PartyChangedHandler().handle(change('party-1'), server, session);

        expect(logged.debug).toEqual(['Steve is in party party-1. Parties are not tracked']);
    });

    it('reads an empty id as leaving the party', () => {
        const { logged, server, session } = fakeSession();

        new PartyChangedHandler().handle(change(''), server, session);

        expect(logged.debug).toEqual(['Steve left its party. Parties are not tracked']);
    });

    it('drops an id longer than the schema allows', () => {
        const { logged, server, session } = fakeSession();

        new PartyChangedHandler().handle(change('x'.repeat(50)), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a party change from Steve: the party id is 50 characters, more than the 49 allowed'
        ]);
    });
});
