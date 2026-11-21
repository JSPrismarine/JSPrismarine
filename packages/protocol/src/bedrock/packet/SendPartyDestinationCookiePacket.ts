import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { sendPartyDestinationCookiePacket } from '../wire/definitions/sendPartyDestinationCookie';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { SendPartyDestinationCookiePayload } from '../wire/definitions/sendPartyDestinationCookie';

import { PartyDestinationCookieIntent } from '../wire/definitions/sendPartyDestinationCookie';
export { PartyDestinationCookieIntent };

/** The fields of a `SendPartyDestinationCookiePacket`, in wire order. */
export type SendPartyDestinationCookie = SendPartyDestinationCookiePayload;

/**
 * Hands the client a party destination cookie. The client answers with a
 * `PartyDestinationCookieResponsePacket` echoing the cookie.
 *
 * Protocol 2193 layout, in wire order: `cookie` as a string, `intent` as the
 * {@link PartyDestinationCookieIntent} member name as a string, then `destination_name` as a
 * string. Strings are a varuint32 byte length followed by UTF-8.
 */
export default class SendPartyDestinationCookiePacket extends NetworkPacket<SendPartyDestinationCookie> {
    public get id(): number {
        return PacketIdentifier.SEND_PARTY_DESTINATION_COOKIE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SendPartyDestinationCookie): void {
        layoutAt(sendPartyDestinationCookiePacket, this.codecProtocol).encode(stream, data);
    }

    /**
     * Reads the three strings.
     * @throws when `intent` is not one of the three member names.
     */
    protected deserializePayload(stream: NetworkBinaryStream): SendPartyDestinationCookie {
        return layoutAt(sendPartyDestinationCookiePacket, this.codecProtocol).decode(stream);
    }
}
