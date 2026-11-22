import type { Gametype } from '@jsprismarine/minecraft';

import { setDefaultGameTypePacket } from '../wire/definitions/setDefaultGameType';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * Packet 105 on protocols 2193 and 2225. Carries one field, `Default Game Type`, as a varint32.
 *
 * The same shape as `SetPlayerGameTypePacket`, but it changes the default every client falls
 * back to rather than one player's own game type. A client sends it from the world settings
 * screen; the server sends it back once it has applied it.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/set-default-game-type-packet/
 */
export default class SetDefaultGameTypePacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'SetDefaultGameTypePacket';
    }

    /**
     * `Default Game Type`, a `Gametype` value written ZigZag encoded.
     * @defaultValue `Gametype.SURVIVAL`
     */
    public gamemode: Gametype = 0;

    /** Reads `Default Game Type` as a varint32. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(setDefaultGameTypePacket, this.codecProtocol).decode(this));
    }

    /** Writes `Default Game Type` as a varint32. */
    public encodePayload(): void {
        layoutAt(setDefaultGameTypePacket, this.codecProtocol).encode(this, this);
    }
}
