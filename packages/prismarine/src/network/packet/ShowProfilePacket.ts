import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Opens the Xbox profile card of one player on the client.
 *
 * Vanilla only sends it from a test command. The card is looked up by XUID, so the client
 * shows nothing for a player who is not signed in to Xbox Live.
 *
 * Wire order at protocol 2193: `Player XUID` as a string.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/show-profile-packet/
 */
export default class ShowProfilePacket extends DataPacket {
    public static NetID = Identifiers.ShowProfilePacket;

    /** The Xbox Live id of the player whose profile the client opens. */
    public xuid = '';

    /** Reads the XUID. */
    public decodePayload(): void {
        this.xuid = NetworkUtil.readString(this);
    }

    /** Writes the XUID. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.xuid);
    }
}
