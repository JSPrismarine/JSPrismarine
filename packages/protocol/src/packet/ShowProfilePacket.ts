import { showProfilePacket } from '../wire/definitions/showProfile';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

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
export default class ShowProfilePacket extends FieldNetworkPacket {
    /** The Xbox Live id of the player whose profile the client opens. */
    public xuid = '';

    /** Reads the XUID. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(showProfilePacket, this.codecProtocol).decode(this));
    }

    /** Writes the XUID. */
    public encodePayload(): void {
        layoutAt(showProfilePacket, this.codecProtocol).encode(this, this);
    }
}
