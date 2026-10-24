import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** The longest `party_id` the `PlayerPartyInfo` schema allows. */
export const MAX_PARTY_ID_LENGTH = 49;

/**
 * The client reporting that its platform party changed.
 *
 * A party is a platform feature (Xbox, PlayStation and the rest), not a server one, so the
 * server has nothing to do with the id beyond reading it. Read so that a 1.26.51 client
 * joining from a party does not log `Packet 0x156 isn't implemented`.
 *
 * **Bound To:** Server
 *
 * Protocol 2193 layout (docs id 342), one `party_info` as a `PlayerPartyInfo` in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | party_id | string | at most {@link MAX_PARTY_ID_LENGTH} characters; empty when the client left its party |
 * | is_party_leader | boolean | |
 *
 * At 2193 `party_info` is required and has no presence byte; 1.26.60-preview.21 (protocol
 * 2207) made it optional.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/party-changed-packet/
 */
export default class PartyChangedPacket extends DataPacket {
    public static NetID = Identifiers.PartyChangedPacket;

    /** party_id: the platform's id for the party, or an empty string for no party. */
    public partyId = '';

    /** is_party_leader: whether this client leads the party. */
    public isPartyLeader = false;

    /** Reads the party id and the leader flag. */
    public decodePayload(): void {
        this.partyId = NetworkUtil.readString(this);
        this.isPartyLeader = this.readBoolean();
    }

    /** Writes the party id and the leader flag. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.partyId);
        this.writeBoolean(this.isPartyLeader);
    }
}
