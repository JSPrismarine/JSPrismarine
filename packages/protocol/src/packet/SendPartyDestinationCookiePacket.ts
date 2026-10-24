import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * `PartyDestinationCookieIntent`: why the server hands the client a cookie. The schema types
 * it as an int8 without `Enum-as-Value`, so Cereal writes the member name as a string, which
 * is what gophertunnel at protocol 2193 sends. Mojang's enum table numbers the members
 * `Notify` 0, `OptIn` 1 and `OptOut` 2; those numbers never reach the wire.
 */
export enum PartyDestinationCookieIntent {
    Notify = 'Notify',
    OptIn = 'OptIn',
    OptOut = 'OptOut'
}

const INTENT_NAMES: readonly string[] = Object.values(PartyDestinationCookieIntent);

const isIntent = (name: string): name is PartyDestinationCookieIntent => INTENT_NAMES.includes(name);

/** The fields of a `SendPartyDestinationCookiePacket`, in wire order. */
export interface SendPartyDestinationCookie {
    /** `cookie`: the opaque party destination cookie, at most 2048 bytes. */
    cookie: string;
    /** `intent`. */
    intent: PartyDestinationCookieIntent;
    /** `destination_name`: the destination the cookie refers to, at most 64 bytes. */
    destinationName: string;
}

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
        stream.writeString(data.cookie);
        stream.writeString(data.intent);
        stream.writeString(data.destinationName);
    }

    /**
     * Reads the three strings.
     * @throws when `intent` is not one of the three member names.
     */
    protected deserializePayload(stream: NetworkBinaryStream): SendPartyDestinationCookie {
        const cookie = stream.readString();
        const intent = stream.readString();
        if (!isIntent(intent)) throw new Error(`Unknown party destination cookie intent "${intent}"`);
        const destinationName = stream.readString();

        return { cookie, intent, destinationName };
    }
}
