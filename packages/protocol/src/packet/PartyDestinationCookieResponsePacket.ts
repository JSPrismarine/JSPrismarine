import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { partyDestinationCookieResponsePacket } from '../wire/definitions/partyDestinationCookieResponse';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `PartyDestinationCookieResponsePacket`, in wire order. */
export interface PartyDestinationCookieResponse {
    /** `cookie`: the cookie from the `SendPartyDestinationCookiePacket` being answered, at most 2048 bytes. */
    cookie: string;
    /** `accepted`: the client took the party destination. */
    accepted: boolean;
}

/**
 * The client's answer to a `SendPartyDestinationCookiePacket`.
 *
 * Layout at protocols 2193 and 2225, in wire order: `cookie` as a string (a varuint32 byte length
 * followed by UTF-8), then `accepted` as one byte.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/party-destination-cookie-response-packet/
 */
export default class PartyDestinationCookieResponsePacket extends NetworkPacket<PartyDestinationCookieResponse> {
    public get id(): number {
        return PacketIdentifier.PARTY_DESTINATION_COOKIE_RESPONSE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PartyDestinationCookieResponse): void {
        layoutAt(partyDestinationCookieResponsePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PartyDestinationCookieResponse {
        return layoutAt(partyDestinationCookieResponsePacket, this.codecProtocol).decode(stream);
    }
}
