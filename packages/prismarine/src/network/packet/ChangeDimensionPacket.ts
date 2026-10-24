import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Starts a dimension change and the loading screen that goes with it.
 *
 * Protocol 2193 wire order, with the docs' field names: `Dimension ID` (a `DimensionType`, one
 * ZigZag varint32), `Position` (a `Vec3` of three little endian floats), `Respawn` (boolean) and
 * `Loading Screen Id` (optional: a presence byte, then a little endian uint32 when present).
 *
 * `Dimension ID` has to differ from the one the player is already in. Sending the current
 * dimension leaves the client on the change screen for ever.
 *
 * **Bound To:** Client
 */
export default class ChangeDimensionPacket extends DataPacket {
    public static NetID = Identifiers.ChangeDimensionPacket;

    /** `Dimension ID`: 0 the Overworld, 1 the Nether, 2 the End, 3 undefined. */
    public dimension!: number;
    /** `Position` in the new dimension. Null writes the origin. */
    public position!: Vector3 | null;
    /** `Respawn`: whether the change followed a death rather than a portal. */
    public respawn!: boolean;

    /**
     * `Loading Screen Id`, or null for no loading screen. Has to be unique among the screens
     * still open, since `ServerboundLoadingScreenPacket` reports progress against it.
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
