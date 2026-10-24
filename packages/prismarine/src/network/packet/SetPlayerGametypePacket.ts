import type { Gametype } from '@jsprismarine/minecraft';

import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Packet 62 on protocol 2193. Carries one field, Player Game Type, as a varint32.
 *
 * The client sends it when the player picks a game type from the dropdown; the server sends
 * it back so the client shows the game type the server holds.
 */
export default class SetPlayerGametypePacket extends DataPacket {
    public static NetID = Identifiers.SetPlayerGametypePacket;

    /** Player Game Type, a `Gametype` value written ZigZag encoded. */
    public gametype!: Gametype;

    /** Reads Player Game Type as a varint32. */
    public decodePayload(): void {
        this.gametype = this.readVarInt();
    }

    /** Writes Player Game Type as a varint32. */
    public encodePayload(): void {
        this.writeVarInt(this.gametype);
    }
}
