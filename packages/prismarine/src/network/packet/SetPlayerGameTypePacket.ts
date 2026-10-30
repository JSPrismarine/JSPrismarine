import type { Gametype } from '@jsprismarine/minecraft';
import { layoutAt, setPlayerGameTypePacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Packet 62 on protocol 2193. Carries one field, Player Game Type, as a varint32.
 *
 * The client sends it when the player picks a game type from the dropdown; the server sends
 * it back so the client shows the game type the server holds.
 */
export default class SetPlayerGameTypePacket extends FieldNetworkPacket {
    /** Player Game Type, a `Gametype` value written ZigZag encoded. */
    public gametype!: Gametype;

    /** Reads Player Game Type as a varint32. */
    public decodePayload(): void {
        this.gametype = layoutAt(setPlayerGameTypePacket, this.codecProtocol).decode(this).gametype;
    }

    /** Writes Player Game Type as a varint32. */
    public encodePayload(): void {
        layoutAt(setPlayerGameTypePacket, this.codecProtocol).encode(this, { gametype: this.gametype });
    }
}
