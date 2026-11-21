import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { partyChangedPacket } from '../wire/definitions/partyChanged';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { PartyChangedPayload } from '../wire/definitions/partyChanged';

/** The fields of a `PartyChangedPacket`, in wire order. */
export type PartyChanged = PartyChangedPayload;

/**
 * The client reporting that its platform party changed.
 *
 * Layout at protocols 2193 and 2225, in wire order: `party_info` as an optional
 * `PlayerPartyInfo`, that is a presence byte, then `party_id` as a string and `is_party_leader`
 * as one byte when present. See `wire/definitions/partyChanged.ts` for why 2193 carries the
 * presence byte.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/party-changed-packet/
 */
export default class PartyChangedPacket extends NetworkPacket<PartyChanged> {
    public get id(): number {
        return PacketIdentifier.PARTY_CHANGED;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PartyChanged): void {
        layoutAt(partyChangedPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PartyChanged {
        return layoutAt(partyChangedPacket, this.codecProtocol).decode(stream);
    }
}
