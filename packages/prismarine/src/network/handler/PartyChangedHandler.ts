import type PartyChangedPacket from '@jsprismarine/protocol/packet/PartyChangedPacket';
import { MAX_PARTY_ID_LENGTH } from '@jsprismarine/protocol/structure/PlayerPartyInfo';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * The client reporting a platform party change.
 *
 * The party lives on the platform, so there is nothing for the server to apply. An id longer
 * than the schema allows is dropped at verbose level; the rest are recorded at debug level
 * and dropped too. Known gap: the id is not kept, so nothing here can tell which players
 * arrived together.
 */
export default class PartyChangedHandler implements ConnectionLaneHandler<PartyChangedPacket> {
    public static PacketName = 'PartyChangedPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Checks the id length, then logs whether the player joined, leads or left a party. */
    public handle(packet: PartyChangedPacket, { session, log }: SessionContext): void {
        const name = session.identity.name;
        const partyInfo = packet.getPacketData()?.partyInfo;
        if (partyInfo === undefined) throw new Error('Cannot handle a PartyChangedPacket without decoded data');

        if (partyInfo.partyId.length > MAX_PARTY_ID_LENGTH) {
            log.verbose(
                `Dropped a party change from ${name}: the party id is ${partyInfo.partyId.length} characters, more than the ${MAX_PARTY_ID_LENGTH} allowed`,
                'PartyChangedHandler/handle'
            );
            return;
        }

        const change =
            partyInfo.partyId === ''
                ? 'left its party'
                : `is in party ${partyInfo.partyId}${partyInfo.isPartyLeader ? ' as its leader' : ''}`;

        log.debug(`${name} ${change}. Parties are not tracked`, 'PartyChangedHandler/handle');
    }
}
