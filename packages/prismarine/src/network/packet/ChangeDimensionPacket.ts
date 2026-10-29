import type { Vector3 } from '@jsprismarine/math';
import type { Dimension } from '@jsprismarine/minecraft';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Starts a dimension change and the loading screen that goes with it.
 *
 * Protocol 2193 wire order, with the docs' field names: `Dimension ID` (a `DimensionType`, one
 * ZigZag varint32), `Position` (a `Vec3` of three little endian floats), `Respawn` (boolean) and
 * `Loading Screen Id` (a presence byte, then a little endian uint32 when present). The 1.26.51
 * schema lists `Loading Screen Id` as required and draws it as a plain uint32, but its own
 * description says to leave it empty when no screen is expected, and gophertunnel at protocol
 * 2193 writes the same presence byte.
 *
 * `Dimension ID` has to differ from the one the player is already in. Sending the current
 * dimension leaves the client on the change screen for ever.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/change-dimension-packet/
 */
export default class ChangeDimensionPacket extends DataPacket {
    /** `Dimension ID`, numbered as {@link Dimension}: 0 the Overworld, 1 the Nether, 2 the End, 3 undefined. */
    public dimension!: Dimension;
    /** `Position` in the new dimension. Null writes the origin. */
    public position!: Vector3 | null;
    /** `Respawn`: whether the change followed a death rather than a portal. */
    public respawn!: boolean;

    /**
     * `Loading Screen Id`, or null for no loading screen. Has to be unique among the screens
     * still open, since `ServerboundLoadingScreenPacket` reports progress against it.
     * `PlayerSession.beginLoadingScreen` hands out such ids.
     */
    public loadingScreenId: number | null = null;

    /** Reads the four fields in the protocol 2193 order described on the class. */
    public decodePayload(): void {
        this.dimension = this.readVarInt();
        this.position = NetworkUtil.readVector3(this);
        this.respawn = this.readBoolean();
        this.loadingScreenId = this.readBoolean() ? this.readUnsignedIntLE() : null;
    }

    /** Writes the four fields in the protocol 2193 order described on the class. */
    public encodePayload(): void {
        this.writeVarInt(this.dimension);
        NetworkUtil.writeVector3(this, this.position);
        this.writeBoolean(this.respawn);

        // An optional: a byte saying whether the id is there, then a little endian uint32 if it
        // is. Omitting the byte ends the packet early, and a client that reads past the end of a
        // packet calls it malformed and hangs up.
        if (this.loadingScreenId === null) {
            this.writeBoolean(false);
        } else {
            this.writeBoolean(true);
            this.writeUnsignedIntLE(this.loadingScreenId);
        }
    }
}
