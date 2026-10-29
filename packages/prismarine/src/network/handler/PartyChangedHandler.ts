import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type PartyChangedPacket from '../packet/PartyChangedPacket';
import { MAX_PARTY_ID_LENGTH } from '../packet/PartyChangedPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client reporting a platform party change.
 *
 * The party lives on the platform, so there is nothing for the server to apply. An id longer
 * than the schema allows is dropped at verbose level; the rest are recorded at debug level
 * and dropped too. Known gap: the id is not kept, so nothing here can tell which players
 * arrived together.
 */
export default class PartyChangedHandler implements PacketHandler<PartyChangedPacket> {
    public static PacketName = 'PartyChangedPacket';
    public readonly phases = ['play'] as const;

    /** Checks the id length, then logs whether the player joined, leads or left a party. */
    public handle(packet: PartyChangedPacket, server: Server, session: PlayerSession): void {
        const name = session.getPlayer().getName();

        if (packet.partyId.length > MAX_PARTY_ID_LENGTH) {
            server
                .getLogger()
                .verbose(
                    `Dropped a party change from ${name}: the party id is ${packet.partyId.length} characters, more than the ${MAX_PARTY_ID_LENGTH} allowed`,
                    'PartyChangedHandler/handle'
                );
            return;
        }

        const change =
            packet.partyId === ''
                ? 'left its party'
                : `is in party ${packet.partyId}${packet.isPartyLeader ? ' as its leader' : ''}`;

        server.getLogger().debug(`${name} ${change}. Parties are not tracked`, 'PartyChangedHandler/handle');
    }
}
