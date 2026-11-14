/**
 * `PartyChangedPacket`: the client reporting that its platform party changed.
 *
 * Layout at protocols 2193 and 2225: `party_info` as an optional `PlayerPartyInfo`, that is a
 * presence byte, then `party_id` as a string and `is_party_leader` as one byte when present.
 * The 1.26.50 page prints the field as required and the 1.26.60 page prints it as optional; the
 * 1.26.60-preview.21 changelog row says it "is now optional", which Mojang's note for that build
 * gives as a correction of the docs, not a wire change, so both versions carry the presence byte
 * (docs/research/protocol-2225-delta.md, "is now optional" rows).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/party-changed-packet/
 */
import PlayerPartyInfo from '../../structure/PlayerPartyInfo';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/**
 * `PlayerPartyInfo` as the {@link PlayerPartyInfo} structure class: `party_id` as a string, then
 * `is_party_leader` as one byte. Local because the class reads and writes through
 * `NetworkBinaryStream` methods that a layout's plain stream does not have; the bytes are the same.
 */
const playerPartyInfo = t.custom<PlayerPartyInfo>(
    'PlayerPartyInfo',
    (stream, value) => {
        t.string.write(stream, value.partyId);
        t.bool.write(stream, value.isPartyLeader);
    },
    (stream) => new PlayerPartyInfo(t.string.read(stream), t.bool.read(stream))
);

/** The fields the client sends when its platform party changes. */
export const partyChangedPacket = definePacket('PartyChangedPacket', {
    /** `party_info`: the party the client is now in and whether it leads it; `null` when the client sent none. */
    partyInfo: t.optional(playerPartyInfo)
});

/** The fields of a `PartyChangedPacket`, in wire order. */
export type PartyChangedPayload = PayloadOf<typeof partyChangedPacket>;
