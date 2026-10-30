import type { Gametype } from '@jsprismarine/minecraft';

import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * Packet 105 on protocol 2193. Carries one field, `Default Game Type`, as a varint32.
 *
 * The same shape as `SetPlayerGameTypePacket`, but it changes the default every client falls
 * back to rather than one player's own game type. A client sends it from the world settings
 * screen; the server sends it back once it has applied it.
 */
export default class SetDefaultGameTypePacket extends FieldNetworkPacket {
    /**
     * `Default Game Type`, a `Gametype` value written ZigZag encoded.
     * @defaultValue `Gametype.SURVIVAL`
     */
    public gamemode: Gametype = 0;

    /** Reads `Default Game Type` as a varint32. */
    public decodePayload(): void {
        this.gamemode = this.readVarInt();
    }

    /** Writes `Default Game Type` as a varint32. */
    public encodePayload(): void {
        this.writeVarInt(this.gamemode);
    }
}
