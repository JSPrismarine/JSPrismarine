import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { LoggedLines } from '../../testing/blockTarget.test.helper';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import PartyChangedPacket from '@jsprismarine/protocol/packet/PartyChangedPacket';
import PlayerPartyInfo from '@jsprismarine/protocol/structure/PlayerPartyInfo';
import PartyChangedHandler from './PartyChangedHandler';

const fakeSession = () => {
    const logged: LoggedLines = { debug: [], verbose: [] };
    const log = stub<Logger>({
        debug: (...message) => void logged.debug.push(message[0] ?? ''),
        verbose: (...message) => void logged.verbose.push(message[0] ?? '')
    });
    const session = stub<PlayerSession>({ identity: STEVE });

    return { logged, context: sessionContext(session, { log }) };
};

const change = (partyId: string, isPartyLeader = false) =>
    new PartyChangedPacket({ partyInfo: new PlayerPartyInfo(partyId, isPartyLeader) });

describe('PartyChangedHandler', () => {
    it('logs the party and the leader role', () => {
        const { logged, context } = fakeSession();

        new PartyChangedHandler().handle(change('party-1', true), context);

        expect(logged.debug).toEqual(['Steve is in party party-1 as its leader. Parties are not tracked']);
        expect(logged.verbose).toEqual([]);
    });

    it('logs a member without the leader role', () => {
        const { logged, context } = fakeSession();

        new PartyChangedHandler().handle(change('party-1'), context);

        expect(logged.debug).toEqual(['Steve is in party party-1. Parties are not tracked']);
    });

    it('reads an empty id as leaving the party', () => {
        const { logged, context } = fakeSession();

        new PartyChangedHandler().handle(change(''), context);

        expect(logged.debug).toEqual(['Steve left its party. Parties are not tracked']);
    });

    it('drops an id longer than the schema allows', () => {
        const { logged, context } = fakeSession();

        new PartyChangedHandler().handle(change('x'.repeat(50)), context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a party change from Steve: the party id is 50 characters, more than the 49 allowed'
        ]);
    });
});
