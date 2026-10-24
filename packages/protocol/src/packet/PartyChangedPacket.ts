import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import PlayerPartyInfo from '../structure/PlayerPartyInfo';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `PartyChangedPacket`, in wire order. */
export interface PartyChanged {
    /** `party_info`, the party the client is now in and whether it leads it. */
    partyInfo: PlayerPartyInfo;
}

/**
 * The client reporting that its platform party changed.
 *
 * Protocol 2193 layout, in wire order: `party_info` as a {@link PlayerPartyInfo}, that is
 * `party_id` as a string then `is_party_leader` as one byte. At 2193 the field is required
 * and has no presence byte; 1.26.60-preview.21 (protocol 2207) made it optional.
 */
export default class PartyChangedPacket extends NetworkPacket<PartyChanged> {
    public get id(): number {
        return PacketIdentifier.PARTY_CHANGED;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PartyChanged): void {
        data.partyInfo.serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PartyChanged {
        return { partyInfo: PlayerPartyInfo.deserialize(stream) };
    }
}
