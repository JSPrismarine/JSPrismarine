import { GraphicsMode, updateClientOptionsPacket } from '../wire/definitions/updateClientOptions';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

export { GraphicsMode };

/**
 * A change to one of the client settings it first reported in the login connection request.
 *
 * **Bound To:** Server
 *
 * The wire layout lives in `@jsprismarine/protocol`'s declarative definition, which this class
 * walks at the protocol version stamped on it: a presence byte, then one {@link GraphicsMode}
 * when set, followed by a presence byte and the profanity filter flag when set.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/update-client-options-packet/
 */
export default class UpdateClientOptionsPacket extends FieldNetworkPacket {
    /** Graphics Mode Change: the new graphics mode, or `null` when it did not change. */
    public graphicsMode: GraphicsMode | null = null;

    /** Filter Profanity Change: the new profanity filter setting, or `null` when it did not change. */
    public filterProfanity: boolean | null = null;

    /** Reads the two optional settings. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(updateClientOptionsPacket, this.codecProtocol).decode(this));
    }

    /** Writes the two optional settings. */
    public encodePayload(): void {
        layoutAt(updateClientOptionsPacket, this.codecProtocol).encode(this, this);
    }
}
