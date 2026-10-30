import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/** Maximum character count in `PlayerPartyInfo.partyId`. */
export const MAX_PARTY_ID_LENGTH = 49;

/**
 * A `PlayerPartyInfo`: the platform party a player is in and whether it leads that party.
 * `PartyChangedPacket` carries one, and the login `ConnectionRequest` reports the same pair.
 *
 * Protocol 2193 wire order:
 * 0. `party_id`: string, at most 49 characters. Empty when the player is in no party.
 * 1. `is_party_leader`: one byte.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/player-party-info/}
 */
export default class PlayerPartyInfo extends NetworkStructure {
    /**
     * Creates the party info from its fields. Both parameters have a default so the static
     * `deserialize` can construct an empty instance before reading the stream.
     * @param partyId - `party_id`, the platform's party identifier; empty for no party.
     * @param isPartyLeader - `is_party_leader`.
     */
    public constructor(
        public partyId = '',
        public isPartyLeader = false
    ) {
        super();
    }

    /** Writes the id then the leader flag. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.partyId);
        stream.writeBoolean(this.isPartyLeader);
    }

    /** Reads the id then the leader flag. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.partyId = stream.readString();
        this.isPartyLeader = stream.readBoolean();
    }
}
