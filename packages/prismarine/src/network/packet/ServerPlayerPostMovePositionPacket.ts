import { Vector3 } from '@jsprismarine/math';
import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Tells a client where the server put its player once movement processing finished.
 *
 * **Bound To:** Client
 *
 * The client only draws this position in its debug renderer, so a server that has debug draw
 * turned off never needs to send it.
 *
 * Protocol 2193 layout (docs id 16), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Pos | Vec3 | Three little-endian floats |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/server-player-post-move-position-packet/
 */
export default class ServerPlayerPostMovePositionPacket extends FieldNetworkPacket {
    /** Pos, the player's position after the server simulated the tick. */
    public pos: Vector3 = new Vector3(0, 0, 0);

    /** Reads Pos. */
    public decodePayload(): void {
        this.pos = NetworkUtil.readVector3(this);
    }

    /** Writes Pos. */
    public encodePayload(): void {
        NetworkUtil.writeVector3(this, this.pos);
    }
}
