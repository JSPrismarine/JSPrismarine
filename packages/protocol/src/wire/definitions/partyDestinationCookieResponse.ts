/**
 * `PartyDestinationCookieResponsePacket`: The client's answer to a
 * `SendPartyDestinationCookiePacket`.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `PartyDestinationCookieResponsePacket` field list. */
export const partyDestinationCookieResponsePacket = definePacket('PartyDestinationCookieResponsePacket', {
    /** `cookie`: the cookie from the `SendPartyDestinationCookiePacket` being answered, at most 2048 bytes. */
    cookie: t.string,
    /** `accepted`: the client took the party destination. */
    accepted: t.bool
});

/** The client's answer to a `SendPartyDestinationCookiePacket`. */
export type PartyDestinationCookieResponsePayload = PayloadOf<typeof partyDestinationCookieResponsePacket>;
