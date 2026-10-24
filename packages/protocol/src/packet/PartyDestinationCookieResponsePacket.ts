import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

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
 * Protocol 2193 layout, in wire order: `cookie` as a string (a varuint32 byte length followed
 * by UTF-8), then `accepted` as one byte.
 */
export default class PartyDestinationCookieResponsePacket extends NetworkPacket<PartyDestinationCookieResponse> {
    public get id(): number {
        return PacketIdentifier.PARTY_DESTINATION_COOKIE_RESPONSE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PartyDestinationCookieResponse): void {
        stream.writeString(data.cookie);
        stream.writeBoolean(data.accepted);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PartyDestinationCookieResponse {
        return {
            cookie: stream.readString(),
            accepted: stream.readBoolean()
        };
    }
}
